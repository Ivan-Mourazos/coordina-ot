"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PedidoEncontrado } from "@/lib/buscador";
import { interpretarBusqueda } from "@/lib/codigo-busqueda";
import type { PedidoBelen } from "@/lib/vista-belen";
import { esIdLista, LISTAS_BELEN, type FilaLista, type IdLista } from "@/lib/vista-belen-listas";
import { Logo } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";
import { PedidoBelenView } from "./PedidoBelen";
import { TablaListaBelen, type CargaLista } from "./ListaBelen";

// ─── La pantalla de Belén Alamancos (Producción) ─────────────────────────────
// Hecha a su medida (09/11/2026): no es la de Producción en general, cada
// compañero tendrá la suya. Lo que más usa es buscar un pedido, así que entra
// con el cursor en el buscador; las pestañas son las hojas de sus Excels que
// pidió primero. Pensada para monitores pequeños (1280-1366 px): nada de
// anchos mínimos grandes y la letra menuda donde no se lee de lejos.
//
// NAVEGACIÓN (Iván, 10/11/2026: «necesitamos un botón de volver atrás o que
// funcione el del ratón»). Manda la dirección de la página:
//   ?pedido=AR.…[&of=…]                 un pedido abierto
//   ?q=texto                            la lista de pedidos que encajan
//   ?vista=comprobaciones&lista=…       una lista de comprobación
//   (nada)                              el buscador vacío
// Cada paso que da ella se apunta en el historial del navegador, así que el
// «atrás» del ratón, el del navegador, Alt+← y el «← Volver» hacen lo mismo:
// abrir un pedido desde una lista y volver deja otra vez en esa lista.

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

/** Lo que se apunta en el historial con cada paso, para saber si «Volver»
 *  tiene adónde volver dentro de esta pantalla. */
interface PasoHistorial {
  belen: true;
  /** Cuántos pasos se han dado dentro de la pantalla hasta este. */
  n: number;
}

