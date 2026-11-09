"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PedidoEncontrado } from "@/lib/buscador";
import { interpretarBusqueda } from "@/lib/codigo-busqueda";
import type { PedidoBelen } from "@/lib/vista-belen";
import { LISTAS_BELEN, type IdLista } from "@/lib/vista-belen-listas";
import { Logo } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";
import { PedidoBelenView } from "./PedidoBelen";
import { TablaListaBelen } from "./ListaBelen";

// ─── La pantalla de Belén Alamancos (Producción) ─────────────────────────────
// Hecha a su medida (09/11/2026): no es la de Producción en general, cada
// compañero tendrá la suya. Lo que más usa es buscar un pedido, así que entra
// con el cursor en el buscador; las pestañas son las hojas de sus Excels que
// pidió primero. Pensada para monitores pequeños (1280-1366 px): nada de
// anchos mínimos grandes y la letra menuda donde no se lee de lejos.

// Dos pestañas arriba y, dentro de «Comprobaciones», un selector con sus
// listas: con una pestaña por hoja de Excel no cabían en un monitor pequeño.
type Pestana = "pedido" | "comprobaciones";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "pedido", label: "Pedidos" },
  { id: "comprobaciones", label: "Comprobaciones" },
];

type Estado =
  | { tipo: "vacio" }
  | { tipo: "buscando" }
  | { tipo: "elegir"; pedidos: PedidoEncontrado[] }
  | { tipo: "nada"; q: string }
  | { tipo: "pedido"; pedido: PedidoBelen; ofResaltada: string | null }
  | { tipo: "error"; mensaje: string };

async function pedirJson<T>(url: string, senal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal: senal, cache: "no-store" });
  if (r.status === 401) {
    // La sesión caducó: a entrar otra vez.
    window.location.href = "/entrar";
    throw new Error("Sin sesión");
  }
  const json = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(json.error ?? "No se pudo leer RPS");
  return json;
}

