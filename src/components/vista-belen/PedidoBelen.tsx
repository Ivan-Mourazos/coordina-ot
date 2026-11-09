"use client";

import { useState } from "react";
import { enFrase, fechaCorta, resumenPedido, type PedidoBelen } from "@/lib/vista-belen";
import { FilaOFBelen } from "./FilaOFBelen";

// ─── Un pedido en la pantalla de Belén ───────────────────────────────────────
// Arriba, una cabecera con lo que es del PEDIDO: cliente, lo que comparten
// todas sus OF (entrega, rotulación, fecha solicitada) y una línea con lo que
// falta, para saber de un vistazo si hay que mirar algo. Debajo, una ficha por
// OF; las finalizadas, plegadas al final.

type Tono = "rojo" | "granate" | "verde" | "ambar" | "neutro";

const TONO: Record<Tono, string> = {
  rojo: "bg-red-500/12 text-red-800 dark:text-red-300",
  granate: "bg-rose-900/12 text-rose-900 dark:bg-rose-400/15 dark:text-rose-200",
  verde: "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300",
  ambar: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  neutro: "bg-[var(--hero-relleno)] text-text",
};

function Chip({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  return <li className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${TONO[tono]}`}>{children}</li>;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-muted">{etiqueta}</dt>
      <dd className="truncate text-[13px] font-semibold">{children}</dd>
    </div>
  );
}

export function PedidoBelenView({ pedido, ofResaltada }: { pedido: PedidoBelen; ofResaltada: string | null }) {
  const r = resumenPedido(pedido);
  const fin = (s: string) => s.trim().toUpperCase() === "FINALIZADA";
  const porOF = (a: { of: string }, b: { of: string }) => a.of.localeCompare(b.of);
  const abiertas = pedido.ofs.filter((o) => !fin(o.situacion)).sort(porOF);
  const finalizadas = pedido.ofs.filter((o) => fin(o.situacion)).sort(porOF);
  // Si busca una OF finalizada, o no queda ninguna abierta, se despliegan.
  const [verFinalizadas, setVerFinalizadas] = useState(
    abiertas.length === 0 || finalizadas.some((o) => o.of === ofResaltada),
  );

  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

  return (
    <section aria-label={`Pedido ${pedido.codigo}`} className="flex flex-col gap-2">
      <header className="tarjeta-of rounded-3xl bg-surface px-5 py-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold tabular-nums">{pedido.codigo}</h1>
          <span className="text-[15px] font-semibold">{pedido.cliente}</span>
          <span className="text-[13px] text-text-muted">{n(r.ofs, "OF", "OF")}</span>
        </div>

        {/* Lo que falta, de un vistazo. Si no hay nada pendiente, lo dice. */}
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Resumen del pedido">
          {r.bultos.rojo > 0 && <Chip tono="rojo">{n(r.bultos.rojo, "OF sin bultos", "OF sin bultos")}</Chip>}
          {r.bultos.granate > 0 && (
            <Chip tono="granate">{n(r.bultos.granate, "OF con unidades que no cuadran", "OF con unidades que no cuadran")}</Chip>
          )}
          {r.tpPendiente > 0 && <Chip tono="ambar">TP pendiente</Chip>}
          {r.cotPendiente > 0 && <Chip tono="ambar">COT pendiente</Chip>}
          {r.conMaterialPendiente > 0 && (
            <Chip tono="ambar">{n(r.conMaterialPendiente, "OF esperando material", "OF esperando material")}</Chip>
          )}
          {r.bultos.verde === r.ofs && r.tpPendiente === 0 && r.cotPendiente === 0 && r.conMaterialPendiente === 0 && (
            <Chip tono="verde">Todo subido, nada pendiente</Chip>
          )}
          {r.bultos.verde > 0 && r.bultos.verde < r.ofs && (
            <Chip tono="neutro">{n(r.bultos.verde, "OF con bultos subidos", "OF con bultos subidos")}</Chip>
          )}
        </ul>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-2.5 sm:grid-cols-4">
          <Dato etiqueta="Entrega">{r.igual.formaEntrega ? enFrase(r.comunes.formaEntrega) || "—" : "Distinta por OF"}</Dato>
          <Dato etiqueta="Rotulación">{r.igual.rotulacion ? r.comunes.rotulacion ?? "Sin rotular" : "Distinta por OF"}</Dato>
          <Dato etiqueta="Fecha solicitada">
            {r.igual.fechaSolicitada ? fechaCorta(r.comunes.fechaSolicitada) || "—" : "Distinta por OF"}
          </Dato>
          <Dato etiqueta="Fecha comprometida">
            {r.comprometida ? (
              <span className="text-teal-700 dark:text-teal-300">{fechaCorta(r.comprometida)}</span>
            ) : (
              <span className="font-normal text-text-muted">Sin dar</span>
            )}
          </Dato>
        </dl>
      </header>

      {abiertas.map((o) => (
        <FilaOFBelen key={o.of} of={o} resumen={r} resaltada={o.of === ofResaltada} />
      ))}
      {finalizadas.length > 0 && (
        <button
          type="button"
          aria-expanded={verFinalizadas}
          onClick={() => setVerFinalizadas((v) => !v)}
          className="self-start rounded-full px-3 py-1 text-[13px] font-semibold text-text-muted hover:bg-[var(--hero-relleno)] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {verFinalizadas ? "▾" : "▸"} {n(finalizadas.length, "OF finalizada", "OF finalizadas")}
        </button>
      )}
      {verFinalizadas &&
        finalizadas.map((o) => <FilaOFBelen key={o.of} of={o} resumen={r} resaltada={o.of === ofResaltada} />)}
    </section>
  );
}
