"use client";

import { useEffect, useRef, useState } from "react";
import { enGrupos, grupoDe, HERRAMIENTAS_BELEN, ordenarHerramientas, vecinaDelGrupo } from "@/lib/herramientas-belen";
import { moverA } from "@/lib/orden-guardado";
import { useDeslizar } from "./usePestanasOrdenables";
import { filasALaVista, LISTAS_BELEN, type IdLista } from "@/lib/vista-belen-listas";
import type { CargaLista } from "./ListaBelen";
import { IconoHerramienta } from "./IconoHerramienta";

// ─── Portada de Belén: sus herramientas, por temas y en su orden ─────────────
// Por temas desde el 12/11/2026 (GRUPOS_BELEN): un panel por grupo y una fila
// por herramienta con icono, nombre y cuántas hay; lo que explica cada una,
// al pasar el ratón (Iván: «se podría omitir la explicación»). Se ordena
// DENTRO de cada grupo; los grupos van siempre en el mismo orden.
//
// Ordenar es ARRASTRAR (Iván, 11/11/2026: «un sistema de arrastre visual que
// vea fácil cómo ordenar y cómo quedaría»):
//   · «Ordenar» pone en cada una sus flechas ↑ ↓.
//   · Al arrastrar una, las demás se apartan EN VIVO a donde quedarían; la que
//     se mueve se ve como hueco con borde de puntos.
//   · Al soltar se guarda (en este navegador). Esc o soltar fuera la deja
//     donde estaba.
//   · Con teclado: las flechas ↑ ↓ de cada una, sin salir de su grupo.
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
    // Solo dentro de su grupo: fuera de él volvería a su sitio al pintar.
    if (grupoDe(herramientas[destino]?.id ?? "") !== grupoDe(arrastrando)) return;
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
          {ordenando ? "Hecho" : "Ordenar"}
        </button>
      </div>
      {ordenando && (
        <p className="mb-3 rounded-2xl bg-[var(--detalle)] px-4 py-2.5 text-[13px] text-text">
          <b>Arrastra cada herramienta</b> arriba o abajo dentro de su grupo: las demás se apartan para enseñarte cómo
          quedará. Al soltar, se guarda. También con las flechas de cada una.
        </p>
      )}
      <p role="status" className="sr-only">{mensaje}</p>
      {mensaje.includes("no permite") && <p className="mb-3 text-sm text-text-muted">{mensaje}</p>}
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {enGrupos(herramientas).map((g) => (
          <section key={g.id} aria-label={g.label} className="tarjeta-of rounded-3xl bg-surface p-2">
            <h3 className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{g.label}</h3>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((h) => {
                const i = herramientas.indexOf(h);
                const carga = listas[h.id as IdLista];
                const defLista = LISTAS_BELEN.find((d) => d.id === h.id);
                const n = carga?.tipo === "listo" ? (defLista ? filasALaVista(carga.filas, defLista) : carga.filas).length : null;
                const esLaQueSeMueve = arrastrando === h.id;
                const antes = vecinaDelGrupo(herramientas, h.id, -1);
                const despues = vecinaDelGrupo(herramientas, h.id, 1);
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
                    className={`flex items-center rounded-2xl ${
                      ordenando ? (esLaQueSeMueve ? "cursor-grabbing outline-2 outline-dashed outline-[var(--hero-anillo)]" : "cursor-grab") : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onAbrir(h.id)}
                      disabled={ordenando}
                      title={h.explica}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] ${
                        ordenando
                          ? "pointer-events-none"
                          : "transition-[transform,background-color] duration-150 hover:bg-[var(--hero-relleno)] active:scale-[.98] motion-reduce:transition-none"
                      } ${esLaQueSeMueve ? "opacity-40" : ""}`}
                    >
                      <IconoHerramienta id={h.id} />
                      <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug">{h.label}</span>
                      {!ordenando && carga && (
                        <span
                          className={`min-w-6 rounded-full px-1.5 text-center text-[12px] font-bold tabular-nums ${
                            n ? "bg-amber-500/20 text-amber-900 dark:text-amber-200" : "bg-[var(--hero-relleno)] text-text-muted"
                          }`}
                        >
                          {n ?? (carga.tipo === "error" ? "!" : "…")}
                        </span>
                      )}
                    </button>
                    {ordenando && (
                      <span className="flex shrink-0 items-center gap-1 pr-1.5">
                        <button
                          type="button"
                          disabled={antes < 0}
                          aria-label={`Subir ${h.label}`}
                          onClick={() => moverConTeclado(h.id, antes)}
                          className={`${BOTON} min-h-8 bg-[var(--hero-relleno)] px-2.5 py-1 text-text hover:bg-[var(--hero-relleno-encima)]`}
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button
                          type="button"
                          disabled={despues < 0}
                          aria-label={`Bajar ${h.label}`}
                          onClick={() => moverConTeclado(h.id, despues)}
                          className={`${BOTON} min-h-8 bg-[var(--hero-relleno)] px-2.5 py-1 text-text hover:bg-[var(--hero-relleno-encima)]`}
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
