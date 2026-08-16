"use client";

import { Fragment, useMemo, useState } from "react";
import type { EstadoMaterial, OF, Operario, Pedido } from "@/lib/types";
import {
  comprasPendientes,
  estaFinalizado,
  estadoMaterialDe,
  familiasDe,
  hoyISO,
  piezasTotal,
  tiempoTotalOF,
} from "@/lib/types";
import { ESTADO, fmtMin, PRIORIDAD, ROL } from "@/lib/estado";
import { FASES, faseDePedido } from "@/lib/fases-tablero";
import { estadoDePedido } from "@/lib/frase-estado";
import { relativoA, type TonoFecha } from "@/lib/fechas";
import { TRAMO, lineaTiempo, repartirEtiquetas, urgenciaRecorrido } from "@/lib/linea-tiempo";
import type { OrdenLista } from "@/lib/filtros";
import { FamiliaTag, FamiliaIcon } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { Desplegable } from "./Desplegable";

// ─── Vista Lista ─────────────────────────────────────────────────────────────
// La consulta densa: todo lo que aún no ha pasado a Producción, para mirar de
// un vistazo en qué anda cada pedido, para cuándo es y cuánto lleva. No se
// trabaja desde aquí (eso es el tablero); por eso no hay acciones, solo datos.
//
// Cinco decisiones que vienen de ver la vista llena de pedidos reales:
//   · La columna de estado habla el MISMO idioma que el tablero (las cuatro
//     fases), no los siete estados internos de la OF. Los estados de OF siguen
//     estando, pero dentro del despliegue, que es donde se mira el detalle.
//   · El badge rojo "ATRASADO" salía en casi todas las filas —basta con que la
//     planificación sea de ayer— y con él el código y la fecha también en rojo:
//     tres avisos para el mismo dato, y ninguno decía CUÁNTO. Ahora hay un solo
//     sitio donde mirarlo, la fecha, y dice "-1 d" o "-28 d".
//   · El orden lo mandan las CABECERAS, no el desplegable de la barra de
//     filtros: ver abajo, en el bloque "Orden por cabecera".
//   · Pedido, cliente y familias son UNA celda de dos renglones y no tres
//     columnas seguidas: se leen siempre juntos ("el AR.26.03914 de toldos de
//     Mahou") y sueltos se comían el ancho que necesita el recorrido, que es a
//     lo que de verdad se viene aquí. Ver "La celda de identidad".
//   · Un pedido desplegado se marca con una barra a la izquierda que recorre su
//     fila y su detalle: con dos o tres abiertos a la vez, el detalle de uno
//     parecía el principio del siguiente. Ver "Marcar lo desplegado".

/** Color del texto de una fecha según su urgencia. Clases literales: Tailwind
 *  no compila las que se construyen concatenando. */
const TONO: Record<TonoFecha, string> = {
  vencida: "font-semibold text-red-600 dark:text-red-400",
  hoy: "font-semibold text-amber-600 dark:text-amber-400",
  proxima: "text-text",
  lejana: "text-text-muted",
};

function Avatar({ op, title }: { op: Operario | undefined; title: string }) {
  if (!op) return <span className="text-text-muted italic">—</span>;
  return (
    <span
      className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
      style={{ background: op.color }}
      title={`${title}: ${op.nombre}`}
    >
      {op.iniciales}
    </span>
  );
}

/** `enfasis` gradúa cuánto grita la fecha:
 *  · "normal"  → su urgencia real (la planificación, que es la que manda).
 *  · "suave"   → solo destaca si ya venció (la entrega: informa, no apremia).
 *  · "ninguno" → siempre en gris, aunque haya vencido: trabajo ya terminado. */
function Fecha({
  iso,
  hoy,
  enfasis = "normal",
  absoluta = false,
}: {
  iso: string;
  hoy: string;
  enfasis?: "normal" | "suave" | "ninguno";
  /** Enseñar la fecha, no lo que falta o sobra. Para las que son HISTORIA y no
   *  un plazo: la creación salía como "-26 d" al lado de "FABRICACIÓN 19/08",
   *  y leídas juntas parecían dos cosas distintas cuando son cuatro fechas del
   *  mismo recorrido. Cuánto hace que entró se sigue viendo en el `title`. */
  absoluta?: boolean;
}) {
  const r = relativoA(iso, hoy);
  const clase =
    enfasis === "ninguno" || (enfasis === "suave" && r.tono !== "vencida")
      ? TONO.lejana
      : TONO[r.tono];
  return (
    <span className={clase} title={`${r.completa} · ${r.etiqueta}`}>
      {absoluta ? `${iso.slice(8)}/${iso.slice(5, 7)}` : r.etiqueta}
    </span>
  );
}

// ─── El ancho del recorrido ──────────────────────────────────────────────────
// La línea de tiempo vivía en 260 px, apretada entre Cliente y Familias. Al
// fundir esas dos con Pedido en una sola celda de identidad se libera sitio, y
// todo se lo queda el recorrido: es lo que más se mira de esta vista.
//
// Ensanchar no es solo estética. La separación mínima entre las fechas de los
// hitos se le pasa a `repartirEtiquetas` en % del ancho, pero el texto ("27/08")
// mide siempre lo mismo en px. Con un 17 % fijo sobre 260 px se separaban 38 px
// las fechas que solo necesitan ~28, así que cada una acababa lejos de su punto
// sin hacer falta —y en un recorrido a escala, la etiqueta despegada de su hito
// es justo lo que hay que evitar—. Ahora el % sale de los px reales: al
// ensanchar la columna las fechas no se separan MÁS, se separan menos.

