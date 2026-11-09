"use client";

import { useEffect, useState } from "react";
import type { DocumentoRps } from "@/lib/historial";
import { fmtMinEnteros } from "@/lib/estado";
import {
  enFrase,
  fechaCorta,
  resumenPedido,
  type MaterialPedido,
  type PedidoBelen,
  type TiemposPedido,
} from "@/lib/vista-belen";
import { estadoMaterialDe } from "@/lib/types";
import { DocumentosRps } from "../DocumentosRps";
import { NotasPedido } from "../NotasPedido";
import { MaterialBelen } from "./MaterialBelen";
import { FilaOFBelen } from "./FilaOFBelen";
import { TiemposBelen } from "./TiemposBelen";

// ─── Un pedido en la pantalla de Belén ───────────────────────────────────────
// Arriba, una cabecera con lo que es del PEDIDO: cliente, lo que comparten
// todas sus OF (entrega, rotulación, fecha solicitada) y una línea con lo que
// falta, para saber de un vistazo si hay que mirar algo. Debajo, una ficha por
// OF; las finalizadas, plegadas al final.
//
// Es el detalle del pedido (Iván, 09/11/2026: «una pantalla de detalle de
// pedido elaborada»): debajo de la cabecera, tres subpestañas para que quepa
// en un monitor pequeño sin un scroll eterno. Documentos y tiempos se piden al
// abrir el pedido, en paralelo, para que cambiar de pestaña sea instantáneo.

type Seccion = "resumen" | "documentos" | "tiempos" | "material" | "notas";
type Carga<T> = { tipo: "cargando" } | { tipo: "listo"; datos: T } | { tipo: "error" };

