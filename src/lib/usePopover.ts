"use client";

import { useEffect, useRef, useState } from "react";

/** Estado de un desplegable flotante: cierra con clic fuera y con Escape.
 *  Compartido por selects, notificaciones, identidad y paneles de equipo. */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const donde = e.target as Node;
      if (ref.current?.contains(donde)) return;
      // Lo que sale por un PORTAL sigue siendo de este desplegable aunque en
      // el DOM cuelgue del `body`. Sin esto, confirmar dentro de un
      // ConfirmDialog abierto desde aquí (p.ej. "PIN olvidado" en
      // Herramientas) se leía como clic fuera: el menú se cerraba —y con él
      // ResetPin, que aún no había podido resetear nada— antes de que el
      // clic en "Confirmar" llegara a ejecutarse. Mismo criterio que
      // PanelFlotante.
      if (donde instanceof Element && donde.closest("[data-en-portal]")) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}