/** Reparto de ancho de las tres columnas. La clase va literal porque Tailwind
 *  no compila las que se concatenan, y `RECORRIDO_PX` repite el mínimo como
 *  número para la cuenta de aquí abajo: los dos tienen que decir lo mismo. */
// Las tres columnas reparten el ancho en PORCENTAJE, no en píxeles fijos.
//
// Con el recorrido clavado en píxeles, todo el hueco que sobraba se lo comía la
// celda de identidad: entre el nombre del cliente y la columna de estado
// quedaban 250 px en blanco en casi todas las filas. Y dándoselo entero al
// recorrido pasaba lo contrario, que se quedaba con más de lo que necesita y
// ahogaba a las otras dos. En porcentaje crecen las tres a la vez.
//
// El `min-w` es el suelo de la línea de tiempo: por debajo de ahí las cuatro
// fechas no caben sin pisarse.
//
// La cuenta de separación (`ANCHO_FECHA_PCT`) se sigue haciendo sobre ese
// mínimo: si la columna crece, el porcentaje sobra y las fechas se separan algo
// MÁS de lo necesario. Se pierde algo de precisión, nunca legibilidad — el
// fallo por el otro lado (calcular sobre un ancho mayor del real) sí las
// montaría unas encima de otras.
const IDENTIDAD_W = "w-[36%]";
const ESTADO_W = "w-[22%]";
const RECORRIDO_W = "w-[42%] min-w-[520px]";
const RECORRIDO_PX = 520;

/** Lo que se lleva el chip "+128d" con su hueco cuando el pedido va tarde. Se
 *  descuenta siempre, salga o no en esa fila: si la separación dependiera del
 *  chip, la misma fecha caería en un sitio distinto según la fila. */
const CHIP_TARDE_PX = 42;

/** Lo que ocupa "27/08" a 10 px, con aire para que dos seguidas no se toquen. */
const ANCHO_FECHA_PX = 36;

/** Lo mismo en % del ancho de la línea, que es lo que entiende
 *  `repartirEtiquetas`: separación mínima entre centros y, a la mitad, lo que
 *  cada fecha sobresale por los extremos (van centradas sobre su hito). */
const ANCHO_FECHA_PCT = (ANCHO_FECHA_PX / (RECORRIDO_PX - CHIP_TARDE_PX)) * 100;

/** El recorrido del pedido en una fila: los hitos a escala con su fecha
 *  encima, y el punto de hoy moviéndose por encima.
 *
 *  Sustituye a las columnas de fechas sueltas, no se suma a ellas. Con las
 *  fechas en columnas propias hacían falta tres colores para decir lo mismo
 *  —planificada en rojo, solicitada en rojo, barra en rojo— y la lista era un
 *  muro. Aquí las fechas son grises y lo único que grita es dónde está hoy.
 *
 *  Los rótulos (Creación, Planificación…) NO se repiten por fila: el orden es
 *  el mismo en todas, así que viven una sola vez en la cabecera. */
