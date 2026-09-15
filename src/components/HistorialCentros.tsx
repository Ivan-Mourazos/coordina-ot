"use client";

import type { HistorialOF, MaterialOF } from "@/lib/historial";
import { personasConRol, personasDeOF, personasDeOFs, repartirMateriales, repartoDe } from "@/lib/historial";
import { fmtMin, ROL } from "@/lib/estado";
import { centrosConDesglose, type HistorialCentro } from "@/lib/historial-centros";
import type { SeccionId } from "@/lib/secciones";
import { TareasPorCentro } from "./HistorialTareas";
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
// sin login pintaba la MISMA ficha (hoy usa `TareasPorCentro`), y la pantalla
// del invitado no debe arrastrar el resto del cajón del equipo (notas, parte
// escaneado, avisos).

/** El centro decide qué minutos se suman; la selección decide el desglose visible.
 *
 *  La PINTURA es la misma que la de «Tareas y tiempos» (`TareasPorCentro`):
 *  centro, OF y debajo sus tareas, todo seguido y sin cajas dentro de cajas.
 *  Antes cada centro era una tarjeta con relieve y cada OF otra dentro, y el
 *  mismo pedido se leía de dos maneras según lo abrieras en la ficha o en la
 *  ventana. Lo que esta ficha añade —el tiempo por persona con su papel y el
 *  material de cada OF— entra por los dos huecos que deja esa pieza. */
export function HistorialCentros({ ofs, seccion }: { ofs: HistorialOF[]; seccion: SeccionId }) {
  // Un desglose solo sale si dice algo que el nivel de arriba no dice: las
  // personas del centro, siempre en el que cuenta; las de cada OF, solo si el
  // centro tiene varias. Con una sola OF eran los mismos nombres dos veces.
  const conDesglose = centrosConDesglose(ofs, seccion);
  return (
    <section aria-label="Tiempos por centro de trabajo">
      <TareasPorCentro
        ofs={ofs}
        seccion={seccion}
        conColor
        extraCentro={(centro) => <PersonasCentro centro={centro} conDesglose={conDesglose} />}
        extraOF={(of, centro) => (
          <>
            {/* Quién hizo cada OF solo cuando el centro tiene varias y la OF
                no trae tareas: con ellas, cada línea ya dice quién la echó. */}
            {conDesglose.has(centro.id) && centro.ofs.length > 1 && !of.tareas?.length && <PersonasOF of={of} />}
            <Materiales of={of} />
          </>
        )}
      />
    </section>
  );
}

/** Quién trabajó en el centro y cuánto, con el papel de cada uno. Solo donde
 *  dice algo: con una sola OF los nombres ya salen en sus tareas. */
function PersonasCentro({
  centro,
  conDesglose,
}: {
  centro: HistorialCentro;
  conDesglose: ReadonlySet<string>;
}) {
  if (!conDesglose.has(centro.id)) return null;
  // El reparto se junta de TODAS las OF del centro, igual que los minutos, y
  // manda el registrado (ver `repartoDe`).
  const reparto = repartoDe(centro.ofs);
  const personas = personasConRol(
    personasDeOFs(centro.ofs),
    reparto.autores,
    reparto.revisores,
    reparto.consta,
  );
  if (personas.length === 0) return null;
  // Con una sola persona su tiempo ES el del centro, que está justo encima.
  const unaSola = personas.length === 1 && personas[0].min === centro.totalMin;
  return (
    <ul
      className="mb-2 flex flex-wrap gap-x-3 text-[11px] text-text-muted"
      aria-label={`Tiempos por persona de ${centro.nombre}`}
      title="Tiempo por persona: el imputado en RPS o, si aún no hay, el fichado en CoordinaOT"
    >
      {personas.map((p) => (
        <li key={p.nombre}>
          <span className="text-text">{p.nombre}</span>
          {/* El papel DELANTE del tiempo: detrás se leía «Iván Sánchez 2m
              planteó», como si el minuto fuera lo planteado. */}
          {p.rol && <span className={ROL[p.rol].texto}> {p.rol === "plantear" ? "planteó" : "revisó"}</span>}
          {!unaSola && <span className="font-mono tabular-nums"> {fmtMin(p.min)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Quién imputó tiempo a esta OF en RPS, con el suyo, de más a menos. Manda el
 *  reparto registrado en CoordinaOT; lo deducido de las horas no se nombra
 *  (ver `repartoDe`). */
function PersonasOF({ of }: { of: HistorialOF }) {
  const reparto = repartoDe([of]);
  const personas = personasConRol(personasDeOF(of), reparto.autores, reparto.revisores, reparto.consta);
  if (personas.length === 0) {
    return <p className="mt-1 text-[11px] text-text-muted">Sin tiempo registrado.</p>;
  }
  return (
    <p className="mt-1 text-[11px] text-text-muted">
      {personas.map((p, i) => (
        <span key={p.nombre}>
          {i > 0 && " · "}
          <span className="text-text">{p.nombre}</span>
          {p.rol && <span className={ROL[p.rol].texto}> {p.rol === "plantear" ? "planteó" : "revisó"}</span>}{" "}
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
