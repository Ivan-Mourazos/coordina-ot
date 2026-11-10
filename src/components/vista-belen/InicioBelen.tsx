"use client";

import { useEffect, useState } from "react";
import { HERRAMIENTAS_BELEN, ordenarHerramientas } from "@/lib/herramientas-belen";
import type { IdLista } from "@/lib/vista-belen-listas";
import type { CargaLista } from "./ListaBelen";

const PULSABLE = "transition-[transform,background-color] duration-150 hover:bg-[var(--hero-relleno)] active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none";

export function InicioBelen({ miId, listas, onAbrir }: {
  miId: string | null;
  listas: Partial<Record<IdLista, CargaLista>>;
  onAbrir: (id: string) => void;
}) {
  const clave = `coordina.belen.herramientas:${miId ?? "local"}`;
  const [herramientas, setHerramientas] = useState(HERRAMIENTAS_BELEN);
  const [ordenando, setOrdenando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [lista, setLista] = useState(false);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve().then(() => {
      if (!vivo) return;
      try { setHerramientas(ordenarHerramientas(JSON.parse(localStorage.getItem(clave) ?? "null"))); }
      catch { setHerramientas(HERRAMIENTAS_BELEN); }
      setLista(true);
    });
    return () => { vivo = false; };
  }, [clave]);

  const mover = (id: string, destino: number) => {
    const origen = herramientas.findIndex((h) => h.id === id);
    if (origen < 0 || destino < 0 || destino >= herramientas.length || origen === destino) return;
    const nuevas = [...herramientas];
    const [tarjeta] = nuevas.splice(origen, 1);
    nuevas.splice(destino, 0, tarjeta);
    setHerramientas(nuevas);
    try {
      localStorage.setItem(clave, JSON.stringify(nuevas.map((h) => h.id)));
      setMensaje(`${tarjeta.label}: posición ${destino + 1} de ${nuevas.length}. Orden guardado.`);
    } catch { setMensaje("El orden ha cambiado, pero este navegador no permite guardarlo para la próxima visita."); }
  };

  return (
    <section aria-labelledby="herramientas-belen" className="mx-auto mt-6 max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="herramientas-belen" className="text-[16px] font-semibold">Herramientas</h2>
        <button type="button" aria-pressed={ordenando} disabled={!lista} onClick={() => setOrdenando(!ordenando)} className={`rounded-full bg-[var(--hero-relleno)] px-3.5 py-2 text-[13px] font-semibold ${PULSABLE}`}>
          {ordenando ? "Terminar de ordenar" : "Ordenar herramientas"}
        </button>
      </div>
      {ordenando && <p className="mb-3 text-[13px] text-text-muted">Arrastra las tarjetas o usa las flechas para ponerlas a tu gusto. El orden se guarda en este navegador.</p>}
      <p role="status" className="sr-only">{mensaje}</p>
      {mensaje.includes("no permite") && <p className="mb-3 text-sm text-text-muted">{mensaje}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Herramientas">
        {herramientas.map((h, i) => {
          const carga = listas[h.id as IdLista];
          return (
            <li key={h.id} data-herramienta={h.id} draggable={ordenando}
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", h.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (ordenando) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
              onDrop={(e) => { if (ordenando) { e.preventDefault(); mover(e.dataTransfer.getData("text/plain"), i); } }}
              className={`tarjeta-of flex flex-col rounded-3xl bg-surface ${ordenando ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <button type="button" onClick={() => onAbrir(h.id)} disabled={ordenando} className={`flex flex-1 flex-col items-start gap-2 rounded-3xl p-4 text-left ${ordenando ? "" : PULSABLE}`}>
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-[14px] font-semibold">{h.label}</span>
                  {carga && <span className="text-[12px] tabular-nums text-text-muted">{carga.tipo === "listo" ? carga.filas.length : carga.tipo === "error" ? "!" : "…"}</span>}
                </span>
                <span className="text-[12.5px] leading-relaxed text-text-muted">{h.explica}</span>
              </button>
              {ordenando && (
                <div className="flex items-center justify-between gap-2 px-4 pb-3">
                  <span aria-hidden="true" className="text-sm text-text-muted">⠿ {i + 1}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={i === 0} aria-label={`Mover ${h.label} antes`} onClick={() => mover(h.id, i - 1)} className={`rounded-full bg-[var(--hero-relleno)] px-3 py-1.5 disabled:opacity-40 ${PULSABLE}`}>←</button>
                    <button type="button" disabled={i === herramientas.length - 1} aria-label={`Mover ${h.label} después`} onClick={() => mover(h.id, i + 1)} className={`rounded-full bg-[var(--hero-relleno)] px-3 py-1.5 disabled:opacity-40 ${PULSABLE}`}>→</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
