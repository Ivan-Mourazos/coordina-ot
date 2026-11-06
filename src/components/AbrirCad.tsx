"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DwgPedido } from "@/lib/server/cad";
import { sitioDeMenu, ventanaActual } from "@/lib/menu-flotante";
import { useCapaEscape } from "@/lib/useCapaEscape";

interface RespuestaCad {
  configurado: boolean;
  ficheros: DwgPedido[];
  error?: string;
}

export function AbrirCad({ pedido }: { pedido: string }) {
  const [datos, setDatos] = useState<RespuestaCad | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titulo = useId();
  const abierto = caja !== null;

  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/cad?pedido=${encodeURIComponent(pedido)}`, { cache: "no-store", signal: abort.signal })
      .then(async (res) => {
        const data = await res.json() as RespuestaCad;
        if (!res.ok) throw new Error(data.error || "No se pudieron consultar los DWG");
        if (!abort.signal.aborted) { setDatos(data); setError(""); }
      })
      .catch((e: Error) => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [pedido, intento]);

  function cerrar() {
    setCaja(null);
    boton.current?.focus();
  }
  useCapaEscape(abierto, cerrar);

  useEffect(() => {
    if (!abierto) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function fuera(e: Event) {
      const nodo = e.target as Node;
      if (panel.current?.contains(nodo) || boton.current?.contains(nodo)) return;
      setCaja(null);
    }
    function mover(e: Event) {
      if (e.target instanceof Node && panel.current?.contains(e.target)) return;
      setCaja(null);
    }
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("resize", mover);
    window.addEventListener("scroll", mover, true);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("resize", mover);
      window.removeEventListener("scroll", mover, true);
    };
  }, [abierto]);

  async function abrir(dwg: DwgPedido) {
    if (ocupado) return;
    setOcupado(true);
    setError("");
    try {
      const res = await fetch(`/api/cad?${new URLSearchParams({ pedido, id: dwg.id })}`, { cache: "no-store" });
      const data = await res.json() as { fichero?: DwgPedido; error?: string };
      if (!res.ok || !data.fichero) throw new Error(data.error || "No se pudo abrir el DWG");
      window.location.assign(data.fichero.url);
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el DWG");
    } finally {
      setOcupado(false);
    }
  }

  if (datos?.configurado === false || (!datos && !error)) return null;
  const ficheros = datos?.ficheros ?? [];
  const sinDwg = datos !== null && !ficheros.length;
  const ventana = ventanaActual();
  const ancho = ventana ? Math.min(360, ventana.ancho - 16) : 360;
  const sitio = caja && ventana ? sitioDeMenu(caja, { ventana, alto: Math.min(320, 70 + ficheros.length * 65), ancho, alignRight: true }) : null;
  const ayuda = error || (sinDwg ? "No hay DWG de este pedido en Oficina Técnica" : "Abrir el CAD del pedido en ZWCAD, en este PC");

  return (
    <>
      <button
        ref={boton}
        type="button"
        disabled={sinDwg || ocupado}
        title={ayuda}
        aria-haspopup={ficheros.length > 1 ? "dialog" : undefined}
        aria-expanded={ficheros.length > 1 ? abierto : undefined}
        onClick={() => {
          if (!datos) { setIntento((n) => n + 1); return; }
          if (ficheros.length === 1) { void abrir(ficheros[0]); return; }
          setCaja(abierto ? null : boton.current!.getBoundingClientRect());
        }}
        className="chip-3d flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-text disabled:cursor-default disabled:opacity-50"
      >
        {ocupado ? "Abriendo…" : "Abrir CAD"} <span aria-hidden="true">↗</span>
      </button>
      {error && <span role="alert" className="text-xs text-error">{error}</span>}
      {sitio && createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-labelledby={titulo}
          data-en-portal=""
          style={{ ...sitio, maxHeight: "min(320px, 70vh)" }}
          className="glass-pop fixed z-[60] overflow-y-auto rounded-2xl p-3 text-text"
          onKeyDown={(e) => {
            if (!["Tab", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
            // El foco se queda en este selector, también dentro de la ficha modal.
            e.preventDefault();
            e.stopPropagation();
            const opciones = [...(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
            const actual = opciones.indexOf(document.activeElement as HTMLButtonElement);
            const paso = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) ? -1 : 1;
            const siguiente = e.key === "Home" ? 0 : e.key === "End" ? opciones.length - 1 : (actual + paso + opciones.length) % opciones.length;
            opciones[siguiente]?.focus();
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p id={titulo} className="text-xs font-semibold">¿Qué DWG quieres abrir?</p>
            <button type="button" onClick={cerrar} aria-label="Cerrar selector CAD" className="chip-3d rounded-full px-2 py-1 text-xs">✕</button>
          </div>
          {ficheros.map((dwg) => (
            <button
              key={dwg.id}
              type="button"
              disabled={ocupado}
              onClick={() => void abrir(dwg)}
              className="block w-full rounded-xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
            >
              <span className="block break-all text-xs font-semibold">{dwg.nombre}</span>
              <span className="block break-all text-[11px] text-text-muted">{dwg.subcarpeta}</span>
            </button>
          ))}
        </div>, document.body,
      )}
    </>
  );
}
