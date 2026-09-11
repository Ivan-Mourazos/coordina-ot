"use client";

/** En las listas, solo el código abre la ficha; el resto de la fila despliega. */
export function PedidoCodigo({ codigo, onAbrir }: { codigo: string; onAbrir: () => void }) {
  return (
    <button
      type="button"
      title="Abrir detalle del pedido"
      className="pointer-events-auto relative z-10 cursor-pointer rounded-sm font-mono text-sm font-semibold text-text hover:underline"
      onClick={(event) => {
        event.stopPropagation();
        onAbrir();
      }}
    >
      {codigo}
    </button>
  );
}
