"use client";

import { useState } from "react";

import {
  agruparPaquetes,
  difiereDelPedido,
  enFrase,
  enTitulo,
  fechaCorta,
  fmtDuracion,
  ofEnAmarillo,
  puntoBultos,
  resumenAvisos,
  type OFBelen,
  type PuntoBultos,
  type ResumenPedido,
  type TipoAviso,
} from "@/lib/vista-belen";
import { AcentoBloque, type TipoBloque } from "../AcentoBloque";
import { Desplegable } from "../Desplegable";
import { chip, ESTADO_OPERACION, FECHA, tonoSituacion } from "./estilos-belen";
import { SIGNIFICA } from "./significados";
import { ImprimirOF } from "./ImprimirOF";

// ─── Una OF en la pantalla de Belén ──────────────────────────────────────────
// Encogida, una línea con lo que se mira de un vistazo (Belén, 11/11/2026):
// punto de bultos, prioridad, TP/COT, OF, artículo, fecha de entrega,
// solicitada, situación, comprometida, compras y logística; lo vacío no sale.
// Al pincharla se despliega todo, en el orden de Belén: descripción e
// imprimir, comentario de la OF (rojo), entrega/rotulación si difieren del
// pedido, paquete y TP/COT, las tareas (sección, tiempo, fin, estado y la de
// los bultos), lo que falta de compras y el texto de la línea del pedido.
// A 1280 px la línea encogida cabe; si no, las fechas bajan a una segunda.

const PUNTO: Record<PuntoBultos, { clase: string; texto: string }> = {
  verde: { clase: "bg-emerald-600 dark:bg-emerald-400", texto: SIGNIFICA.puntoVerde },
  azul: { clase: "bg-blue-600 dark:bg-blue-400", texto: SIGNIFICA.puntoAzul },
  rojo: { clase: "bg-red-600 dark:bg-red-400", texto: SIGNIFICA.puntoRojo },
};

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

