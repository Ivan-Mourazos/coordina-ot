"use client";

import { useState } from "react";

import {
  enFrase,
  fechaCorta,
  puntoBultos,
  resumenAvisos,
  type EstadoOperacion,
  type OFBelen,
  type PuntoBultos,
  type ResumenPedido,
  type TipoAviso,
  difiereDelPedido,
} from "@/lib/vista-belen";

// ─── Una OF en la pantalla de Belén ──────────────────────────────────────────
// Tres franjas, de lo que se mira de un vistazo a lo que se lee con calma:
//
//   1. Identidad: punto de bultos, prioridad, OF, descripción, situación y, a la
//      derecha, las fechas que importan.
//   2. Trabajo: las operaciones con su estado y una barra de avance; al lado,
//      el paquete (quién y cuándo) y la logística.
//   3. Avisos, solo si hay: comentario de la OF, material que falta, TP/COT.
//
// Lo que es igual en todas las OF del pedido (entrega, rotulación, fecha
// solicitada) ya va en la cabecera y aquí solo sale si esta OF es distinta.
// Monitores pequeños: a 1280 px todo cabe en dos columnas; por debajo de
// 900 px la franja 2 se apila.

const PUNTO: Record<PuntoBultos, { clase: string; texto: string }> = {
  verde: { clase: "bg-emerald-600 dark:bg-emerald-400", texto: "Bultos subidos" },
  granate: { clase: "bg-rose-900 dark:bg-rose-300", texto: "Bultos subidos, pero las unidades no coinciden" },
  rojo: { clase: "bg-red-600 dark:bg-red-400", texto: "Bultos sin subir" },
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

function Fecha({ etiqueta, valor, clase = "" }: { etiqueta: string; valor: string | null; clase?: string }) {
  if (!valor) return null;
  return (
    <div className="text-right">
      <dt className="text-[11px] leading-tight text-text-muted">{etiqueta}</dt>
      <dd className={`text-[14px] font-semibold tabular-nums leading-tight ${clase}`}>{fechaCorta(valor)}</dd>
    </div>
  );
}

/** El texto de la línea del pedido (medidas, acabados): a veces es una línea
 *  y a veces veinte. Se ven dos y el resto al pedirlo. */
function DetalleLinea({ texto }: { texto: string }) {
  const [entero, setEntero] = useState(false);
  const largo = texto.length > 160 || texto.split(/\r?\n/).length > 2;
  return (
    <div className="mt-1 rounded-xl bg-[var(--detalle)] px-3 py-1.5 text-[12.5px]">
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

export function FilaOFBelen({
  of,
  resumen,
  resaltada,
}: {
  of: OFBelen;
  resumen: ResumenPedido;
  resaltada: boolean;
}) {
  const punto = PUNTO[puntoBultos(of.cantidad, of.subidas)];
  const textoPunto =
    of.subidas && of.subidas !== of.cantidad ? `${punto.texto}: ${of.subidas} de ${of.cantidad}` : punto.texto;
  const ops = of.operaciones;
  const hechas = ops.filter((o) => o.estado === "finalizado").length;
  const otraEntrega = difiereDelPedido(of, resumen, "formaEntrega");
  const otraRotulacion = difiereDelPedido(of, resumen, "rotulacion");
  const hayAvisos = of.notas || of.compras.length > 0 || of.avisos.length > 0;

  return (
    <article
      aria-label={`OF ${of.of}`}
      className={`tarjeta-of overflow-hidden rounded-3xl bg-surface ${resaltada ? "ring-2 ring-[var(--hero-anillo)]" : ""}`}
    >
      {/* 1. Identidad */}
      <div className="flex items-start gap-3 px-5 pb-2 pt-3">
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className={`size-3 rounded-full ${punto.clase}`} title={textoPunto} role="img" aria-label={textoPunto} />
          <span className="w-5 text-center text-[22px] font-bold leading-none tabular-nums" title="Prioridad">
            {of.prioridad ?? "—"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-mono text-[15px] font-bold">{of.of}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${claseSituacion(of.situacion)}`}>
              {enFrase(of.situacion)}
            </span>
            {of.linea !== null && <span className="text-[12px] text-text-muted">línea {of.linea}</span>}
            {of.subidas > 0 && of.subidas !== of.cantidad && (
              <span className="text-[12px] font-semibold text-rose-900 dark:text-rose-200">
                {of.subidas} de {of.cantidad} uds. subidas
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[13.5px] text-text-muted">{enFrase(of.descripcion)}</p>
          {of.detalleLinea && <DetalleLinea texto={of.detalleLinea} />}
          {/* Solo lo que difiere del resto del pedido. */}
          {(otraEntrega || otraRotulacion) && (
            <p className="mt-0.5 text-[12.5px]">
              {otraEntrega && <span>Entrega: {enFrase(of.formaEntrega) || "—"}</span>}
              {otraEntrega && otraRotulacion && <span className="text-text-muted"> · </span>}
              {otraRotulacion && <span>Rotulación: {of.rotulacion ?? "sin rotular"}</span>}
            </p>
          )}
        </div>
        <dl className="flex shrink-0 gap-4">
          {difiereDelPedido(of, resumen, "fechaSolicitada") && <Fecha etiqueta="Solicitada" valor={of.fechaSolicitada} />}
          <Fecha etiqueta="Comprometida" valor={of.fechaComprometida} clase="text-teal-700 dark:text-teal-300" />
          <Fecha etiqueta="Llega material" valor={of.fechaCompras} clase="text-amber-700 dark:text-amber-300" />
        </dl>
      </div>

      {/* 2. Trabajo */}
      <div className="grid gap-x-6 gap-y-2 px-5 pb-3 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {ops.length > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  {ops.map((o) => (
                    <span key={o.codigo} className={`flex-1 ${OPERACION[o.estado].barra}`} />
                  ))}
                </div>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-text-muted">
                  {hechas} de {ops.length} operaciones
                </span>
              </div>
              <ul className="mt-1.5 grid gap-x-5 gap-y-0.5 min-[1100px]:grid-cols-2" aria-label="Operaciones">
                {ops.map((op) => {
                  const e = OPERACION[op.estado];
                  return (
                    <li key={op.codigo} className="flex min-w-0 items-baseline gap-2 text-[12.5px]">
                      <span className="w-5 shrink-0 text-right tabular-nums text-text-muted">{op.codigo}</span>
                      <span
                        title={`${enFrase(op.descripcion)}${op.maquina ? ` · ${op.maquina}` : ""}`}
                        className={`min-w-0 flex-1 truncate ${op.estado === "sin_empezar" ? "text-text-muted" : ""}`}
                      >
                        {enFrase(op.descripcion)}
                      </span>
                      <span className={`shrink-0 text-[11.5px] font-semibold ${e.clase}`}>{e.texto}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-[12.5px] text-text-muted">Sin operaciones de taller.</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-[var(--detalle)] px-3.5 py-2.5 text-[12.5px]">
          <div>
            <div className="text-[11px] text-text-muted">Paquete</div>
            {of.paquetes.length > 0 ? (
              of.paquetes.map((p, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate font-semibold">{persona(p.quien) || "—"}</span>
                  <span className="shrink-0 tabular-nums text-text-muted">{fechaCorta(p.fecha)}</span>
                </div>
              ))
            ) : (
              <div className="text-text-muted">Sin paquete todavía</div>
            )}
          </div>
          {of.logistica && (
            <div>
              <div className="text-[11px] text-text-muted">Previsión de logística</div>
              <div className="flex justify-between gap-2">
                <span className="truncate font-semibold">{persona(of.logistica.responsable) || "—"}</span>
                <span className="shrink-0 font-semibold tabular-nums text-purple-700 dark:text-purple-300">
                  {fechaCorta(of.logistica.fecha)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Avisos */}
      {hayAvisos && (
        <div className="flex flex-col gap-1.5 border-t border-border px-5 py-2.5">
          {of.avisos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <ChipAviso of={of} tipo="TP" />
              <ChipAviso of={of} tipo="COT" />
            </div>
          )}
          {of.notas && (
            <p className="rounded-xl bg-red-500/8 px-3 py-1.5 text-[13px] font-semibold text-red-800 dark:text-red-200">
              {of.notas}
            </p>
          )}
          {of.compras.map((c, i) => (
            <p key={i} className="rounded-xl bg-amber-500/10 px-3 py-1.5 text-[12.5px] text-amber-900 dark:text-amber-100">
              <span className="font-semibold">Falta por recibir:</span> {enFrase(c.articulo)} ({c.recibida} de {c.pedida})
              {c.proveedor && <span className="text-amber-800/80 dark:text-amber-200/80"> · {enFrase(c.proveedor)}</span>}
              {c.prevista && <span className="font-semibold"> · llega {fechaCorta(c.prevista)}</span>}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
