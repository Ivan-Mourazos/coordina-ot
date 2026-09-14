"use client";

import { useRef } from "react";

/** El parte escaneado, con sus botones en una barra estrecha a la izquierda.
 *
 *  LA ALTURA ES DE LA HOJA. El parte es un A4 vertical y lo que se viene a
 *  hacer aquí es leerlo entero; cualquier cosa puesta encima le come alto y
 *  obliga a bajar. Los botones van al lado, en vertical, donde sobra sitio: la
 *  hoja se queda con todo el alto y entra completa.
 *
 *  La barra del visor de PDF de Chrome se oculta (`toolbar=0`): es gris oscura,
 *  vive dentro del iframe —ninguna clase nuestra la alcanza—, encima de una
 *  ficha en relieve canta, y además gastaba ese alto. Lo que hacía falta de
 *  ella se rehace aquí con los mismos chips que «Material» y «Tareas y
 *  tiempos».
 *
 *  El zoom NO se rehace: lo lleva el visor por dentro (Ctrl + rueda) y sigue
 *  funcionando con la barra escondida.
 *
 *  Vive aquí y no dentro de una ficha porque son DOS: la del Historial y la del
 *  tablero (Pendientes y panel). */
export function ParteEscaneado({
  codigo,
  scanUrl,
  onAmpliar,
}: {
  codigo: string;
  scanUrl: string;
  /** Solo donde hay sitio al que ampliar. */
  onAmpliar?: () => void;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  // Cuadrados: en una barra estrecha el rótulo no cabe, así que el nombre va
  // en el `title` y en el `aria-label` —el lector de pantalla lo lee igual—.
  const chip = "chip-3d grid size-8 place-items-center rounded-lg text-sm text-text";

  function imprimir() {
    const ventana = marco.current?.contentWindow;
    try {
      if (!ventana) throw new Error("sin visor");
      ventana.focus();
      ventana.print();
    } catch {
      window.open(scanUrl, "_blank", "noopener");
    }
  }

  return (
    // El clic no sale de aquí: en la ficha del tablero, un clic fuera la
    // cierra, y pulsar un botón del parte no es salirse de ella.
    <div className="flex h-full w-full gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex shrink-0 flex-col gap-1.5">
        <a href={scanUrl} download={`${codigo}.pdf`} title="Descargar el parte" aria-label="Descargar el parte" className={chip}>
          ↓
        </a>
        <button type="button" onClick={imprimir} title="Imprimir el parte" aria-label="Imprimir el parte" className={chip}>
          ⎙
        </button>
        {onAmpliar && (
          <button
            type="button"
            onClick={onAmpliar}
            title="Ver el parte a pantalla casi completa"
            aria-label="Ampliar el parte"
            className={chip}
          >
            ⤢
          </button>
        )}
      </div>
      <iframe
        ref={marco}
        src={`${scanUrl}#page=1&view=Fit&toolbar=0`}
        title={`Pedido ${codigo}`}
        className="h-full min-w-0 flex-1 rounded-xl border-none bg-white"
      />
    </div>
  );
}
