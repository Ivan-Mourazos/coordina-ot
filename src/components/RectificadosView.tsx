"use client";

import { useEffect, useState } from "react";
import {
  RESULTADOS_RECTIFICADO,
  pendientesDe,
  type Rectificado,
  type ResultadoRectificado,
} from "@/lib/rectificados";
import type { SeccionId } from "@/lib/secciones";
import { useSoloLectura } from "./SoloLectura";

// ─── Rectificados por revisar ────────────────────────────────────────────────
// Los pedidos que Calidad rectificó sin pasar por aquí, para decidir si hay que
// tocar el planteamiento original. La regla y de dónde salen, en
// lib/rectificados.ts. Cada fila se cierra con una de tres salidas y deja quién
// y cuándo; lo cerrado se queda debajo para poder deshacer un error.

const RESULTADOS = Object.entries(RESULTADOS_RECTIFICADO) as [ResultadoRectificado, string][];
const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/** Calidad escribe en mayúsculas: en una tarjeta se lee mejor como frase. */
function frase(texto: string): string {
  return texto
    .toLocaleLowerCase("es-ES")
    .replace(/\s+([.,])/g, "$1")
    .replace(/(^|[.]\s+)(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase("es-ES"));
}

/** La píldora de cada salida: el color dice cómo acabó, el texto lo confirma. */
const TONO: Record<ResultadoRectificado, string> = {
  corregido: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  ya_estaba: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  no_hace_falta: "bg-[var(--hero-relleno)] text-text-muted",
};

function Pedido({ etiqueta, codigo, onAbrir }: { etiqueta: string; codigo: string; onAbrir: (codigo: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(codigo)}
      title={`Abre el pedido ${codigo}`}
      className="min-w-0 rounded-2xl bg-[var(--hero-relleno)] px-3.5 py-2 text-left transition-colors hover:bg-[var(--hero-relleno-encima)]"
    >
      <span className="block text-[11px] text-text-muted">{etiqueta}</span>
      <span className="block text-sm font-semibold tabular-nums text-text">{codigo}</span>
    </button>
  );
}

function Fila({
  r,
  ocupada,
  soloLectura,
  onAbrirPedido,
  onMarcar,
  onDeshacer,
}: {
  r: Rectificado;
  ocupada: boolean;
  soloLectura: boolean;
  onAbrirPedido: (codigo: string) => void;
  onMarcar: (nc: string, resultado: ResultadoRectificado) => void;
  onDeshacer: (nc: string) => void;
}) {
  const textos = [...new Set([r.descripcion, ...r.defectos].filter(Boolean))];
  return (
    <li className="tarjeta-rectificado p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="min-w-0 text-base font-semibold text-text">{r.cliente ?? "Cliente sin datos"}</h3>
        <span className="text-xs tabular-nums text-text-muted">{r.nc} · {fmt(r.fecha)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pedido etiqueta="Falló" codigo={r.pedido} onAbrir={onAbrirPedido} />
        <span aria-hidden className="text-text-muted">→</span>
        <Pedido etiqueta="Rectificado en" codigo={r.rectificativo} onAbrir={onAbrirPedido} />
      </div>
      {textos.length > 0 && (
        <div className="mt-3 rounded-2xl bg-brand-400/15 px-4 py-3">
          <p className="text-[11px] font-semibold text-text-muted">Qué dice Calidad</p>
          {textos.map((t) => (
            <p key={t} className="mt-0.5 text-sm text-text">{frase(t)}</p>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {r.marca ? (
          <>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONO[r.marca.resultado]}`}>
              {RESULTADOS_RECTIFICADO[r.marca.resultado]}
            </span>
            <span className="text-xs text-text-muted">{r.marca.nombre} · {fmt(r.marca.en)}</span>
            {!soloLectura && (
              <button type="button" disabled={ocupada} onClick={() => onDeshacer(r.nc)} className="chip-3d ml-auto px-3.5 py-1.5 text-xs font-semibold text-text disabled:opacity-55">
                Deshacer
              </button>
            )}
          </>
        ) : (
          !soloLectura &&
          RESULTADOS.map(([id, texto], i) => (
            <button
              key={id}
              type="button"
              disabled={ocupada}
              onClick={() => onMarcar(r.nc, id)}
              className={`px-4 py-2 text-xs font-semibold disabled:opacity-55 ${
                i === 0 ? "boton-3d bg-brand-400 text-brand-950 hover:bg-brand-300" : "chip-3d text-text"
              }`}
            >
              {texto}
            </button>
          ))
        )}
      </div>
    </li>
  );
}

export function RectificadosView({
  seccion,
  miId,
  onAbrirPedido,
  onPendientes,
}: {
  seccion: SeccionId;
  miId: string | null;
  onAbrirPedido: (codigo: string) => void;
  /** Para el contador de la pestaña. */
  onPendientes: (n: number) => void;
}) {
  const soloLectura = useSoloLectura();
  const [filas, setFilas] = useState<Rectificado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [apartado, setApartado] = useState<"pendientes" | "revisados">("pendientes");

  // Sube tras cada marca: vuelve a pedir la lista, y con ella el contador.
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/rectificados?seccion=${seccion}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ rectificados: Rectificado[] }>;
      })
      .then((d) => {
        if (!vivo) return;
        setFilas(d.rectificados);
        setError(null);
        onPendientes(pendientesDe(d.rectificados));
      })
      .catch(() => {
        if (vivo) setError("No se pudieron cargar los rectificados. Prueba otra vez en un momento.");
      });
    return () => {
      vivo = false;
    };
  }, [seccion, vuelta, onPendientes]);

  const enviar = async (nc: string, metodo: "POST" | "DELETE", resultado?: ResultadoRectificado) => {
    setOcupada(nc);
    try {
      const r = await fetch("/api/rectificados", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nc, seccion, resultado, operarioId: miId }),
      });
      if (!r.ok) throw new Error();
      setVuelta((v) => v + 1);
    } catch {
      setError("No se pudo guardar. Prueba otra vez.");
    } finally {
      setOcupada(null);
    }
  };

  const fila = (r: Rectificado) => (
    <Fila
      key={r.nc}
      r={r}
      ocupada={ocupada === r.nc}
      soloLectura={soloLectura}
      onAbrirPedido={onAbrirPedido}
      onMarcar={(nc, resultado) => void enviar(nc, "POST", resultado)}
      onDeshacer={(nc) => void enviar(nc, "DELETE")}
    />
  );
  const pendientes = filas?.filter((r) => !r.marca) ?? [];
  const revisados = filas?.filter((r) => r.marca) ?? [];

  const visibles = apartado === "pendientes" ? pendientes : revisados;
  const apartados = [
    { id: "pendientes", texto: "Por revisar", n: pendientes.length },
    { id: "revisados", texto: "Ya revisados", n: revisados.length },
  ] as const;

  return (
    <section className="mx-auto max-w-4xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text">Rectificados</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Pedidos rectificados en fábrica: mira si hay que cambiar el planteamiento original.
          </p>
        </div>
        <div className="tira-3d glass-chip inline-flex rounded-lg p-1" role="group" aria-label="Qué rectificados ver">
          {apartados.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={apartado === a.id}
              onClick={() => setApartado(a.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${apartado === a.id ? "pestana-activa" : ""}`}
            >
              {a.texto}
              <span className="ml-1.5 font-normal tabular-nums">{a.n}</span>
            </button>
          ))}
        </div>
      </header>
      {error && (
        <p role="alert" className="mb-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-text">{error}</p>
      )}
      {!filas && !error && (
        <div aria-label="Cargando" className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="tarjeta-rectificado h-44 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      )}
      {filas && visibles.length === 0 && (
        <div className="tarjeta-rectificado grid min-h-56 place-items-center px-6 text-center">
          <div>
            <span aria-hidden className="mx-auto grid size-11 place-items-center rounded-full bg-teal-500/15 text-lg text-teal-800 dark:text-teal-300">✓</span>
            <p className="mt-3 text-sm font-semibold text-text">
              {apartado === "pendientes" ? "No hay rectificados por revisar" : "Todavía no hay ninguno revisado"}
            </p>
          </div>
        </div>
      )}
      {visibles.length > 0 && <ul className="flex flex-col gap-3">{visibles.map(fila)}</ul>}
    </section>
  );
}
