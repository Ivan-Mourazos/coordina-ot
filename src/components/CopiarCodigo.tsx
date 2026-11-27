"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

// El botoncito de copiar junto al número de una OF (Iván, 27/11/2026): ese
// número se pega a cada rato en RPS, en un correo o en el chat, y
// seleccionarlo a mano en una cabecera que se pliega al pulsar era una lata.

/** Copia al portapapeles. La web se sirve por http://coordina, que NO es un
 *  contexto seguro: ahí `navigator.clipboard` no existe. Se intenta primero
 *  (localhost y https sí lo tienen) y, si no, el método de toda la vida con un
 *  textarea fuera de la vista. */
async function copiar(texto: string, origen: Element | null): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sin permiso: se prueba la otra vía.
  }
  const ta = document.createElement("textarea");
  ta.value = texto;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  // DENTRO DEL <dialog> si lo hay: la ficha se abre con `showModal()` y todo
  // lo de fuera queda inerte, así que un textarea colgado del body no puede
  // tener el foco ni la selección y `execCommand` no copiaba nada (revisión
  // del 27/11/2026). Y con foco explícito: sin él, Chromium no pasa la
  // selección del campo al documento.
  (origen?.closest("dialog") ?? document.body).appendChild(ta);
  const antes = document.activeElement as HTMLElement | null;
  ta.focus({ preventScroll: true });
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  antes?.focus?.();
  return ok;
}

/** Icono de copiar o, durante un momento después de copiar, una marca de
 *  hecho. Mismo trazo que los de `Iconos.tsx` (2 px, redondeado), sin emoji.
 *
 *  `dentroDeBoton`: la cabecera de una OF plegable ES un botón, y un botón no
 *  puede llevar otro dentro. Ahí se pinta como `span` pulsable que corta el
 *  clic, para que copiar no pliegue ni despliegue la OF. */
export function CopiarCodigo({
  texto,
  que = "OF",
  dentroDeBoton = false,
  className = "",
}: {
  texto: string;
  /** Para el rótulo: «Copiar la OF 26/12345». */
  que?: string;
  dentroDeBoton?: boolean;
  className?: string;
}) {
  const [hecho, setHecho] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const alPulsar = async (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!(await copiar(texto, e.currentTarget as Element))) return;
    setHecho(true);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setHecho(false), 1500);
  };

  const rotulo = hecho ? "Copiado" : `Copiar la ${que} ${texto}`;
  const clases = `inline-grid size-5 shrink-0 cursor-pointer place-items-center rounded-md! text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text ${
    hecho ? "text-emerald-600! dark:text-emerald-400!" : ""
  } ${className}`;
  const icono = hecho ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );

  if (dentroDeBoton) {
    return (
      <span title={rotulo} aria-hidden onClick={alPulsar} className={clases}>
        {icono}
      </span>
    );
  }
  return (
    <button type="button" title={rotulo} aria-label={rotulo} onClick={alPulsar} className={clases}>
      {icono}
    </button>
  );
}
