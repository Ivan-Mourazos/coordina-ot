"use client";

import { useState } from "react";
import type { HistorialOF } from "@/lib/historial";
import { porMinutos, repartoDe } from "@/lib/historial";
import type { SeccionId } from "@/lib/secciones";
import { fmtMin, ROL } from "@/lib/estado";
import { fmtFechaLarga, rangoDias } from "@/lib/fechas";
import { hoyISO } from "@/lib/types";
import { BloqueDesplegable } from "./BloqueDesplegable";
import { CENTRO_TONO, agruparCentros, rangoCentro, type HistorialCentro } from "@/lib/historial-centros";

const COLUMNAS = "grid items-start gap-x-4 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(min(20rem,100%),1fr))]";

const tareasDe = (centro: HistorialCentro) => centro.ofs.reduce((n, of) => n + (of.tareas?.length ?? 0), 0);

/** «Tareas y tiempos»: qué tareas lleva el pedido en RPS y cuánto se ha echado
 *  en cada una.
 *
 *  ERA UN POPOVER, una ventana encima de todo. Se abría justo sobre la ficha
 *  que estabas leyendo, tapándola, y había que cerrarla para volver — con el
 *  añadido de que un popover nativo no congela el `body` por su cuenta, así
 *  que la rueda seguía moviendo lo de detrás y al cerrar aparecías en otro
 *  sitio. Ahora es un bloque que se abre DENTRO, con el mismo borde y fondo
 *  que Documentos y Notas: se lee al lado de lo demás y no tapa nada. */
export function HistorialTareas({
  ofs,
  seccion,
  className = "mb-4",
  compacto = false,
  abrirAlMontar = false,
}: {
  /** Ya no se pinta (lo dice la cabecera de la ficha); se sigue recibiendo
   *  porque quien llama lo tiene a mano y sirve de clave al leer el código. */
  pedido: string;
  ofs: HistorialOF[];
  seccion: SeccionId;
  className?: string;
  /** En la lista del Historial va dentro de una fila ya desplegada: rótulo
   *  corto, con el largo en el `title`. */
  compacto?: boolean;
  /** Abierto nada más montar. Lo usa `TareasDelPedido`: allí el botón de
   *  verdad es el que dispara la carga, y al llegar los datos esto aparece ya
   *  abierto en vez de pedir un segundo clic. */
  abrirAlMontar?: boolean;
}) {
  return (
    <BloqueDesplegable
      titulo={compacto ? "Tareas" : "Tareas y tiempos"}
      tipo="tareas"
      abiertoDeSalida={abrirAlMontar}
      className={className}
      piezasHundidas
    >
      {/* Con color, como la consulta: el código de la OF y los tiempos se
          recorren con la vista sin leerlo todo. */}
      <TareasPorCentro ofs={ofs} seccion={seccion} conColor />
    </BloqueDesplegable>
  );
}

/** El contenido de «Tareas y tiempos»: los centros con trabajo echado, uno
 *  detrás de otro, y los que no tienen ni un minuto plegados en una línea.
 *
 *  Sale de dentro de la ventana para poder pintarlo TAL CUAL en la consulta sin
 *  login, que enseña lo mismo pero dentro de la ficha del pedido. Una sola
 *  pintura para los dos sitios: si fueran dos, acabarían diciendo cosas
 *  distintas del mismo pedido. */
