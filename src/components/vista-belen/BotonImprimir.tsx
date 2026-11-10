"use client";

/** El botón de la barra de la página de impresión: abre el diálogo de imprimir
 *  del navegador (A4, sin márgenes; las hojas ya traen los suyos). */
export function BotonImprimir() {
  return (
    <button
      type="button"
      autoFocus
      onClick={() => window.print()}
      style={{
        border: 0,
        borderRadius: 999,
        padding: "8px 18px",
        background: "#f5b335",
        color: "#3b2603",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Imprimir
    </button>
  );
}
