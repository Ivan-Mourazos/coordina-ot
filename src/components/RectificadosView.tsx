"use client";

import { useEffect, useState } from "react";
import {
  RESULTADOS_RECTIFICADO,
  pendientesDe,
  type Rectificado,
  type ResultadoRectificado,
} from "@/lib/rectificados";
import type { SeccionId } from "@/lib/secciones";
import { BOTON_BLOQUE, BOTON_CIERRE, BOTON_NEUTRO, TAMANO_BLOQUE } from "@/lib/botones";
import { useSoloLectura } from "./SoloLectura";

// ─── Rectificados por revisar ────────────────────────────────────────────────
// Los pedidos que Calidad rectificó sin pasar por aquí, para decidir si hay que
// tocar el planteamiento original. La regla y de dónde salen, en
// lib/rectificados.ts. Cada fila se cierra con una de tres salidas y deja quién
// y cuándo; lo cerrado se queda debajo para poder deshacer un error.

const RESULTADOS = Object.entries(RESULTADOS_RECTIFICADO) as [ResultadoRectificado, string][];
const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/** «Ya revisados» crece cada mes: se agrupa por el mes de la NC, en el orden
 *  en que ya viene la lista (lo más reciente arriba). */
function porMes(rs: Rectificado[]): [string, Rectificado[]][] {
  const grupos = new Map<string, Rectificado[]>();
  for (const r of rs) {
    const mes = r.fecha.slice(0, 7);
    grupos.set(mes, [...(grupos.get(mes) ?? []), r]);
  }
  return [...grupos].sort(([a], [b]) => b.localeCompare(a));
}

/** «2026-11» → «Noviembre 2026». */
function nombreMes(mes: string): string {
  const texto = new Date(`${mes}-15T12:00:00`).toLocaleDateString("es-ES", { month: "long", year: "numeric" }).replace(" de ", " ");
  return texto.charAt(0).toLocaleUpperCase("es-ES") + texto.slice(1);
}

/** Calidad escribe en mayúsculas: en una tarjeta se lee mejor como frase. */
function frase(texto: string): string {
  return texto
    .toLocaleLowerCase("es-ES")
    .replace(/\s+([.,])/g, "$1")
    .replace(/(^|[.]\s+)(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase("es-ES"));
}

/** El punto de la píldora de cada salida, como el estado de una OF: la
 *  píldora es neutra y el color solo dice cómo acabó. */
const PUNTO: Record<ResultadoRectificado, string> = {
  corregido: "bg-teal-600 dark:bg-teal-400",
  ya_estaba: "bg-sky-500",
  no_hace_falta: "bg-text-muted",
};

/** El código de un pedido, con la jerarquía de la tarjeta de OF de la ficha:
 *  subrayado punteado para que se vea que se abre (lo abre el Board en
 *  Coordina). `rounded-none!`: en hero todo botón es una píldora. */
function Pedido({
  etiqueta,
  codigo,
  principal,
  onAbrir,
}: {
  etiqueta: string;
  codigo: string;
  principal?: boolean;
  onAbrir: (codigo: string) => void;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-[11px] text-text-muted">{etiqueta}</span>
      <button
        type="button"
        onClick={() => onAbrir(codigo)}
        title={`Abre el pedido ${codigo} en Coordina`}
        className={`rounded-none! font-mono tracking-[0.02em] underline decoration-dotted underline-offset-[3px] hover:decoration-solid ${
          principal ? "text-[15px] font-bold text-text" : "text-[13px] font-semibold text-text-muted hover:text-text"
        }`}
      >
        {codigo}
      </button>
    </span>
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
  // Lo ya revisado pliega lo que dijo Calidad, como una corrección enviada.
  const [verNota, setVerNota] = useState(!r.marca);
  const conBarra = r.marca ? true : !soloLectura;
  return (
    <li className="bloque-3d rounded-xl px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Pedido etiqueta="Falló" codigo={r.pedido} principal onAbrir={onAbrirPedido} />
        <span aria-hidden className="px-0.5 text-text-muted">→</span>
        <Pedido etiqueta="Rectificado en" codigo={r.rectificativo} onAbrir={onAbrirPedido} />
        <span className="ml-auto text-[11px] tabular-nums text-text-muted" title={`No conformidad del ${fmt(r.fecha)}`}>
          <span className="font-mono">{r.nc}</span> · {fmt(r.fecha)}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-text" title={r.cliente ?? undefined}>
        {r.cliente ?? "Cliente sin datos"}
      </p>
      {textos.length > 0 &&
        (verNota ? (
          <div className={`mt-2 rounded-md border-l-[3px] bg-surface-2 px-2.5 py-1.5 ${r.marca ? "border-border" : "border-amber-500"}`}>
            {r.marca ? (
              <button
                type="button"
                onClick={() => setVerNota(false)}
                className="flex items-center gap-1.5 rounded-none! text-[11px] font-semibold text-text-muted hover:text-text"
              >
                <span aria-hidden className="text-[9px]">▾</span>
                Qué dijo Calidad
              </button>
            ) : (
              <p className="text-[11px] font-semibold text-text">Qué dice Calidad</p>
            )}
            <div className="mt-0.5 max-w-[75ch] space-y-1">
              {textos.map((t) => (
                <p key={t} className="text-[13px] leading-snug text-text">{frase(t)}</p>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setVerNota(true)}
            className="mt-2 flex w-full min-w-0 items-center gap-1.5 rounded-md! border-l-[3px] border-border bg-surface-2 px-2.5 py-1 text-left text-[11px] text-text-muted hover:text-text"
          >
            <span aria-hidden className="text-[9px]">▸</span>
            <span className="shrink-0 font-semibold">Qué dijo Calidad</span>
            <span className="truncate">· {frase(textos[0])}</span>
          </button>
        ))}
      {conBarra && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {r.marca ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text">
                <span aria-hidden className={`size-1.5 rounded-full ${PUNTO[r.marca.resultado]}`} />
                {RESULTADOS_RECTIFICADO[r.marca.resultado]}
              </span>
              <span className="text-[11px] tabular-nums text-text-muted">{r.marca.nombre} · {fmt(r.marca.en)}</span>
              {!soloLectura && (
                <button type="button" disabled={ocupada} onClick={() => onDeshacer(r.nc)} className={`ml-auto ${TAMANO_BLOQUE} ${BOTON_NEUTRO}`}>
                  Deshacer
                </button>
              )}
            </>
          ) : (
            RESULTADOS.map(([id, texto], i) => (
              <button
                key={id}
                type="button"
                disabled={ocupada}
                onClick={() => onMarcar(r.nc, id)}
                className={i === 0 ? `${BOTON_BLOQUE} ${BOTON_CIERRE}` : `${TAMANO_BLOQUE} ${BOTON_NEUTRO}`}
              >
                {texto}
              </button>
            ))
          )}
        </div>
      )}
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
        <div aria-label="Cargando" className="flex flex-col gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="bloque-3d h-32 rounded-xl animate-pulse motion-reduce:animate-none" />
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
      {visibles.length > 0 && apartado === "pendientes" && <ul className="flex flex-col gap-2.5">{visibles.map(fila)}</ul>}
      {visibles.length > 0 && apartado === "revisados" && (
        <div className="flex flex-col gap-6">
          {porMes(visibles).map(([mes, rs]) => (
            <section key={mes} aria-label={nombreMes(mes)}>
              <h2 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-semibold text-text">
                {nombreMes(mes)}
                <span className="text-xs font-normal tabular-nums text-text-muted">{rs.length}</span>
              </h2>
              <ul className="flex flex-col gap-2.5">{rs.map(fila)}</ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
