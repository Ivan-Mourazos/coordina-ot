"use client";

/** El botón de la barra de la página de impresión: abre el diálogo de imprimir
 *  del navegador (A4, sin márgenes; las hojas ya traen los suyos). Principal
 *  de HeroUI: marca maciza, pastilla, foco visible y escala al pulsar. */
export function BotonImprimir() {
  return (
    <button
      type="button"
      autoFocus
      onClick={() => window.print()}
      className="h-9 rounded-full bg-brand-400 px-5 text-[14px] font-bold text-brand-950 transition-transform active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      Imprimir
    </button>
  );
}
