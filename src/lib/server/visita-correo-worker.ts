// src/lib/server/visita-correo-worker.ts
import { credencialesGraph, enviarCorreo, ErrorGraph } from "./graph-correo";
import { crearNota } from "./notas-db";
import { descartarVisita, marcarFalloVisita, marcarVisitaEnviada, modoVisita, visitasParaEnviar } from "./visita-correo-cola";

// ─── El que manda los correos de «Pedir visita» ─────────────────────────────
// Igual que correo-worker. Lo que Microsoft rechaza se descarta y se dice en
// el hilo de la nota de la visita, para que quien la pidió lo mande a mano.

const CADA_MS = 30_000;

declare global {
  var __coordinaVisita: ReturnType<typeof setInterval> | undefined;
}

let corriendo = false;

export async function vueltaVisita(ahora = new Date(), enviar = enviarCorreo): Promise<number> {
  if (modoVisita() === "off" || corriendo) return 0;
  const cred = credencialesGraph();
  if (!cred) return 0;
  corriendo = true;
  let enviados = 0;
  try {
    for (const c of visitasParaEnviar(ahora)) {
      try {
        await enviar(
          {
            de: process.env.CORREO_REMITENTE ?? "coordina@toldosgomez.com",
            para: c.para,
            cc: c.cc,
            responderA: c.responderA ?? process.env.CORREO_RESPONDER_A ?? "of.tecnica@toldosgomez.com",
            asunto: c.asunto,
            texto: c.cuerpo,
            html: c.html ?? undefined,
            adjuntos: [],
          },
          cred,
        );
        marcarVisitaEnviada(c.id, ahora);
        enviados += 1;
      } catch (e) {
        const mensaje = (e as Error).message;
        if (e instanceof ErrorGraph && !e.reintentable) {
          descartarVisita(c.id, mensaje);
          console.warn(`[visita] ${c.pedidoId} descartado:`, mensaje);
          if (c.notaId !== null) {
            try {
              crearNota(c.pedidoId, c.pedidoPor, "No se pudo enviar el correo de esta visita. Hay que mandarlo a mano.", ahora.toISOString(), { padreId: c.notaId });
            } catch (err) {
              // La nota pudo borrarse entretanto: el descarte ya queda en la cola.
              console.warn(`[visita] no pude avisar en la nota ${c.notaId}:`, (err as Error).message);
            }
          }
          continue;
        }
        marcarFalloVisita(c.id, c.intentos, mensaje, ahora);
        console.warn(`[visita] ${c.pedidoId}:`, mensaje);
        break;
      }
    }
  } finally {
    corriendo = false;
  }
  return enviados;
}

export function arrancarVisita(): void {
  if (globalThis.__coordinaVisita) return;
  globalThis.__coordinaVisita = setInterval(() => {
    vueltaVisita().catch((e) => console.error("[visita] la vuelta falló:", e));
  }, CADA_MS);
  globalThis.__coordinaVisita.unref?.();
}