export function VistaBelen({ nombre, miId = null }: { nombre: string; miId?: string | null }) {
  const [pestana, setPestana] = useState<Pestana>("pedido");
  const [lista, setLista] = useState<IdLista>(LISTAS_BELEN[0].id);
  const [cuentas, setCuentas] = useState<Partial<Record<IdLista, number>>>({});
  const apuntarCuenta = useCallback(
    (id: IdLista, n: number) => setCuentas((c) => (c[id] === n ? c : { ...c, [id]: n })),
    [],
  );
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "vacio" });
  const caja = useRef<HTMLInputElement>(null);
  const enCurso = useRef<AbortController | null>(null);

  const abrirPedido = useCallback(async (codigo: string, ofResaltada: string | null = null) => {
    enCurso.current?.abort();
    const ctl = new AbortController();
    enCurso.current = ctl;
    setEstado({ tipo: "buscando" });
    try {
      const { pedido } = await pedirJson<{ pedido: PedidoBelen | null }>(
        `/api/vista-belen?pedido=${encodeURIComponent(codigo)}`,
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      setEstado(pedido ? { tipo: "pedido", pedido, ofResaltada } : { tipo: "nada", q: codigo });
      if (pedido) {
        // En la caja queda el código entero: escribió «4716» y ve AR.26.04716.
        setQ(pedido.codigo);
        history.replaceState(null, "", `?pedido=${encodeURIComponent(pedido.codigo)}`);
      }
    } catch (e) {
      if (!ctl.signal.aborted) setEstado({ tipo: "error", mensaje: (e as Error).message });
    }
  }, []);

  const buscar = useCallback(
    async (escrito: string) => {
      const term = escrito.trim();
      if (!term) return;
      const que = interpretarBusqueda(term, new Date().getFullYear());
      // Un código entero va directo al pedido, sin pasar por la lista: es el
      // caso de casi siempre y así se ahorra un viaje a RPS.
      if (que.tipo === "pedido" && que.exactos.length === 1 && que.prefijos.length === 0) {
        return abrirPedido(que.exactos[0]);
      }
      enCurso.current?.abort();
      const ctl = new AbortController();
      enCurso.current = ctl;
      setEstado({ tipo: "buscando" });
      try {
        const { pedidos } = await pedirJson<{ pedidos: PedidoEncontrado[] }>(
          `/api/vista-belen?q=${encodeURIComponent(term)}`,
          ctl.signal,
        );
        if (ctl.signal.aborted) return;
        if (pedidos.length === 1) {
          enCurso.current = null;
          return abrirPedido(pedidos[0].codigo, que.tipo === "of" ? que.codigo : null);
        }
        setEstado(pedidos.length ? { tipo: "elegir", pedidos } : { tipo: "nada", q: term });
      } catch (e) {
        if (!ctl.signal.aborted) setEstado({ tipo: "error", mensaje: (e as Error).message });
      }
    },
    [abrirPedido],
  );

  // Al recargar la página se queda en el pedido que estaba mirando.
  useEffect(() => {
    const inicial = new URLSearchParams(window.location.search).get("pedido");
    // Fuera del cuerpo del efecto: abrirPedido pinta «Buscando…» al momento.
    if (inicial) void Promise.resolve().then(() => abrirPedido(inicial));
    // Al salir de la pantalla, lo que esté pidiendo ya no le importa a nadie.
    const peticiones = enCurso;
    return () => peticiones.current?.abort();
  }, [abrirPedido]);

  const irAPedido = (codigo: string, of: string | null) => {
    setPestana("pedido");
    setQ(codigo);
    void abrirPedido(codigo, of);
  };

  const salir = async () => {
    await fetch("/api/sesion", { method: "DELETE" }).catch(() => {});
    window.location.href = "/";
  };

  return (
    <div className="min-h-full">
      <header className="glass-header sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <Logo height={30} />
        <span className="text-sm font-semibold text-text-muted">Producción</span>
        <div
          role="tablist"
          aria-label="Secciones"
          className="tira-3d glass-chip inline-flex flex-wrap rounded-lg p-[3px]"
          onKeyDown={(e) => {
            const i = PESTANAS.findIndex((p) => p.id === pestana);
            let destino: number | null = null;
            if (e.key === "ArrowRight") destino = (i + 1) % PESTANAS.length;
            else if (e.key === "ArrowLeft") destino = (i - 1 + PESTANAS.length) % PESTANAS.length;
            else if (e.key === "Home") destino = 0;
            else if (e.key === "End") destino = PESTANAS.length - 1;
            if (destino === null) return;
            e.preventDefault();
            setPestana(PESTANAS[destino].id);
            document.getElementById(`pestana-${PESTANAS[destino].id}`)?.focus();
          }}
        >
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={p.id === pestana}
              aria-controls={`panel-${p.id}`}
              tabIndex={p.id === pestana ? 0 : -1}
              onClick={() => setPestana(p.id)}
              className={`h-8 rounded-md px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                p.id === pestana
                  ? "pestana-activa"
                  : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[13px] text-text-muted">{nombre}</span>
          <ThemeToggle />
          <button
            type="button"
            onClick={salir}
            className="boton-arriba h-8 rounded-full px-3 text-[13px] font-semibold text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Salir
          </button>
        </div>
      </header>

      {pestana === "pedido" ? (
        <main role="tabpanel" id="panel-pedido" aria-labelledby="pestana-pedido" className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-3">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              void buscar(q);
            }}
            className="mb-3 flex max-w-xl items-center gap-2"
          >
            <label className="relative flex-1">
              <span className="sr-only">Buscar pedido, OF o cliente</span>
              <input
                ref={caja}
                // Lo primero que hace al entrar es buscar: el cursor ya está ahí.
                autoFocus
                autoComplete="off"
                type="text"
                enterKeyHint="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pedido (4716, 26.04716…), OF o cliente"
                className="campo-hundido h-10 w-full rounded-[14px] px-3 text-[15px] text-text outline-none placeholder:text-text-muted"
              />
            </label>
            <button
              type="submit"
              className="h-10 rounded-full bg-brand-400 px-4 text-sm font-semibold text-brand-950 transition-transform active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none"
            >
              Buscar
            </button>
          </form>
          <ResultadoBusqueda
            estado={estado}
            miId={miId}
            onElegir={(codigo) => {
              setQ(codigo);
              void abrirPedido(codigo);
            }}
          />
        </main>
      ) : (
        <main role="tabpanel" id="panel-comprobaciones" aria-labelledby="pestana-comprobaciones" className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-3">
          <div role="group" aria-label="Lista" className="mb-3 flex flex-wrap gap-1.5">
            {LISTAS_BELEN.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={l.id === lista}
                onClick={() => setLista(l.id)}
                className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  l.id === lista
                    ? "bg-text text-bg"
                    : "bg-[var(--hero-relleno)] text-text-muted hover:bg-[var(--hero-relleno-encima)] hover:text-text"
                }`}
              >
                {l.label}
                {cuentas[l.id] !== undefined && (
                  <span
                    className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                      l.id === lista ? "bg-bg/20" : "bg-[var(--hero-relleno-encima)]"
                    }`}
                  >
                    {cuentas[l.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <TablaListaBelen key={lista} lista={lista} onAbrir={irAPedido} onCuenta={apuntarCuenta} />
        </main>
      )}
    </div>
  );
}

function ResultadoBusqueda({
  estado,
  onElegir,
  miId,
}: {
  estado: Estado;
  onElegir: (codigo: string) => void;
  miId: string | null;
}) {
  switch (estado.tipo) {
    case "vacio":
      return (
        <p className="text-sm text-text-muted">
          Escribe el pedido como quieras (AR.26.04716, 26.04716, 4716), una OF (0232470) o el cliente, y pulsa Intro.
        </p>
      );
    case "buscando":
      return <p className="text-sm text-text-muted" aria-live="polite">Buscando…</p>;
    case "nada":
      return (
        <p className="text-sm text-text-muted" aria-live="polite">
          No hay ningún pedido que encaje con «{estado.q}».
        </p>
      );
    case "error":
      return (
        <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
          {estado.mensaje}
        </p>
      );
    case "elegir":
      return (
        <ul className="flex max-w-3xl flex-col gap-1.5" aria-label="Pedidos encontrados">
          {estado.pedidos.map((p) => (
            <li key={p.codigo}>
              <button
                type="button"
                onClick={() => onElegir(p.codigo)}
                className="tarjeta-of flex w-full items-baseline gap-3 rounded-2xl bg-surface px-4 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="font-bold tabular-nums">{p.codigo}</span>
                <span className="min-w-0 flex-1 truncate">{p.cliente}</span>
                {p.fecha && (
                  <span className="text-xs text-text-muted">{new Date(p.fecha).toLocaleDateString("es-ES")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      );
    case "pedido":
      return (
        <PedidoBelenView key={estado.pedido.codigo} pedido={estado.pedido} ofResaltada={estado.ofResaltada} miId={miId} />
      );
  }
}
