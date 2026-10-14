"use client";

import { useSyncExternalStore } from "react";

// El tema lo pone el script del <head> (layout.tsx) antes de pintar, como
// clase «dark» en el <html>. Aquí solo se LEE esa clase, y en el servidor se
// dice siempre «claro». Antes se leía en el primer render: en la consulta, que
// se pinta en el servidor, el icono no coincidía con el del navegador, React
// rehacía la página entera y de paso le quitaba al <html> la clase «dark» —se
// perdía el modo oscuro al recargar, con el icono del sol— (Iván, 14/10/2026).
const html = () => document.documentElement;
function suscribir(aviso: () => void) {
  const o = new MutationObserver(aviso);
  o.observe(html(), { attributes: true, attributeFilter: ["class"] });
  return () => o.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    suscribir,
    () => html().classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const next = !dark;
    html().classList.toggle("dark", next);
    try {
      localStorage.setItem("coordina-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="Cambiar tema"
      title="Cambiar tema"
      className="glass-chip grid size-9 place-items-center rounded-lg text-text-muted transition-colors hover:text-text"
    >
      {dark ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.95 6.95-1.41-1.41M7.46 7.46 6.05 6.05m11.9 0-1.41 1.41M7.46 16.54l-1.41 1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
