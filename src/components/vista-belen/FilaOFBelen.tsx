"use client";

import { Fragment, useState } from "react";

import {
  agruparPaquetes,
  difiereDelPedido,
  enFrase,
  enTitulo,
  fechaCorta,
  fmtDuracion,
  ofEnAmarillo,
  personasDeOF,
  puntoBultos,
  resumenAvisos,
  type FichandoAhora,
  type OFBelen,
  type OFTiempos,
  type PuntoBultos,
  type ResumenPedido,
  type TipoAviso,
} from "@/lib/vista-belen";
import { AcentoBloque, type TipoBloque } from "../AcentoBloque";
import { Desplegable } from "../Desplegable";
import { chip, ESTADO_OPERACION, FECHA, tonoSituacion } from "./estilos-belen";
import { SIGNIFICA } from "./significados";
import { ImprimirOF } from "./ImprimirOF";
import { FichajesDeTarea, TiemposPorPersona } from "./TiemposBelen";

// ─── Una OF en la pantalla de Belén ──────────────────────────────────────────
// Encogida, una línea con lo que se mira de un vistazo (Belén, 11/11/2026):
// punto de bultos, prioridad, TP/COT, OF, artículo, solicitada, situación,
// comprometida, compras y logística; lo vacío no sale (la fecha de entrega
// de la hoja de ruta se quitó el 12/11/2026). Si alguien está fichando en
// ella AHORA, un punto verde que late.
// Al pincharla se despliega todo, en el orden de Belén: descripción e
// imprimir, comentario de la OF (rojo), entrega/rotulación si difieren del
// pedido, paquete y TP/COT, las tareas (sección, tiempo, estado, fin, quién
// ficha en directo y la de los bultos), lo que falta de compras y el texto
// de la línea del pedido.
// A 1280 px la línea encogida cabe; si no, las fechas bajan a una segunda.

const PUNTO: Record<PuntoBultos, { clase: string; texto: string }> = {
  verde: { clase: "bg-emerald-600 dark:bg-emerald-400", texto: SIGNIFICA.puntoVerde },
  azul: { clase: "bg-blue-600 dark:bg-blue-400", texto: SIGNIFICA.puntoAzul },
  rojo: { clase: "bg-red-600 dark:bg-red-400", texto: SIGNIFICA.puntoRojo },
};

/** Punto verde que late: alguien está fichando ahora. Con «reducir
 *  movimiento» activado queda quieto, pero sigue ahí. */
function PuntoEnDirecto() {
  return (
    <span aria-hidden className="relative inline-flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:animate-none dark:bg-emerald-400" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
    </span>
  );
}

/** Rótulo pequeño con su ayuda al pasar el ratón (subrayado de puntos). */
function Rotulo({ children, ayuda }: { children: React.ReactNode; ayuda?: string }) {
  return (
    <span
      title={ayuda}
      className={`text-[12px] font-medium text-text-muted ${ayuda ? "cursor-help underline decoration-dotted underline-offset-2" : ""}`}
    >
      {children}
    </span>
  );
}

function CabeceraBloque({ tipo, children, derecha }: { tipo: TipoBloque; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <div data-bloque={tipo} className="cabecera-bloque mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
      <AcentoBloque tipo={tipo} />
      {children}
      {derecha && <span className="ml-auto text-[12px] font-medium tabular-nums text-text-muted">{derecha}</span>}
    </div>
  );
}

/** El texto de la línea del pedido (medidas, acabados): a veces es una línea
 *  y a veces veinte. Se ven dos y el resto al pedirlo. */
