import { readFileSync } from "node:fs";
import { imprimirPdf } from "./ipp";
import { descartar, impresoraDestino, marcarFallo, marcarImpreso, modoImpresion, pendientesParaEnviar } from "./impresion-cola";

// ─── El que manda los planteamientos a la impresora ─────────────────────────
// Cada 30 s, lo pendiente cuya espera ya pasó. Uno detrás de otro: si la
// impresora no responde al primero, no responderá al segundo, y se para la
// vuelta hasta la siguiente.

const CADA_MS = 30_000;

declare global {
  // Sobrevive a recargas de módulo (HMR en dev) para no arrancar dos.
  var __coordinaImpresion: ReturnType<typeof setInterval> | undefined;
}

let corriendo = false;

export async function vueltaImpresion(ahora = new Date(), imprimir = imprimirPdf): Promise<number> {
  const modo = modoImpresion();
  const destino = impresoraDestino(modo);
  if (!destino || corriendo) return 0;
  corriendo = true;
  let enviados = 0;
  try {
    for (const p of pendientesParaEnviar(ahora)) {
      // Sin copia legible no hay nada que reintentar: se descarta esa fila y se
      // sigue con las demás (la impresora no tiene la culpa).
      if (!p.copia) {
        descartar(p.id, "Falta la copia del PDF; hay que imprimirlo a mano");
        continue;
      }
      let pdf: Uint8Array;
      try {
        pdf = new Uint8Array(readFileSync(p.copia));
      } catch (e) {
        descartar(p.id, `No puedo leer la copia del PDF (${(e as Error).message}); hay que imprimirlo a mano`);
        console.warn(`[impresion] ${p.pedidoId} ${p.fichero}: copia ilegible`);
        continue;
      }
      try {
        const { trabajo } = await imprimir(destino, pdf, {
          nombre: `Planteamiento ${p.pedidoId}`,
          usuario: "CoordinaOT",
        });
        marcarImpreso(p.id, trabajo, destino, modo, ahora, p.copia);
        enviados += 1;
      } catch (e) {
        marcarFallo(p.id, p.intentos, (e as Error).message, ahora);
        console.warn(`[impresion] ${p.pedidoId} ${p.fichero}:`, (e as Error).message);
        break;
      }
    }
  } finally {
    corriendo = false;
  }
  return enviados;
}

export function arrancarImpresion(): void {
  if (globalThis.__coordinaImpresion) return;
  globalThis.__coordinaImpresion = setInterval(() => {
    vueltaImpresion().catch((e) => console.error("[impresion] la vuelta falló:", e));
  }, CADA_MS);
  globalThis.__coordinaImpresion.unref?.();
}
