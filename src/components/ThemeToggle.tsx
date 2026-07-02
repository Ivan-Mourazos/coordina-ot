"use client";

import { useState } from "react";

export function ThemeToggle() {
  // Solo se monta tras hidratar (gate de Board), así que puede leer la clase
  // del <html> directamente en el primer render sin desajustes con el SSR.
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
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
