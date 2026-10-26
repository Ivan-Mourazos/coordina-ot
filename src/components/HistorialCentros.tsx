"use client";

import type { HistorialOF, MaterialOF, PersonaConRol } from "@/lib/historial";
import { fmtCantidad, personasConRol, personasDeOF, repartirMateriales, repartoDe, tiempoDePersona, type MaterialGastadoOF } from "@/lib/historial";
import { ROL } from "@/lib/estado";
import { fmtDiaMesAno } from "@/lib/fechas";
import type { SeccionId } from "@/lib/secciones";
import { TareasPorCentro } from "./HistorialTareas";
import { DetalleVenta } from "./DetalleVenta";
import {
  BOTON_DETALLE,
  CabeceraVentana,
  LINEA,
  LISTA,
  VentanaAnclada,
  useVentanaAnclada,
} from "./VentanaAnclada";
import { IconoAviso, IconoCaja, IconoMaterial } from "./Iconos";

/** La misma pieza de Pendientes, también en la lista y la consulta pública.
 *  Los datos ya vienen del detalle: este adaptador solo añade lo que necesita
 *  el equipo (material y personas que no figuran en ninguna tarea). */
export function OFsDeLaFicha({
  ofs,
  seccion,
  gastado,
  onReintentarGastado,
  conGastado = true,
  sinMaterial = false,
}: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  conGastado?: boolean;
  sinMaterial?: boolean;
  gastado?: Record<string, MaterialGastadoOF[]> | null;
  onReintentarGastado?: () => void;
}) {
  // El material y el texto de venta pertenecen a la OF, no al centro.
  const porCodigo = new Map<string, HistorialOF[]>();
  for (const of of ofs) {
    const entradas = porCodigo.get(of.codigo) ?? [];
    entradas.push(of);
    porCodigo.set(of.codigo, entradas);
  }

  if (!ofs.length) return <p className="py-1 text-xs text-text-muted">Sin OF vinculadas al pedido en RPS.</p>;

  return (
    <TareasPorCentro
      ofs={ofs}
      seccion={seccion}
      conColor
      extraOF={(of) => {
        const reparto = repartoDe([of]);
        const enTareas = new Set((of.tareas ?? []).flatMap((t) => t.personas.map((p) => p.nombre)));
        const conTiempo = personasConRol(personasDeOF(of), reparto.autores, reparto.revisores, reparto.consta, reparto.registrados);
        const deducidos: PersonaConRol[] = !reparto.consta && of.rolDeducido
          ? [...of.rolDeducido.quienPlanteo, ...of.rolDeducido.quienReviso]
            .filter((nombre) => !conTiempo.some((p) => p.nombre === nombre))
            .map((nombre) => ({ nombre, min: 0 }))
          : [];
        const personas = [...conTiempo, ...deducidos]
          .filter((p) => !enTareas.has(p.nombre));
        const delCodigo = porCodigo.get(of.codigo)!;
        const primera = delCodigo[0] === of;
        const entradas = primera ? delCodigo : [];
        const conMaterial = entradas.find((entrada) => entrada.materiales?.length || entrada.notasProduccion) ?? of;
        const venta = entradas.find((entrada) => entrada.detalleVenta)?.detalleVenta;
        if (!personas.length && !venta && (!primera || sinMaterial)) return null;
        return (
          <>
            {personas.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
                {personas.map((p) => {
                  const rol = p.rol;
                  const deducido = !reparto.consta
                    ? of.rolDeducido?.quienPlanteo.includes(p.nombre) ? "Autor" : of.rolDeducido?.quienReviso.includes(p.nombre) ? "Revisor" : null
                    : null;
                  return (
                    <span key={p.nombre}>
                      {rol && <span className={ROL[rol].texto}>{rol === "plantear" ? "Autor" : "Revisor"} </span>}
                      {deducido && <span title="Deducido de las horas de RPS" className="rounded bg-text-muted/15 px-1 text-[9px] font-bold uppercase text-text-muted ring-1 ring-border-strong">{deducido}</span>}
                      {" "}{p.nombre} {deducido && p.min === 0 ? "<1m" : tiempoDePersona(p)}
                    </span>
                  );
                })}
              </p>
            )}
            {venta && <DetalleVenta texto={venta} />}
            {primera && !sinMaterial && (
              <Materiales
                of={conMaterial}
                gastadoOF={gastado === null ? null : gastado?.[of.codigo]}
                onReintentarGastado={onReintentarGastado}
                conGastado={conGastado}
              />
            )}
          </>
        );
      }}
    />
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
function Materiales({
  of,
  gastadoOF,
  onReintentarGastado,
  conGastado = true,
  className = "mt-2",
}: {
  of: HistorialOF;
  className?: string;
  /** El botón de Gastado. La lista del Historial no lo lleva: el gastado es
   *  otra consulta a RPS por pedido, y se mira en la ficha. */
  conGastado?: boolean;
  /** undefined = todavía cargando; null = RPS no contestó; [] = cargado y sin líneas. */
  gastadoOF: MaterialGastadoOF[] | null | undefined;
  onReintentarGastado?: () => void;
}) {
  const { apartados, apuntados } = repartirMateriales(of.materiales);
  // El botón de Gastado sale SIEMPRE (ver MaterialGastado); el resto,
  // solo si dice algo.
  return (
    <div className={`${className} flex flex-wrap gap-1.5`}>
      {apartados.length + apuntados.length > 0 && (
        <MaterialHistorico of={of.codigo} reservados={apartados} resto={apuntados} />
      )}
      {conGastado && <MaterialGastado of={of.codigo} lineas={gastadoOF} onReintentar={onReintentarGastado} />}
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
        <IconoMaterial />
        Asignado
        <span className="rounded-full bg-text-muted/15 px-1.5 text-[10px] font-bold text-text ring-1 ring-border-strong">
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
            {/* La cantidad en su casilla a la derecha, como en Pendientes
                (MaterialChip): pegada al final del texto se perdía. */}
            {[...reservados, ...resto].map((m, i) => (
              <li key={`${i}-${m.texto}`} className={`${LINEA} flex items-start justify-between gap-2`}>
                <span className="min-w-0 text-text">
                  {m.nombre ?? m.texto}
                  {m.apartado && (
                    <span className="block text-[10px] text-teal-700 dark:text-teal-300">
                      sigue reservado
                    </span>
                  )}
                </span>
                {m.nombre && m.cantidad && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold ring-1 ${
                      m.apartado
                        ? "bg-teal-600/12 text-teal-700 ring-teal-500/40 dark:text-teal-300"
                        : "bg-surface-2 text-text ring-border"
                    }`}
                  >
                    {m.cantidad}
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

/** Lo que salió de verdad del almacén (RPS, `CPRImputationMaterialMO`). Sale
 *  SIEMPRE, también en una OF sin nada asignado: con el 57 % de las OF que
 *  gastan sin nada apuntado, escondiendo el botón se perdía justo lo que esto
 *  viene a enseñar (spec §1, "Cómo se ve"). */
function MaterialGastado({
  of,
  lineas,
  onReintentar,
}: {
  of: string;
  lineas: MaterialGastadoOF[] | null | undefined;
  onReintentar?: () => void;
}) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  const cargando = lineas === undefined;
  const error = lineas === null;
  const n = lineas?.length ?? 0;
  const ultimaSalida = (lineas ?? []).reduce<string | null>(
    (max, m) => (m.ultimaSalida && (!max || m.ultimaSalida > max) ? m.ultimaSalida : max),
    null,
  );
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Material que salió del almacén para esta OF, según RPS."
        className={`${BOTON_DETALLE} ${n > 0 ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}`}
      >
        <IconoCaja />
        Gastado
        <span className="rounded-full bg-text-muted/15 px-1.5 text-[10px] font-bold text-text ring-1 ring-border-strong">
          {n}
        </span>
      </button>
      {anclaje && (
        <VentanaAnclada anclaje={anclaje} onCerrar={cerrar} etiqueta={`Material gastado de la OF ${of}`}>
          <CabeceraVentana
            titulo="Salido del almacén"
            cuantos={cargando ? undefined : n}
            nota={ultimaSalida ? `Última salida ${fmtDiaMesAno(ultimaSalida)}` : undefined}
          />
          {error && (
            <p className="text-[11px] text-error">
              No se pudo consultar el material gastado.{" "}
              <button type="button" onClick={onReintentar} className="underline">
                Reintentar
              </button>
            </p>
          )}
          {!error && cargando && <p className="text-[11px] text-text-muted">Consultando…</p>}
          {!error && !cargando && n === 0 && (
            <div className="text-[11px] text-text-muted">
              <p>Todavía no hay salidas apuntadas para esta OF.</p>
              <p className="mt-1">
                El almacén las apunta según sale el material. Las reparaciones y manipulaciones no suelen llevarlo.
              </p>
            </div>
          )}
          {!error && n > 0 && (
            <ul className={LISTA}>
              {lineas!.map((m, i) => (
                <li key={`${i}-${m.material}`} className={`${LINEA} flex items-start justify-between gap-2`}>
                  <span className="min-w-0 text-text">
                    {m.material}
                    {m.gastado < 0 && (
                      <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                        devuelto al almacén
                      </span>
                    )}
                    {m.codigo && <span className="block text-[10px] text-text-muted">{m.codigo}</span>}
                  </span>
                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold tabular-nums text-text ring-1 ring-border">
                    {fmtCantidad(m.gastado)}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
        <IconoAviso />
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