function Recorrido({ pedido, hoy }: { pedido: Pedido; hoy: string }) {
  const linea = lineaTiempo(pedido, hoy);
  const { hitos, hoyPct, hoyFuera, diasParaEntrega } = linea;
  const etiquetas = repartirEtiquetas(
    hitos.map((h) => h.pct),
    ANCHO_FECHA_PCT,
    ANCHO_FECHA_PCT / 2,
  );
  // Dónde cae hoy en la escalada, y de qué color va. Lo decide
  // `urgenciaRecorrido`, que es lo mismo que usa la línea del detalle: cuando
  // cada una lo calculaba por su cuenta, el mismo pedido salía de un color en
  // la lista y de otro al abrirlo.
  const { actual, color, sinPlanificar, diasTarde, esHoyLaPlanificada, vencido } =
    urgenciaRecorrido(linea, pedido, hoy);
  // Con el año cuando el recorrido cruza de un año a otro.
  //
  // Sin él, un pedido creado el 02/12/2024 y planificado el 16/06/2027 pintaba
  // "02/12 · 16/06 · 19/03 · 20/03": leídas como del mismo año parecen
  // desordenadas y el recorrido, roto. Son 17 de 92 en la vista de hoy, casi
  // todos trabajo interno con fechas disparatadas en RPS (planificaciones de
  // 2028 y 2029). El año no se pone siempre porque en los normales gasta sitio
  // para decir lo que ya se sabe.
  const aniosDistintos = new Set(hitos.map((h) => h.iso.slice(0, 4))).size > 1;
  const fmtHito = (iso: string) =>
    `${iso.slice(8)}/${iso.slice(5, 7)}${aniosDistintos ? `/${iso.slice(2, 4)}` : ""}`;
  return (
    // `w-full` a secas: el ancho lo manda la COLUMNA (ver RECORRIDO_W) y la
    // línea solo tiene que llenarla.
    <div className="flex w-full items-end gap-1.5 pb-0.5 pt-1">
      <div className="min-w-0 flex-1">
      <div className="relative h-3">
        {/* A 10 px y no a 9: la fecha es lo único que hay que LEER de la línea
            (el resto se mira), y con la columna ensanchada el sitio ya no lo
            paga nadie. */}
        {hitos.map((h, i) => {
          // La PLANIFICADA destacada sobre las demás: de las cuatro fechas es
          // la única que es una fecha límite para OT —el día en que esto
          // debería estar planteado— y las otras tres son contexto.
          //
          // Y con color propio, porque es la que contesta la pregunta: verde
          // mientras se llega (incluido el mismo día), y al pasarla cambia a lo
          // que diga la escalada —naranja mientras el margen es de Producción,
          // rojo cuando se come el suyo, morado cuando la entrega ya se
          // incumplió—. Antes iba en negro y había que buscar el retraso en el
          // chip del final.
          // Se colorea el hito de REFERENCIA, sea cual sea: la planificada en
          // los normales y la solicitada en los que no tienen fecha de planteo
          // (ahí no se pinta hito de planificación, porque sería la misma fecha
          // repetida). Así el color está siempre en el mismo sitio de la línea:
          // la fecha que manda.
          const colorHito = h.referencia ? color : undefined;
          const cuanto = esHoyLaPlanificada
            ? " (es hoy)"
            : diasTarde < 0
              ? ` (quedan ${-diasTarde} d)`
              : ` (pasada hace ${diasTarde} d)`;
          return (
            <span
              key={h.clave}
              className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none ${
                h.referencia ? "font-bold" : "text-text-muted"
              }`}
              style={{ left: `${etiquetas[i]}%`, color: colorHito }}
              title={
                !h.referencia
                  ? `${h.etiqueta}: ${h.iso.split("-").reverse().join("/")}`
                  : sinPlanificar
                    ? `Solicitada: ${h.iso.split("-").reverse().join("/")} — este pedido no tiene fecha de planificación en RPS. Se enseña la entrega como referencia, pero sin medir retraso contra ella: no es la fecha en que hay que plantearlo.`
                    : `Planificada: ${h.iso.split("-").reverse().join("/")} — el día en que debería estar planteado${cuanto}`
              }
            >
              {fmtHito(h.iso)}
            </span>
          );
        })}
      </div>

      <div className="relative h-2">
        {/* El color dice EN QUÉ TRAMO va el pedido, no cuánto lleva: verde
            hasta la planificación (hay margen), naranja mientras el trabajo es
            de OT, rojo en el último tramo. Cortes secos, no degradado: el
            pedido cambia de tramo un día concreto y verlo saltar ES el dato.

            Lo ya recorrido va a todo color y lo que queda apagado, así se ven
            a la vez el plan entero y por dónde se va. */}
        <div className="absolute inset-x-0 top-[3px] h-0.5 rounded-full bg-border" />
        {/* El día exacto de la planificada, el tramo VERDE se sigue pintando.
            Antes ese día la barra se quedaba entera en gris y todo el aviso lo
            llevaba el punto: la fila se leía como "este pedido no tiene fecha",
            que es lo que significa el gris en todas las demás, justo el día en
            que hay que mirarlo. Sigue estando a tiempo, así que va en verde
            como el día anterior; lo que cambia es el punto, que ese día también
            se pinta de verde en vez de negro. */}
        {actual && (
          <div
            className="absolute top-[3px] h-0.5 rounded-full"
            style={{
              left: `${actual.desde}%`,
              width: `${actual.hasta - actual.desde}%`,
              background: vencido ? TRAMO.fuera : actual.color,
            }}
          />
        )}
        {hitos.map((h) => (
          <span
            key={h.clave}
            className="absolute top-0 size-2 -translate-x-1/2 rounded-full bg-border-strong"
            style={{ left: `${h.pct}%` }}
          />
        ))}
        {/* Hoy: el único que se mueve. Sin color propio —el tramo ya lo dice—
            salvo cuando se sale de la línea, que ahí el morado es la señal.
            Más grande que los hitos y con anillo del fondo para despegarlo. */}
        <span
          className="absolute top-[-1px] size-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface"
          style={{
            left: `${hoyPct}%`,
            background: esHoyLaPlanificada
              ? TRAMO.holgado
              : vencido
                ? TRAMO.fuera
                : "var(--text)",
            opacity: hoyFuera && !vencido ? 0.5 : 1,
          }}
          title={
            esHoyLaPlanificada
              ? "Hoy es el día planificado: toca plantearlo hoy y aún se va a tiempo"
              : vencido
                ? `Hoy · fuera de fecha, ${-diasParaEntrega} d pasada la solicitada`
                : `Hoy · quedan ${diasParaEntrega} d`
          }
        />
        </div>
      </div>

      {/* Cuánto se ha pasado OT de SU fecha. El número no cabe en la línea
          —hoy se queda pegado al extremo cuando se sale— así que se dice
          aparte. El morado avisa además de que la entrega al cliente ya no se
          cumple: está fuera de la escalada verde-naranja-rojo a propósito,
          porque no es "va muy justo", es que la fecha ya se incumplió. */}
      {/* Sin fecha de planteo no hay retraso que anunciar: el chip contaría
          días pasados de una fecha que no es la que hay que cumplir. */}
      {diasTarde > 0 && !sinPlanificar && (
        <span
          className="shrink-0 rounded px-1 py-px text-[9px] font-bold leading-none"
          // El texto va del color del FONDO de la app, no blanco fijo: sobre el
          // ámbar claro del tema oscuro, un "+3d" en blanco se leía a 2:1. Así
          // el chip contrasta solo en los dos temas, sin una segunda pareja de
          // colores que mantener.
          style={{ background: vencido ? TRAMO.fuera : TRAMO.trabajo, color: "var(--surface)" }}
          title={
            vencido
              ? `${diasTarde} días pasada la planificada — y la entrega solicitada era hace ${-diasParaEntrega}`
              : `${diasTarde} días pasada la fecha planificada para plantearlo`
          }
        >
          +{diasTarde}d
        </span>
      )}
    </div>
  );
}

// ─── Orden ───────────────────────────────────────────────────────────────────
// El criterio lo elige la barra de filtros y llega por props (ver `orden` en
// lib/filtros.ts). Estuvo un tiempo en las cabeceras de la tabla, pulsando la
// columna que se mira; se quitó porque tres de las cuatro columnas son celdas
// fundidas y hacía falta meter dos rótulos pulsables dentro de cada una, con su
// flecha y su hueco: la cabecera acababa contando más que una fila.
//
// La Lista recibe los pedidos SIN ordenar y ordena aquí: el criterio es de la
// barra, la comparación es suya.

/** Nombre del PRIMER autor del pedido, el mismo que sale en el primer avatar de
 *  la columna. Un pedido repartido entre dos personas se ordena por la que se
 *  ve a la izquierda y no por una escondida detrás; `null` = ninguna de sus OF
 *  tiene autor todavía. Si el operario ya no está en la plantilla se cae al id,
 *  que al menos es estable y no manda la fila a un sitio distinto cada vez. */
function nombrePrimerAutor(p: Pedido, nombres: Map<string, string>): string | null {
  for (const of of p.ofs) {
    if (of.autorId) return nombres.get(of.autorId) ?? of.autorId;
  }
  return null;
}

/** Compara dos pedidos por la columna elegida.
 *
 *  El signo de la dirección se aplica DENTRO y no envolviendo el resultado,
 *  porque hay dos cosas que no se invierten con el resto:
 *    · Los pedidos sin autor se quedan al final en las dos direcciones. Son
 *      los recién llegados de Producción y hay muchos: subirlos al principio al
 *      pulsar por segunda vez llenaría la primera pantalla de guiones.
 *    · El desempate por código va siempre de la A a la Z, para que dos pedidos
 *      planificados el mismo día (que son la mayoría) no se cambien de sitio
 *      entre sí cada vez que se reordena por otra columna y se vuelve. */
function comparar(orden: OrdenLista, desc: boolean, nombres: Map<string, string>) {
  const signo = desc ? -1 : 1;
  return (a: Pedido, b: Pedido): number => {
    let d = 0;
    switch (orden) {
      case "codigo":
        d = a.codigo.localeCompare(b.codigo, "es");
        break;
      case "cliente":
        d = a.cliente.localeCompare(b.cliente, "es");
        break;
      case "autor": {
        const na = nombrePrimerAutor(a, nombres);
        const nb = nombrePrimerAutor(b, nombres);
        if (na === null || nb === null) {
          if (na !== nb) return na === null ? 1 : -1;
          break; // los dos sin autor: que decida el desempate
        }
        d = na.localeCompare(nb, "es");
        break;
      }
      case "fase":
        // Por el orden natural del tablero (sin empezar → listo para pasar), no
        // por la etiqueta: alfabéticamente "Esperando revisión" iría antes que
        // "Planteando", y eso no dice nada de cómo avanza el trabajo.
        d =
          FASES.findIndex((f) => f.id === faseDePedido(a)) -
          FASES.findIndex((f) => f.id === faseDePedido(b));
        break;
      case "planificacion":
        // Por la fecha de REFERENCIA de cada pedido, que en los que no tienen
        // planificación es la entrega (`fechaPlanificacion` ya trae ese valor).
        // Sin privilegios para esos: llegué a ponerlos delante de todo, pero
        // eso colaba un pedido con la entrega a tres meses por encima de uno
        // urgente. Lo que tienen de particular se ve en la línea, que no pinta
        // hito de planificación, no colándose en la primera pantalla.
        //
        // ISO yyyy-mm-dd: comparar el texto ya es comparar la fecha.
        d = a.fechaPlanificacion.localeCompare(b.fechaPlanificacion);
        break;
    }
    return d !== 0 ? d * signo : a.codigo.localeCompare(b.codigo, "es");
  };
}

// ─── Marcar lo desplegado ────────────────────────────────────────────────────
// Un pedido abierto son DOS <tr>: la fila de siempre y la del detalle. Pintadas
// como las demás no se veía dónde empezaba ni dónde acababa lo abierto —con
// tres pedidos desplegados a la vez, el detalle de uno se leía como el arranque
// del siguiente— y el fondo que ya llevaba la fila abierta era `bg-surface-2`,
// exactamente el mismo gris del hover: marcaba tan poco como no marcar.
//
// Se resuelve con UNA barra dorada a la izquierda que recorre las dos filas. Es
// la única de las opciones que dice a la vez dónde empieza y dónde acaba el
// bloque sin añadir tinta al centro de la tabla, que ya va densa. Descartado el
// borde envolvente: con `border-collapse` habría que fingir los lados en la
// primera y la última celda, y son cuatro hairlines más por pedido abierto.
//
// La barra va en dos mitades, una por fila, y se dibuja con un pseudoelemento y
// no con `border-l`: un borde de verdad empujaría el contenido 3 px al abrir y
// la fila daría un salto. Cada mitad deja un respiro en su extremo y lo remata
// redondeado, para que dos pedidos abiertos SEGUIDOS no formen una sola barra
// continua de arriba abajo: entre el final de uno y el principio del otro se ve
// el corte. El dorado es el de marca (`--color-brand-400`), que es el mismo
// tono en claro y en oscuro; el fondo, ese mismo dorado a un 10 % en la fila y
// a un 5 % en el detalle: sobre blanco queda crema y sobre grafito, cálido, y
// en los dos casos no se confunde con el gris del hover.
const ACENTO_ARRIBA =
  "relative before:absolute before:bottom-0 before:left-0 before:top-1.5 before:w-[3px] before:rounded-t-full before:bg-brand-400 before:content-['']";
const ACENTO_ABAJO =
  "relative before:absolute before:bottom-1.5 before:left-0 before:top-0 before:w-[3px] before:rounded-b-full before:bg-brand-400 before:content-['']";

export function ListaView({
  pedidos,
  operarios,
  onOpen,
  orden,
  ordenDesc,
  hayFiltrosActivos = false,
}: {
  /** SIN ordenar: el orden lo pone esta vista, ver "Orden por cabecera". */
  pedidos: Pedido[];
  operarios: Operario[];
  onOpen: (p: Pedido) => void;
  /** ¿Hay algún filtro puesto en la barra? Solo cambia lo que dice la lista
   *  vacía, y la diferencia importa: "no queda trabajo pendiente" y "lo hay,
   *  pero lo estás tapando con un filtro" se arreglan de formas distintas. */
  hayFiltrosActivos?: boolean;
  /** Criterio y sentido del orden. Vienen de la barra de filtros: es un ajuste
   *  de la vista, como los filtros, y viaja con ellos en la URL. */
  orden: OrdenLista;
  ordenDesc: boolean;
}) {
  const hoy = hoyISO();
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const nombrePorId = useMemo(() => {
    const m = new Map(operarios.map((o) => [o.id, o.nombre]));
    return (id: string) => m.get(id) ?? id;
  }, [operarios]);

  const ordenados = useMemo(() => {
    const nombres = new Map(operarios.map((o) => [o.id, o.nombre]));
    return [...pedidos].sort(comparar(orden, ordenDesc, nombres));
  }, [pedidos, operarios, orden, ordenDesc]);

  function toggle(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* Pegada arriba: con 40 pedidos, a mitad de scroll ya no se sabía
                qué columna era cuál. */}
            <tr className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wide text-text-muted">
              <Th className="w-8" />
              {/* Rótulos y nada más: el orden se elige en la barra de filtros.
                  Familias no tiene el suyo —un pedido trae varias y nombrarlas
                  en singular engañaría—; se reconocen por su icono de color,
                  que es como se leen en el tablero. */}
              <Th className={IDENTIDAD_W}>Pedido · cliente</Th>
              <Th className={ESTADO_W}>Quién · estado</Th>
              {/* Los rótulos de los hitos van aquí, una vez, en lugar de
                  repetirse en cada fila: el orden es el mismo en todas. Los
                  nombres son los de la herramienta vieja, salvo "llegada". */}
              <Th className={RECORRIDO_W}>
                <span className="block">Recorrido</span>
                {/* Sin opacidad extra sobre el muted: a 9 px ya es lo bastante
                    secundario por tamaño, y el /80 solo restaba legibilidad. */}
                <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-text-muted">
                  creación · <span className="font-semibold text-text">planificada</span> ·
                  fabricación · solicitada
                </span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 && (
              <tr>
                {/* Antes la tabla se quedaba en la cabecera y a secas: con un
                    filtro puesto y ningún resultado parecía que la web se había
                    quedado a medias de cargar. */}
                <td colSpan={4} className="px-3 py-12 text-center">
                  <p className="text-sm font-semibold text-text">
                    {hayFiltrosActivos
                      ? "Ningún pedido pasa los filtros"
                      : "No hay trabajo pendiente"}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-text-muted">
                    {hayFiltrosActivos
                      ? "Hay pedidos en la lista, pero los filtros de arriba los dejan todos fuera. Quita alguno para volver a verlos."
                      : "Aquí sale lo que aún no ha pasado a Producción. Los pedidos nuevos aparecerán en cuanto Producción los planifique para Oficina Técnica."}
                  </p>
                </td>
              </tr>
            )}
            {ordenados.map((p) => {
              // Terminado = la planificación vencida ya no es un problema
              // pendiente. Misma regla que `estaAtrasado`, que también los
              // excluye; si no, media lista salía en rojo por trabajo hecho.
              const hecho = estaFinalizado(p);
              const pendienteProc = p.situacion === "pendiente";
              const fichando = p.ofs.find((o) => o.fichandoRol)?.fichandoRol ?? null;
              const abierto = expandidos.has(p.id);
              return (
                <Fragment key={p.id}>
                  <tr
                    onClick={() => toggle(p.id)}
                    // Abierta pierde el hairline de abajo: lo que va debajo no
                    // es la fila siguiente, es su propio detalle, y sin la raya
                    // los dos <tr> se leen como un bloque. Y pierde el hover
                    // gris, que si no ganaría por especificidad y taparía el
                    // dorado justo al pasar por encima.
                    className={`cursor-pointer ${pendienteProc ? "opacity-60" : ""} ${
                      abierto
                        ? "bg-brand-500/10 hover:bg-brand-500/15"
                        : "border-b border-border last:border-0 hover:bg-surface-2"
                    }`}
                  >
                    <Td className={abierto ? ACENTO_ARRIBA : ""}>
                      {/* El clic en la fila entera despliega, pero una <tr> no se
                          puede enfocar sin romper la semántica de la tabla: el
                          botón de la flecha es la misma acción, alcanzable con
                          el tabulador. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          // La fila también escucha el clic: sin esto, el toggle
                          // se ejecutaría dos veces y se quedaría como estaba.
                          e.stopPropagation();
                          toggle(p.id);
                        }}
                        aria-expanded={abierto}
                        aria-label={`${abierto ? "Plegar" : "Desplegar"} ${p.codigo}`}
                        className="grid place-items-center rounded p-0.5 hover:bg-surface-2"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          className={`size-3.5 text-text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </Td>
                    {/* ─── La celda de identidad ───────────────────────────
                        Arriba QUÉ pedido es y de qué va; abajo, de quién es.
                        Los dos renglones ocupan lo mismo de alto que la fila de
                        antes, así que la vista no pierde densidad y el
                        recorrido se lleva las dos columnas liberadas. */}
                    <Td>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className="h-3.5 w-1 shrink-0 rounded-full"
                            style={{ background: PRIORIDAD[p.prioridad].color }}
                            title={`Prioridad ${PRIORIDAD[p.prioridad].label}`}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpen(p);
                            }}
                            className="font-mono font-semibold text-text hover:underline"
                            title="Abrir detalle del pedido"
                          >
                            {p.codigo}
                          </button>
                          {/* El nº de OF pegado al código: es parte de QUÉ es
                              este pedido —"el de Mahou, el de tres"—, no una
                              medida que nadie compara en columna. */}
                          <span
                            className="shrink-0 text-[11px] font-medium text-text-muted"
                            title={`${p.ofs.length} orden${p.ofs.length === 1 ? "" : "es"} de fabricación`}
                          >
                            · {p.ofs.length} OF
                          </span>
                          {fichando && (
                            <span
                              title={fichando === "revisar" ? "Revisando ahora" : "Planteando ahora"}
                              className="inline-flex"
                            >
                              <LiveDot rol={fichando} />
                            </span>
                          )}
                          {/* Las familias pegadas al código y no en columna
                              propia: nadie busca "los de lona" leyendo una
                              columna, se pregunta de qué va ESTE pedido. */}
                          {familiasDe(p).map((f) => (
                            <FamiliaTag key={f} familia={f} />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-text-muted">
                          {/* Cliente y negocio en la misma frase, "MAHOU · NOVA
                              CAMELIAS": el negocio solo significa algo pegado a
                              su cliente —de MAHOU hay muchos pedidos y lo que
                              los distingue es el local—, y en columnas
                              separadas obligaba a leer a saltos. */}
                          <span
                            className="min-w-0 text-text"
                            title={
                              p.negocio
                                ? `Cliente ${p.cliente} · Negocio ${p.negocio}`
                                : `Cliente ${p.cliente}`
                            }
                          >
                            {p.cliente}
                            {/* El negocio, más apagado que el cliente: el
                                renglón se lee de corrido pero sigue viéndose
                                cuál de los dos es el que se busca. */}
                            {p.negocio && <span className="text-text-muted"> · {p.negocio}</span>}
                          </span>
                          {/* Los dos avisos bajan a este renglón: arriba le
                              quitaban el sitio a las familias, y los dos hablan
                              de la PROCEDENCIA del pedido —"Interno" es que no
                              hay pedido de venta detrás, "Sin procesar" que
                              Producción aún no lo ha pasado a OT—, que es de lo
                              que va aquí abajo. */}
                          {p.interno && (
                            <span
                              className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-muted ring-1 ring-border"
                              title="Proyecto interno: sin pedido de venta"
                            >
                              Interno
                            </span>
                          )}
                          {pendienteProc && (
                            <span
                              // gray-400 con texto blanco se leía a 2,6:1 en
                              // claro. Mismo tratamiento que "Interno", que ya
                              // usaba tokens y no fallaba.
                              className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold uppercase text-text-muted ring-1 ring-border"
                              title="Producción todavía no lo ha pasado a Oficina Técnica"
                            >
                              Sin procesar
                            </span>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Estado pedido={p} nombrePorId={nombrePorId} />
                    </Td>
                    <Td>
                      {/* Terminado = el recorrido ya no dice nada: el pedido no
                          se mueve más. Se apaga entero en vez de teñir media
                          lista de rojo por trabajo que ya está hecho. */}
                      <span className={hecho ? "block opacity-40 grayscale" : undefined}>
                        <Recorrido pedido={p} hoy={hoy} />
                      </span>
                    </Td>
                  </tr>
                  {/* La <tr> del detalle se pinta SIEMPRE, aunque esté cerrada.
                      Es el precio de que el cierre se vea: si React la quitara
                      al pulsar, el contenido desaparecería de golpe y no habría
                      nada que animar. Cerrada no ocupa nada —`Desplegable`
                      devuelve null y la celda va sin relleno— y el fondo, el
                      acento y el hairline viven DENTRO, para que se vayan con
                      el contenido en vez de apagarse antes que él. */}
                  <tr>
                    <td colSpan={4} className="p-0">
                      <Desplegable abierto={abierto}>
                        {/* El hairline de abajo es el que CIERRA el bloque: es
                            la única raya que le queda al pedido abierto, así
                            que se lee como "hasta aquí llega lo desplegado". */}
                        <div
                          className={`border-b border-border bg-brand-500/5 px-3 py-3 ${ACENTO_ABAJO}`}
                        >
                          <Detalle p={p} hoy={hoy} operarios={operarios} />
                        </div>
                      </Desplegable>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Lo que se ve al desplegar una fila: lo que puede parar el trabajo, y una
 *  línea por OF. Es la respuesta a "¿puedo ponerme con esto?" sin tener que
 *  abrir el pedido.
 *
 *  AQUÍ HABÍA cuatro fechas (llegada, planificada, fabricación, solicitada), el
 *  reparto del tiempo en planteo y revisión, y la ciudad de entrega. Las cuatro
 *  fechas son EXACTAMENTE las de la línea de tiempo de la fila de arriba, a dos
 *  centímetros y a escala; los dos tiempos son los mismos que ya lleva la
 *  columna de estado, con el nombre de quien los echó al lado; y el destino no
 *  se mira nunca desde Oficina Técnica: el pedido no lo lleva nadie allí. Así
 *  que el desplegable repetía la fila y no añadía nada.
 *
 *  Lo que sí faltaba es lo que decide si se puede empezar: si hay material y si
 *  está reservado, si Compras espera algo (y si llega tarde), los avisos que
 *  Producción deja en la ruta, y cuánto se estimó frente a lo que lleva. Eso es
 *  lo que hay ahora. */
function Detalle({ p, hoy, operarios }: { p: Pedido; hoy: string; operarios: Operario[] }) {
  const llevado = p.ofs.reduce((n, of) => n + tiempoTotalOF(of), 0);
  const estimado = p.ofs.reduce((n, of) => n + of.tiempoEstimadoMin, 0);
  const material = estadoMaterialDe(p.ofs);
  const compras = comprasPendientes(p.ofs, hoy);
  const avisos = [...new Set(p.ofs.flatMap((of) => of.avisos ?? []))];

  return (
    <div className="space-y-2.5">
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-[11px]">
        <Dato label="Piezas">{piezasTotal(p)}</Dato>
        {/* Lo llevado CONTRA lo estimado, no cada uno por su lado: el número
            solo dice algo comparado con el otro. */}
        {estimado > 0 && (
          <Dato label="Tiempo">
            <span className={llevado > estimado ? "font-semibold text-text" : undefined}>
              {fmtMin(llevado)}
            </span>
            <span className="text-text-muted"> / est. {fmtMin(estimado)}</span>
          </Dato>
        )}
        {material && (
          <Dato label="Material">
            <span className={MATERIAL[material].clase}>{MATERIAL[material].texto}</span>
          </Dato>
        )}
        {compras.porLlegar > 0 && (
          <Dato label="Compras">
            <span className={compras.tarde > 0 ? "font-semibold text-red-600 dark:text-red-400" : undefined}>
              {compras.porLlegar} por llegar
              {compras.tarde > 0 && ` · ${compras.tarde} con la fecha pasada`}
            </span>
          </Dato>
        )}
      </dl>
      {/* Las "tareas-nota" que Producción deja en la ruta de la OF ("22/06
          VISITA MEDIR"). Se enseñan sin repetir: en un pedido de seis OF suele
          ser el mismo aviso seis veces. */}
      {avisos.length > 0 && (
        <ul className="space-y-0.5 rounded-lg bg-indigo-500/10 px-2.5 py-1.5">
          {avisos.map((a) => (
            <li key={a} className="text-[11px] leading-5 text-indigo-800 dark:text-indigo-200">
              📌 {a}
            </li>
          ))}
        </ul>
      )}
      {p.comentarioVenta && (
        <p className="rounded-lg bg-surface px-2.5 py-1.5 text-[11px] leading-5 text-text ring-1 ring-border">
          <span className="font-semibold text-text-muted">Comercial: </span>
          {p.comentarioVenta}
        </p>
      )}
      <ul className="space-y-1.5">
        {p.ofs.map((of) => (
          <OFRowLista key={of.id} of={of} operarios={operarios} hoy={hoy} />
        ))}
      </ul>
    </div>
  );
}

/** Cómo se dice el estado del material del pedido. Los tres son estados de
 *  ALMACÉN, no de OT: lo único que cambia para nosotros es si hay que contar
 *  con que falte. */
const MATERIAL: Record<EstadoMaterial, { texto: string; clase: string }> = {
  reservado: { texto: "reservado", clase: "text-teal-700 dark:text-teal-300" },
  aMedias: { texto: "a medias", clase: "font-semibold text-amber-700 dark:text-amber-300" },
  sinReservar: { texto: "sin reservar", clase: "text-text-muted" },
};

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}

function OFRowLista({ of, operarios, hoy }: { of: OF; operarios: Operario[]; hoy: string }) {
  const meta = ESTADO[of.estado];
  const autor = operarios.find((o) => o.id === of.autorId);
  const revisor = operarios.find((o) => o.id === of.revisorId);
  const total = tiempoTotalOF(of);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] ring-1 ring-border">
      <FamiliaIcon familia={of.familia} className="size-3.5 shrink-0" />
      <span className="font-mono font-semibold text-text">{of.codigo}</span>
      <span className="truncate text-text">{of.descripcion}</span>
      {of.fichandoRol && (
        <span
          title={of.fichandoRol === "revisar" ? "Revisando ahora" : "Planteando ahora"}
          className="inline-flex"
        >
          <LiveDot rol={of.fichandoRol} />
        </span>
      )}
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
        {meta.label}
      </span>
      {of.ajenaOT && (
        <span
          className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border"
          title="Entra por una tarea de taller (PLANTEAR EN TALLER): no es trabajo de OT. Se recupera asignándole autor."
        >
          Taller
        </span>
      )}
      {of.detenida && (
        <span
          className="rounded bg-red-600/12 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:text-red-300"
          title="Detenida por Producción: no se puede fichar"
        >
          Detenida
        </span>
      )}
      {of.materialPendienteHasta && (
        <span className="whitespace-nowrap text-text-muted" title="Llegada del material pedido">
          Material <Fecha iso={of.materialPendienteHasta} hoy={hoy} />
        </span>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        <Avatar op={autor} title="Autor" />
        <span className="text-text-muted">→</span>
        <Avatar op={revisor} title="Revisor" />
      </span>
      <span
        className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-text ring-1 ring-border"
        title={`Planteo ${fmtMin(of.tiempoPlanteoMin)} · Revisión ${fmtMin(of.tiempoRevisionMin)}`}
      >
        {total > 0 ? fmtMin(total) : "—"}
      </span>
    </li>
  );
}

/** Cabecera de columna: un rótulo y nada más. El orden se elige en la barra de
 *  filtros, así que aquí no hay nada pulsable — tres de las cuatro columnas son
 *  celdas fundidas y meterles dos rótulos con su flecha hacía que la cabecera
 *  contara más que una fila. */
function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-2.5 font-semibold ${className}`}>{children}</th>;
}

/** Quién lleva el pedido y por dónde va, en una frase.
 *
 *  Sustituye a tres columnas —avatares de autor y revisor, fase y minutos— que
 *  contaban a trozos algo que en el taller se dice de corrido: "lo planteó
 *  Iván, 25 minutos, y lo tiene Tamara para revisar". Los tramos los arma
 *  `estadoDePedido`, que está probado aparte; aquí solo se pintan. */
function Estado({
  pedido,
  nombrePorId,
}: {
  pedido: Pedido;
  nombrePorId: (id: string) => string;
}) {
  const { tramos, listoParaPasar } = estadoDePedido(pedido, nombrePorId);

  return (
    <span className="flex min-w-0 flex-col gap-0.5 text-[11px] leading-4">
      {tramos.map((t) => (
        <span key={t.rol} className="flex flex-wrap items-baseline gap-x-1.5">
          {/* Con NOMBRE y no con avatar: dos iniciales en un círculo obligan a
              descifrar quién es, y la frase que se dice en el taller lleva el
              nombre — "eso lo tiene Jaime sin empezar". Los avatares valen en
              el tablero, donde cada zona ya tiene cara y color; aquí no. */}
          {t.quien.length > 0 && (
            <>
              <span className="min-w-0 font-medium text-text">{t.quien.join(", ")}</span>
              <span aria-hidden="true" className="text-text-muted">
                ·
              </span>
            </>
          )}
          {/* Solo el texto en el color de su rol —plantear esmeralda, revisar
              violeta, los de toda la app—, sin recuadro. Con fondo tintado, 40
              filas seguidas eran 40 pastillas de color compitiendo entre ellas
              y con el resto de la fila.
              Cuando lo que dice es que FALTA alguien va apagado: "Sin asignar"
              en el mismo verde que "Planteado" hacía que un pedido sin tocar
              pareciera terminado. */}
          <span
            className={`font-semibold ${
              t.pendienteDeAlguien ? "text-text-muted" : ROL[t.rol].texto
            }`}
          >
            {t.verbo}
          </span>
          {t.enMarcha && <LiveDot rol={t.rol} />}
          {t.minutos > 0 && (
            <span className="tabular-nums text-text-muted">{fmtMin(t.minutos)}</span>
          )}
        </span>
      ))}
      {/* El estado del PEDIDO, que no es de nadie: "Revisado" dice que el
          revisor terminó lo suyo, no que el parte esté listo — en uno de cuatro
          OF puede haber una revisada y tres sin empezar. Esto solo sale cuando
          ya no queda nada, y es lo que hay que ver para pasarlo a Producción.
          En el cian de `aprobada`, el mismo de toda la app. */}
      {listoParaPasar && (
        <span
          // Sin fondo, como los verbos de los tramos: la columna entera se lee
          // como texto y una pastilla suelta aquí abajo destacaría más que el
          // trabajo que sí hay que atender.
          className="font-semibold text-cyan-700 dark:text-cyan-300"
          title="Todas sus OF están aprobadas: solo falta pasarlo a Producción."
        >
          Listo para Producción
        </span>
      )}
    </span>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>;
}
