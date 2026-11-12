"use client";

import { useEffect, useRef, useState } from "react";
import { HERRAMIENTAS_BELEN, ordenarHerramientas } from "@/lib/herramientas-belen";
import { moverA } from "@/lib/orden-guardado";
import { useDeslizar } from "./usePestanasOrdenables";
import type { IdLista } from "@/lib/vista-belen-listas";
import type { CargaLista } from "./ListaBelen";

// ─── Portada de Belén: sus herramientas, en el orden que ella quiera ────────
// Ordenar es ARRASTRAR (Iván, 11/11/2026: «un sistema de arrastre visual que
// vea fácil cómo ordenar y cómo quedaría»):
//   · «Ordenar herramientas» pone cada tarjeta con su número y un asa.
//   · Al arrastrar una, las demás se apartan EN VIVO a donde quedarían; la que
//     se mueve se ve como hueco con borde de puntos.
//   · Al soltar se guarda (en este navegador). Esc o soltar fuera la deja
//     donde estaba.
//   · Con teclado: las flechas ← → de cada tarjeta.
// Las tarjetas se deslizan a su sitio (FLIP) salvo con movimiento reducido.

const BOTON =
  "rounded-full px-4 py-2 text-[13px] font-semibold transition-[transform,background-color] duration-150 active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] motion-reduce:transition-none disabled:opacity-40";

type Herramienta = (typeof HERRAMIENTAS_BELEN)[number];

