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
import { AcentoBloque, type TipoBloque } from "../AcentoBloque";
import { CaraPersona } from "./CaraPersona";
import { SIGNIFICA } from "./significados";

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
  verde: { clase: "bg-emerald-600 dark:bg-emerald-400", texto: SIGNIFICA.puntoVerde },
  marron: { clase: "bg-amber-700 dark:bg-amber-500", texto: SIGNIFICA.puntoMarron },
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
  const fechas = [
    difiereDelPedido(of, resumen, "fechaSolicitada") && of.fechaSolicitada
      ? { etiqueta: "Solicitada", valor: of.fechaSolicitada, clase: "text-text", ayuda: SIGNIFICA.solicitada }
      : null,
    of.fechaComprometida
      ? { etiqueta: "Comprometida", valor: of.fechaComprometida, clase: "text-teal-700 dark:text-teal-300", ayuda: SIGNIFICA.comprometida }
      : null,
    of.fechaCompras
      ? { etiqueta: "Llega material", valor: of.fechaCompras, clase: "text-amber-700 dark:text-amber-300", ayuda: SIGNIFICA.llegaMaterial }
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
            <span className="font-mono text-[16px] font-bold">{of.of}</span>
            <span
              title={SIGNIFICA.situacion}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${claseSituacion(of.situacion)}`}
            >
              {enFrase(of.situacion)}
            </span>
            {of.linea !== null && <span className="text-[12px] text-text-muted">línea {of.linea}</span>}
            {of.subidas > 0 && of.subidas !== of.cantidad && (
              <span className="rounded-full bg-amber-700 px-2.5 py-0.5 text-[11.5px] font-bold text-white dark:bg-amber-500 dark:text-black">
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
          <dl className="flex shrink-0 gap-1.5">
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
                <span className="shrink-0 rounded-lg bg-purple-500/12 px-2 py-0.5 font-bold tabular-nums text-purple-700 dark:text-purple-300">
                  {fechaCorta(of.logistica.fecha)}
                </span>
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
          {of.notas && (
            <p className="flex items-start gap-2 rounded-xl bg-red-500/8 px-3 py-2 text-[13px] font-semibold text-red-800 dark:text-red-200">
              <AcentoBloque tipo="comentario" />
              <span>{of.notas}</span>
            </p>
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
    </article>
  );
}
