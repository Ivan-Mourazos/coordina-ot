"use client";

import { useState } from "react";

import {
  enFrase,
  fechaCorta,
  puntoBultos,
  resumenAvisos,
  type EstadoOperacion,
  type OFBelen,
  type OFTiempos,
  type PuntoBultos,
  type ResumenPedido,
  type TipoAviso,
  difiereDelPedido,
} from "@/lib/vista-belen";
import { fmtMinEnteros } from "@/lib/estado";
import { AcentoBloque, type TipoBloque } from "../AcentoBloque";
import { Desplegable } from "../Desplegable";
import { CaraPersona } from "./CaraPersona";
import { SIGNIFICA } from "./significados";

// ─── Una OF en la pantalla de Belén ──────────────────────────────────────────
// Tres franjas, de lo que se mira de un vistazo a lo que se lee con calma:
//
//   1. Identidad: punto de bultos, prioridad, OF, descripción, situación y, a la
//      derecha, las fechas (solicitada, comprometida, logística y compras).
//      Debajo, el comentario de la OF.
//   2. Trabajo: las operaciones con su estado y una barra de avance; al lado,
//      el paquete (quién y cuándo) y la logística.
//   3. Avisos, solo si hay: material que falta, TP/COT.
//   4. Desplegable (Belén, 10/11/2026: «las OF podrían aparecer así hacia
//      abajo»): cada tarea con su máquina, el tiempo fichado, el último día
//      que se fichó y su estado; al final los TP/COT. Se abre pinchando en el
//      número de la OF o en «Ver las tareas».
//
// Lo que es igual en todas las OF del pedido (entrega, rotulación) ya va en
// la cabecera y aquí solo sale si esta OF es distinta.
// Monitores pequeños: a 1280 px todo cabe en dos columnas; por debajo de
// 900 px la franja 2 se apila.

const PUNTO: Record<PuntoBultos, { clase: string; texto: string }> = {
  verde: { clase: "bg-emerald-600 dark:bg-emerald-400", texto: SIGNIFICA.puntoVerde },
  azul: { clase: "bg-blue-600 dark:bg-blue-400", texto: SIGNIFICA.puntoAzul },
  rojo: { clase: "bg-red-600 dark:bg-red-400", texto: SIGNIFICA.puntoRojo },
};

const OPERACION: Record<EstadoOperacion, { texto: string; clase: string; barra: string }> = {
  finalizado: {
    texto: "Finalizado",
    clase: "text-emerald-700 dark:text-emerald-300",
    barra: "bg-emerald-500 dark:bg-emerald-400",
  },
  interrumpido: {
    texto: "Interrumpido",
    clase: "text-amber-700 dark:text-amber-300",
    barra: "bg-amber-500 dark:bg-amber-400",
  },
  sin_empezar: { texto: "Sin empezar", clase: "text-text-muted", barra: "bg-[var(--hero-relleno-encima)]" },
};

function claseSituacion(s: string): string {
  const v = s.trim().toUpperCase();
  if (v === "FINALIZADA") return "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300";
  if (v === "DETENIDA") return "bg-red-500/12 text-red-800 dark:text-red-300";
  return "bg-amber-500/15 text-amber-900 dark:text-amber-200";
}

/** «VAZQUEZ QUINTEIRO, TERESA» → «Teresa Vazquez Quinteiro». */
function persona(nombre: string | null): string {
  if (!nombre) return "";
  const [apellidos, propio] = nombre.split(",").map((s) => s.trim());
  const capital = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
  return propio ? `${capital(propio)} ${capital(apellidos)}` : capital(apellidos);
}

/** El texto de la línea del pedido (medidas, acabados): a veces es una línea
 *  y a veces veinte. Se ven dos y el resto al pedirlo. */
