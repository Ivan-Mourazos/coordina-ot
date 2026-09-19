"use client";

import { PedidoCodigo } from "./PedidoCodigo";

import { useMemo, useState } from "react";
import type { EstadoMaterial, Operario, Pedido } from "@/lib/types";
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
import { estadoDePedido, type TramoEstado } from "@/lib/frase-estado";
import { TRAMO, lineaTiempo, repartirEtiquetas, urgenciaRecorrido } from "@/lib/linea-tiempo";
import type { OrdenLista } from "@/lib/filtros";
import { FamiliaTag } from "./FamiliaTag";
import { LiveDot } from "./LiveBadge";
import { BloqueLista } from "./BloqueLista";
import { FilaDesplegable } from "./FilaDesplegable";
import { FilaOF } from "./FilaOF";
import { negocioAparte } from "@/lib/negocio";
import { IconoAviso } from "./Iconos";

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
//     parecía el principio del siguiente. Eso lo pone `FilaDesplegable`, que es
//     de donde salen también el chevron y la animación.

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

/** Las mismas columnas en la cabecera y en cada fila. Literal entera: Tailwind
 *  solo compila las clases que ve escritas.
 *
 *  Son los mismos repartos de antes —36 % identidad, 22 % estado, 42 %
 *  recorrido con suelo de 440 px— más los 32 px del chevron, que en la tabla
 *  era una `<Th className="w-8" />`. El `min-w` del recorrido es el suelo por
 *  debajo del cual las cuatro fechas de la línea se pisan.
 *
 *  El suelo BAJÓ de 520 a 440: con 520, el ancho total de la fila (32 +
 *  36 % + 22 % + 520, más los `gap-x-3` entre columnas) supera el ancho
 *  disponible en cuanto la ventana baja de ~1400 px de contenido —un
 *  portátil normal, no un caso raro—, y el sobrante empuja el chip
 *  "+Xd"/el último punto fuera de lo visible. Con `desbordaHorizontal` ya no
 *  se RECORTA (eso lo arregló un commit anterior), pero sigue habiendo que
 *  arrastrar la barra para verlo, y nadie lo hace: se ve cortado igual. 440
 *  empuja ese umbral por debajo de ~900 px de contenido, fuera del rango de
 *  cualquier ventana real, sin tocar la separación mínima entre fechas: baja
 *  con el mismo suelo (ver `RECORRIDO_PX`), así que a 440 px las cuatro
 *  siguen sin pisarse.
 *
 *  Identidad y estado ya no van en %, sino con TOPE (28 rem y 18 rem), y el
 *  recorrido se lleva el resto. En porcentaje, en un monitor de 2.500 px la
 *  columna del cliente medía 900 px para un nombre de 300, y "quién · estado"
 *  quedaba flotando a media fila, lejos del pedido. Hasta ~1.400 px de ancho
 *  el reparto sale casi igual que antes; por encima, lo que crece es la línea
 *  de tiempo, que es lo único que gana algo con más sitio. Y el mínimo total
 *  baja: el cliente puede encoger hasta cero antes que el recorrido. */
const COLUMNAS_LISTA =
  "grid grid-cols-[32px_minmax(0,28rem)_minmax(200px,18rem)_minmax(440px,1fr)] items-center gap-x-3";

/** `RECORRIDO_PX` repite ese mínimo como número, para la cuenta de separación
 *  de las fechas de aquí abajo: los dos tienen que decir lo mismo. */
