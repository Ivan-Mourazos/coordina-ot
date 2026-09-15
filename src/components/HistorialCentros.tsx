"use client";

import type { HistorialOF, MaterialOF } from "@/lib/historial";
import { personasConRol, personasDeOF, personasDeOFs, repartirMateriales, repartoDe } from "@/lib/historial";
import { fmtMin, ROL } from "@/lib/estado";
import { agruparCentros, centrosConDesglose } from "@/lib/historial-centros";
import type { SeccionId } from "@/lib/secciones";
import { TareasDeOF } from "./HistorialTareas";
import {
  BOTON_DETALLE,
  CabeceraVentana,
  LINEA,
  LISTA,
  VentanaAnclada,
  useVentanaAnclada,
} from "./VentanaAnclada";

// ─── Tiempos por centro de la ficha del pedido ──────────────────────────────
// Vivía dentro de HistorialDrawer.tsx. Sale a su fichero porque la consulta
// sin login pinta la MISMA ficha, y la pantalla del invitado no debe arrastrar
// el resto del cajón del equipo (notas, parte escaneado, avisos).

/** El centro decide qué minutos se suman; la selección decide el desglose visible. */
export function HistorialCentros({ ofs, seccion }: { ofs: HistorialOF[]; seccion: SeccionId }) {
  // Un desglose solo sale si dice algo que el nivel de arriba no dice: las
  // personas del centro, siempre en el que cuenta; las de cada OF, solo si el
  // centro tiene varias. Con una sola OF eran los mismos nombres dos veces.
  const conDesglose = centrosConDesglose(ofs, seccion);
  return (
    // Sin rótulo "Trabajo por centro": debajo va un bloque por centro y cada
    // uno se llama Oficina Técnica, Diseño Gráfico o Taller, que lo dice mejor.
    <section aria-label="Tiempos por centro de trabajo" className="space-y-3">
      {agruparCentros(ofs).filter((centro) => centro.ofs.length > 0).map((centro) => {
        const seleccionado = centro.id === seccion;
        const desglose = conDesglose.has(centro.id);
        // Con el papel de cada uno, que es lo que se busca al abrir la ficha.
        // El reparto se junta de TODAS las OF del centro, igual que los
        // minutos, y manda el registrado (ver `repartoDe`).
        const reparto = repartoDe(centro.ofs);
        const personas = desglose
          ? personasConRol(personasDeOFs(centro.ofs), reparto.autores, reparto.revisores, reparto.consta)
          : [];
        const porOF = desglose && centro.ofs.length > 1;
        // Su tiempo ES el del centro: no se repite (ver abajo).
        const unaSolaPersona = personas.length === 1 && personas[0].min === centro.totalMin;
        return (
          <details key={centro.id} open={seleccionado || desglose} className="bloque-3d rounded-xl">
            <summary className="cursor-pointer rounded-xl p-3 text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-accent">
              {centro.nombre}
              <span className="float-right ml-2 font-mono text-xs tabular-nums" title="Tiempo imputado en RPS">{fmtMin(centro.totalMin)}</span>
            </summary>
            <div className="space-y-3 px-3 pb-3">
              {personas.length > 0 && (
                <div>
                  {/* El rótulo solo si de verdad hay tiempos que leer: con
                      una sola persona el número se calla (es el del centro) y
                      «Tiempo por persona» quedaba encabezando una lista de
                      nombres a secas. */}
                  {!unaSolaPersona && (
                    <p className="mb-1 text-[11px] text-text-muted">Tiempo por persona</p>
                  )}
                  <ul className="space-y-1 text-xs text-text" aria-label={`Tiempos por persona de ${centro.nombre}`}>
                    {personas.map((persona) => (
                      <li key={persona.nombre} className="flex justify-between gap-3">
                        <span>
                          {persona.nombre}
                          {persona.rol && (
                            <span className={ROL[persona.rol].texto}>
                              {" "}
                              {persona.rol === "plantear" ? "planteó" : "revisó"}
                            </span>
                          )}
                        </span>
                        {/* Con una sola persona su tiempo ES el del centro,
                            que está tres líneas más arriba: escribirlo aquí
                            otra vez no añade nada. Con varias sí reparten, y
                            entonces vuelve. */}
                        {!unaSolaPersona && (
                          <span className="font-mono tabular-nums">{fmtMin(persona.min)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {centro.ofs.length === 0 ? (
                <p className="text-xs text-text-muted">Sin trabajo registrado en este centro.</p>
              ) : (
                <ul className="space-y-2" aria-label={`Órdenes de fabricación de ${centro.nombre}`}>
                  {centro.ofs.map((of) => (
                    <li key={of.codigo} className="glass-chip rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-text">{of.codigo}</span>
                        {/* Lo mismo con la OF: si es la única del centro, su
                            tiempo es el del centro. El código y la descripción
                            se quedan; el número, no. */}
                        {!(centro.ofs.length === 1 && of.tiempoImputadoMin === centro.totalMin) && (
                          <span title="Tiempo imputado en RPS" className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text ring-1 ring-border">
                            {fmtMin(of.tiempoImputadoMin)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-text">{of.descripcion}</p>
                      {/* Las personas de la OF solo cuando NO hay tareas: con
                          ellas, cada línea ya dice quién la echó, y el resumen
                          de arriba repetía los mismos nombres dos líneas más
                          abajo. */}
                      {porOF && !of.tareas?.length && <PersonasOF of={of} />}
                      {/* El desglose de tareas, aquí y no en una ventana que se
                          abre encima de la ficha tapando lo que se está
                          mirando. Quién echó cada tarea sale en TODOS los
                          centros —también en Taller—: era lo único que la
                          ventana enseñaba y esto no. */}
                      {of.tareas?.length ? (
                        <div className="mt-2 border-t border-border pt-2 text-xs">
                          <TareasDeOF of={of} />
                        </div>
                      ) : null}
                      <Materiales of={of} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}

/** Quién imputó tiempo a esta OF en RPS, con el suyo, de más a menos.
 *
 *  Sin rol, igual que la fila del pedido y «Tareas y tiempos». Aquí salían
 *  "Planteo / ≈ Revisión / Imputó", y el mismo pedido parecía tener un autor en
 *  la lista y más gente en la ficha. El orden es el de `porMinutos` en todos
 *  los sitios, así que las mismas personas salen siempre en el mismo orden. */
function PersonasOF({ of }: { of: HistorialOF }) {
  // El papel de cada uno EN PALABRAS, que es lo que se busca al abrir la ficha:
  // quién la planteó y quién la repasó. Manda el reparto registrado en
  // CoordinaOT; lo deducido de las horas no se nombra (ver `repartoDe`).
  const reparto = repartoDe([of]);
  const personas = personasConRol(personasDeOF(of), reparto.autores, reparto.revisores, reparto.consta);
  if (personas.length === 0) {
    return <p className="mt-1 text-[11px] text-text-muted">Sin tiempo registrado.</p>;
  }
  return (
    <p className="mt-2 text-[11px] text-text-muted" title="Tiempo por persona: el imputado en RPS o, si aún no hay, el fichado en CoordinaOT">
      {/* El papel DELANTE del tiempo: detrás se leía "Iván Sánchez 2m planteó",
          como si el minuto fuera lo planteado. */}
      {personas.map((p, i) => (
        <span key={p.nombre}>
          {i > 0 && " · "}
          <span className="text-text">{p.nombre}</span>
          {p.rol && (
            <span className={ROL[p.rol].texto}> {p.rol === "plantear" ? "planteó" : "revisó"}</span>
          )}{" "}
          {fmtMin(p.min)}
        </span>
      ))}
    </p>
  );
}

/** Material que lleva la OF y lo que Producción apuntó en ella, tras botones
 *  con cantidad. La ventana es la misma que la de Pendientes (VentanaAnclada).
 *
 *  Y las palabras también: «asignado en la OF» es el material que lleva;
 *  «reservado», que sigue habiendo reserva viva en RPS. Aquí se llamaban
 *  "Apuntado" y "Apartado", y el mismo material se nombraba de dos maneras
 *  según la pestaña.
 *
 *  Lo que aquí NO puede decirse es "sin reservar": la reserva se borra al
 *  consumir el material, así que en un pedido cerrado que no quede ninguna no
 *  demuestra que nunca la hubiera. Por eso la línea sin reserva no lleva marca
 *  y la cabecera habla de HOY.
 *
 *  Casi nunca quedará reserva: de las 36 918 OF de OT ya terminadas, 140
 *  conservan reserva y 14 419 conservan material asignado. La reserva viva
 *  sale en los pedidos recién cerrados, que es justo cuando alguien la mira. */
function Materiales({ of }: { of: HistorialOF }) {
  const { apartados, apuntados } = repartirMateriales(of.materiales);
  if (!apartados.length && !apuntados.length && !of.notasProduccion) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {apartados.length + apuntados.length > 0 && (
        <MaterialHistorico of={of.codigo} reservados={apartados} resto={apuntados} />
      )}
      {of.notasProduccion && <NotasProduccion of={of.codigo} texto={of.notasProduccion} />}
    </div>
  );
}

function MaterialHistorico({
  of,
  reservados,
  resto,
}: {
  of: string;
  reservados: MaterialOF[];
  resto: MaterialOF[];
}) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  const total = reservados.length + resto.length;
  const conReserva = reservados.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Material asignado en la OF. Se marca el que sigue reservado en RPS; la reserva se borra al consumir el material."
        className={`${BOTON_DETALLE} ${conReserva ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}`}
      >
        <span aria-hidden>🧵</span>
        Material
        <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-text ring-1 ring-border">
          {total}
        </span>
      </button>
      {anclaje && (
        <VentanaAnclada anclaje={anclaje} onCerrar={cerrar} etiqueta={`Material de la OF ${of}`}>
          <CabeceraVentana
            titulo="Asignado en la OF"
            cuantos={total}
            nota={conReserva ? `${reservados.length} sigue${reservados.length === 1 ? "" : "n"} reservado${reservados.length === 1 ? "" : "s"}` : "Sin reserva viva hoy"}
            claseNota={conReserva ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}
            tituloNota="La reserva se borra al consumir el material: que hoy no quede ninguna no quiere decir que no se reservara."
          />
          <ul className={LISTA}>
            {/* Lo reservado primero. La clave lleva el índice porque el texto
                puede repetirse: una misma OF puede apuntar dos veces la misma
                lona en cantidades distintas (la 0230706 lleva la misma "LONA
                PLASTEL …" con 72,6 y con 2,4). */}
            {[...reservados, ...resto].map((m, i) => (
              <li key={`${i}-${m.texto}`} className={`${LINEA} text-text`}>
                {m.texto}
                {m.apartado && (
                  <span className="block text-[10px] text-teal-700 dark:text-teal-300">
                    sigue reservado
                  </span>
                )}
              </li>
            ))}
          </ul>
        </VentanaAnclada>
      )}
    </>
  );
}

function NotasProduccion({ of, texto }: { of: string; texto: string }) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Nota que Producción dejó escrita en la OF."
        className={`${BOTON_DETALLE} text-text-muted`}
      >
        <span aria-hidden>📌</span>
        Notas de Producción
      </button>
      {anclaje && (
        <VentanaAnclada
          anclaje={anclaje}
          onCerrar={cerrar}
          etiqueta={`Notas de Producción de la OF ${of}`}
        >
          <CabeceraVentana titulo="Notas de Producción" />
          <p className="whitespace-pre-line">{texto}</p>
        </VentanaAnclada>
      )}
    </>
  );
}
