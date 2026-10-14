import { test } from "vitest";
import { credencialesGraph, enviarCorreo } from "../src/lib/server/graph-correo";

// ─── El correo del planteamiento contra Microsoft de verdad ──────────────────
// MANDA un correo real, así que solo corre con su bandera y a la dirección que
// se le diga:
//
//   ENVIAR_CORREO_PRUEBA=ivan.sanchez@toldosgomez.com \
//     node --env-file=.env node_modules/vitest/vitest.mjs run scripts/verificar-correo.test.ts
//
// Usa GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET del .env.

const DESTINO = process.env.ENVIAR_CORREO_PRUEBA;

// Un PDF mínimo válido de una página, para que el adjunto se abra.
const PDF = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

test.skipIf(!DESTINO)("manda un correo de prueba con un PDF adjunto", async () => {
  const cred = credencialesGraph();
  if (!cred) throw new Error("Faltan GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET");
  await enviarCorreo(
    {
      de: process.env.CORREO_REMITENTE ?? "coordina@toldosgomez.com",
      para: [DESTINO!],
      responderA: process.env.CORREO_RESPONDER_A ?? "of.tecnica@toldosgomez.com",
      asunto: "Prueba del correo del planteamiento (CoordinaOT)",
      texto: "Correo de prueba con un PDF adjunto. Si llega con el adjunto, el envío funciona.",
      adjuntos: [{ nombre: "prueba.pdf", bytes: PDF }],
    },
    cred,
  );
  console.info(`[correo] enviado a ${DESTINO}`);
});
