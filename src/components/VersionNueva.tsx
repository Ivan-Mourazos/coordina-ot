"use client";

// ─── "Hay una versión nueva de la web" ───────────────────────────────────────
// Una pestaña que lleva abierta desde antes del despliegue sigue con el código
// viejo hasta que alguien recargue a mano, y aquí eso pasa: la web se deja
// abierta toda la jornada. Con Next hay además un efecto peor que quedarse sin
// lo nuevo — los trozos de JavaScript de la versión anterior dejan de existir
// en el servidor, así que al abrir una pantalla que no estaba cargada todavía
// puede salir un error en vez de la pantalla.
//
// SE AVISA, NO SE RECARGA SOLA. Recargar por su cuenta se llevaría por delante
// la nota a medio escribir o el cuadro de devolución abierto, y una pantalla
// que se reinicia sola mientras trabajas asusta más de lo que ayuda. El aviso
// es una barra discreta abajo; quien no le haga caso sigue con la versión de
// antes, que es lo que hacía hasta hoy.
//
// La versión la trae la respuesta del tablero (cabecera `X-Coordina-Version`),
// así que esto no pide nada por su cuenta: el Board ya pregunta cada 30 s.

export function VersionNueva({ onRecargar }: { onRecargar?: () => void }) {
  return (
    // Abajo en el centro, como los avisos de Planteamientos: tarjeta sin borde,
    // icono y título en el color del aviso y la explicación en gris. El estilo
    // HeroUI lo remata en hero.css (`.aviso-version`).
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex justify-center p-3">
      <div role="status" className="aviso-version glass-pop pointer-events-auto flex items-center gap-3 rounded-xl px-3 py-2 shadow-lg">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="aviso-version-icono size-5 shrink-0 text-brand-700 dark:text-brand-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="flex min-w-0 flex-col text-sm">
          <span className="font-semibold text-brand-700 dark:text-brand-300">Hay una versión nueva de la web</span>
          <span className="text-text-muted">Actualiza cuando puedas; no pierdes nada de lo que estés haciendo.</span>
        </span>
        <button
          onClick={() => (onRecargar ? onRecargar() : window.location.reload())}
          className="shrink-0 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
