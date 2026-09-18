"use client";

import { useState } from "react";
import { CLAVE_ENCAJE_PARTE, siguienteGiro, type Giro } from "@/lib/visor-pdf";
import { BotonesEncaje } from "./VisorPdf/BotonesEncaje";
import { imprimirPdf } from "./VisorPdf/imprimir";
import { MotorNavegador } from "./VisorPdf/MotorNavegador";
import { useEncajePdf, useMotorPdf } from "./VisorPdf/preferencias";
import { VisorPdf } from "./VisorPdf/VisorPdf";

/** El parte escaneado, con sus botones en una barra estrecha a la izquierda.
 *
 *  LA ALTURA ES DE LA HOJA. El parte es un A4 vertical y lo que se viene a
 *  hacer aquí es leerlo entero; cualquier cosa puesta encima le come alto. Los
 *  botones van al lado, en vertical, donde sobra sitio.
 *
 *  DOS MOTORES. Por defecto lo pinta CoordinaOT (`VisorPdf`): el giro no gira
 *  el scroll y cambiar de encaje no recarga. Quien prefiere el visor de su
 *  navegador —hay quien usa el de Adobe en Firefox— lo elige con un botón y
 *  se le recuerda. En ese modo no hay botón de girar: lo trae su visor.
 *
 *  Vive aquí y no dentro de una ficha porque son DOS: la del Historial y la del
 *  tablero (Pendientes y panel). */
export function ParteEscaneado({ codigo, scanUrl }: { codigo: string; scanUrl: string }) {
  // El encaje y el motor se recuerdan (ver preferencias.ts); el giro no.
  const [ajuste, pulsarEncaje] = useEncajePdf(CLAVE_ENCAJE_PARTE);
  const [motor, setMotor] = useMotorPdf();
  // El giro NO se guarda entre pedidos: que el siguiente se abriera torcido
  // porque el anterior lo estaba sería peor que no tener botón.
  const [giro, setGiro] = useState<Giro>(0);
  const propio = motor === "propio";
  const titulo = `Pedido ${codigo}`;
  // La miniatura que ya pinta el servidor para las tarjetas: misma ruta, .png.
  const poster = /\.pdf$/i.test(scanUrl) ? scanUrl.replace(/\.pdf$/i, ".png") : undefined;
  // Cuadrados: en una barra estrecha el rótulo no cabe, así que el nombre va
  // en el `title` y en el `aria-label`.
  const chip = "chip-3d grid size-8 place-items-center rounded-lg text-sm text-text";
  // Anillo y color de marca para el que está puesto. NO `glass-chip-activo`:
  // esa tiñe el fondo, y `chip-3d` va después en la hoja y se lo comería.
  const puesto = "ring-2 ring-brand-400 text-brand-700 dark:text-brand-300";

  return (
    // El clic no sale de aquí: en la ficha del tablero, un clic fuera la
    // cierra, y pulsar un botón del parte no es salirse de ella.
    <div className="flex h-full w-full gap-2" onClick={(e) => e.stopPropagation()}>
      {/* TRES GRUPOS, no una fila de botones. Arriba lo que cambia cómo se ve
          la hoja aquí dentro; debajo lo que la saca fuera (otra pestaña,
          descarga, papel); y al pie, aparte, con QUÉ se ve. Mezclados, ⇄ caía
          entre girar y descargar y se leía como una acción más sobre el parte,
          cuando es una preferencia que se pone una vez y se olvida. */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <div role="group" aria-label="Cómo se ve el parte" className="flex flex-col gap-1.5">
          <BotonesEncaje encaje={ajuste} onPulsar={pulsarEncaje} clase={chip} clasePuesto={puesto} />
          {propio && (
            <button
              type="button"
              onClick={() => setGiro(siguienteGiro)}
              title={`Girar el parte · ahora ${giro}°`}
              // El grado también en el `aria-label`: con uno fijo, quien usa
              // lector de pantalla no sabría en qué posición está la hoja.
              aria-label={`Girar el parte · ahora ${giro}°`}
              className={`${chip} ${giro !== 0 ? puesto : ""}`}
            >
              ↻
            </button>
          )}
        </div>
        <Separador />
        <div role="group" aria-label="Sacar el parte" className="flex flex-col gap-1.5">
          <a
            href={scanUrl}
            target="_blank"
            rel="noopener"
            title="Abrir el parte en otra pestaña"
            aria-label="Abrir el parte en otra pestaña"
            className={chip}
          >
            ↗
          </a>
          <a href={scanUrl} download={`${codigo}.pdf`} title="Descargar el parte" aria-label="Descargar el parte" className={chip}>
            ↓
          </a>
          <button
            type="button"
            onClick={() => imprimirPdf(scanUrl)}
            title="Imprimir el parte"
            aria-label="Imprimir el parte"
            className={chip}
          >
            ⎙
          </button>
        </div>
        {/* Al pie del carril (`mt-auto`): lejos de las acciones, donde no se
            pulsa por error buscando imprimir. */}
        <div className="mt-auto flex flex-col gap-1.5">
          <Separador />
          <button
            type="button"
            onClick={() => setMotor(propio ? "navegador" : "propio")}
            aria-pressed={!propio}
            title={
              propio
                ? "Ver con el visor del navegador · se recuerda para la próxima vez"
                : "Volver al visor de CoordinaOT · se recuerda para la próxima vez"
            }
            aria-label={propio ? "Ver con el visor del navegador" : "Volver al visor de CoordinaOT"}
            className={`${chip} ${propio ? "" : puesto}`}
          >
            ⇄
          </button>
        </div>
      </div>
      <div className="relative h-full min-w-0 flex-1 overflow-hidden rounded-xl">
        {propio ? (
          // `key`: al pasar a otra OF sin cerrar el cajón, el parte nuevo
          // empieza arriba y sin el zoom del anterior.
          <VisorPdf key={scanUrl} url={scanUrl} encaje={ajuste} giro={giro} titulo={titulo} poster={poster} />
        ) : (
          // `toolbar=0`: la barra gris de Chrome cantaba encima de la ficha.
          // Quien quiere la barra entera tiene «abrir en otra pestaña».
          <MotorNavegador url={scanUrl} fragmento={`page=1&view=${ajuste}&toolbar=0`} titulo={titulo} />
        )}
      </div>
    </div>
  );
}

/** Raya corta entre grupos del carril: separa sin gastar alto. */
function Separador() {
  return <span aria-hidden="true" className="mx-auto my-1 h-px w-6 bg-white/25" />;
}
