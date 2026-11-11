"use client";

import { SelectorFecha } from "../SelectorFecha";

// ─── Filtros y orden de las listas de Belén ──────────────────────────────────
// Las mismas piezas en «Por fecha solicitada» y en las listas de Comprobaciones
// (Iván, 11/11/2026: «todas las pestañas con lista de pedidos, con filtros y
// orden, estilo HeroUI»). Campos de 14 px de radio con su sombra mínima,
// botones en pastilla y el calendario de siempre de Coordina para las fechas.

const CAMPO =
  "campo-hundido h-10 min-w-0 max-w-full rounded-[14px] px-3 text-sm text-text outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)]";

/** Quita tildes y pasa a minúsculas, para buscar «alvarez» y encontrar «Álvarez». */
export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");

export function CampoBuscar({ valor, onCambiar, pista, etiqueta = "Buscar en la lista" }: { valor: string; onCambiar: (v: string) => void; pista: string; etiqueta?: string }) {
  return (
    <label className="flex min-w-[min(14rem,100%)] flex-1 flex-col gap-1 text-xs font-medium text-text-muted">
      {etiqueta}
      <span className="relative">
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input type="search" value={valor} onChange={(e) => onCambiar(e.target.value)} placeholder={pista} className={`${CAMPO} w-full pl-9`} />
      </span>
    </label>
  );
}

/** Un día o un rango, con el calendario de Coordina, a la altura de los campos. */
export function FiltroFechas({
  etiqueta,
  desde,
  hasta,
  onCambiar,
}: {
  etiqueta: string;
  desde: string;
  hasta: string;
  onCambiar: (desde: string, hasta: string) => void;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-text-muted">
      <span>{etiqueta}</span>
      <SelectorFecha
        desde={desde}
        hasta={hasta}
        onCambiar={onCambiar}
        vacio="Cualquier fecha"
        ayuda={`${etiqueta}: un día o entre dos fechas`}
        claseBoton="campo-hundido flex h-10 min-w-40 max-w-full items-center gap-2 rounded-[14px] px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)]"
      />
    </div>
  );
}

export function Seleccion<T extends string>({
  etiqueta,
  valor,
  opciones,
  onCambiar,
}: {
  etiqueta: string;
  valor: T;
  opciones: ReadonlyArray<readonly [T, string]>;
  onCambiar: (v: T) => void;
}) {
  return (
    <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-text-muted">
      {etiqueta}
      <select value={valor} onChange={(e) => onCambiar(e.target.value as T)} className={CAMPO}>
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BotonLimpiar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 rounded-full bg-[var(--hero-relleno)] px-4 text-sm font-semibold text-text transition-[transform,background-color] hover:bg-[var(--hero-relleno-encima)] active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] motion-reduce:transition-none"
    >
      Limpiar
    </button>
  );
}

export interface Orden<K extends string> {
  clave: K;
  descendente: boolean;
}

/** Cabecera de columna que ordena al pincharla; la segunda vez, al revés. */
export function CabeceraOrdenable<K extends string>({
  clave,
  titulo,
  orden,
  onOrdenar,
  derecha = false,
  className = "",
}: {
  clave: K;
  titulo: string;
  orden: Orden<K> | null;
  onOrdenar: (clave: K) => void;
  derecha?: boolean;
  className?: string;
}) {
  const activa = orden?.clave === clave;
  return (
    <th scope="col" aria-sort={activa ? (orden!.descendente ? "descending" : "ascending") : "none"} className={`px-2.5 py-1.5 first:pl-4 last:pr-4 ${derecha ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onOrdenar(clave)}
        title={`Ordenar por ${titulo.toLowerCase()}`}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] ${
          activa ? "bg-[var(--hero-relleno)] text-text" : "text-text-muted hover:text-text"
        } ${derecha ? "flex-row-reverse" : ""}`}
      >
        {titulo}
        <span aria-hidden className={activa ? "" : "opacity-0"}>
          {activa && orden!.descendente ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );
}

/** Pasa al orden siguiente: otra columna → ascendente; la misma → al revés. */
export function siguienteOrden<K extends string>(actual: Orden<K> | null, clave: K): Orden<K> {
  return actual?.clave === clave ? { clave, descendente: !actual.descendente } : { clave, descendente: false };
}
