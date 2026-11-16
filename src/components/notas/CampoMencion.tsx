"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { SECCIONES_MENCIONABLES, tokenMencion, type Destino } from "@/lib/nota-pedido";
import type { PersonaPublica } from "@/lib/personas";

// ─── El cuadro de una nota, con menciones (16/11/2026) ──────────────────────
// Al teclear `@` sale la lista de secciones y personas, filtrada por lo que se
// escribe detrás. Al elegir se mete el token (`@[persona:ivan]`): el cuadro lo
// enseña tal cual —es sencillo y no se rompe al editar— y la nota guardada lo
// pinta como etiqueta con el nombre. Ver docs/NOTAS-MENCIONES.md.

interface Opcion {
  destino: Destino;
  nombre: string;
  detalle: string;
}

/** Sin mayúsculas ni tildes: «dise» encuentra «Diseño» y «ivan» a «Iván». */
const llano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Lo escrito tras la `@` que hay justo antes del cursor, o null si el cursor
 *  no está en una mención a medio escribir. */
function consultaEn(texto: string, cursor: number): { desde: number; q: string } | null {
  const m = /(^|\s)@([^\s@[\]]{0,30})$/u.exec(texto.slice(0, cursor));
  if (!m) return null;
  return { desde: cursor - m[2].length - 1, q: m[2] };
}

export function CampoMencion({
  valor,
  onCambio,
  onGuardar,
  onCancelar,
  personas,
  miId,
  disabled,
  puedeGuardar,
}: {
  valor: string;
  onCambio: (v: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  personas: readonly PersonaPublica[];
  miId: string | null;
  disabled: boolean;
  puedeGuardar: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const idLista = useId();
  const [consulta, setConsulta] = useState<{ desde: number; q: string } | null>(null);
  const [activa, setActiva] = useState(0);

  const opciones: Opcion[] = consulta
    ? [
        ...SECCIONES_MENCIONABLES.map((s) => ({
          destino: { tipo: "seccion", id: s.id } as Destino,
          nombre: s.nombre,
          detalle: "Sección",
        })),
        ...personas
          .filter((p) => p.id !== miId)
          .map((p) => ({ destino: { tipo: "persona", id: p.id } as Destino, nombre: p.nombre, detalle: p.nombreCompleto })),
      ]
        .filter((o) => {
          const q = llano(consulta.q);
          return !q || llano(o.nombre).includes(q) || llano(o.detalle).includes(q);
        })
        .slice(0, 8)
    : [];
  const abierta = consulta !== null && opciones.length > 0;
  const indice = Math.min(activa, Math.max(opciones.length - 1, 0));

  function mirar(texto: string, cursor: number) {
    const c = consultaEn(texto, cursor);
    setConsulta(c);
    if (c?.q !== consulta?.q) setActiva(0);
  }

  function elegir(o: Opcion) {
    if (!consulta) return;
    const token = `${tokenMencion(o.destino)} `;
    const cursor = ref.current?.selectionStart ?? valor.length;
    const nuevo = valor.slice(0, consulta.desde) + token + valor.slice(cursor);
    onCambio(nuevo);
    setConsulta(null);
    const pos = consulta.desde + token.length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (abierta) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = opciones.length;
        setActiva((indice + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
        e.preventDefault();
        elegir(opciones[indice]);
        return;
      }
      if (e.key === "Escape") {
        // Cierra la lista y nada más: ni la nota ni la ficha.
        e.preventDefault();
        e.stopPropagation();
        setConsulta(null);
        return;
      }
    }
    // Cancela la nota y nada más: sin cortarlo, Escape cerraba la ficha.
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancelar();
    }
    // Ctrl/Cmd+Enter guarda: el Enter suelto hace falta para el salto de
    // línea, que estas notas suelen llevar más de una.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && puedeGuardar) onGuardar();
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={valor}
        autoFocus
        rows={3}
        onChange={(e) => {
          onCambio(e.target.value);
          mirar(e.target.value, e.target.selectionStart);
        }}
        onSelect={(e) => mirar(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setConsulta(null)}
        onKeyDown={onKeyDown}
        placeholder="Lo que hay que saber de este pedido… Escribe @ para avisar a alguien."
        aria-label="Nota del pedido"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={abierta}
        aria-controls={abierta ? idLista : undefined}
        aria-activedescendant={abierta ? `${idLista}-${indice}` : undefined}
        // Bloqueado mientras se guarda: el camino de éxito limpia el borrador,
        // así que lo que se teclease en esa ventana se iría sin avisar.
        disabled={disabled}
        className="recuadro w-full rounded-lg border border-borde-campo px-3 py-2 text-[13px] leading-relaxed text-text disabled:opacity-60"
      />
      {abierta && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="A quién mencionar"
          className="absolute left-2 top-full z-30 -mt-1 max-h-64 w-64 overflow-y-auto rounded-[14px] bg-surface p-1 shadow-[var(--hero-sombra-panel)]"
        >
          {opciones.map((o, i) => (
            <li
              key={`${o.destino.tipo}:${o.destino.id}`}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={i === indice}
              // mousedown y no click: el click llega después del blur del
              // cuadro, que ya habría cerrado la lista.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(o);
              }}
              onMouseEnter={() => setActiva(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${
                i === indice ? "bg-[var(--hero-relleno)] text-text" : "text-text"
              }`}
            >
              <span className="truncate font-semibold">{o.nombre}</span>
              <span className="shrink-0 text-[11px] text-text-muted">
                {o.destino.tipo === "seccion" ? "Sección" : o.detalle !== o.nombre ? o.detalle : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
