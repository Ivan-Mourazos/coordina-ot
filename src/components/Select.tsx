"use client";

import { useEffect, useRef } from "react";
import { tintaSobre } from "@/lib/tinta";

// ─── Un <select> de verdad, con `appearance: base-select` (17/11/2026) ───────
// Hasta aquí era un botón con una lista en un PORTAL: su clic fuera, su Escape
// en `capas-escape`, la marca `data-en-portal` para que los paneles flotantes no
// se cerraran al pinchar en él, sus flechas, su `aria-activedescendant` y su
// cuenta de si cabía abajo o arriba. Todo eso lo hace ahora el navegador:
//
//  · la lista va a la capa superior y se cuelga del control sola (nada la
//    recorta y, si abajo no cabe, se abre hacia arriba);
//  · teclado completo —flechas, Inicio/Fin, escribir para saltar, Intro, Esc—
//    y el lector de pantalla lo anuncia como lo que es;
//  · las opciones siguen DENTRO del control en el DOM, así que el panel que lo
//    contiene ve el clic como suyo sin marcas.
//
// Lo que se ve lo pinta `globals.css` (`.select-nativo` y su `::picker`). Pedía
// React 19.3 (Next 16.4): el de antes solo admitía texto dentro de <option> y
// aquí van iconos y avatares.
//
// En un navegador sin `base-select` (Firefox, hoy) sale el desplegable del
// sistema, sin iconos: funciona igual, solo se ve más soso.

export interface SelectOption {
  value: string;
  label: string;
  /** Adorno a la izquierda: punto de color, icono de familia, avatar… */
  icon?: React.ReactNode;
}

/** Desplegable con el aspecto de la casa. `value` null = placeholder. */
export function Select({
  value,
  onChange,
  options,
  placeholder = "—",
  alignRight = false,
  className = "",
  acentuarActivo = false,
  etiquetaVaciar,
  ariaLabelledBy,
  abiertoAlMontar = false,
  plano = false,
  claseBoton,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: SelectOption[];
  /** Opción vacía al principio (para "Todos", "Sin asignar"…). Si es null,
   *  no se ofrece vaciar. */
  placeholder?: string | null;
  /** La lista se alinea con el borde derecho del control. */
  alignRight?: boolean;
  className?: string;
  /** Para los filtros: con valor elegido se pinta con el color de marca, para
   *  que se vea CUÁL está filtrando sin tener que leer todos los desplegables.
   *  Los selectores que siempre tienen valor (autor, revisor, orden) no lo
   *  usan: ahí el acento sería permanente y no diría nada. */
  acentuarActivo?: boolean;
  /** Texto de la opción que quita el valor, cuando no sirve el del botón. */
  etiquetaVaciar?: string;
  /** Id del rótulo de al lado (un `<span>`, no un `<label>` alrededor). */
  ariaLabelledBy?: string;
  /** Sale ya desplegado, con el foco puesto. Para cuando elegir ES el
   *  siguiente paso y no un dato opcional: el revisor al pasar a revisión. */
  abiertoAlMontar?: boolean;
  /** Sin aspecto de botón: el valor como texto, con la flecha discreta. Para
   *  un DATO que además se puede cambiar (el autor en la ficha), no una
   *  acción: con relieve de botón parecía lo primero que había que pulsar
   *  (Iván, 15/10/2026). */
  plano?: boolean;
  /** Forma del control cerrado en vez del chip de vidrio: para ponerlo a la
   *  altura de los campos de al lado (filtros HeroUI de la vista de Belén). */
  claseBoton?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  // Abrir al montar. En un timeout y no en el propio efecto: el control tiene
  // que estar ya pintado para colgarle la lista. `showPicker` pide que venga de
  // un gesto del usuario; si el navegador no lo da por bueno, se queda con el
  // foco, que con Intro o las flechas ya la abre.
  useEffect(() => {
    if (!abiertoAlMontar) return;
    const t = setTimeout(() => {
      const el = ref.current;
      el?.focus();
      try {
        el?.showPicker();
      } catch {
        /* sin gesto del usuario: se queda enfocado */
      }
    }, 0);
    return () => clearTimeout(t);
    // Solo al montar: si se cierra, es porque quien lo usa lo ha cerrado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El control cerrado y la opción de vaciar dicen cosas distintas: el control
  // lleva el nombre del campo ("Familia") y la opción, qué pasa al elegirla
  // ("Todas"). Por eso lo de dentro del botón se pinta aquí y no con
  // <selectedcontent>, que copiaría el texto de la opción.
  const textoCerrado = selected?.label ?? placeholder ?? "—";

  return (
    <div className={className}>
      <select
        ref={ref}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        aria-labelledby={ariaLabelledBy}
        // `glass-chip-activo` y no un `bg-*` de Tailwind: el fondo de
        // `.glass-chip` gana siempre a las utilidades (ver globals.css), así
        // que el acento de "este filtro está recortando la lista" no llegaba a
        // pintarse nunca.
        className={`select-nativo group ${alignRight ? "select-derecha" : ""} ${
          claseBoton
            ? `w-full transition-colors ${claseBoton}`
            : plano
              ? "-mx-1.5 rounded-md px-1.5 py-1 text-xs font-semibold transition-colors hover:bg-surface-2"
              : "glass-chip w-full rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-border-strong"
        } ${
          acentuarActivo && selected
            ? "glass-chip-activo text-brand-800 dark:text-brand-300"
            : selected
              ? "text-text"
              : "text-text-muted"
        }`}
      >
        {/* El botón de dentro es lo que se ve cerrado. Sin `base-select` el
            navegador lo ignora y enseña la opción elegida. */}
        <button type="button" className={`flex w-full min-w-0 items-center ${claseBoton ? "gap-2" : "gap-1.5"}`}>
          {selected?.icon}
          <span className="min-w-0 flex-1 truncate text-left">{textoCerrado}</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`size-3 shrink-0 text-text-muted transition-transform group-open:rotate-180 ${
              plano ? "opacity-40 group-hover:opacity-100 group-focus-visible:opacity-100 group-open:opacity-100" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {placeholder !== null ? (
          <option value="">
            <span className="min-w-0 flex-1 truncate">{etiquetaVaciar ?? placeholder}</span>
          </option>
        ) : (
          // Sin opción de vaciar y sin valor: que no salga elegida la primera
          // opción como si lo estuviera.
          value === null && <option value="" disabled hidden>—</option>
        )}
        {options.map((o) => (
          <option key={o.value || "__empty"} value={o.value}>
            {o.icon}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
          </option>
        ))}
      </select>
    </div>
  );
}

/** Avatar pequeño para opciones de operario. */
export function OpDot({ color, iniciales }: { color: string; iniciales: string }) {
  return (
    <span
      className="grid size-4.5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
      style={{ background: color, color: tintaSobre(color) }}
    >
      {iniciales}
    </span>
  );
}
