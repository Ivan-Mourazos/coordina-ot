"use client";

import { useEffect, useRef, useState } from "react";
import type { HistorialItem } from "@/lib/historial";

import type { Pedido } from "@/lib/types";
import {
  MIN_LETRAS,
  buscar,
  type PedidoEncontrado,
  type Resultado,
  type Ubicacion,
} from "@/lib/buscador";
import { usePopover } from "@/lib/usePopover";

// ─── Buscar un pedido sin saber en qué pestaña está ──────────────────────────
// El porqué está en lib/buscador.ts. Aquí solo la parte de cristal: escribir y
// que salgan, con el teclado, y que cada línea diga DÓNDE está el pedido —que
// es la pregunta de verdad cuando alguien busca uno.
//
// TRES fuentes con dos velocidades: el tablero ya está en memoria y responde en
// la misma tecla; el Historial y "cualquier pedido de RPS" son consultas caras y
// van con freno (debounce), las dos a la vez. Los locales se pintan mientras
// llegan: la lista crece por debajo sin que la primera respuesta se haga
// esperar, y si RPS no contesta el buscador sigue sirviendo.

const COLOR: Record<Ubicacion, string> = {
  sinAsignar: "bg-gray-400",
  conAutor: "bg-emerald-600",
  historial: "bg-slate-400",
  taller: "bg-amber-500",
  fuera: "bg-cyan-600",
};

const ESPERA_MS = 300;

export function BuscadorGlobal({
  pedidos,
  nombre,
  onAbrirPedido,
  onAbrirHistorial,
  className = "",
}: {
  /** Lo pone quien lo coloca: en la cabecera es la columna del centro. */
  className?: string;
  /** Todos los del tablero SIN filtrar: aquí se busca en todo. */
  pedidos: readonly Pedido[];
  nombre: (id: string) => string;
  onAbrirPedido: (pedidoId: string) => void;
  onAbrirHistorial: (codigo: string) => void;
}) {
  const [q, setQ] = useState("");
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [otros, setOtros] = useState<PedidoEncontrado[]>([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Descarta respuestas que llegan tarde: al escribir rápido se solapan varias
  // consultas y la vieja no puede pisar a la nueva.
  const seq = useRef(0);

  // Ctrl/⌘+K desde cualquier sitio. Es lo que la gente prueba sin que nadie se
  // lo diga, y ahorra ir al ratón para lo que más se hace.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    // Sin vaciar `historial` aquí: eso sería un setState dentro del efecto (y
    // un render en cascada). Lo que sobra se descarta al usarlo, más abajo.
    if (q.trim().length < MIN_LETRAS) return;
    const mio = ++seq.current;
    const t = setTimeout(async () => {
      setCargandoHist(true);
      const texto = encodeURIComponent(q.trim());
      // Las dos consultas a RPS van a la vez y cada una se apaña sola: si una
      // falla, la otra sigue dando resultados. `allSettled` y no `all`.
      const [hist, todos] = await Promise.allSettled([
        fetch(`/api/historial?q=${texto}`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<{ pedidos: HistorialItem[] }>;
        }),
        fetch(`/api/buscar?q=${texto}`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<{ pedidos: PedidoEncontrado[] }>;
        }),
      ]);
      if (mio !== seq.current) return; // respuesta obsoleta
      // Lo que venga de RPS es el extra: si no contesta, los del tablero ya
      // están en pantalla y el buscador sigue sirviendo.
      setHistorial(hist.status === "fulfilled" ? hist.value.pedidos : []);
      setOtros(todos.status === "fulfilled" ? todos.value.pedidos : []);
      setCargandoHist(false);
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [q]);

  const abierto = open && q.trim().length >= MIN_LETRAS;
  // Lo que queda de la consulta anterior no estorba —`buscar` lo filtra por la
  // consulta de ahora— pero con el buscador vacío no pinta nada.
  const resultados = buscar(q, {
    pedidos,
    historial: abierto ? historial : [],
    otros: abierto ? otros : [],
    nombre,
  });
  // El cursor no puede quedarse apuntando a un sitio que ya no existe: los
  // resultados cambian con cada tecla.
  const activo = Math.min(cursor, Math.max(0, resultados.length - 1));

  function elegir(r: Resultado) {
    // Los del tablero se abren con todas sus acciones; el resto —historial y
    // pedidos que nunca fueron de OT— en el panel de solo lectura, que es lo
    // unico que se puede hacer con ellos.
    if (r.fuente === "tablero") onAbrirPedido(r.clave);
    else onAbrirHistorial(r.clave);
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setCursor((c) => {
        const n = resultados.length;
        return n === 0 ? 0 : (Math.min(c, n - 1) + paso + n) % n;
      });
    } else if (e.key === "Enter" && resultados[activo]) {
      e.preventDefault();
      elegir(resultados[activo]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={ref} className={`relative min-w-0 ${className}`}>
      <div className="glass-chip flex items-center gap-2 rounded-lg px-2.5 py-1.5">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 text-text-muted"
          fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={abierto}
          aria-controls="buscador-global-resultados"
          aria-autocomplete="list"
          aria-label="Buscar pedidos"
          placeholder="Buscar pedido, cliente o nº de OF…"
          className="min-w-0 flex-1 bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
        />
        {q ? (
          <button
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
            aria-label="Limpiar"
            className="shrink-0 text-text-muted hover:text-text"
          >
            ✕
          </button>
        ) : (
          <kbd className="shrink-0 rounded border border-border px-1 text-[9px] font-semibold text-text-muted">
            Ctrl K
          </kbd>
        )}
      </div>

      {abierto && (
        <div
          id="buscador-global-resultados"
          className="glass-pop absolute left-0 right-0 top-full z-40 mt-1.5 rounded-xl p-1"
        >
          {resultados.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-text-muted">
              {cargandoHist ? "Buscando…" : "Nada con eso, ni en el tablero ni en RPS."}
            </p>
          ) : (
            <ul className="scroll-thin max-h-96 overflow-y-auto">
              {resultados.map((r, i) => (
                <li key={`${r.fuente}-${r.clave}`}>
                  <button
                    onClick={() => elegir(r)}
                    onMouseEnter={() => setCursor(i)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                      i === activo ? "bg-[var(--glass-highlight)]" : ""
                    }`}
                  >
                    <span className={`size-2 shrink-0 rounded-full ${COLOR[r.ubicacion]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">
                        <span className="font-mono font-semibold text-text">{r.codigo}</span>
                        <span className="text-text-muted">
                          {" · "}
                          {r.cliente}
                          {r.negocio ? ` · ${r.negocio}` : ""}
                        </span>
                      </span>
                      {/* La mitad que faltaba: dónde está. Sin esto el
                          resultado obliga a abrirlo para saber si es tuyo, de
                          otro, de taller o ya pasado. */}
                      <span className="block truncate text-[11px] text-text-muted">
                        {r.donde}
                        {r.extra ? ` · ${r.extra}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {cargandoHist && (
                <li className="px-2 py-1.5 text-[11px] text-text-muted">Buscando en RPS…</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