function useCarga<T>(url: string, sacar: (json: unknown) => T): Carga<T> {
  const [carga, setCarga] = useState<Carga<T>>({ tipo: "cargando" });
  useEffect(() => {
    const ctl = new AbortController();
    fetch(url, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => setCarga({ tipo: "listo", datos: sacar(json) }))
      .catch(() => {
        if (!ctl.signal.aborted) setCarga({ tipo: "error" });
      });
    return () => ctl.abort();
    // sacar es una función pura escrita en el sitio: no cambia lo que se pide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return carga;
}

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

export function PedidoBelenView({
  pedido,
  ofResaltada,
  miId,
}: {
  pedido: PedidoBelen;
  ofResaltada: string | null;
  /** Quién escribe las notas: la sesión. null = sin sesión, notas solo de lectura. */
  miId: string | null;
}) {
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
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const docs = useCarga(`/api/pedidos/${encodeURIComponent(pedido.codigo)}/documentos`, (j) =>
    (j as { documentos?: DocumentoRps[] }).documentos ?? [],
  );
  const tiempos = useCarga(`/api/vista-belen?tiempos=${encodeURIComponent(pedido.codigo)}`, (j) =>
    (j as { tiempos: TiemposPedido | null }).tiempos,
  );
  const material = useCarga(`/api/vista-belen?material=${encodeURIComponent(pedido.codigo)}`, (j) =>
    (j as { material: MaterialPedido | null }).material,
  );
  // En la pestaña, cómo va lo asignado: lo peor manda, como en el tablero.
  const estadoMat =
    material.tipo === "listo" && material.datos ? estadoMaterialDe(material.datos.ofs) : null;
  const SECCIONES: { id: Seccion; label: string; extra?: string }[] = [
    { id: "resumen", label: "Resumen", extra: n(r.ofs, "OF", "OF") },
    { id: "documentos", label: "Documentos", extra: docs.tipo === "listo" ? String(docs.datos.length) : undefined },
    {
      id: "tiempos",
      label: "Tareas y tiempos",
      extra: tiempos.tipo === "listo" && tiempos.datos ? fmtMinEnteros(tiempos.datos.minutos) : undefined,
    },
    {
      id: "material",
      label: "Material",
      extra: estadoMat === "sinReservar" ? "sin reservar" : estadoMat === "aMedias" ? "a medias" : estadoMat === "reservado" ? "reservado" : undefined,
    },
    { id: "notas", label: "Notas" },
  ];

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
        {pedido.comentarioVenta && (
          <div className="mt-2.5 border-t border-border pt-2">
            <div className="text-[11px] text-text-muted">Comentario del pedido</div>
            <p className="whitespace-pre-line text-[13px]">{pedido.comentarioVenta}</p>
          </div>
        )}
      </header>

      <div role="tablist" aria-label="Detalle del pedido" className="flex flex-wrap gap-1.5 px-1 pt-1">
        {SECCIONES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`detalle-${x.id}`}
            aria-selected={seccion === x.id}
            aria-controls={`panel-detalle-${x.id}`}
            onClick={() => setSeccion(x.id)}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              seccion === x.id
                ? "bg-text text-bg"
                : "bg-[var(--hero-relleno)] text-text-muted hover:bg-[var(--hero-relleno-encima)] hover:text-text"
            }`}
          >
            {x.label}
            {x.extra && (
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${seccion === x.id ? "bg-bg/20" : "bg-[var(--hero-relleno-encima)]"}`}
              >
                {x.extra}
              </span>
            )}
          </button>
        ))}
      </div>

      {seccion === "documentos" && (
        <div role="tabpanel" id="panel-detalle-documentos" aria-labelledby="detalle-documentos" className="tarjeta-of rounded-3xl bg-surface px-4 py-3">
          {docs.tipo === "cargando" && <p className="text-sm text-text-muted">Cargando documentos…</p>}
          {docs.tipo === "error" && (
            <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
              No se pudieron leer los documentos de RPS. Prueba otra vez en un momento.
            </p>
          )}
          {docs.tipo === "listo" &&
            (docs.datos.length ? (
              // Los planteamientos primero: es lo que más busca (Belén, 09/11/2026).
              <DocumentosRps documentos={docs.datos} clasePrimero="Planteamiento" abrirPrimera />
            ) : (
              <p className="text-sm text-text-muted">Este pedido no tiene documentos en RPS.</p>
            ))}
        </div>
      )}

      {seccion === "material" && (
        <div role="tabpanel" id="panel-detalle-material" aria-labelledby="detalle-material">
          {material.tipo === "cargando" && <p className="px-1 text-sm text-text-muted">Cargando material…</p>}
          {material.tipo === "error" && (
            <p role="alert" className="px-1 text-sm font-semibold text-red-700 dark:text-red-300">
              No se pudo leer el material de RPS. Prueba otra vez en un momento.
            </p>
          )}
          {material.tipo === "listo" && material.datos && <MaterialBelen material={material.datos} />}
        </div>
      )}

      {seccion === "notas" && (
        <div
          role="tabpanel"
          id="panel-detalle-notas"
          aria-labelledby="detalle-notas"
          className="tarjeta-of rounded-3xl bg-surface px-5 py-3"
        >
          <p className="mb-2 text-[12.5px] text-text-muted">
            Aquí ves las notas que Oficina Técnica pone «para todos» y las tuyas. Lo que escribas «para todos» lo lee
            todo el equipo.
          </p>
          <NotasPedido pedido={pedido.codigo} miId={miId} operarios={[]} publicaPorDefecto />
        </div>
      )}

      {seccion === "tiempos" && (
        <div role="tabpanel" id="panel-detalle-tiempos" aria-labelledby="detalle-tiempos">
          {tiempos.tipo === "cargando" && <p className="px-1 text-sm text-text-muted">Cargando tareas y tiempos…</p>}
          {tiempos.tipo === "error" && (
            <p role="alert" className="px-1 text-sm font-semibold text-red-700 dark:text-red-300">
              No se pudieron leer los tiempos de RPS. Prueba otra vez en un momento.
            </p>
          )}
          {tiempos.tipo === "listo" &&
            (tiempos.datos ? (
              <TiemposBelen tiempos={tiempos.datos} />
            ) : (
              <p className="px-1 text-sm text-text-muted">Este pedido no tiene tareas en RPS.</p>
            ))}
        </div>
      )}

      {seccion === "resumen" && (
      <div role="tabpanel" id="panel-detalle-resumen" aria-labelledby="detalle-resumen" className="flex flex-col gap-2">
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
      </div>
      )}
    </section>
  );
}