async function pedirJson<T>(url: string, senal?: AbortSignal): Promise<T> {
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

const pasoActual = (): number => {
  const s = history.state as Partial<PasoHistorial> | null;
  return s?.belen ? (s.n ?? 0) : 0;
};

export function VistaBelen({ nombre, miId = null }: { nombre: string; miId?: string | null }) {
  const [pestana, setPestana] = useState<Pestana>("pedido");
  const [lista, setLista] = useState<IdLista>(LISTAS_BELEN[0].id);
  const [listas, setListas] = useState<Partial<Record<IdLista, CargaLista>>>({});
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "vacio" });
  const [puedeVolver, setPuedeVolver] = useState(false);
  const caja = useRef<HTMLInputElement>(null);
  const enCurso = useRef<AbortController | null>(null);
  // La última dirección de la pestaña Pedidos, para volver a ella al cambiar
  // de pestaña sin perder el pedido que estaba abierto.
  const ultimaDePedidos = useRef("");

  // ── Las listas: se piden TODAS al entrar, por detrás ────────────────────────
  // Antes cada una se pedía al pinchar en ella, y los números de los botones
  // salían a medida que se visitaban (Iván: «tuve que ir pestaña por pestaña»).
  const cargarLista = useCallback(async (id: IdLista) => {
    setListas((ls) => ({ ...ls, [id]: ls[id]?.tipo === "listo" ? { ...ls[id], actualizando: true } : { tipo: "cargando" } }));
    try {
      const { filas, calculadaAt } = await pedirJson<{ filas: FilaLista[]; calculadaAt: string }>(
        `/api/vista-belen?lista=${id}`,
      );
      setListas((ls) => ({ ...ls, [id]: { tipo: "listo", filas, calculadaAt } }));
    } catch (e) {
      setListas((ls) => ({ ...ls, [id]: { tipo: "error", mensaje: (e as Error).message } }));
    }
  }, []);

  useEffect(() => {
    // Fuera del cuerpo del efecto: cargarLista pinta «Cargando» al momento.
    void Promise.resolve().then(() => LISTAS_BELEN.forEach((l) => void cargarLista(l.id)));
  }, [cargarLista]);

  // ── Pedidos ────────────────────────────────────────────────────────────────
  const mostrarPedido = useCallback(async (codigo: string, ofResaltada: string | null) => {
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
      // En la caja queda el código entero: escribió «4716» y ve AR.26.04716.
      if (pedido) setQ(pedido.codigo);
    } catch (e) {
      if (!ctl.signal.aborted) setEstado({ tipo: "error", mensaje: (e as Error).message });
    }
  }, []);

  /** Lleva la pantalla a lo que dice la dirección. Lo usa todo: los clics
   *  (después de apuntar el paso), el «atrás» y el recargar la página. */
  const aplicarUrl = useCallback(async () => {
    const p = new URLSearchParams(window.location.search);
    setPuedeVolver(pasoActual() > 0);
    if (p.get("vista") === "comprobaciones") {
      setPestana("comprobaciones");
      const l = p.get("lista");
      if (esIdLista(l)) setLista(l);
      return;
    }
    setPestana("pedido");
    ultimaDePedidos.current = window.location.search;
    const pedido = p.get("pedido");
    if (pedido) return mostrarPedido(pedido, p.get("of"));
    const texto = p.get("q");
    if (!texto) {
      enCurso.current?.abort();
      setEstado({ tipo: "vacio" });
      setQ("");
      return;
    }
    setQ(texto);
    enCurso.current?.abort();
    const ctl = new AbortController();
    enCurso.current = ctl;
    setEstado({ tipo: "buscando" });
    try {
      const { pedidos } = await pedirJson<{ pedidos: PedidoEncontrado[] }>(
        `/api/vista-belen?q=${encodeURIComponent(texto)}`,
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      if (pedidos.length === 1) {
        // Uno solo: se abre, y la búsqueda no se queda como paso intermedio
        // (volver desde el pedido lleva a donde estaba antes de buscar).
        const que = interpretarBusqueda(texto, new Date().getFullYear());
        const params = new URLSearchParams({ pedido: pedidos[0].codigo });
        if (que.tipo === "of") params.set("of", que.codigo);
        history.replaceState(history.state, "", `?${params}`);
        ultimaDePedidos.current = `?${params}`;
        return mostrarPedido(pedidos[0].codigo, que.tipo === "of" ? que.codigo : null);
      }
      setEstado(pedidos.length ? { tipo: "elegir", pedidos } : { tipo: "nada", q: texto });
    } catch (e) {
      if (!ctl.signal.aborted) setEstado({ tipo: "error", mensaje: (e as Error).message });
    }
  }, [mostrarPedido]);

  /** Un paso nuevo: se apunta en el historial y se aplica. `reemplazar` para
   *  lo que no merece un «atrás» propio (cambiar de lista). */
  const navegar = useCallback(
    (params: Record<string, string>, { reemplazar = false } = {}) => {
      const busqueda = new URLSearchParams(params).toString();
      const url = busqueda ? `?${busqueda}` : window.location.pathname;
      if (reemplazar) history.replaceState(history.state, "", url);
      else history.pushState({ belen: true, n: pasoActual() + 1 } satisfies PasoHistorial, "", url);
      void aplicarUrl();
    },
    [aplicarUrl],
  );

  useEffect(() => {
    // Al recargar, se queda donde estaba; con «atrás» y «adelante», igual.
    void Promise.resolve().then(aplicarUrl);
    const alVolver = () => void aplicarUrl();
    window.addEventListener("popstate", alVolver);
    // Al salir de la pantalla, lo que esté pidiendo ya no le importa a nadie.
    const peticiones = enCurso;
    return () => {
      window.removeEventListener("popstate", alVolver);
      peticiones.current?.abort();
    };
  }, [aplicarUrl]);

  const buscar = (escrito: string) => {
    const term = escrito.trim();
    if (!term) return;
    const que = interpretarBusqueda(term, new Date().getFullYear());
    // Un código entero va directo al pedido, sin pasar por la lista: es el
    // caso de casi siempre y así se ahorra un viaje a RPS.
    if (que.tipo === "pedido" && que.exactos.length === 1 && que.prefijos.length === 0) {
      navegar({ pedido: que.exactos[0] });
    } else {
      navegar({ q: term });
    }
  };

  const volver = () => {
    if (pasoActual() > 0) history.back();
    else navegar({});
  };

  const irAPestana = (p: Pestana) => {
    if (p === pestana) return;
    if (p === "comprobaciones") navegar({ vista: "comprobaciones", lista });
    else navegar(Object.fromEntries(new URLSearchParams(ultimaDePedidos.current)));
  };

  const salir = async () => {
    await fetch("/api/sesion", { method: "DELETE" }).catch(() => {});
    window.location.href = "/";
  };

  return (
    <div className="min-h-full">
      <header className="glass-header sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <Logo height={38} />
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
            irAPestana(PESTANAS[destino].id);
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
              onClick={() => irAPestana(p.id)}
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(puedeVolver || estado.tipo !== "vacio") && (
              <button
                type="button"
                onClick={volver}
                title="Volver a lo de antes (también con el botón «atrás» del ratón o Alt+←)"
                className="h-10 rounded-full bg-[var(--hero-relleno)] px-3.5 text-sm font-semibold text-text transition-[transform,background-color] hover:bg-[var(--hero-relleno-encima)] active:scale-[.97] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                ← Volver
              </button>
            )}
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                buscar(q);
              }}
              className="flex min-w-72 max-w-xl flex-1 items-center gap-2"
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
          </div>
          <ResultadoBusqueda estado={estado} miId={miId} onElegir={(codigo) => navegar({ pedido: codigo })} />
        </main>
      ) : (
        <main role="tabpanel" id="panel-comprobaciones" aria-labelledby="pestana-comprobaciones" className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-3">
          {/* La misma píldora que se desliza del resto de Coordina. */}
          <div role="group" aria-label="Lista" className="tira-3d glass-chip mb-3 inline-flex flex-wrap rounded-lg p-[3px]">
            {LISTAS_BELEN.map((l) => {
              const c = listas[l.id];
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.id === lista}
                  onClick={() => navegar({ vista: "comprobaciones", lista: l.id }, { reemplazar: true })}
                  className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    l.id === lista ? "pestana-activa" : "text-text-muted hover:text-text"
                  }`}
                >
                  {l.label}
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums ${
                      c?.tipo === "listo" && c.filas.length > 0
                        ? "bg-amber-500/20 text-amber-900 dark:text-amber-200"
                        : "bg-[var(--hero-relleno-encima)] text-text-muted"
                    }`}
                  >
                    {c?.tipo === "listo" ? c.filas.length : c?.tipo === "error" ? "!" : "…"}
                  </span>
                </button>
              );
            })}
          </div>
          <TablaListaBelen
            lista={lista}
            carga={listas[lista] ?? { tipo: "cargando" }}
            onActualizar={() => void cargarLista(lista)}
            onAbrir={(pedido, of) => navegar(of ? { pedido, of } : { pedido })}
          />
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