export function TareasPorCentro({
  ofs,
  seccion,
  /** Con el color de marca en los códigos, los nombres y los tiempos. */
  conColor = false,
  extraCentro,
  extraOF,
}: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  conColor?: boolean;
  /** Lo que la ficha del equipo enseña de cada centro y que la ventana no: el
   *  tiempo por persona con su papel (planteó / revisó). */
  extraCentro?: (centro: HistorialCentro) => React.ReactNode;
  /** Lo que la ficha añade a cada OF: quién la hizo (cuando el centro tiene
   *  varias) y el material asignado. Van por aquí y no dentro de esta pieza
   *  porque la consulta sin login NO puede enseñar el material. */
  extraOF?: (of: HistorialOF, centro: HistorialCentro) => React.ReactNode;
}) {
  const centros = agruparCentros(ofs)
    .filter((centro) => centro.ofs.length)
    .sort((a, b) => rangoCentro(a.id, seccion) - rangoCentro(b.id, seccion));
  // Los centros sin un minuto no dicen nada: van plegados en una línea.
  const conTiempo = centros.filter((centro) => centro.totalMin > 0);
  const sinTiempo = centros.filter((centro) => centro.totalMin <= 0);
  const pinta = (centro: HistorialCentro) => (
    <CentroTareas
      key={centro.id}
      centro={centro}
      conColor={conColor}
      extraCentro={extraCentro}
      extraOF={extraOF}
    />
  );
  return (
    <>
      {/* LOS CENTROS LADO A LADO, tantos como quepan (Iván, 27/10/2026: «sigue
          en filas»): en la fila desplegada del Historial sobraba media
          pantalla a la derecha de cada centro. En la ficha, estrecha, cabe uno
          y quedan uno debajo de otro, como antes. */}
      <div className={COLUMNAS}>{conTiempo.map(pinta)}</div>
      {sinTiempo.length > 0 && (
        <details className={`text-xs ${conTiempo.length ? "mt-2.5 border-t border-border pt-1.5" : ""}`}>
          <summary className="cursor-pointer text-text-muted hover:text-text">
            Sin tiempo echado: {sinTiempo.map((centro) => {
              const n = tareasDe(centro);
              return n ? `${centro.nombre} (${n} ${n === 1 ? "tarea" : "tareas"})` : centro.nombre;
            }).join(" · ")}
          </summary>
          <div className={`mt-3 ${COLUMNAS}`}>{sinTiempo.map(pinta)}</div>
        </details>
      )}
    </>
  );
}

/** Un centro con sus OF y, dentro, sus tareas.
 *
 *  QUIÉN ECHÓ CADA TAREA SALE EN TODOS LOS CENTROS, no solo en el que se está
 *  mirando: esto se abre justo para eso, y dejar Diseño y Taller con un número
 *  y sin nadie obligaba a preguntar por el pasillo quién lo había hecho. */
function CentroTareas({
  centro,
  conColor = false,
  extraCentro,
  extraOF,
}: {
  centro: HistorialCentro;
  conColor?: boolean;
  extraCentro?: (centro: HistorialCentro) => React.ReactNode;
  extraOF?: (of: HistorialOF, centro: HistorialCentro) => React.ReactNode;
}) {
  // El color del centro, el mismo que en la ficha del Historial (CENTRO_TONO).
  // Sin color (la consulta lo pide sin él), todo en el tono del texto.
  const tono = CENTRO_TONO[centro.id];
  const acento = conColor ? tono.texto : "";
  return (
    // Aire entre centro y centro. Iban pegados, y con tres o cuatro no se veía
    // dónde acababa uno.
    <section className="min-w-0">
      <h4
        className="mb-1.5 flex items-center gap-2 px-0.5 text-[13px] font-semibold"
        title="Tiempo imputado en RPS"
      >
        <span className={`size-2.5 shrink-0 rounded-full ${tono.punto}`} aria-hidden="true" />
        <span className="flex-1">{centro.nombre}</span>
        <span className={`font-mono tabular-nums ${acento}`}>{fmtMin(centro.totalMin)}</span>
      </h4>
      {extraCentro?.(centro)}
      {/* CADA OF EN SU PIEZA HUNDIDA, como cada nota en «Notas», y no un
          texto seguido sobre el fondo del bloque: era todo el mismo gris y
          había que leerlo entero para ver dónde acababa una OF (Iván,
          16/10/2026). Lleva a la izquierda el color de su centro. */}
      <div className="space-y-1.5">
        {centro.ofs.map((of) => {
          const extra = extraOF?.(of, centro);
          return (
          <div
            key={of.codigo}
            className={`recuadro overflow-hidden rounded-lg border-l-[3px] text-xs ${tono.raya}`}
          >
            {/* TRES ESCALONES, y se distinguen por peso y tamaño, no por
                sangría sola: el centro (14 px, negrita), la OF (12 px,
                negrita, con su código en mono) y las tareas (11 px, normales).

                El código en mono y el resto en la tipografía normal: "0232035"
                es una matrícula que se compara con la vista, y la descripción
                se lee. Mezclarlos en mono hacía la descripción más lenta de
                leer. */}
            <p className="flex items-baseline justify-between gap-3 px-2.5 pt-1.5 pb-0.5">
              <span className="min-w-0 truncate font-semibold leading-snug" title={`${of.codigo} · ${of.descripcion}`}>
                <span className={`font-mono ${acento}`}>{of.codigo}</span>
                {" · "}
                {of.descripcion}
              </span>
                <span
                  className={`shrink-0 font-mono font-semibold tabular-nums ${acento}`}
                  title="Tiempo imputado en RPS"
                >
                  {fmtMin(of.tiempoImputadoMin)}
                </span>
            </p>
            <div className="px-2.5 pb-1 text-[11px]">
              <TareasDeOF
                of={of}
                conColor={conColor}
                claseTiempo={conColor ? tono.texto : undefined}
                claseBarra={conColor ? tono.punto : "bg-text-muted"}
              />
            </div>
            {extra && <div className="px-2.5 pb-1.5">{extra}</div>}
          </div>
          );
        })}
      </div>
    </section>
  );
}

