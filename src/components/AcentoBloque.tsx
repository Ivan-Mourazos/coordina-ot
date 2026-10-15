export type TipoBloque = "documentos" | "tareas" | "notas" | "recorrido" | "comentario" | "ofs";

const TRAZOS: Record<TipoBloque, string> = {
  documentos: "M14 2H6v20h12V6l-4-4ZM14 2v5h5M9 12h6M9 16h6",
  tareas: "M9 5h11M9 12h11M9 19h11M3 5l1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2",
  notas: "M4 3h16v14l-5 4H4V3ZM8 8h8M8 12h6M15 21v-4h5",
  recorrido: "M5 4v13a3 3 0 0 0 3 3h11M2 7l3-3 3 3M16 17l3 3-3 3M11 9h8M11 13h5",
  comentario: "M3 4h18v13H9l-6 4V4ZM7 8h10M7 12h7",
  ofs: "M3 21V9l6 3V7l6 3V3h5v18H3ZM7 16v2M11 16v2M16 16v2",
};

/** El color identifica el apartado, nunca sustituye su nombre. Solo el icono
 *  y la raya llevan acento: el texto conserva la tinta legible del tema. */
export function AcentoBloque({ tipo }: { tipo: TipoBloque }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="icono-bloque size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={TRAZOS[tipo]} />
    </svg>
  );
}