export function InicioBelen({ miId, listas, onAbrir }: {
  miId: string | null;
  listas: Partial<Record<IdLista, CargaLista>>;
  onAbrir: (id: string) => void;
}) {
  const clave = `coordina.belen.herramientas:${miId ?? "local"}`;
  const [herramientas, setHerramientas] = useState<Herramienta[]>(HERRAMIENTAS_BELEN);
  const [ordenando, setOrdenando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [lista, setLista] = useState(false);
  // Mientras se arrastra: cuál y el orden de antes (para deshacer si se suelta fuera).
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const antesDeArrastrar = useRef<Herramienta[] | null>(null);
  const soltado = useRef(false);
  // Tras mover, las tarjetas se deslizan 180 ms: mientras, una que pasa por
  // debajo del cursor no debe «robar» el sitio (si no, la arrastrada rebota).
  const ultimoMovimiento = useRef(0);
  const deslizar = useDeslizar(herramientas.map((h) => h.id).join("|"));

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

  const guardar = (nuevas: Herramienta[], movida: Herramienta) => {
    try {
      localStorage.setItem(clave, JSON.stringify(nuevas.map((h) => h.id)));
      setMensaje(`${movida.label}: posición ${nuevas.indexOf(movida) + 1} de ${nuevas.length}. Orden guardado.`);
    } catch { setMensaje("El orden ha cambiado, pero este navegador no permite guardarlo para la próxima visita."); }
  };

  const moverConTeclado = (id: string, destino: number) => {
    const nuevas = moverA(herramientas, id, destino);
    setHerramientas(nuevas);
    guardar(nuevas, nuevas.find((h) => h.id === id)!);
  };

  const empezar = (id: string) => {
    antesDeArrastrar.current = herramientas;
    soltado.current = false;
    setArrastrando(id);
  };
  // Al pasar por encima de otra tarjeta, la arrastrada ocupa YA su sitio: así
  // se ve cómo quedaría antes de soltar.
  const pasarPor = (destino: number, ahora: number) => {
    if (!arrastrando || herramientas[destino]?.id === arrastrando) return;
    if (ahora - ultimoMovimiento.current < 220) return;
    ultimoMovimiento.current = ahora;
    setHerramientas((hs) => moverA(hs, arrastrando, destino));
  };
  const soltar = () => {
    soltado.current = true;
    const movida = herramientas.find((h) => h.id === arrastrando);
    if (movida) guardar(herramientas, movida);
  };
  const terminar = () => {
    // Soltada fuera de las tarjetas (o con Esc): vuelve como estaba.
    if (!soltado.current && antesDeArrastrar.current) setHerramientas(antesDeArrastrar.current);
    antesDeArrastrar.current = null;
    setArrastrando(null);
  };

  return (
    <section aria-labelledby="herramientas-belen" className="mx-auto mt-6 max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="herramientas-belen" className="text-[16px] font-semibold">Herramientas</h2>
        <button
          type="button"
          aria-pressed={ordenando}
          disabled={!lista}
          onClick={() => setOrdenando(!ordenando)}
          className={`${BOTON} ${ordenando ? "bg-brand-400 text-brand-950" : "bg-[var(--hero-relleno)] text-text hover:bg-[var(--hero-relleno-encima)]"}`}
        >
          {ordenando ? "Hecho" : "Ordenar herramientas"}
        </button>
      </div>
      {ordenando && (
        <p className="mb-3 rounded-2xl bg-[var(--detalle)] px-4 py-2.5 text-[13px] text-text">
          <b>Arrastra cada tarjeta</b> a donde la quieras: las demás se apartan para enseñarte cómo quedará. Al soltar, se
          guarda. También puedes usar las flechas de cada tarjeta.
        </p>
      )}
      <p role="status" className="sr-only">{mensaje}</p>
      {mensaje.includes("no permite") && <p className="mb-3 text-sm text-text-muted">{mensaje}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Herramientas">
        {herramientas.map((h, i) => {
          const carga = listas[h.id as IdLista];
          const esLaQueSeMueve = arrastrando === h.id;
          return (
            <li
              key={h.id}
              ref={deslizar(h.id)}
              data-herramienta={h.id}
              draggable={ordenando}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", h.id);
                e.dataTransfer.effectAllowed = "move";
                empezar(h.id);
              }}
              onDragEnter={(e) => { if (ordenando) { e.preventDefault(); pasarPor(i, e.timeStamp); } }}
              onDragOver={(e) => { if (ordenando) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; pasarPor(i, e.timeStamp); } }}
              onDrop={(e) => { if (ordenando) { e.preventDefault(); soltar(); } }}
              onDragEnd={terminar}
              className={`tarjeta-of relative flex flex-col rounded-3xl bg-surface transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none ${
                ordenando
                  ? esLaQueSeMueve
                    ? "cursor-grabbing outline-2 outline-dashed outline-[var(--hero-anillo)] [--surface:var(--detalle)]"
                    : "cursor-grab"
                  : "hover:[--surface:color-mix(in_oklab,var(--hero-relleno)_55%,var(--detalle))]"
              }`}
            >
              <button
                type="button"
                onClick={() => onAbrir(h.id)}
                disabled={ordenando}
                className={`belen-herramienta flex flex-1 flex-col items-start gap-2 rounded-[inherit] p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] ${
                  ordenando ? "pointer-events-none" : "transition-transform duration-150 active:scale-[.98] motion-reduce:transition-none"
                } ${esLaQueSeMueve ? "opacity-40" : ""}`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {ordenando && (
                      <span className="grid size-6 place-items-center rounded-full bg-[var(--hero-relleno)] text-[12px] font-bold tabular-nums" aria-hidden>
                        {i + 1}
                      </span>
                    )}
                    <span className="text-[14px] font-semibold">{h.label}</span>
                  </span>
                  {ordenando ? (
                    <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-text-muted" fill="currentColor">
                      {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
                    </svg>
                  ) : (
                    carga && (
                      <span className="text-[12px] tabular-nums text-text-muted">
                        {carga.tipo === "listo" ? carga.filas.length : carga.tipo === "error" ? "!" : "…"}
                      </span>
                    )
                  )}
                </span>
                <span className="text-[12.5px] leading-relaxed text-text-muted">{h.explica}</span>
              </button>
              {ordenando && (
                <div className="flex items-center justify-end gap-2 px-4 pb-3">
                  <button
                    type="button"
                    disabled={i === 0}
                    aria-label={`Mover ${h.label} antes`}
                    onClick={() => moverConTeclado(h.id, i - 1)}
                    className={`${BOTON} min-h-9 bg-[var(--hero-relleno)] px-3.5 py-1.5 text-text hover:bg-[var(--hero-relleno-encima)]`}
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                  <button
                    type="button"
                    disabled={i === herramientas.length - 1}
                    aria-label={`Mover ${h.label} después`}
                    onClick={() => moverConTeclado(h.id, i + 1)}
                    className={`${BOTON} min-h-9 bg-[var(--hero-relleno)] px-3.5 py-1.5 text-text hover:bg-[var(--hero-relleno-encima)]`}
                  >
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
