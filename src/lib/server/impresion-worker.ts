import { readFileSync } from "node:fs";
import { estadoTrabajo, imprimirPdf, type TrabajoIpp } from "./ipp";
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

/** Con qué usuario se imprime. Las Konica tienen la autenticación de usuario
 *  activada y abortan lo que llega sin uno válido (14/10/2026); el usuario y su
 *  clave los da David, en `IMPRESORA_USUARIO` / `IMPRESORA_CLAVE`. */
function usuarioImpresora(): Pick<TrabajoIpp, "usuario" | "clave"> {
  const clave = process.env.IMPRESORA_CLAVE;
  return { usuario: process.env.IMPRESORA_USUARIO ?? "CoordinaOT", ...(clave ? { clave } : {}) };
}

/** Pregunta a la impresora cómo acabó un trabajo, para no dar por impreso lo
 *  que abortó. Devuelve el job-state de IPP, o null si no se sabe. */
export type Comprobador = (uri: string, trabajo: number, t: TrabajoIpp) => Promise<number | null>;

/** job-state de IPP que significan «no ha salido»: cancelado y abortado. */
const NO_SALIO: ReadonlySet<number> = new Set([7, 8]);

/** Lo que tarda una Konica en decidir si aborta: unos segundos. */
const ESPERA_COMPROBACION_MS = 10_000;
const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** `comprobar`: si se da, tras mandar cada trabajo se pregunta cómo acabó, y
 *  si la impresora lo abortó queda como error en vez de «impreso». El
 *  trabajador de verdad siempre comprueba (ver `arrancarImpresion`). */
export async function vueltaImpresion(
  ahora = new Date(),
  imprimir = imprimirPdf,
  comprobar?: Comprobador,
): Promise<number> {
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
        const t: TrabajoIpp = { nombre: `Planteamiento ${p.pedidoId}`, ...usuarioImpresora() };
        const { trabajo } = await imprimir(destino, pdf, t);
        const estado = comprobar && trabajo !== null ? await comprobar(destino, trabajo, t) : null;
        if (estado !== null && NO_SALIO.has(estado)) {
          // «Reimprimir» lo vuelve a buscar y mandar cuando se arregle.
          descartar(p.id, `La impresora aceptó el trabajo pero lo ${estado === 7 ? "canceló" : "abortó"} sin imprimir: revisa el usuario de la impresora (IMPRESORA_USUARIO / IMPRESORA_CLAVE)`);
          console.warn(`[impresion] ${p.pedidoId} ${p.fichero}: la impresora abortó el trabajo ${trabajo}`);
          continue;
        }
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
    vueltaImpresion(new Date(), imprimirPdf, async (uri, trabajo, t) => {
      await dormir(ESPERA_COMPROBACION_MS);
      return estadoTrabajo(uri, trabajo, t);
    }).catch((e) => console.error("[impresion] la vuelta falló:", e));
  }, CADA_MS);
  globalThis.__coordinaImpresion.unref?.();
}
