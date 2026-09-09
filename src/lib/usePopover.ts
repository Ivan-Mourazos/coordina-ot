"use client";

import { useEffect, useRef, useState } from "react";

/** Estado de un desplegable flotante: cierra con clic fuera y con Escape.
 *  Compartido por selects, notificaciones, identidad y paneles de equipo. */
export function usePopover<T extends HTMLElement = HTMLDivElement>(opciones?: {
  /** Ignora los clics dentro de CUALQUIER `[data-en-portal]`, no solo el
   *  propio: `[data-en-portal]` es una marca global (la llevan también
   *  Select, MenuAccionesOF, MenuAsignar y MaterialChip) y este hook no
   *  tiene forma de saber cuál de esos portales es "el suyo".
   *
   *  Por eso NO es la conducta por defecto: si lo fuera, abrir la campana de
   *  Notificaciones y luego elegir una opción en un `Select` de otra parte
   *  de la página dejaría la campana flotando en vez de cerrarse —el portal
   *  del Select, ajeno a la campana, la libraría del cierre igual que si
   *  fuera el suyo propio—. Solo lo pide quien de verdad abre un diálogo
   *  DESDE DENTRO de su propio desplegable: hoy, Herramientas con el
   *  ConfirmDialog de "PIN olvidado". Sin esto, confirmar ahí se leía como
   *  clic fuera: el menú se cerraba —y con él ResetPin, que aún no había
   *  podido resetear nada— antes de que el clic en "Confirmar" llegara a
   *  ejecutarse. Mismo criterio que PanelFlotante, que sí puede asumirlo
   *  siempre por ser un modal a pantalla completa que no convive con nada. */
  ignorarPortales?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<T | null>(null);
  const ignorarPortales = opciones?.ignorarPortales ?? false;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const donde = e.target as Node;
      if (ref.current?.contains(donde)) return;
      if (ignorarPortales && donde instanceof Element && donde.closest("[data-en-portal]")) return;
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
  }, [open, ignorarPortales]);

  return { open, setOpen, ref };
}