function DetalleLinea({ texto }: { texto: string }) {
  const [entero, setEntero] = useState(false);
  const largo = texto.length > 160 || texto.split(/\r?\n/).length > 2;
  return (
    <div className="rounded-xl bg-[var(--detalle)] px-3.5 py-2 text-[12.5px]">
      <span className="text-[11px] text-text-muted">Detalle del pedido · </span>
      <span className={`whitespace-pre-line ${entero || !largo ? "" : "line-clamp-2"}`}>{texto}</span>
      {largo && (
        <button
          type="button"
          aria-expanded={entero}
          onClick={() => setEntero((v) => !v)}
          className="mt-0.5 block text-[12px] font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {entero ? "Ver menos" : "Ver todo"}
        </button>
      )}
    </div>
  );
}

function ChipAviso({ of, tipo }: { of: OFBelen; tipo: TipoAviso }) {
  const r = resumenAvisos(of.avisos, tipo);
  if (!r) return null;
  const detalle = r.avisos
    .map((a) => `${a.codigo} · ${enFrase(a.descripcion)}${a.cerrado ? ` · hecho ${fechaCorta(a.cerrado)}` : " · pendiente"}`)
    .join("\n");
  const nombre = tipo === "TP" ? "Trabajo previo" : "Consulta con OT";
  return (
    <span
      title={detalle}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
        r.pendiente
          ? "bg-amber-500/15 text-amber-900 dark:text-amber-200"
          : "bg-indigo-500/12 text-indigo-800 dark:text-indigo-200"
      }`}
    >
      <span className="font-bold">{tipo}</span>
      <span className="sr-only">({nombre})</span>
      {r.pendiente ? "pendiente de hacer" : `hecho el ${fechaCorta(r.fecha)}`}
    </span>
  );
}

/** Último día en que alguien fichó en la tarea. */
function ultimoFichaje(t: OFTiempos["tareas"][number]): string | null {
  return t.personas.flatMap((p) => p.fichajes.map((f) => f.dia)).sort().pop() ?? null;
}

function DetalleTareas({ of, tareas }: { of: OFBelen; tareas: OFTiempos | null | undefined }) {
  if (tareas === undefined) return <p className="px-6 py-3 text-[12.5px] text-text-muted">Cargando tareas…</p>;
  const filas = tareas?.tareas ?? [];
  return (
    <div className="px-6 pb-4 pt-1">
      {filas.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">Esta OF no tiene tareas en RPS.</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">Tareas de la OF {of.of}</caption>
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-text-muted">
              <th scope="col" className="py-1.5 pr-2">Tarea</th>
              <th scope="col" className="w-[9rem] px-2 py-1.5">Máquina</th>
              <th scope="col" className="w-[6rem] px-2 py-1.5 text-right">Tiempo</th>
              <th scope="col" className="w-[7.5rem] px-2 py-1.5">Último fichaje</th>
              <th scope="col" className="w-[7rem] py-1.5 pl-2 text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((t) => {
              const e = OPERACION[t.estado];
              const quien = t.personas.map((x) => `${persona(x.persona)} · ${fmtMinEnteros(x.minutos)}`).join("\n");
              return (
                <tr key={t.codigo} className="border-t border-border">
                  <td className="truncate py-1.5 pr-2" title={enFrase(t.descripcion)}>
                    <span className="mr-1.5 inline-block w-6 text-right text-[12px] tabular-nums text-text-muted">{t.codigo}</span>
                    {enFrase(t.descripcion)}
                  </td>
                  <td className="truncate px-2 py-1.5 font-mono text-[12px]" title={t.maquina ?? undefined}>{t.maquina ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" title={quien || undefined}>
                    {t.minutos > 0 ? fmtMinEnteros(t.minutos) : <span className="text-text-muted">Sin tiempo</span>}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{fechaCorta(ultimoFichaje(t)) || <span className="text-text-muted">—</span>}</td>
                  <td className={`py-1.5 pl-2 text-right text-[12px] font-semibold ${e.clase}`}>{e.texto}</td>
                </tr>
              );
            })}
            {of.avisos.map((a) => (
              <tr key={a.codigo} className="border-t border-border">
                <td colSpan={3} className="truncate py-1.5 pr-2" title={enFrase(a.descripcion)}>
                  <span className="mr-1.5 rounded-full bg-indigo-500/12 px-2 py-0.5 text-[11px] font-bold text-indigo-800 dark:text-indigo-200">{a.tipo}</span>
                  {enFrase(a.descripcion) || a.codigo}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{fechaCorta(a.cerrado) || <span className="text-text-muted">—</span>}</td>
                <td className={`py-1.5 pl-2 text-right text-[12px] font-semibold ${a.cerrado ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                  {a.cerrado ? "Hecho" : "Pendiente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Cabecera pequeña de un bloque, con su icono de color como en el resto de
 *  Coordina (AcentoBloque): se sabe de un vistazo qué bloque es cuál. */
function CabeceraBloque({
  tipo,
  children,
  derecha,
  ayuda,
}: {
  tipo: TipoBloque;
  children: React.ReactNode;
  derecha?: React.ReactNode;
  ayuda?: string;
}) {
  return (
    <div data-bloque={tipo} className="cabecera-bloque mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-text">
      <AcentoBloque tipo={tipo} />
      <span
        title={ayuda}
        className={ayuda ? "cursor-help underline decoration-dotted decoration-text-muted/60 underline-offset-2" : ""}
      >
        {children}
      </span>
      {derecha && <span className="ml-auto text-[12px] font-medium tabular-nums text-text-muted">{derecha}</span>}
    </div>
  );
}

export function FilaOFBelen({
  of,
  resumen,
  resaltada,
  tareas,
}: {
  of: OFBelen;
  resumen: ResumenPedido;
  resaltada: boolean;
  /** Sus tareas con tiempos (de la pestaña «Tareas y tiempos»). undefined =
   *  cargando; null = RPS no tiene ninguna. */
  tareas?: OFTiempos | null;
}) {
  const [abierta, setAbierta] = useState(false);
  const idDetalle = `tareas-of-${of.of}`;
  const punto = PUNTO[puntoBultos(of.cantidad, of.subidas)];
  const textoPunto =
    of.subidas && of.subidas !== of.cantidad ? `${punto.texto}: ${of.subidas} de ${of.cantidad}` : punto.texto;
  const ops = of.operaciones;
  const hechas = ops.filter((o) => o.estado === "finalizado").length;
  const otraEntrega = difiereDelPedido(of, resumen, "formaEntrega");
  const otraRotulacion = difiereDelPedido(of, resumen, "rotulacion");
  const hayAvisos = of.compras.length > 0 || of.avisos.length > 0;
  // El orden y los colores los pidió Belén (10/11/2026), como en su pantalla
  // de antes: solicitada en rojo, comprometida en verde, logística en malva y
  // compras en azul. Justo debajo, el comentario de la OF, también en rojo.
  const fechas = [
    of.fechaSolicitada
      ? { etiqueta: "Solicitada", valor: of.fechaSolicitada, clase: "text-red-700 dark:text-red-300", ayuda: SIGNIFICA.solicitada }
      : null,
    of.fechaComprometida
      ? { etiqueta: "Comprometida", valor: of.fechaComprometida, clase: "text-emerald-700 dark:text-emerald-300", ayuda: SIGNIFICA.comprometida }
      : null,
    of.logistica?.fecha
      ? { etiqueta: "Logística", valor: of.logistica.fecha, clase: "text-purple-700 dark:text-purple-300", ayuda: SIGNIFICA.logistica }
      : null,
    of.fechaCompras
      ? { etiqueta: "Compras", valor: of.fechaCompras, clase: "text-blue-700 dark:text-blue-300", ayuda: SIGNIFICA.compras }
      : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null);

  return (
    <article
      aria-label={`OF ${of.of}`}
      className={`tarjeta-of relative overflow-hidden rounded-3xl bg-surface ${resaltada ? "ring-2 ring-[var(--hero-anillo)]" : ""}`}
    >
      {/* 1. Identidad */}
      <div className="flex items-start gap-3 px-6 pb-3 pt-4">
        <span
          title={SIGNIFICA.prioridad}
          className="grid h-9 min-w-9 shrink-0 cursor-help place-items-center rounded-xl bg-[var(--hero-relleno)] px-1.5 text-[15px] font-bold tabular-nums"
        >
          <span className="sr-only">Prioridad </span>P{of.prioridad ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span
              role="img"
              aria-label={textoPunto}
              title={textoPunto}
              className={`size-3 shrink-0 cursor-help rounded-full ${punto.clase}`}
            />
            <button
              type="button"
              aria-expanded={abierta}
              aria-controls={idDetalle}
              onClick={() => setAbierta((v) => !v)}
              title={abierta ? "Ocultar las tareas" : "Ver las tareas de la OF"}
              className="rounded font-mono text-[16px] font-bold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {of.of}
            </button>
            <span
              title={SIGNIFICA.situacion}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${claseSituacion(of.situacion)}`}
            >
              {enFrase(of.situacion)}
            </span>
            {of.linea !== null && <span className="text-[12px] text-text-muted">línea {of.linea}</span>}
            {of.subidas > 0 && of.subidas !== of.cantidad && (
              <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[11.5px] font-bold text-white dark:bg-blue-400 dark:text-black">
                {of.subidas} de {of.cantidad} uds. subidas
              </span>
            )}
          </div>
          <p className="mt-1 text-[14.5px] font-medium">{enFrase(of.descripcion)}</p>
          {/* Solo lo que difiere del resto del pedido. */}
          {(otraEntrega || otraRotulacion) && (
            <p className="mt-0.5 text-[12.5px] text-text-muted">
              {otraEntrega && <span>Entrega: {enFrase(of.formaEntrega) || "—"}</span>}
              {otraEntrega && otraRotulacion && <span> · </span>}
              {otraRotulacion && <span>Rotulación: {of.rotulacion ?? "sin rotular"}</span>}
            </p>
          )}
        </div>
        {fechas.length > 0 && (
          <dl className="flex max-w-[55%] shrink-0 flex-wrap justify-end gap-1.5">
            {fechas.map((f) => (
              <div key={f.etiqueta} className="rounded-xl bg-[var(--detalle)] px-3 py-1.5 text-right">
                <dt
                  title={f.ayuda}
                  className="cursor-help text-[11px] leading-tight text-text-muted underline decoration-dotted decoration-text-muted/60 underline-offset-2"
                >
                  {f.etiqueta}
                </dt>
                <dd className={`text-[15px] font-bold leading-tight tabular-nums ${f.clase}`}>{fechaCorta(f.valor)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {of.notas && (
        <div className="px-6 pb-3">
          <p className="flex items-start gap-2 rounded-xl bg-red-500/8 px-3 py-2 text-[13px] font-semibold text-red-800 dark:text-red-200">
            <AcentoBloque tipo="comentario" />
            <span>{of.notas}</span>
          </p>
        </div>
      )}

      {of.detalleLinea && (
        <div className="px-6 pb-3">
          <DetalleLinea texto={of.detalleLinea} />
        </div>
      )}

      {/* 2. Trabajo */}
      <div className="grid gap-x-6 gap-y-3 px-6 pb-4 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <CabeceraBloque tipo="tareas" derecha={ops.length > 0 ? `${hechas} de ${ops.length} acabadas` : undefined}>
            Operaciones
          </CabeceraBloque>
          {ops.length > 0 ? (
            <>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {ops.map((o) => (
                  <span key={o.codigo} className={`flex-1 transition-colors ${OPERACION[o.estado].barra}`} />
                ))}
              </div>
              <ul className="mt-2 grid gap-x-5 gap-y-1 min-[1100px]:grid-cols-2" aria-label="Operaciones">
                {ops.map((op) => {
                  const e = OPERACION[op.estado];
                  return (
                    <li key={op.codigo} className="flex min-w-0 items-center gap-2 text-[13px]">
                      <span className={`size-2 shrink-0 rounded-full ${e.barra}`} aria-hidden />
                      <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-text-muted">{op.codigo}</span>
                      <span
                        title={`${enFrase(op.descripcion)}${op.maquina ? ` · ${op.maquina}` : ""}`}
                        className={`min-w-0 flex-1 truncate ${op.estado === "sin_empezar" ? "text-text-muted" : ""}`}
                      >
                        {enFrase(op.descripcion)}
                      </span>
                      <span
                        className={`shrink-0 cursor-help text-[11.5px] font-semibold ${e.clase}`}
                        title={
                          op.estado === "finalizado"
                            ? SIGNIFICA.finalizado
                            : op.estado === "interrumpido"
                              ? SIGNIFICA.interrumpido
                              : SIGNIFICA.sinEmpezar
                        }
                      >
                        {e.texto}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-[12.5px] text-text-muted">Sin operaciones de taller.</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-[var(--detalle)] px-4 py-3 text-[13px]">
          <div>
            <CabeceraBloque tipo="ofs" ayuda={SIGNIFICA.paquete}>
              Paquete
            </CabeceraBloque>
            {of.paquetes.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {of.paquetes.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CaraPersona nombre={persona(p.quien) || "?"} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{persona(p.quien) || "—"}</span>
                    <span className="shrink-0 tabular-nums text-text-muted">{fechaCorta(p.fecha)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-muted">Sin paquete todavía</p>
            )}
          </div>
          {of.logistica && (
            <div>
              <CabeceraBloque tipo="recorrido" ayuda={SIGNIFICA.logistica}>
                Previsión de logística
              </CabeceraBloque>
              <div className="flex items-center gap-2">
                <CaraPersona nombre={persona(of.logistica.responsable) || "?"} />
                <span className="min-w-0 flex-1 truncate font-semibold">{persona(of.logistica.responsable) || "—"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Avisos */}
      {hayAvisos && (
        <div className="flex flex-col gap-1.5 border-t border-border px-6 py-3">
          {of.avisos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <ChipAviso of={of} tipo="TP" />
              <ChipAviso of={of} tipo="COT" />
            </div>
          )}
          {of.compras.map((c, i) => (
            <p
              key={i}
              className="flex flex-wrap items-baseline gap-x-1.5 rounded-xl bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-900 dark:text-amber-100"
            >
              <span className="font-semibold">Falta por recibir:</span> {enFrase(c.articulo)} ({c.recibida} de {c.pedida})
              {c.proveedor && <span className="text-amber-800/80 dark:text-amber-200/80">· {enFrase(c.proveedor)}</span>}
              {c.prevista && <span className="font-semibold">· llega {fechaCorta(c.prevista)}</span>}
            </p>
          ))}
        </div>
      )}

      {/* 4. Las tareas, hacia abajo. */}
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idDetalle}
        onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-2 border-t border-border px-6 py-2 text-left text-[12.5px] font-semibold text-text-muted transition-colors hover:bg-[var(--hero-relleno)] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span aria-hidden className={`inline-block transition-transform duration-200 motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}>▸</span>
        {abierta
          ? "Ocultar las tareas"
          : `Ver las tareas${tareas?.tareas.length ? ` (${tareas.tareas.length})` : ""}${tareas?.minutos ? ` · ${fmtMinEnteros(tareas.minutos)} fichados` : ""}`}
      </button>
      <div id={idDetalle}>
        <Desplegable abierto={abierta}>
          <DetalleTareas of={of} tareas={tareas} />
        </Desplegable>
      </div>
    </article>
  );
}
