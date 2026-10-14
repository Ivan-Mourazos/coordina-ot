import { readFileSync } from "node:fs";
import { credencialesGraph, enviarCorreo, ErrorGraph, type Adjunto } from "./graph-correo";
import { correosParaEnviar, descartarCorreo, marcarCorreoEnviado, marcarFalloCorreo, modoCorreo } from "./correo-cola";

// ─── El que manda los correos del planteamiento ─────────────────────────────
// Cada 30 s, lo pendiente cuya espera ya pasó. Uno detrás de otro: si
// Microsoft no responde al primero, no responderá al segundo, y se para la
// vuelta hasta la siguiente. Lo que Microsoft RECHAZA (sin permiso, secreto
// caducado) no se reintenta: se descarta con el motivo y se sigue.

const CADA_MS = 30_000;

declare global {
  // Sobrevive a recargas de módulo (HMR en dev) para no arrancar dos.
  var __coordinaCorreo: ReturnType<typeof setInterval> | undefined;
}

let corriendo = false;
let avisadoSinCredenciales = false;

export async function vueltaCorreo(ahora = new Date(), enviar = enviarCorreo): Promise<number> {
  if (modoCorreo() === "off" || corriendo) return 0;
  const cred = credencialesGraph();
  if (!cred) {
    // Sin GRAPH_* en el .env no hay forma de enviar: se avisa una vez en el log
    // y los correos esperan en la cola hasta que se configure.
    if (!avisadoSinCredenciales) {
      console.warn("[correo] faltan GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET: no se manda nada");
      avisadoSinCredenciales = true;
    }
    return 0;
  }
  corriendo = true;
  let enviados = 0;
  try {
    for (const c of correosParaEnviar(ahora)) {
      let adjuntos: Adjunto[];
      try {
        adjuntos = c.ficheros.map((f) => ({ nombre: f.nombre, bytes: new Uint8Array(readFileSync(f.copia)) }));
      } catch (e) {
        descartarCorreo(c.id, `Falta la copia de un PDF (${(e as Error).message}); usa «Reenviar»`);
        continue;
      }
      try {
        await enviar(
          {
            de: process.env.CORREO_REMITENTE ?? "coordina@toldosgomez.com",
            para: c.para,
            responderA: process.env.CORREO_RESPONDER_A ?? "of.tecnica@toldosgomez.com",
            asunto: c.asunto,
            texto: c.cuerpo,
            html: c.html ?? undefined,
            adjuntos,
          },
          cred,
        );
        marcarCorreoEnviado(c.id, ahora);
        enviados += 1;
      } catch (e) {
        const mensaje = (e as Error).message;
        if (e instanceof ErrorGraph && !e.reintentable) {
          descartarCorreo(c.id, mensaje);
          console.warn(`[correo] ${c.pedidoId} descartado:`, mensaje);
          continue;
        }
        marcarFalloCorreo(c.id, c.intentos, mensaje, ahora);
        console.warn(`[correo] ${c.pedidoId}:`, mensaje);
        break;
      }
    }
  } finally {
    corriendo = false;
  }
  return enviados;
}

export function arrancarCorreo(): void {
  if (globalThis.__coordinaCorreo) return;
  globalThis.__coordinaCorreo = setInterval(() => {
    vueltaCorreo().catch((e) => console.error("[correo] la vuelta falló:", e));
  }, CADA_MS);
  globalThis.__coordinaCorreo.unref?.();
}
