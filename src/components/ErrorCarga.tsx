"use client";

/** La misma salida para una consulta fallida, sin obligar a cerrar y volver a abrir. */
export function ErrorCarga({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-text">
      <span>{mensaje}</span>
      <button type="button" onClick={onReintentar} className="rounded-md border border-border bg-surface px-2 py-1 font-semibold hover:bg-surface-2">
        Reintentar
      </button>
    </div>
  );
}