/** Las tareas de la OF con todo lo suyo y, al final, sus TP/COT. */
function Tareas({ of }: { of: OFBelen }) {
  const ops = of.operaciones;
  const hechas = ops.filter((o) => o.estado === "finalizado").length;
  if (!ops.length && !of.avisos.length) return <p className="text-[12.5px] text-text-muted">Sin tareas en RPS.</p>;
  return (
    <div>
      <CabeceraBloque tipo="tareas" derecha={ops.length ? `${hechas} de ${ops.length} acabadas` : undefined}>
        Tareas
      </CabeceraBloque>
      <table className="w-full table-fixed border-collapse text-[13px]">
        <caption className="sr-only">Tareas de la OF {of.of}</caption>
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <th scope="col" className="py-1 pr-2">Tarea</th>
            <th scope="col" className="w-[13rem] px-2 py-1">Sección</th>
            <th scope="col" className="w-[7rem] px-2 py-1 text-right">Tiempo</th>
            <th scope="col" className="w-[6.5rem] whitespace-nowrap px-2 py-1" title="El día en que se acabó la operación">Fin</th>
            <th scope="col" className="w-[6.5rem] py-1 pl-2 text-right">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ops.map((op) => {
            const e = ESTADO_OPERACION[op.estado];
            return (
              <tr key={op.codigo}>
                <td className="truncate py-1.5 pr-2" title={enFrase(op.descripcion)}>
                  <span className={`mr-2 inline-block size-2 rounded-full align-middle ${e.punto}`} aria-hidden />
                  <span className="mr-1.5 inline-block w-6 text-right text-[12px] tabular-nums text-text-muted">{op.codigo}</span>
                  <span className={op.estado === "sin_empezar" ? "text-text-muted" : ""}>{enFrase(op.descripcion)}</span>
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
                <td className="px-2 py-1.5 tabular-nums" title={op.ultimoFichaje ? `Último fichaje: ${fechaCorta(op.ultimoFichaje)}` : undefined}>
                  {fechaCorta(op.fin) || <span className="text-text-muted">—</span>}
                </td>
                <td
                  className={`py-1.5 pl-2 text-right text-[12px] font-semibold ${e.tinta}`}
                  title={op.estado === "finalizado" ? SIGNIFICA.finalizado : op.estado === "interrumpido" ? SIGNIFICA.interrumpido : SIGNIFICA.sinEmpezar}
                >
                  {e.texto}
                </td>
              </tr>
            );
          })}
          {of.avisos.map((a) => (
            <tr key={`${a.tipo}-${a.codigo}`}>
              <td colSpan={3} className="truncate py-1.5 pr-2" title={enFrase(a.descripcion)}>
                <span className={`${chip("neutro")} mr-2`}>{a.tipo}</span>
                {enFrase(a.descripcion) || a.codigo}
              </td>
              <td className="px-2 py-1.5 tabular-nums">{fechaCorta(a.cerrado) || <span className="text-text-muted">—</span>}</td>
              <td className={`py-1.5 pl-2 text-right text-[12px] font-semibold ${a.cerrado ? ESTADO_OPERACION.finalizado.tinta : ESTADO_OPERACION.interrumpido.tinta}`}>
                {a.cerrado ? "Hecho" : "Pendiente"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
}: {
  of: OFBelen;
  resumen: ResumenPedido;
  resaltada: boolean;
  /** ¿Tiene material reservado? undefined = el material aún está cargando. */
  conReserva?: boolean;
  /** Desplegada (todo) o encogida (una línea). */
  abierta: boolean;
  onAlternar: () => void;
}) {
  const punto = PUNTO[puntoBultos(of.cantidad, of.subidas)];
  const noCuadra = of.subidas > 0 && of.subidas !== of.cantidad;
  const textoPunto = noCuadra ? `${punto.texto}: ${of.subidas} de ${of.cantidad}` : punto.texto;
  const otraEntrega = difiereDelPedido(of, resumen, "formaEntrega");
  const otraRotulacion = difiereDelPedido(of, resumen, "rotulacion");
  // Belén (11/11/2026): la OF en amarillo cuando tiene sus visitas (TP/COT)
  // hechas y TODAS sus tareas finalizadas. Es de la OF, no del pedido. Tinte
  // suave sobre la superficie (Iván lo aprobó con capturas el 10/11).
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
        amarilla ? "bg-surface [--surface:var(--belen-avisos-hechos)]" : "bg-surface"
      } ${resaltada ? "ring-2 ring-[var(--hero-anillo)]" : ""}`}
    >
      {/* La OF encogida, en una línea, con lo que pidió Belén (11/11/2026) y en
          su orden: punto, prioridad, TP/COT, OF, artículo, fecha de entrega,
          solicitada, situación, comprometida, compras y logística. Lo que no
          tiene valor no sale. Pinchando se despliega todo. */}
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idCuerpo}
        onClick={onAlternar}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left transition-colors hover:bg-[var(--hero-relleno)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--hero-anillo)]"
      >
        <span aria-hidden className={`inline-block w-3 text-text-muted transition-transform duration-200 motion-reduce:transition-none ${abierta ? "rotate-90" : ""}`}>▸</span>
        <span role="img" aria-label={textoPunto} title={textoPunto} className={`size-3 shrink-0 rounded-full ${punto.clase}`} />
        <span title={SIGNIFICA.prioridad} className="grid h-7 min-w-8 place-items-center rounded-lg bg-[var(--hero-relleno)] px-1 text-[13px] font-bold tabular-nums">
          <span className="sr-only">Prioridad </span>P{of.prioridad ?? "—"}
        </span>
        {tp && <span title={SIGNIFICA.tp} className={chip(tp.pendiente ? "aviso" : "ok")}>TP</span>}
        {cot && <span title={SIGNIFICA.cot} className={chip(cot.pendiente ? "aviso" : "ok")}>COT</span>}
        <span className="font-mono text-[15px] font-bold">{of.of}</span>
        <span className="min-w-[10rem] flex-1 truncate text-[13.5px] font-medium" title={of.articulo ?? of.descripcion}>
          {enFrase(of.articulo ?? of.descripcion)}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {of.fechaEntrega && <FechaCorta rotulo="Entrega" valor={of.fechaEntrega} tinta="text-text" ayuda="«F. ENTREGA» de la hoja de ruta: la fecha de fabricación de la OF en RPS" />}
          {of.fechaSolicitada && <FechaCorta {...FECHA.solicitada} valor={of.fechaSolicitada} ayuda={SIGNIFICA.solicitada} />}
          {of.situacion && <span title={SIGNIFICA.situacion} className={chip(tonoSituacion(of.situacion))}>{enFrase(of.situacion)}</span>}
          {of.fechaComprometida && <FechaCorta {...FECHA.comprometida} valor={of.fechaComprometida} ayuda={SIGNIFICA.comprometida} />}
          {of.fechaCompras && <FechaCorta {...FECHA.compras} valor={of.fechaCompras} ayuda={SIGNIFICA.compras} />}
          {of.logistica?.fecha && <FechaCorta {...FECHA.logistica} valor={of.logistica.fecha} ayuda={SIGNIFICA.logistica} extra={of.logistica.responsable} />}
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

            <Tareas of={of} />
            <Compras of={of} />
            {of.detalleLinea && <DetalleLinea texto={of.detalleLinea} />}
          </div>
        </Desplegable>
      </div>
    </article>
  );
}
