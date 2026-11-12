"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { moverA, ordenarPorIds } from "@/lib/orden-guardado";

// ─── Pestañas que Belén ordena a su manera ───────────────────────────────────
// Iván, 12/11/2026: «Belén quiere poder ordenar las cosas a su manera… quizá
// agarrando la pestaña y desplazando». Sin modo «ordenar»: se agarra la
// pestaña y se suelta donde se quiera; un clic sigue abriéndola.
//   · Mientras se arrastra, las demás se apartan EN VIVO (FLIP) y la que se
//     mueve queda como hueco.
//   · Cambia de sitio al pasar la MITAD de la vecina: con pestañas de anchos
//     distintos, cambiar nada más entrar hacía que rebotaran.
//   · Al soltar se guarda en este navegador, por persona. Soltar fuera o Esc
//     la deja como estaba.
//   · Con teclado: Ctrl + Mayús + ← / →.
// La PRIMERA de su orden es la que se abre por defecto.

/** Desliza cada elemento desde donde estaba a donde está ahora (FLIP). */
export function useDeslizar(orden: string) {
  const nodos = useRef(new Map<string, HTMLElement>());
  const antes = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [id, el] of nodos.current) {
      const previo = antes.current.get(id);
      const ahora = el.getBoundingClientRect();
      antes.current.set(id, ahora);
      if (!previo || quieto) continue;
      const dx = previo.left - ahora.left;
      const dy = previo.top - ahora.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 180, easing: "ease-out" });
    }
  }, [orden]);
  return useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) nodos.current.set(id, el);
    else nodos.current.delete(id);
  }, []);
}

/** Opciones: `grupoDe` para no dejar mover una pestaña fuera de su grupo
 *  (la barra de listas va por temas desde el 12/11/2026) y `vertical` para
 *  listas de arriba abajo (se mira la mitad en alto y se usan ↑ ↓). */
export function usePestanasOrdenables<T extends { id: string }>(
  clave: string,
  base: readonly T[],
  { grupoDe, vertical = false }: { grupoDe?: (id: string) => string; vertical?: boolean } = {},
) {
  const mismoGrupo = (a: string, b: string) => !grupoDe || grupoDe(a) === grupoDe(b);
  // Se guardan los ids, no las pestañas: sus rótulos llevan cifras que cambian.
  const [ids, setIds] = useState<string[] | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const antes = useRef<string[] | null>(null);
  const soltado = useRef(false);
  const items = ordenarPorIds(base, ids);
  const deslizar = useDeslizar(items.map((x) => x.id).join("|"));

  useEffect(() => {
    let vivo = true;
    void Promise.resolve().then(() => {
      if (!vivo) return;
      try {
        const v: unknown = JSON.parse(localStorage.getItem(clave) ?? "null");
        setIds(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
      } catch {
        setIds(null);
      }
    });
    return () => { vivo = false; };
  }, [clave]);

  const guardar = (nuevos: string[]) => {
    try { localStorage.setItem(clave, JSON.stringify(nuevos)); } catch { /* Sin almacenamiento: vale para esta visita. */ }
  };

  const propsDe = (id: string, i: number) => ({
    ref: deslizar(id),
    draggable: true,
    title: "Arrastra para cambiar el orden",
    onDragStart: (e: React.DragEvent) => {
      antes.current = items.map((x) => x.id);
      soltado.current = false;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      setArrastrando(id);
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!arrastrando) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (arrastrando === id || !mismoGrupo(arrastrando, id)) return;
      const desde = items.findIndex((x) => x.id === arrastrando);
      const r = e.currentTarget.getBoundingClientRect();
      const mitad = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
      const donde = vertical ? e.clientY : e.clientX;
      // Hacia delante cambia al pasar la mitad; hacia atrás, igual.
      if ((desde < i && donde < mitad) || (desde > i && donde > mitad)) return;
      setIds(moverA(items, arrastrando, i).map((x) => x.id));
    },
    onDrop: (e: React.DragEvent) => {
      if (!arrastrando) return;
      e.preventDefault();
      soltado.current = true;
      guardar(items.map((x) => x.id));
    },
    onDragEnd: () => {
      if (!soltado.current && antes.current) setIds(antes.current);
      antes.current = null;
      setArrastrando(null);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      const [atras, adelante] = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
      if (!e.ctrlKey || !e.shiftKey || (e.key !== atras && e.key !== adelante)) return;
      e.preventDefault();
      const destino = i + (e.key === atras ? -1 : 1);
      if (!items[destino] || !mismoGrupo(id, items[destino].id)) return;
      const nuevos = moverA(items, id, destino).map((x) => x.id);
      setIds(nuevos);
      guardar(nuevos);
      const el = e.currentTarget;
      requestAnimationFrame(() => el.focus());
    },
  });

  /** Clases para la pestaña mientras se arrastra: hueco con borde de puntos. */
  const claseArrastre = (id: string) =>
    arrastrando === id ? "opacity-40 outline-dashed outline-2 outline-[var(--hero-anillo)]" : "";

  return { items, propsDe, claseArrastre, arrastrando };
}