/** Las tareas de una OF: qué se hace, quién la echó y cuánto lleva.
 *
 *  TRES COLUMNAS ALINEADAS y no un `flex` de tres trozos. Con flex, el nombre
 *  y el tiempo caían en un sitio distinto en cada línea según lo larga que
 *  fuera la tarea, y la columna de tiempos —que es la que se recorre con la
 *  vista— no existía como columna. El ancho del tiempo es fijo, y `tabular-nums`
 *  hace que "7m" y "1h 20m" ocupen lo mismo por cifra.
 *
 *  Vive aquí y la pintan DOS sitios —este bloque y el lateral de la ficha del
 *  Historial— porque son la misma información. Estuvo duplicada un tiempo y
 *  acabaron diciendo cosas distintas del mismo pedido. */
export function TareasDeOF({
  of,
  conColor = false,
  rolDe: rolRecibido,
  claseTiempo,
  claseBarra,
}: {
  of: HistorialOF;
  conColor?: boolean;
  /** Con ella, las tareas van en filas separadas y cada una lleva una barra
   *  con su parte del tiempo de la OF, del color que se pase (el del centro).
   *  Las que no tienen tiempo, con una raya en vez de «0m». */
  claseBarra?: string;
  /** Color de los tiempos: el de su centro en la ficha del Historial. Manda
   *  sobre `conColor`. */
  claseTiempo?: string;
  /** El papel de cada persona en la OF, si se sabe (la ficha del Historial):
   *  cada nombre de la tarea lleva su «Autor» o «Revisor». Con color si está
   *  registrado en CoordinaOT; en gris si se dedujo de las horas de RPS. */
  rolDe?: (nombre: string) => { rol: "plantear" | "revisar"; deducido: boolean } | undefined;
}) {
  if (!of.tareas?.length) {
    return <p className="text-text-muted">Esta OF no tiene tareas en RPS.</p>;
  }
  // El papel pertenece a esta entrada de centro, tanto en Pendientes como en
  // Historial. Conserva también a quien revisó en menos de un minuto.
  const reparto = repartoDe([of]);
  const deducido = of.rolDeducido;
  const rolDe = rolRecibido ?? (reparto.consta || deducido ? (nombre: string) => {
    const autores = reparto.consta ? reparto.autores : deducido?.quienPlanteo;
    const revisores = reparto.consta ? reparto.revisores : deducido?.quienReviso;
    if (autores?.includes(nombre)) return { rol: "plantear" as const, deducido: !reparto.consta };
    if (revisores?.includes(nombre)) return { rol: "revisar" as const, deducido: !reparto.consta };
    return undefined;
  } : undefined);
  // Sin rayas (Iván, 27/10/2026: «si las rayas lían, las quitamos»): el
  // tiempo de cada tarea ya va en cifras. `claseBarra` sigue diciendo si es la
  // vista de detalle (la que pinta «—» y junta las tareas sin tiempo).
  const conBarra = claseBarra !== undefined;
  // Las tareas sin un minuto y sin nadie, juntas en UNA línea al final: en
  // Taller una OF lleva cinco o seis, y cada una gastaba un renglón entero
  // para decir «—» (Iván, 27/10/2026: «se debería compactar»). Con una sola
  // no se agrupa: ocupa lo mismo.
  const sinNadie = (t: (typeof of.tareas)[number]) =>
    t.tiempoImputadoMin <= 0 && !t.personas.some((p) => p.min > 0 || (rolDe && rolDe(p.nombre)));
  const vacias = conBarra ? of.tareas.filter(sinNadie) : [];
  const juntas = vacias.length >= 2;
  const visibles = juntas ? of.tareas.filter((t) => !vacias.includes(t)) : of.tareas;
  return (
    <div className={`@container ${claseBarra !== undefined ? "divide-y divide-border" : ""}`}>
      {visibles.map((tarea) => {
        // Con papeles (la ficha del Historial), quien es autor o revisor sale
        // aunque su tiempo sea 0: RPS guarda minutos enteros y una revisión de
        // menos de uno queda a cero (AR.26.04928).
        const personas = tarea.personas
          .filter((p) => p.min > 0 || (rolDe && rolDe(p.nombre)))
          .sort(porMinutos);
        const vacia = tarea.tiempoImputadoMin <= 0;
        // Con autor y revisor, cada uno lleva SUS minutos en su etiqueta, y el
        // total de la OF sale arriba: el de la tarea sobraba (Iván,
        // 27/10/2026), y su columna se la queda el nombre de la tarea.
        const sinTotal = Boolean(rolDe) && personas.length > 0;
        return (
          // DOS RENGLONES, no tres columnas. Eran
          // `grid-cols-[minmax(0,1fr)_auto_56px]`, y esa columna `auto` del
          // medio se queda con lo que pide su contenido: en la ficha del
          // Historial, que es estrecha, no dejaba sitio a la primera y la
          // descripción salía a una palabra por línea.
          //
          // Arriba QUÉ se hizo y cuánto costó, que es lo que se recorre con la
          // vista; debajo y más apagado, QUIÉN — que solo se mira cuando algo
          // llama la atención. Así la descripción dispone del ancho entero y
          // da igual lo estrecho que sea el hueco.
          //
          // COMPACTO (Iván, 27/10/2026: «se debería compactar»): qué, quién y
          // cuánto en UNA línea en cuanto hay sitio. Quién sin papeles (Taller,
          // Diseño) cabe ya en la ficha, recortado y entero al pasar el ratón;
          // con Autor/Revisor y fechas, solo en la fila desplegada del
          // Historial, y en la ficha baja a un segundo renglón. La barra ya no
          // gasta renglón: es una raya fina pegada al pie de la tarea.
          //
          // En la fila ancha del Historial, COLUMNAS DE VERDAD (Iván,
          // 27/10/2026: «¿dónde están las columnas?»): la tarea con ancho
          // fijo, quién justo al lado y entero, y el tiempo al final. Con quién
          // pegado a la derecha quedaba media pantalla vacía en medio y el
          // nombre recortado.
          <div
            key={tarea.codigo}
            className={`grid items-baseline gap-x-3 py-1 ${
              sinTotal
                ? "grid-cols-[minmax(0,1fr)] @[36rem]:grid-cols-[minmax(0,1fr)_auto]"
                : `grid-cols-[minmax(0,1fr)_auto] ${rolDe ? "" : "@[22rem]:grid-cols-[minmax(0,1fr)_minmax(0,auto)_3.5rem]"} @[44rem]:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_3.5rem]`
            } ${vacia ? "text-text-muted" : ""}`}
          >
            <span className="min-w-0 truncate leading-snug" title={`${tarea.codigo} ${tarea.descripcion}`}>
              <span className="font-mono text-[10px] text-text-muted">{tarea.codigo}</span>{" "}
              {tarea.descripcion}
            </span>
            {!sinTotal && <span
              className={`shrink-0 text-right font-mono tabular-nums ${rolDe ? "" : "@[22rem]:col-start-3 @[22rem]:row-start-1"} @[44rem]:col-start-3 @[44rem]:row-start-1 ${vacia ? "" : "font-semibold"} ${
                vacia ? "" : (claseTiempo ?? (conColor ? "text-brand-800 dark:text-brand-300" : ""))
              }`}
            >
              {vacia && claseBarra !== undefined ? "—" : fmtMin(tarea.tiempoImputadoMin)}
            </span>}
            {personas.length > 0 && !rolDe && (
              <p
                className="col-span-2 truncate text-[11px] leading-snug text-text-muted @[22rem]:col-span-1 @[22rem]:col-start-2 @[22rem]:row-start-1 @[22rem]:max-w-[16rem] @[22rem]:text-right @[44rem]:max-w-none @[44rem]:whitespace-normal @[44rem]:text-left"
                title={personas.map((p) => `${p.nombre} ${fmtMin(p.min)}`).join(" · ")}
              >
                {personas.map((p) => `${p.nombre} ${fmtMin(p.min)}`).join(" · ")}
              </p>
            )}
            {personas.length > 0 && rolDe && (
              <p className="flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[11px] leading-snug text-text-muted @[36rem]:col-start-2 @[36rem]:row-start-1 @[36rem]:justify-end">
                {/* Sin «·» entre personas: al partirse la línea se quedaba al
                    principio del renglón siguiente. El hueco las separa. */}
                {personas.map((p) => {
                  const papel = rolDe?.(p.nombre);
                  // QUÉ DÍAS lo echó (se ve si la revisión llegó días después
                  // del planteo, o si un trabajo se partió): al pasar el ratón,
                  // no a la vista. Con «· 05–14/10» detrás de cada nombre, en la
                  // ficha no cabían autor y revisor junto a la tarea sin cortar
                  // su nombre (Iván, 28/10/2026).
                  const dias = p.desde && p.hasta
                    ? `${p.desde === p.hasta ? `Imputado el ${fmtFechaLarga(p.desde)}` : `Imputado del ${fmtFechaLarga(p.desde)} al ${fmtFechaLarga(p.hasta)}`} (${rangoDias(p.desde, p.hasta, hoyISO())})`
                    : undefined;
                  return (
                    <span key={p.nombre} className="flex items-center gap-1" title={dias}>
                      {papel && (
                        <span
                          className={`rounded px-1 text-[9px] font-bold uppercase ${
                            papel.deducido ? "bg-text-muted/15 text-text-muted ring-1 ring-border-strong" : ROL[papel.rol].chip
                          }`}
                          title={papel.deducido ? "Deducido de las horas de RPS: esta OF no se fichó en Coordina" : undefined}
                        >
                          {papel.rol === "plantear" ? "Autor" : "Revisor"}
                        </span>
                      )}
                      <span>{p.nombre}</span>
                      {/* Con papeles, el tiempo de cada uno SIEMPRE: la línea
                          de autor y revisor de la OF se retira al desplegar y
                          es aquí donde se lee quién echó cuánto. */}
                      <span>{p.min > 0 ? fmtMin(p.min) : "<1m"}</span>
                    </span>
                  );
                })}
              </p>
            )}
          </div>
        );
      })}
      {juntas && (
        <p className="truncate py-1 text-text-muted" title={vacias.map((t) => `${t.codigo} ${t.descripcion}`).join("\n")}>
          <span className="font-semibold">Sin tiempo:</span>{" "}
          {vacias.map((t) => t.descripcion.trim() || t.codigo).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** «Tareas y tiempos» para un pedido que TODAVÍA no está en el Historial.
 *
 *  El desglose por tarea y centro sale del detalle del Historial, y ese dato
 *  no lo tiene el tablero: hay que pedirlo a RPS, y cuesta entre 2,5 y 5
 *  segundos (medido). Por eso NO se carga al abrir la ficha —como los
 *  documentos, por lo mismo—, sino al pulsar; cuando llega, la ventana se abre
 *  sola para no cobrar un segundo clic.
 *
 *  Sirve para un pedido a medias: enseña lo que lleva imputado hasta ahora. */
export function TareasDelPedido({
  pedido,
  seccion,
  className,
}: {
  pedido: string;
  seccion: SeccionId;
  className?: string;
}) {
  const [ofs, setOfs] = useState<HistorialOF[] | null>(null);
  const [estado, setEstado] = useState<"quieto" | "cargando" | "error">("quieto");

  async function cargar() {
    setEstado("cargando");
    try {
      const r = await fetch(`/api/historial/${pedido}?seccion=${seccion}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { ofs?: HistorialOF[] };
      setOfs(d.ofs ?? []);
      setEstado("quieto");
    } catch {
      setEstado("error");
    }
  }

  // El bloque permanece montado mientras llegan los datos: si se sustituyera
  // al terminar la petición, se abriría otra vez aunque ya hubiéramos abierto
  // Documentos. La carga no decide qué apartado está abierto.
  return (
    <BloqueDesplegable
      titulo="Tareas y tiempos"
      tipo="tareas"
      className={className}
      piezasHundidas
      onAbrir={() => { if (!ofs && estado !== "cargando") void cargar(); }}
    >
      {ofs && <TareasPorCentro ofs={ofs} seccion={seccion} conColor />}
      {estado === "cargando" && <p role="status" className="text-[11px] text-text-muted">Cargando tareas…</p>}
      {estado === "error" && (
        <p role="alert" className="text-[11px] text-text">
          No se pudieron cargar las tareas. <button type="button" onClick={() => void cargar()} className="chip-3d rounded px-2 py-1 font-semibold">Reintentar</button>
        </p>
      )}
    </BloqueDesplegable>
  );
}
