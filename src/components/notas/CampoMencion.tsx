"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  SECCIONES_MENCIONABLES,
  claveDestino,
  etiquetasMencion,
  tokensAVisible,
  trocearVisible,
  visibleATokens,
  type Destino,
} from "@/lib/nota-pedido";
import type { PersonaPublica } from "@/lib/personas";

// ─── El cuadro de una nota, con menciones (16/11/2026) ──────────────────────
// Al teclear `@` sale la lista de secciones y personas, filtrada por lo que se
// escribe detrás. El cuadro enseña `@Producción` resaltado; lo que sube al
// padre (y se guarda) es el token `@[seccion:produccion]`. Antes el cuadro
// enseñaba el token crudo y no se entendía (Iván, 16/11/2026).
// Ver docs/NOTAS-MENCIONES.md.

/** El color de una mención: personas en el ámbar de la marca, secciones en
 *  azul, para distinguirlas de un vistazo (Iván, 16/11/2026). En la nota
 *  guardada, la que va contigo va en sólido y las demás en suave. */
export function claseMencion(tipo: Destino["tipo"], tono: "cuadro" | "mia" | "otra"): string {
  if (tipo === "seccion") {
    if (tono === "cuadro") return "bg-sky-400/35";
    return tono === "mia" ? "bg-sky-600 text-white" : "bg-sky-500/15 text-sky-800 dark:text-sky-200";
  }
  if (tono === "cuadro") return "bg-brand-400/35";
  return tono === "mia" ? "bg-brand-400 text-brand-950" : "bg-brand-400/20 text-brand-800 dark:text-brand-200";
}

/** Lo que comparten el cuadro y la capa de resaltado: si difieren, el
 *  resaltado se descuadra del texto. */
const CAJA = "px-3 py-2 text-[13px] leading-relaxed";

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
  const capa = useRef<HTMLDivElement>(null);
  const etiquetas = useMemo(() => etiquetasMencion(personas), [personas]);
  const etiquetaDe = useMemo(
    () => new Map(etiquetas.map((e) => [claveDestino(e.destino), e.etiqueta])),
    [etiquetas],
  );
  // Lo que se ve y se teclea; `valor` (con tokens) es lo que tiene el padre.
  const visible = tokensAVisible(valor, etiquetas);
  const cambiar = (v: string) => onCambio(visibleATokens(v, etiquetas));

  const opciones: Opcion[] = consulta
    ? [
        ...SECCIONES_MENCIONABLES.map((s) => ({
          destino: { tipo: "seccion", id: s.id } as Destino,
          nombre: s.nombre,
          detalle: "Sección",
        })),
        ...personas
          .filter((p) => p.id !== miId)
          .map((p) => ({ destino: { tipo: "persona", id: p.id } as Destino, nombre: p.nombre, detalle: p.nombreCompleto }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      ].filter((o) => {
        // Con la `@` sola salen todas, agrupadas: así se descubre a quién se
        // puede avisar sin saberse los nombres (Iván, 16/11/2026).
        const q = llano(consulta.q);
        return !q || llano(o.nombre).includes(q) || llano(o.detalle).includes(q);
      })
    : [];
  // Ya escrita entera («@Diseño») es una mención hecha: la lista sobra, y
  // abierta tapaba el botón de Guardar y se comía el clic.
  const completa = consulta !== null && etiquetas.some((e) => e.etiqueta === consulta.q);
  const abierta = consulta !== null && !completa && opciones.length > 0;
  const indice = Math.min(activa, Math.max(opciones.length - 1, 0));

  // Con las flechas, la elegida siempre a la vista: la lista ya no se corta
  // en 8 y baja con desplazamiento.
  useEffect(() => {
    if (abierta) document.getElementById(`${idLista}-${indice}`)?.scrollIntoView({ block: "nearest" });
  }, [abierta, indice, idLista]);

  // El cursor tras elegir, puesto en el mismo render que el texto nuevo. Con
  // requestAnimationFrame llegaba tarde si se seguía tecleando deprisa: lo
  // devolvía atrás y la siguiente mención duplicaba el texto.
  const cursorPendiente = useRef<number | null>(null);
  useLayoutEffect(() => {
    const pos = cursorPendiente.current;
    if (pos === null || !ref.current) return;
    cursorPendiente.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(pos, pos);
  });

  // Hacia arriba si abajo no cabe: al final de la ficha se cortaba.
  const [arriba, setArriba] = useState(false);
  useLayoutEffect(() => {
    if (!abierta || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const alto = 300;
    setArriba(window.innerHeight - r.bottom < alto && r.top > window.innerHeight - r.bottom);
  }, [abierta]);

  function mirar(texto: string, cursor: number) {
    const c = consultaEn(texto, cursor);
    setConsulta(c);
    if (c?.q !== consulta?.q) setActiva(0);
  }

  function elegir(o: Opcion) {
    if (!consulta) return;
    const token = `@${etiquetaDe.get(claveDestino(o.destino)) ?? o.nombre} `;
    const cursor = ref.current?.selectionStart ?? visible.length;
    cambiar(visible.slice(0, consulta.desde) + token + visible.slice(cursor));
    setConsulta(null);
    cursorPendiente.current = consulta.desde + token.length;
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
        value={visible}
        autoFocus
        rows={3}
        onChange={(e) => {
          cambiar(e.target.value);
          mirar(e.target.value, e.target.selectionStart);
        }}
        onScroll={(e) => {
          if (capa.current) capa.current.scrollTop = e.currentTarget.scrollTop;
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
        className={`recuadro w-full rounded-lg border border-borde-campo ${CAJA} text-text disabled:opacity-60`}
      />
      {/* Las menciones resaltadas: una capa encima, transparente salvo el
          fondo de cada mención, con la misma caja y letra que el cuadro. */}
      <div
        ref={capa}
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border border-transparent text-transparent ${CAJA}`}
      >
        {trocearVisible(visible, etiquetas).map((t, i) =>
          t.mencion ? (
            <span key={i} className={`rounded-sm [box-decoration-break:clone] ${claseMencion(t.mencion, "cuadro")}`}>
              {t.texto}
            </span>
          ) : (
            <span key={i}>{t.texto}</span>
          ),
        )}
        {"​"}
      </div>
      {abierta && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="A quién mencionar"
          className={`absolute left-2 z-30 max-h-72 w-72 max-w-[calc(100%-1rem)] overflow-y-auto rounded-[14px] bg-surface p-1 shadow-[var(--hero-sombra-panel)] ${
            arriba ? "bottom-full mb-1" : "top-full -mt-1"
          }`}
        >
          {opciones.map((o, i) => [
            // Título de grupo delante de la primera de cada tipo.
            (i === 0 || opciones[i - 1].destino.tipo !== o.destino.tipo) && (
              <li
                key={`titulo-${o.destino.tipo}`}
                role="presentation"
                className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted"
              >
                {o.destino.tipo === "seccion" ? "Secciones" : "Personas"}
              </li>
            ),
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
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${
                i === indice ? "bg-[var(--hero-relleno)] text-text" : "text-text"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${o.destino.tipo === "seccion" ? "bg-sky-500" : "bg-brand-400"}`}
                />
                <span className="truncate font-semibold">{o.nombre}</span>
              </span>
              {o.destino.tipo === "persona" && o.detalle !== o.nombre && (
                <span className="truncate text-[11px] text-text-muted">{o.detalle}</span>
              )}
            </li>,
          ])}
        </ul>
      )}
    </div>
  );
}
