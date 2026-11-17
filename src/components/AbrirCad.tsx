"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import type { DwgPedido } from "@/lib/server/cad";
import { usePopover } from "@/lib/usePopover";

interface RespuestaCad {
  configurado: boolean;
  ficheros: DwgPedido[];
  error?: string;
}

const CLASE_BOTON =
  "chip-3d flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-text disabled:cursor-default disabled:opacity-50";

export function AbrirCad({ pedido }: { pedido: string }) {
  const [datos, setDatos] = useState<RespuestaCad | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);

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

  /** Pide la URL del DWG y la abre (el protocolo de ZWCAD). `true` si salió. */
  async function abrir(dwg: DwgPedido): Promise<boolean> {
    if (ocupado) return false;
    setOcupado(true);
    setError("");
    try {
      const res = await fetch(`/api/cad?${new URLSearchParams({ pedido, id: dwg.id })}`, { cache: "no-store" });
      const data = await res.json() as { fichero?: DwgPedido; error?: string };
      if (!res.ok || !data.fichero) throw new Error(data.error || "No se pudo abrir el DWG");
      window.location.assign(data.fichero.url);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el DWG");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  if (datos?.configurado === false || (!datos && !error)) return null;
  const ficheros = datos?.ficheros ?? [];
  const sinDwg = datos !== null && !ficheros.length;
  const ayuda = error || (sinDwg ? "No hay DWG de este pedido en Oficina Técnica" : "Abrir el CAD del pedido en ZWCAD, en este PC");
  const texto = <>{ocupado ? "Abriendo…" : "Abrir CAD"} <span aria-hidden="true">↗</span></>;

  return (
    <>
      {ficheros.length > 1 ? (
        <SelectorDwg ficheros={ficheros} ocupado={ocupado} ayuda={ayuda} abrir={abrir}>
          {texto}
        </SelectorDwg>
      ) : (
        <button
          type="button"
          disabled={sinDwg || ocupado}
          title={ayuda}
          onClick={() => {
            if (!datos) { setIntento((n) => n + 1); return; }
            if (ficheros.length === 1) void abrir(ficheros[0]);
          }}
          className={CLASE_BOTON}
        >
          {texto}
        </button>
      )}
      {error && <span role="alert" className="text-xs text-error">{error}</span>}
    </>
  );
}

// ─── Varios DWG: a elegir en un popover (17/11/2026) ─────────────────────────
// Antes era un `div` en un portal al `body` con su propio clic fuera, Escape
// apilado en `capas-escape` y la marca `data-en-portal`. Ahora es el panel de
// `usePopover`, como los desplegables de la cabecera: el navegador lo cierra al
// pinchar fuera y con Escape (solo a él: la ficha de debajo se queda), y como
// cuelga de la ficha en el DOM, la trampa de foco de la ficha no lo da por
// "fuera". Antes, con el portal, cada Tab dentro del selector lo devolvía a la
// ficha.
//
// Componente aparte porque el popover tiene que estar montado desde el
// principio, y el botón de un solo DWG no lo lleva.
function SelectorDwg({
  ficheros,
  ocupado,
  ayuda,
  abrir,
  children,
}: {
  ficheros: DwgPedido[];
  ocupado: boolean;
  ayuda: string;
  abrir: (dwg: DwgPedido) => Promise<boolean>;
  children: ReactNode;
}) {
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLButtonElement>();
  const titulo = useId();

  // Al abrir, el foco entra en el panel (en la ✕, como antes). En el `toggle`
  // y no en un efecto de `open`: el efecto corre antes de que el navegador
  // enseñe el panel, y en un panel oculto `focus()` no hace nada. Al cerrarse
  // con el foco dentro, el navegador lo devuelve al botón.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    function alAbrir(e: Event) {
      if ((e as ToggleEvent).newState === "open") panel?.querySelector<HTMLButtonElement>("button")?.focus();
    }
    panel.addEventListener("toggle", alAbrir);
    return () => panel.removeEventListener("toggle", alAbrir);
  }, [panelRef]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={ocupado}
        title={ayuda}
        popoverTarget={idPanel}
        aria-expanded={open}
        className={CLASE_BOTON}
      >
        {children}
      </button>
      <div
        ref={panelRef}
        id={idPanel}
        popover="auto"
        role="dialog"
        aria-labelledby={titulo}
        className="glass-pop max-h-[min(320px,70vh)] w-[min(360px,calc(100vw-1rem))] overflow-y-auto rounded-2xl p-3 text-text"
        onKeyDown={(e) => {
          if (!["Tab", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          // El foco da vueltas dentro del selector. El `preventDefault` avisa
          // también a la trampa de foco de la ficha (useFocoModal) de que este
          // Tab ya está resuelto.
          e.preventDefault();
          e.stopPropagation();
          const opciones = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
          const actual = opciones.indexOf(document.activeElement as HTMLButtonElement);
          const paso = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) ? -1 : 1;
          const siguiente = e.key === "Home" ? 0 : e.key === "End" ? opciones.length - 1 : (actual + paso + opciones.length) % opciones.length;
          opciones[siguiente]?.focus();
        }}
      >
        {open && (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p id={titulo} className="text-xs font-semibold">¿Qué DWG quieres abrir?</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar selector CAD" className="chip-3d rounded-full px-2 py-1 text-xs">✕</button>
            </div>
            {ficheros.map((dwg) => (
              <button
                key={dwg.id}
                type="button"
                disabled={ocupado}
                onClick={async () => { if (await abrir(dwg)) setOpen(false); }}
                className="block w-full rounded-xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="block break-all text-xs font-semibold">{dwg.nombre}</span>
                <span className="block break-all text-[11px] text-text-muted">{dwg.subcarpeta}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}