function DetalleLinea({ texto }: { texto: string }) {
  const [entero, setEntero] = useState(false);
  const largo = texto.length > 160 || texto.split(/\r?\n/).length > 2;
  return (
    <div className="rounded-2xl bg-[var(--detalle)] px-3.5 py-2 text-[12.5px]">
      <Rotulo>Detalle del pedido · </Rotulo>
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
  return (
    <span title={`${tipo === "TP" ? SIGNIFICA.tp : SIGNIFICA.cot}\n\n${detalle}`} className={`${chip(r.pendiente ? "aviso" : "ok")} cursor-help`}>
      <b>{tipo}</b>
      {r.pendiente ? "pendiente de hacer" : `hecho el ${fechaCorta(r.fecha)}`}
    </span>
  );
}

/** Las tareas de la OF con todo lo suyo y, al final, sus TP/COT. Con un
 *  selector (Iván, 11/11/2026, en lugar de la pestaña «Tareas y tiempos»):
 *    · Por tarea: la tabla; pinchando una tarea se ve debajo quién fichó y
 *      cuándo (franja horaria y tiempo exacto).
 *    · Por persona: quién ha trabajado en esta OF, cuánto y qué días. */
function Tareas({ of, tiempos, enDirecto }: { of: OFBelen; tiempos: OFTiempos | null | undefined; enDirecto: readonly FichandoAhora[] }) {
  const [modo, setModo] = useState<"tarea" | "persona">("tarea");
  const [abierta, setAbierta] = useState<string | null>(null);
  const ops = of.operaciones;
  const hechas = ops.filter((o) => o.estado === "finalizado").length;
  const fichajes = new Map((tiempos?.tareas ?? []).map((t) => [t.codigo, t]));
  if (!ops.length && !of.avisos.length) return <p className="text-[12.5px] text-text-muted">Sin tareas en RPS.</p>;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <CabeceraBloque tipo="tareas">Tareas</CabeceraBloque>
        <div role="group" aria-label="Ver tareas" className="tira-3d glass-chip inline-flex rounded-lg p-[3px]">
          {(
            [
              ["tarea", "Por tarea"],
              ["persona", "Por persona"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              aria-pressed={modo === id}
              onClick={() => setModo(id)}
              className={`h-7 rounded-md px-3 text-[12.5px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] ${
                modo === id ? "pestana-activa" : "text-text-muted hover:text-text"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {ops.length > 0 && <span className="ml-auto text-[12px] font-medium tabular-nums text-text-muted">{hechas} de {ops.length} acabadas</span>}
      </div>

      {modo === "persona" ? (
        tiempos === undefined ? (
          <p className="text-[12.5px] text-text-muted">Cargando fichajes…</p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-[var(--detalle)]">
            <TiemposPorPersona personas={tiempos ? personasDeOF(tiempos) : []} total={tiempos?.minutos ?? 0} />
          </div>
        )
      ) : (
        <table className="w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">Tareas de la OF {of.of}</caption>
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <th scope="col" className="py-1 pr-2">Tarea</th>
              <th scope="col" className="w-[22rem] px-2 py-1">Sección</th>
              <th scope="col" className="w-[8rem] px-2 py-1 text-right">Tiempo</th>
              <th scope="col" className="w-[8rem] px-2 py-1">Estado</th>
              <th scope="col" className="w-[6.5rem] whitespace-nowrap py-1 pl-2 text-right" title="El día en que se acabó la operación. Si falta, en gris, el inicio y el fin que le da el planificador">Fin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color-mix(in_srgb,var(--border-strong)_30%,var(--border))]">
            {ops.map((op) => {
              const e = ESTADO_OPERACION[op.estado];
              const suya = fichajes.get(op.codigo);
              const conFichajes = !!suya?.personas.length;
              const desplegada = abierta === op.codigo && conFichajes;
              // Exacto: «2» y «02» son tareas distintas de la misma OF.
              const ahora = enDirecto.filter((f) => f.tarea === op.codigo);
              return (
                <Fragment key={op.codigo}>
                  <tr
                    onClick={conFichajes ? () => setAbierta((x) => (x === op.codigo ? null : op.codigo)) : undefined}
                    className={[
                      conFichajes ? "cursor-pointer transition-colors" : "",
                      // Alguien fichando ahora → la línea en verde, como en la
                      // app vieja (Iván, 14/11/2026). Gana al hover.
                      ahora.length > 0
                        ? "belen-fichando"
                        : conFichajes
                          ? "hover:bg-[var(--hero-relleno)]"
                          : "",
                    ].join(" ")}
                  >
                    <td className="truncate py-1.5 pr-2" title={enFrase(op.descripcion)}>
                      {conFichajes ? (
                        <button
                          type="button"
                          aria-expanded={desplegada}
                          aria-label={`${desplegada ? "Ocultar" : "Ver"} quién fichó en ${op.codigo}`}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setAbierta((x) => (x === op.codigo ? null : op.codigo));
                          }}
                          className="mr-1 inline-block w-3 text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)]"
                        >
                          <span aria-hidden className={`inline-block transition-transform motion-reduce:transition-none ${desplegada ? "rotate-90" : ""}`}>▸</span>
                        </button>
                      ) : (
                        <span className="mr-1 inline-block w-3" aria-hidden />
                      )}
                      <span className={`mr-2 inline-block size-2 rounded-full align-middle ${e.punto}`} aria-hidden />
                      <span className="mr-1.5 inline-block w-6 text-right text-[12px] tabular-nums text-text-muted">{op.codigo}</span>
                      <span className={op.estado === "sin_empezar" ? "text-text-muted" : ""}>{enFrase(op.descripcion)}</span>
                      {ahora.length > 0 && (
                        <span className="mt-0.5 block truncate pl-[3.25rem] text-[12px] font-bold text-blue-800 dark:text-sky-200" title={SIGNIFICA.enDirecto}>
                          {ahora.map((f) => `${f.persona} (${fmtDuracion(f.minutos)})`).join(" · ")}
                        </span>
                      )}
                      {op.subeBultos && (
                        <span title="En esta tarea se suben los bultos (entrada de producto en RPS)" className={`${chip("info")} ml-2 cursor-help`}>
                          Bultos
                        </span>
                      )}
                    </td>
                    <td className="truncate px-2 py-1.5" title={[op.seccion, op.maquina].filter(Boolean).join(" · ") || undefined}>
                      {op.seccion ? enTitulo(op.seccion) : op.maquina ?? <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {op.minutos ? fmtDuracion(op.minutos) : <span className="text-text-muted">—</span>}
                    </td>
                    {ahora.length > 0 ? (
                      <td className="px-2 py-1.5 align-top text-[12px] font-bold text-blue-800 dark:text-sky-200" title={SIGNIFICA.enDirecto}>
                        <span className="inline-flex items-center gap-1.5">
                          <PuntoEnDirecto />
                          Fichando
                        </span>
                      </td>
                    ) : (
                      <td
                        className={`px-2 py-1.5 align-top text-[12px] font-semibold ${e.tinta}`}
                        title={op.estado === "finalizado" ? SIGNIFICA.finalizado : op.estado === "interrumpido" ? SIGNIFICA.interrumpido : SIGNIFICA.sinEmpezar}
                      >
                        {e.texto}
                      </td>
                    )}
                    {op.fin || !(op.planInicio || op.planFin) ? (
                      <td className="py-1.5 pl-2 text-right align-top tabular-nums" title={op.ultimoFichaje ? `Último fichaje: ${fechaCorta(op.ultimoFichaje)}` : undefined}>
                        {fechaCorta(op.fin) || <span className="text-text-muted">—</span>}
                      </td>
                    ) : (
                      // Sin acabar: inicio y fin del planificador de RPS, uno
                      // encima del otro como en la app vieja (Belén, 14/11/2026).
                      // En gris: es lo previsto, no lo hecho.
                      <td
                        className="py-1.5 pl-2 text-right align-top text-[12px] leading-tight tabular-nums text-text-muted"
                        title={`Según el planificador: empieza ${fechaCorta(op.planInicio) || "—"} y acaba ${fechaCorta(op.planFin) || "—"}`}
                      >
                        <span className="block">{fechaCorta(op.planInicio) || "—"}</span>
                        <span className="block">{fechaCorta(op.planFin) || "—"}</span>
                      </td>
                    )}
                  </tr>
                  {desplegada && suya && (
                    <tr>
                      <td colSpan={5} className="pb-2.5 pl-9 pt-1">
                        <div className="rounded-2xl bg-[var(--detalle)] px-3.5 py-2.5">
                          <FichajesDeTarea tarea={suya} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {of.avisos.map((av) => (
              // Hecha → la línea en amarillo, como en la app vieja (Iván,
              // 14/11/2026). El resto de lo desplegado, sin color.
              <tr key={`${av.tipo}-${av.codigo}`} className={av.cerrado ? "bg-[var(--belen-avisos-hechos)]" : undefined}>
                <td colSpan={3} className="truncate py-1.5 pl-4 pr-2" title={enFrase(av.descripcion)}>
                  <span className={`${chip("neutro")} mr-2`}>{av.tipo}</span>
                  {enFrase(av.descripcion) || av.codigo}
                </td>
                <td className={`px-2 py-1.5 text-[12px] font-semibold ${av.cerrado ? ESTADO_OPERACION.finalizado.tinta : ESTADO_OPERACION.interrumpido.tinta}`}>
                  {av.cerrado ? "Hecho" : "Pendiente"}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{fechaCorta(av.cerrado) || <span className="text-text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Lo que falta por recibir de compras: tres a la vista y el resto al pedirlo
 *  (hay OF con treinta líneas de perfiles). */
function Compras({ of }: { of: OFBelen }) {
  const [todas, setTodas] = useState(false);
  if (!of.compras.length) return null;
  const vistas = todas ? of.compras : of.compras.slice(0, 3);
  return (
    <div className="rounded-2xl bg-[var(--detalle)] px-3.5 py-2">
      <CabeceraBloque tipo="recorrido" derecha={`${of.compras.length} ${of.compras.length === 1 ? "línea" : "líneas"}`}>
        Falta por recibir de compras
      </CabeceraBloque>
      <ul className="flex flex-col gap-0.5 text-[12.5px]">
        {vistas.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-medium">{enFrase(c.articulo)}</span>
            <span className="tabular-nums text-text-muted">({c.recibida} de {c.pedida})</span>
            {c.proveedor && <span className="text-text-muted">· {enFrase(c.proveedor)}</span>}
            {c.prevista && <span className={`font-semibold ${FECHA.compras.tinta}`}>· llega {fechaCorta(c.prevista)}</span>}
          </li>
        ))}
      </ul>
      {of.compras.length > 3 && (
        <button
          type="button"
          aria-expanded={todas}
          onClick={() => setTodas((v) => !v)}
          className="mt-1 text-[12px] font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {todas ? "Ver menos" : `Ver las ${of.compras.length - 3} restantes`}
        </button>
      )}
    </div>
  );
}

/** Una fecha de la línea encogida: rótulo pequeño y el día en su color. */
function FechaCorta({ rotulo, valor, tinta, ayuda, extra }: { rotulo: string; valor: string; tinta: string; ayuda?: string; extra?: string | null }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap" title={ayuda}>
      <span className="text-[11px] font-medium text-text-muted">{rotulo}</span>
      <b className={`text-[13px] font-bold tabular-nums ${tinta}`}>{fechaCorta(valor)}</b>
      {extra && <span className={`max-w-[9rem] truncate text-[11.5px] font-semibold ${tinta}`}>· {extra}</span>}
    </span>
  );
}

export function FilaOFBelen({
  of,
  resumen,
  resaltada,
  conReserva,
  abierta,
  onAlternar,
  tiempos,
  enDirecto = [],
}: {
  of: OFBelen;
  resumen: ResumenPedido;
  resaltada: boolean;
  /** ¿Tiene material reservado? undefined = el material aún está cargando. */
  conReserva?: boolean;
  /** Desplegada (todo) o encogida (una línea). */
  abierta: boolean;
  onAlternar: () => void;
  /** Los fichajes de esta OF (para ver quién y cuándo). undefined = cargando. */
  tiempos?: OFTiempos | null;
  /** Quién ficha AHORA en sus tareas (OLANET). */
  enDirecto?: readonly FichandoAhora[];
}) {
  const punto = PUNTO[puntoBultos(of.cantidad, of.subidas)];
  const noCuadra = of.subidas > 0 && of.subidas !== of.cantidad;
  const textoPunto = noCuadra ? `${punto.texto}: ${of.subidas} de ${of.cantidad}` : punto.texto;
  const otraEntrega = difiereDelPedido(of, resumen, "formaEntrega");
  const otraRotulacion = difiereDelPedido(of, resumen, "rotulacion");
  // Belén (11/11/2026): la OF en amarillo cuando tiene sus visitas (TP/COT)
  // hechas (ver ofEnAmarillo). Es de la OF, no del pedido. Solo
  // la línea compactada y bien marcada; lo desplegado queda como siempre
  // (Iván, 11/11/2026: «si no, queda fatal»).
  const amarilla = ofEnAmarillo(of);
  const paquetes = agruparPaquetes(of.paquetes);
  const tp = resumenAvisos(of.avisos, "TP");
  const cot = resumenAvisos(of.avisos, "COT");
  const idCuerpo = `of-${of.of}-detalle`;

  return (
    <article
      aria-label={`OF ${of.of}`}
      data-avisos-hechos={amarilla || undefined}
      className={`tarjeta-of relative overflow-hidden rounded-3xl ${
        // HeroUI pinta .tarjeta-of con var(--surface): se tiñe la variable.
        // El amarillo va SOLO en la línea compactada (abajo), no en la tarjeta.
        "bg-surface"
      } ${resaltada ? "ring-2 ring-[var(--hero-anillo)]" : ""}`}
    >
      {/* La OF encogida, en una línea, con lo que pidió Belén (11/11/2026) y en
          su orden: punto, prioridad, TP/COT, OF, artículo, rotulación,
          solicitada, comprometida, logística, compras, comentario y situación. Lo que no
          tiene valor no sale. Pinchando se despliega todo. */}
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idCuerpo}
        onClick={onAlternar}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-none! px-5 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--hero-anillo)] ${
          // Belén (11/11/2026): OF con TP/COT hechos → la LÍNEA en
          // amarillo marcado; lo desplegado, normal.
          amarilla ? "bg-[var(--belen-avisos-hechos)] hover:bg-[var(--belen-avisos-hechos-encima)]" : "hover:bg-[var(--hero-relleno)]"
        }`}
      >
        <span aria-hidden className={`inline-block w-3 text-text-muted transition-transform duration-200 motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}>▸</span>
        <span role="img" aria-label={textoPunto} title={textoPunto} className={`size-3 shrink-0 rounded-full ${punto.clase}`} />
        <span title={SIGNIFICA.prioridad} className="grid h-7 min-w-8 place-items-center rounded-lg bg-[var(--hero-relleno)] px-1 text-[13px] font-bold tabular-nums">
          <span className="sr-only">Prioridad </span>P{of.prioridad ?? "—"}
        </span>
        {tp && <span title={SIGNIFICA.tp} className={chip(tp.pendiente ? "aviso" : "ok")}>TP</span>}
        {cot && <span title={SIGNIFICA.cot} className={chip(cot.pendiente ? "aviso" : "ok")}>COT</span>}
        <span className="font-mono text-[15px] font-bold">{of.of}</span>
        {enDirecto.length > 0 && (
          <span
            title={[SIGNIFICA.enDirecto, "", ...enDirecto.map((f) => `${f.persona} · tarea ${f.tarea} · ${fmtDuracion(f.minutos)}`)].join("\n")}
            className={`${chip("ok")} cursor-help`}
          >
            <PuntoEnDirecto />
            Fichando ahora
          </span>
        )}
        <span className="min-w-[10rem] flex-1 truncate text-[13.5px] font-medium" title={of.articulo ?? of.descripcion}>
          {enFrase(of.articulo ?? of.descripcion)}
        </span>
        {/* Belén (14/11/2026): la rotulación en la línea, sin desplegar, como en
            su pantalla de antes. Solo si la OF la tiene y no es la del pedido
            (esa ya sale en la cabecera). */}
        {otraRotulacion && of.rotulacion && (
          <span className="max-w-[18rem] truncate text-[12.5px] text-text-muted" title={`Rotulación: ${of.rotulacion}`}>
            Rotulación <b className="font-semibold text-text">{of.rotulacion}</b>
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Belén (14/11/2026), en este orden: solicitada (rojo), comprometida
              (verde), logística (malva), compras (azul) y el comentario de la
              OF (rojo). La situación, detrás. */}
          {of.fechaSolicitada && <FechaCorta {...FECHA.solicitada} valor={of.fechaSolicitada} ayuda={SIGNIFICA.solicitada} />}
          {of.fechaComprometida && <FechaCorta {...FECHA.comprometida} valor={of.fechaComprometida} ayuda={SIGNIFICA.comprometida} />}
          {of.logistica?.fecha && <FechaCorta {...FECHA.logistica} valor={of.logistica.fecha} ayuda={SIGNIFICA.logistica} extra={of.logistica.responsable} />}
          {of.fechaCompras && <FechaCorta {...FECHA.compras} valor={of.fechaCompras} ayuda={SIGNIFICA.compras} />}
          {of.notas && (
            <span className="max-w-[20rem] truncate text-[12.5px] font-semibold text-red-700 dark:text-red-300" title={`Comentario de la OF: ${of.notas}`}>
              {of.notas}
            </span>
          )}
          {of.situacion && <span title={SIGNIFICA.situacion} className={chip(tonoSituacion(of.situacion))}>{enFrase(of.situacion)}</span>}
        </span>
      </button>

      <div id={idCuerpo}>
        <Desplegable abierto={abierta}>
          <div className="flex flex-col gap-2.5 border-t border-border px-6 pb-4 pt-3">
            {/* Descripción de la OF, línea, unidades e imprimir */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="min-w-0 flex-1 text-[14px] font-medium">{enFrase(of.descripcion)}</p>
              {of.linea !== null && <span className="text-[12px] text-text-muted">línea {of.linea}</span>}
              {noCuadra && <span className={chip("info")}>{of.subidas} de {of.cantidad} uds. subidas</span>}
              <ImprimirOF ofs={[of.of]} conReserva={conReserva} />
            </div>

            {/* Comentario de la OF */}
            {of.notas && (
              <p className="flex items-start gap-2 rounded-xl bg-red-500/8 px-3 py-2 text-[13px] font-semibold text-red-800 dark:bg-red-400/10 dark:text-red-200">
                <AcentoBloque tipo="comentario" />
                <span>{of.notas}</span>
              </p>
            )}

            {/* Entrega, rotulación, paquete y TP/COT */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
              {otraEntrega && (
                <span>
                  <Rotulo>Entrega</Rotulo> <b className="font-semibold">{enFrase(of.formaEntrega) || "—"}</b>
                </span>
              )}
              {otraRotulacion && (
                <span>
                  <Rotulo>Rotulación</Rotulo> <b className="font-semibold">{of.rotulacion ?? "sin rotular"}</b>
                </span>
              )}
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <Rotulo ayuda={SIGNIFICA.paquete}>Paquete</Rotulo>
                {paquetes.length ? (
                  paquetes.map((p, i) => (
                    <b key={i} className="font-semibold">
                      {p.paquetes} {p.paquetes === 1 ? "paquete" : "paquetes"}
                      {p.unidades > 0 && <span className="font-normal text-text-muted"> ({p.unidades} uds.)</span>}
                      {" · "}
                      {p.quien ?? "—"} · <span className="tabular-nums">{fechaCorta(p.dia)}</span>
                      {i < paquetes.length - 1 && ";"}
                    </b>
                  ))
                ) : (
                  <span className="text-text-muted">sin paquete todavía</span>
                )}
              </span>
              {of.avisos.length > 0 && (
                <span className="flex flex-wrap gap-1.5">
                  <ChipAviso of={of} tipo="TP" />
                  <ChipAviso of={of} tipo="COT" />
                </span>
              )}
            </div>

            <Tareas of={of} tiempos={tiempos} enDirecto={enDirecto} />
            <Compras of={of} />
            {of.detalleLinea && <DetalleLinea texto={of.detalleLinea} />}
          </div>
        </Desplegable>
      </div>
    </article>
  );
}
