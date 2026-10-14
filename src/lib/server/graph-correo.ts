// ─── Mandar un correo por Microsoft 365 (Graph) ──────────────────────────────
// La empresa usa Microsoft 365 y su dominio solo da por buenos los correos que
// salen de allí, así que el servidor no puede mandar correo por su cuenta. Lo
// hace como la aplicación «Coordina» de Entra ID, con permiso Mail.Send de
// APLICACIÓN limitado al buzón compartido coordina@ (David, 13/10/2026). Sin
// usuario ni contraseña de nadie: client credentials.
//
// Sin dependencias: son dos peticiones HTTP.

export interface Adjunto { nombre: string; bytes: Uint8Array }
export interface Correo {
  de: string;
  para: string[];
  responderA: string | null;
  asunto: string;
  texto: string;
  adjuntos: Adjunto[];
}
export interface CredencialesGraph { tenant: string; cliente: string; secreto: string }

/** Lo que admite un sendMail simple. Los planteamientos de CAD pesan KB. */
export const MAX_ADJUNTOS_BYTES = 3 * 1024 * 1024;

/** `reintentable`: vale la pena volver a probar (red, Microsoft caído). Lo que
 *  no se arregla insistiendo (secreto caducado, sin permiso, demasiado grande)
 *  no se reintenta: se para y se dice. */
export class ErrorGraph extends Error {
  constructor(mensaje: string, readonly reintentable: boolean) {
    super(mensaje);
  }
}

export function credencialesGraph(): CredencialesGraph | null {
  const tenant = process.env.GRAPH_TENANT_ID;
  const cliente = process.env.GRAPH_CLIENT_ID;
  const secreto = process.env.GRAPH_CLIENT_SECRET;
  return tenant && cliente && secreto ? { tenant, cliente, secreto } : null;
}

let token: { valor: string; caduca: number } | null = null;

async function pedir(f: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await f(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new ErrorGraph(`Microsoft no responde (${(e as Error).message})`, true);
  }
}

async function textoDeError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error_description?: string; error?: { message?: string } | string };
    if (j.error_description) return j.error_description.split("\n")[0];
    if (typeof j.error === "object" && j.error?.message) return j.error.message;
  } catch {}
  return `HTTP ${r.status}`;
}

const reintentable = (status: number) => status === 429 || status >= 500;

async function obtenerToken(cred: CredencialesGraph, f: typeof fetch, ahora: number): Promise<string> {
  // Un minuto de margen: que no caduque entre pedirlo y usarlo.
  if (token && token.caduca - 60_000 > ahora) return token.valor;
  const r = await pedir(f, `https://login.microsoftonline.com/${cred.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.cliente,
      client_secret: cred.secreto,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }).toString(),
  });
  if (!r.ok) throw new ErrorGraph(`No se pudo entrar en Microsoft: ${await textoDeError(r)}`, reintentable(r.status));
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { valor: j.access_token, caduca: ahora + j.expires_in * 1000 };
  return token.valor;
}

const direccion = (address: string) => ({ emailAddress: { address } });

export async function enviarCorreo(
  c: Correo,
  cred: CredencialesGraph,
  f: typeof fetch = fetch,
  ahora: () => number = Date.now,
): Promise<void> {
  const peso = c.adjuntos.reduce((n, a) => n + a.bytes.length, 0);
  if (peso > MAX_ADJUNTOS_BYTES) {
    throw new ErrorGraph(`Los adjuntos pesan ${Math.round(peso / 1024)} KB: demasiado para un correo`, false);
  }
  const tok = await obtenerToken(cred, f, ahora());
  const r = await pedir(f, `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.de)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      saveToSentItems: true,
      message: {
        subject: c.asunto,
        body: { contentType: "Text", content: c.texto },
        toRecipients: c.para.map(direccion),
        ...(c.responderA ? { replyTo: [direccion(c.responderA)] } : {}),
        attachments: c.adjuntos.map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.nombre,
          contentType: "application/pdf",
          contentBytes: Buffer.from(a.bytes).toString("base64"),
        })),
      },
    }),
  });
  if (r.status !== 202 && !r.ok) {
    // Token rechazado a medio camino (caducado, revocado): que se pida otro.
    if (r.status === 401) token = null;
    throw new ErrorGraph(`Microsoft no aceptó el correo: ${await textoDeError(r)}`, reintentable(r.status));
  }
}