const RECORRIDO_PX = 440;

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
    // `w-full` a secas: el ancho lo manda la COLUMNA (ver COLUMNAS_LISTA) y la
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
                : "var(--hoy)",
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
          className="shrink-0 rounded px-1 py-px text-[10px] font-bold leading-none"
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

  const cabecera = (
    <>
      <span />
      <span>Pedido · cliente</span>
      <span>Quién · estado</span>
      <span>
        <span className="block">Recorrido</span>
        <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-text-muted">
          creación · <span className="font-semibold text-text">planificada</span> ·
          fabricación · solicitada
        </span>
      </span>
    </>
  );

  if (ordenados.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <div>
          <p className="text-sm font-semibold text-text">
            {hayFiltrosActivos ? "Ningún pedido pasa los filtros" : "No hay trabajo pendiente"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-text-muted">
            {hayFiltrosActivos
              ? "Hay pedidos en la lista, pero los filtros de arriba los dejan todos fuera. Quita alguno para volver a verlos."
              : "Aquí sale lo que aún no ha pasado a Producción. Los pedidos nuevos aparecerán en cuanto Producción los planifique para Oficina Técnica."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <BloqueLista columnas={COLUMNAS_LISTA} cabecera={cabecera} desbordaHorizontal sinCaja>
        {ordenados.map((p) => {
          // Terminado = la planificación vencida ya no es un problema
          // pendiente. Misma regla que `estaAtrasado`, que también los excluye.
          const hecho = estaFinalizado(p);
          const pendienteProc = p.situacion === "pendiente";
          const fichando = p.ofs.find((o) => o.fichandoRol)?.fichandoRol ?? null;
          // Una sola vez por fila: la columna de estado pinta los tramos y la
          // celda de identidad pinta "Listo para Producción" cuando toca (ver
          // el comentario junto a ese texto, más abajo).
          const { tramos, listoParaPasar } = estadoDePedido(p, nombrePorId);
          return (
            <FilaDesplegable
              key={p.id}
              columnas={COLUMNAS_LISTA}
              abierta={expandidos.has(p.id)}
              onAlternar={() => toggle(p.id)}
              etiqueta={p.codigo}
              idDetalle={`detalle-${p.id}`}
              tarjeta
              celdas={
                <>
                  {/* ─── La celda de identidad ───────────────────────────
                      Arriba QUÉ pedido es y de qué va; abajo, de quién es. */}
                  <div className="pointer-events-none min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="h-3.5 w-1 shrink-0 rounded-full"
                        style={{ background: PRIORIDAD[p.prioridad].color, color: PRIORIDAD[p.prioridad].tinta }}
                        title={`Prioridad ${PRIORIDAD[p.prioridad].label}`}
                      />
                      {/* El código SÍ se pulsa: sale del `pointer-events-none`. */}
                      <span className="pointer-events-auto">
                        <PedidoCodigo codigo={p.codigo} onAbrir={() => onOpen(p)} />
                      </span>
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
                      {familiasDe(p).map((f) => (
                        <FamiliaTag key={f} familia={f} />
                      ))}
                      {/* SUBIÓ desde la columna de estado (ver el comentario que
                          llevaba allí, y por qué cambia aquí, en `EtiquetaListo`
                          más abajo). Va AL FINAL de la línea, después de las
                          familias: es la última pieza que se lee ("de qué es, y
                          ya está listo"), y así nunca se interpone entre el
                          código y ellas cuando el ancho aprieta — con
                          `flex-wrap` lo que no cabe baja de línea, no tapa. */}
                      {listoParaPasar && <EtiquetaListo />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-text-muted">
                      <span
                        className="min-w-0 text-text"
                        title={p.negocio ? `Cliente ${p.cliente} · Negocio ${p.negocio}` : `Cliente ${p.cliente}`}
                      >
                        {p.cliente}
                        {negocioAparte(p.cliente, p.negocio) && (
                          <span className="text-text-muted"> · {negocioAparte(p.cliente, p.negocio)}</span>
                        )}
                      </span>
                      {p.interno && (
                        <span
                          className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border"
                          title="Proyecto interno: sin pedido de venta"
                        >
                          Interno
                        </span>
                      )}
                      {pendienteProc && (
                        <span
                          className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border"
                          title="Producción todavía no lo ha pasado a Oficina Técnica"
                        >
                          Sin procesar
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="pointer-events-none min-w-0">
                    <Estado tramos={tramos} />
                  </div>
                  {/* Terminado = el recorrido ya no dice nada: el pedido no se
                      mueve más. Se apaga entero en vez de teñir media lista de
                      rojo por trabajo que ya está hecho. */}
                  <div className={`pointer-events-none min-w-0 ${hecho ? "opacity-40 grayscale" : ""}`}>
                    <Recorrido pedido={p} hoy={hoy} />
                  </div>
                </>
              }
              detalle={<Detalle p={p} hoy={hoy} operarios={operarios} />}
            />
          );
        })}
      </BloqueLista>
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
            <li key={a} className="flex items-start gap-1.5 text-[11px] leading-5 text-indigo-800 dark:text-indigo-200">
              <IconoAviso className="mt-1 size-3.5" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
      {p.comentarioVenta && <ComentarioComercial texto={p.comentarioVenta} />}
      <ul className="space-y-1.5">
        {p.ofs.map((of) => (
          <FilaOF key={of.id} of={of} operarios={operarios} hoy={hoy} />
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

/** Quién lleva el pedido y por dónde va, en una frase.
 *
 *  Sustituye a tres columnas —avatares de autor y revisor, fase y minutos— que
 *  contaban a trozos algo que en el taller se dice de corrido: "lo planteó
 *  Iván, 25 minutos, y lo tiene Tamara para revisar". Los tramos los arma
 *  `estadoDePedido`, que está probado aparte; aquí solo se pintan.
 *
 *  YA NO PINTA "Listo para Producción": ese texto solo salía cuando no
 *  quedaban tramos que contar, y era el único motivo por el que un pedido
 *  terminado gastaba tres renglones en esta columna —dos de gente y uno de
 *  cierre— frente a los dos de la celda de identidad. Ahora vive arriba, junto
 *  al código (ver `EtiquetaListo`), y esta columna se queda solo con los
 *  tramos: como mucho dos renglones, uno por rol. */
function Estado({ tramos }: { tramos: TramoEstado[] }) {
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
    </span>
  );
}

/** "Listo para Producción": todas las OF que cuentan están aprobadas y solo
 *  falta la acción de pasarlo. Antes vivía al final de la columna de estado, y
 *  el comentario que llevaba explicaba por qué SIN fondo: ahí abajo los
 *  verbos de los tramos ("Planteando", "Revisado"…) tampoco llevan pastilla, y
 *  una suelta habría destacado más que el trabajo que sí queda por hacer.
 *
 *  Aquí arriba el argumento se invierte. Esta línea ya no es una columna de
 *  texto corrido: es donde viven la barra de prioridad, el código, el nº de
 *  OF y las FAMILIAS, que sí son chips de color (`FamiliaTag`). Sin fondo,
 *  "Listo para Producción" se perdería entre ellas justo cuando es un pedido
 *  entero —no una OF— el que ha terminado, que es la única vez que sale. Con
 *  el mismo dibujo de pastilla que ya usan "Detenida" o "Taller" más abajo en
 *  el detalle, y el cian de `aprobada`, el mismo de toda la app. */
function EtiquetaListo() {
  return (
    <span
      className={`rounded bg-cyan-600/12 px-1.5 py-0.5 text-[10px] font-bold uppercase dark:bg-cyan-400/15 ${ESTADO.aprobada.texto}`}
      title="Todas sus OF están aprobadas: solo falta pasarlo a Producción."
    >
      Listo para Producción
    </span>
  );
}

/** El comentario del comercial en la fila desplegada, plegado a una línea
 *  como en la ficha (ComentarioPedido): casi siempre es el mismo texto legal
 *  de TGM y, entero, ocupaba dos líneas de 1.500 px en cada pedido abierto. */
function ComentarioComercial({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false);
  const largo = texto.length > 140 || texto.includes("\n");
  return (
    <div className="rounded-lg bg-surface px-2.5 py-1.5 text-[11px] leading-5 text-text ring-1 ring-border">
      <p className={abierto || !largo ? "whitespace-pre-line" : "line-clamp-1"}>
        <span className="font-semibold text-text-muted">Comercial: </span>
        {texto}
      </p>
      {largo && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="text-[11px] font-semibold text-brand-800 hover:underline dark:text-brand-300"
        >
          {abierto ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}
