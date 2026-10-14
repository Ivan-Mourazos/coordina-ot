# Correo del planteamiento — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al pasar a Producción un pedido de OT, CoordinaOT manda desde `coordina@` un correo con el planteamiento adjunto y los datos del pedido a Oficina Técnica y Producción. En modo `ensayo` solo le llega a Iván.

**Architecture:** Igual que la impresión del 13/10, que ya está en `main`:
- un cliente de Microsoft Graph mínimo (`graph-correo.ts`);
- textos puros (`correo-planteamiento.ts`);
- una cola SQLite propia (`planteamiento_correo`) con su trabajador;
- el enganche en el `completar` de `/api/estado`, compartiendo la búsqueda del PDF con la impresión;
- rutas y pantalla junto a las de impresión.

**Tech Stack:** Next.js 16 (lee `node_modules/next/dist/docs/` antes de tocar rutas), TypeScript, better-sqlite3, Vitest, `fetch` nativo. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-14-correo-planteamiento-design.md`

## Global Constraints

- Solo pedidos de la sección `ot`. Mismo disparo y misma búsqueda (`planteamientosDe`) que la impresión.
- Se adjuntan TODOS los PDF del planteamiento. Sin planteamiento no hay correo: se anota `sin_planteamiento`.
- `CORREO_PLANTEAMIENTO`: `off` (por defecto) | `ensayo` | `activo`.
  - `activo` → para `CORREO_PARA`, por defecto `of.tecnica@toldosgomez.com,produccion@toldosgomez.com`.
  - `ensayo` → para `CORREO_ENSAYO_PARA`, por defecto `ivan.sanchez@toldosgomez.com`.
- Remitente `CORREO_REMITENTE`, por defecto `coordina@toldosgomez.com`. «Responder a» `CORREO_RESPONDER_A`, por defecto `of.tecnica@toldosgomez.com`.
- Graph:
  - `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` (el secreto NUNCA va al repo).
  - Token por client credentials, scope `https://graph.microsoft.com/.default`.
  - `POST https://graph.microsoft.com/v1.0/users/{remitente}/sendMail` con `saveToSentItems: true`.
- Asunto: `Planteamiento AR.26.05016 · Bar Central`. Cuerpo en texto plano, con el formato exacto de la Task 2.
- Adjuntos de más de 3 MB en total: no se mandan; la fila pasa a `descartado` con el motivo.
- El contenido (asunto, cuerpo, destinatarios, PDF copiados) se congela al encolar.
- Mandar el correo NUNCA bloquea ni hace fallar el pase: va sin esperar y con su `catch`.
- Nada nuevo en `olanet-outbox.ts`.
- Los tests NUNCA llaman a Microsoft: siempre un `fetch` falso.
- Comentarios en español que expliquen el porqué. Solo el último commit lleva `Novedad:`.
- Comandos: `pnpm test <ruta>`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`. **No encadenes un commit detrás de `pnpm test | grep`**: comprueba antes que no haya `failed`.

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/server/graph-correo.ts` (nuevo) | Token y `enviarCorreo`. |
| `src/lib/correo-planteamiento.ts` (nuevo) | `asuntoCorreo`, `cuerpoCorreo`, `minutosATexto` (puros). |
| `src/lib/server/estado-db.ts` | Tabla `planteamiento_correo`. |
| `src/lib/server/correo-cola.ts` (nuevo) | Modo, destinatarios, `prepararCorreo`, estados, `reenviarUltimo`. |
| `src/lib/server/correo-worker.ts` (nuevo) | La vuelta cada 30 s. |
| `src/instrumentation.ts`, `.env.example` | Arranque y configuración. |
| `src/app/api/estado/route.ts` | Lanza el correo al pasar, con la búsqueda compartida. |
| `src/app/api/planteamiento/route.ts` | Añade `correo` a la respuesta. |
| `src/app/api/planteamiento/reenviar/route.ts` (nuevo) | POST reenviar. |
| `src/lib/planteamiento-textos.ts` | Textos del correo para el diálogo y el Historial. |
| `src/components/Board.tsx`, `src/components/PlanteamientoPedido.tsx` | Casilla «Mandar por correo», estado y «Reenviar». |

---

### Task 1: Cliente de Microsoft Graph

**Files:**
- Create: `src/lib/server/graph-correo.ts`
- Test: `src/lib/__tests__/graph-correo.test.ts`

**Interfaces:**
- Produces:
  - `interface Adjunto { nombre: string; bytes: Uint8Array }`
  - `interface Correo { de: string; para: string[]; responderA: string | null; asunto: string; texto: string; adjuntos: Adjunto[] }`
  - `interface CredencialesGraph { tenant: string; cliente: string; secreto: string }`
  - `credencialesGraph(): CredencialesGraph | null` (null si falta alguna variable)
  - `enviarCorreo(c: Correo, cred: CredencialesGraph, f?: typeof fetch, ahora?: () => number): Promise<void>`. Lanza `ErrorGraph`.
  - `class ErrorGraph extends Error { reintentable: boolean }`
  - `MAX_ADJUNTOS_BYTES = 3 * 1024 * 1024`

- [ ] **Step 1: Failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const CRED = { tenant: "t-1", cliente: "c-1", secreto: "s-1" };
const CORREO = {
  de: "coordina@toldosgomez.com",
  para: ["a@x.com", "b@x.com"],
  responderA: "of.tecnica@toldosgomez.com",
  asunto: "Planteamiento AR.26.05016 · Bar Central",
  texto: "hola",
  adjuntos: [{ nombre: "AR2605016-10.pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }],
};

let g: typeof import("../server/graph-correo");
beforeEach(async () => {
  vi.resetModules();
  g = await import("../server/graph-correo");
});

function fetchFalso(respuestas: Array<{ status: number; json?: unknown }>) {
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas.shift()!;
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status });
  });
  return { f: f as unknown as typeof fetch, llamadas };
}

describe("enviarCorreo", () => {
  it("pide token y manda el correo con adjuntos en base64", async () => {
    const { f, llamadas } = fetchFalso([
      { status: 200, json: { access_token: "TOK", expires_in: 3600 } },
      { status: 202 },
    ]);
    await g.enviarCorreo(CORREO, CRED, f, () => 0);
    expect(llamadas[0].url).toBe("https://login.microsoftonline.com/t-1/oauth2/v2.0/token");
    expect(String(llamadas[0].init.body)).toContain("grant_type=client_credentials");
    expect(llamadas[1].url).toBe("https://graph.microsoft.com/v1.0/users/coordina%40toldosgomez.com/sendMail");
    expect((llamadas[1].init.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
    const cuerpo = JSON.parse(String(llamadas[1].init.body));
    expect(cuerpo.saveToSentItems).toBe(true);
    expect(cuerpo.message.subject).toBe(CORREO.asunto);
    expect(cuerpo.message.body).toEqual({ contentType: "Text", content: "hola" });
    expect(cuerpo.message.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address)).toEqual(["a@x.com", "b@x.com"]);
    expect(cuerpo.message.replyTo[0].emailAddress.address).toBe("of.tecnica@toldosgomez.com");
    expect(cuerpo.message.attachments[0]).toMatchObject({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "AR2605016-10.pdf",
      contentType: "application/pdf",
      contentBytes: "JVBERg==",
    });
  });

  it("reutiliza el token mientras no caduca", async () => {
    const { f, llamadas } = fetchFalso([
      { status: 200, json: { access_token: "TOK", expires_in: 3600 } },
      { status: 202 },
      { status: 202 },
    ]);
    await g.enviarCorreo(CORREO, CRED, f, () => 0);
    await g.enviarCorreo(CORREO, CRED, f, () => 60_000);
    expect(llamadas.filter((l) => l.url.includes("/token"))).toHaveLength(1);
  });

  it("credenciales malas: error NO reintentable", async () => {
    const { f } = fetchFalso([{ status: 401, json: { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret" } }]);
    await expect(g.enviarCorreo(CORREO, CRED, f, () => 0)).rejects.toMatchObject({ reintentable: false });
  });

  it("Graph 403 (sin permiso): NO reintentable; 503: reintentable", async () => {
    const a = fetchFalso([{ status: 200, json: { access_token: "T", expires_in: 3600 } }, { status: 403, json: { error: { code: "ErrorAccessDenied", message: "Access is denied" } } }]);
    await expect(g.enviarCorreo(CORREO, CRED, a.f, () => 0)).rejects.toMatchObject({ reintentable: false });
    vi.resetModules();
    g = await import("../server/graph-correo");
    const b = fetchFalso([{ status: 200, json: { access_token: "T", expires_in: 3600 } }, { status: 503, json: { error: { code: "ServiceUnavailable", message: "x" } } }]);
    await expect(g.enviarCorreo(CORREO, CRED, b.f, () => 0)).rejects.toMatchObject({ reintentable: true });
  });

  it("sin red: reintentable", async () => {
    const f = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(g.enviarCorreo(CORREO, CRED, f, () => 0)).rejects.toMatchObject({ reintentable: true });
  });

  it("adjuntos de más de 3 MB: no se manda, NO reintentable", async () => {
    const grande = { ...CORREO, adjuntos: [{ nombre: "x.pdf", bytes: new Uint8Array(g.MAX_ADJUNTOS_BYTES + 1) }] };
    const { f } = fetchFalso([]);
    await expect(g.enviarCorreo(grande, CRED, f, () => 0)).rejects.toMatchObject({ reintentable: false });
  });
});

describe("credencialesGraph", () => {
  it("null si falta alguna variable", () => {
    delete process.env.GRAPH_CLIENT_SECRET;
    process.env.GRAPH_TENANT_ID = "t";
    process.env.GRAPH_CLIENT_ID = "c";
    expect(g.credencialesGraph()).toBeNull();
    process.env.GRAPH_CLIENT_SECRET = "s";
    expect(g.credencialesGraph()).toEqual({ tenant: "t", cliente: "c", secreto: "s" });
  });
});
```

Run: `pnpm test src/lib/__tests__/graph-correo.test.ts`
Expected: FAIL. No resuelve el módulo.

- [ ] **Step 2: Implement `src/lib/server/graph-correo.ts`**

```ts
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
```

Run: `pnpm test src/lib/__tests__/graph-correo.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/graph-correo.ts src/lib/__tests__/graph-correo.test.ts
git commit -m "feat(correo): cliente mínimo de Microsoft Graph para mandar correo"
```

---

### Task 2: Textos del correo

**Files:**
- Create: `src/lib/correo-planteamiento.ts`
- Test: `src/lib/__tests__/correo-planteamiento.test.ts`

**Interfaces:**
- Produces:
  - `interface DatosCorreo { pedido: string; cliente: string; ofs: string[]; entrega: string | null; minutosPlanteo: number; pasadoPor: string }`
  - `asuntoCorreo(d: DatosCorreo): string`
  - `cuerpoCorreo(d: DatosCorreo, ficheros: string[]): string`
  - `minutosATexto(min: number): string`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { asuntoCorreo, cuerpoCorreo, minutosATexto } from "../correo-planteamiento";

const D = {
  pedido: "AR.26.05016",
  cliente: "Bar Central",
  ofs: ["0232968", "0232969"],
  entrega: "2026-10-24",
  minutosPlanteo: 85,
  pasadoPor: "Iván Sánchez",
};

describe("correo del planteamiento", () => {
  it("asunto con pedido y cliente", () => {
    expect(asuntoCorreo(D)).toBe("Planteamiento AR.26.05016 · Bar Central");
    expect(asuntoCorreo({ ...D, cliente: "" })).toBe("Planteamiento AR.26.05016");
  });

  it("cuerpo con los datos del pedido", () => {
    expect(cuerpoCorreo(D, ["AR2605016-10.pdf"])).toBe(
      [
        "Planteamiento del pedido AR.26.05016",
        "",
        "Cliente: Bar Central",
        "OF: 0232968, 0232969",
        "Entrega solicitada: 24/10/2026",
        "Tiempo de planteo: 1 h 25 min",
        "Pasado a Producción por: Iván Sánchez",
        "",
        "Adjunto: AR2605016-10.pdf",
        "",
        "Enviado automáticamente por CoordinaOT.",
      ].join("\n"),
    );
  });

  it("sin entrega ni tiempo, no inventa nada", () => {
    const c = cuerpoCorreo({ ...D, entrega: null, minutosPlanteo: 0 }, ["a.pdf", "b.pdf"]);
    expect(c).not.toContain("Entrega solicitada");
    expect(c).not.toContain("Tiempo de planteo");
    expect(c).toContain("Adjuntos: a.pdf, b.pdf");
  });

  it("minutos a texto", () => {
    expect(minutosATexto(25)).toBe("25 min");
    expect(minutosATexto(60)).toBe("1 h");
    expect(minutosATexto(85)).toBe("1 h 25 min");
  });
});
```

Run: `pnpm test src/lib/__tests__/correo-planteamiento.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
// ─── El correo del planteamiento: asunto y cuerpo ────────────────────────────
// Sustituye al que cada técnico mandaba a mano («PLANTEAMENTO» y el PDF). Lleva
// además los datos del pedido (Iván, 14/10/2026) para que Producción no tenga
// que abrir nada para saber de qué va. Texto plano: se lee igual en cualquier
// cliente de correo y en el móvil.

export interface DatosCorreo {
  pedido: string;
  cliente: string;
  ofs: string[];
  /** ISO yyyy-mm-dd, la entrega SOLICITADA (no la planificación de RPS, que se
   *  recalcula en bloque y no dice nada). */
  entrega: string | null;
  minutosPlanteo: number;
  pasadoPor: string;
}

export function asuntoCorreo(d: DatosCorreo): string {
  return d.cliente.trim() ? `Planteamiento ${d.pedido} · ${d.cliente.trim()}` : `Planteamiento ${d.pedido}`;
}

export function minutosATexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const fecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export function cuerpoCorreo(d: DatosCorreo, ficheros: string[]): string {
  const lineas = [`Planteamiento del pedido ${d.pedido}`, ""];
  if (d.cliente.trim()) lineas.push(`Cliente: ${d.cliente.trim()}`);
  if (d.ofs.length) lineas.push(`OF: ${d.ofs.join(", ")}`);
  if (d.entrega) lineas.push(`Entrega solicitada: ${fecha(d.entrega)}`);
  if (d.minutosPlanteo > 0) lineas.push(`Tiempo de planteo: ${minutosATexto(d.minutosPlanteo)}`);
  lineas.push(`Pasado a Producción por: ${d.pasadoPor}`, "");
  lineas.push(`${ficheros.length === 1 ? "Adjunto" : "Adjuntos"}: ${ficheros.join(", ")}`, "");
  lineas.push("Enviado automáticamente por CoordinaOT.");
  return lineas.join("\n");
}
```

Run: `pnpm test src/lib/__tests__/correo-planteamiento.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/correo-planteamiento.ts src/lib/__tests__/correo-planteamiento.test.ts
git commit -m "feat(correo): asunto y cuerpo del correo del planteamiento"
```

---

### Task 3: La cola del correo y su trabajador

**Files:**
- Modify: `src/lib/server/estado-db.ts` (bloque `CREATE TABLE` de `abrir()`, tras `planteamiento_impresion`)
- Create: `src/lib/server/correo-cola.ts`
- Create: `src/lib/server/correo-worker.ts`
- Modify: `src/instrumentation.ts` (tras `arrancarImpresion()`)
- Modify: `.env.example` (tras la sección de impresión)
- Test: `src/lib/__tests__/correo-cola.test.ts`

Lee antes `src/lib/server/impresion-cola.ts` e `impresion-worker.ts` y su test: son el modelo, con la copia ANTES de insertar, `descartar` y `esperaTras`. Reutiliza `esperaTras` y `dirCopias` importándolos de `impresion-cola.ts`; no los copies.

**Interfaces:**
- Consumes:
  - `planteamientosDe`, `Planteamientos`;
  - `enviarCorreo`, `credencialesGraph`, `ErrorGraph`, `Correo` (Task 1);
  - `asuntoCorreo`, `cuerpoCorreo`, `DatosCorreo` (Task 2);
  - `esperaTras`, `dirCopias` de `impresion-cola.ts`;
  - `getDb()`.
- Produces:
  - `type ModoCorreo = "off" | "ensayo" | "activo"`
  - `modoCorreo(): ModoCorreo`
  - `destinatariosCorreo(modo: ModoCorreo): string[]`
  - `type EstadoCorreo = "pendiente" | "enviado" | "sin_planteamiento" | "descartado"`
  - `interface FilaCorreo { id: number; pedidoId: string; ficheros: string[]; para: string[]; asunto: string | null; estado: EstadoCorreo; intentos: number; error: string | null; modo: ModoCorreo | null; pasadoPor: string | null; creadoAt: string; enviadoAt: string | null }`
  - `prepararCorreo(datos: DatosCorreo, operarioId: string, ahora?: Date, buscar?: () => Promise<Planteamientos>): Promise<{ encolado: boolean; aviso: string | null }>`
  - `leerCorreosDe(pedidoId: string): FilaCorreo[]` (más reciente primero)
  - `reenviarUltimo(pedidoId: string, operarioId: string, ahora?: Date): boolean` (duplica la última fila con PDF como nueva `pendiente`, con los mismos asunto, cuerpo y adjuntos; vuelve a copiar los PDF desde las copias si siguen, si no desde `planteamientosDe`)
  - `vueltaCorreo(ahora?: Date, enviar?: typeof enviarCorreo): Promise<number>`
  - `arrancarCorreo(): void`

**Tabla:**
```sql
    -- Correo del planteamiento a Oficina Técnica y Producción al pasar un pedido
    -- de OT (spec 2026-10-14). Una fila por pase, con TODO congelado: los PDF
    -- copiados, asunto, cuerpo y destinatarios. Un reintento manda lo mismo.
    CREATE TABLE IF NOT EXISTS planteamiento_correo (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id   TEXT NOT NULL,
      ficheros    TEXT NOT NULL,   -- JSON [{ nombre, copia }]
      para        TEXT NOT NULL,   -- JSON [direcciones]
      asunto      TEXT,
      cuerpo      TEXT,
      estado      TEXT NOT NULL,
      intentos    INTEGER NOT NULL DEFAULT 0,
      error       TEXT,
      modo        TEXT,
      pasado_por  TEXT,
      creado_at   TEXT NOT NULL,
      proximo_at  TEXT,
      enviado_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_planteamiento_correo ON planteamiento_correo(pedido_id, id);
    CREATE INDEX IF NOT EXISTS idx_planteamiento_correo_cola ON planteamiento_correo(estado, proximo_at);
```
Ojo: nada de comillas invertidas en los comentarios SQL. Van dentro de una plantilla de JS y la rompen.

**Reglas:**
- `prepararCorreo` sin ficheros → fila `sin_planteamiento` con el `aviso` en `error`. Con ficheros → copia TODOS (A4 o no) a `dirCopias()` con nombre único y luego inserta una fila `pendiente`, con `proximo_at = ahora` y `modo = modoCorreo()`.
  - Los PDF que no se puedan copiar se quedan fuera, y se anota cuáles en `error`.
  - Si no se pudo copiar ninguno, la fila va `descartado`.
  - Nunca lanza por un fallo de copia.
- `vueltaCorreo`:
  - no hace nada si el modo es `off`, si `credencialesGraph()` es null (deja un aviso en el log una sola vez) o si ya hay otra vuelta corriendo;
  - por cada pendiente: lee las copias. Si falta alguna, `descartado` con el motivo y sigue con la siguiente;
  - manda con `remitente = CORREO_REMITENTE ?? "coordina@toldosgomez.com"` y `responderA = CORREO_RESPONDER_A ?? "of.tecnica@toldosgomez.com"`;
  - si sale bien: `enviado`, `enviado_at`, y borra las copias (sin que un fallo al borrar afecte al envío);
  - si falla con `ErrorGraph.reintentable === false`: `descartado` con el mensaje y sigue;
  - si es reintentable: suma un intento, `proximo_at = ahora + esperaTras(intentos)` y PARA la vuelta.
- `destinatariosCorreo("activo")` = `CORREO_PARA` partido por comas, o `["of.tecnica@toldosgomez.com", "produccion@toldosgomez.com"]`. `"ensayo"` = `CORREO_ENSAYO_PARA` o `["ivan.sanchez@toldosgomez.com"]`. `"off"` = `[]`.
- Trabajador cada 30 s con guarda `globalThis.__coordinaCorreo`, igual que `impresion-worker.ts`. Arranca en `instrumentation.ts` junto al de impresión.

- [ ] **Step 1: Failing tests** (`src/lib/__tests__/correo-cola.test.ts`, montaje como `impresion-cola.test.ts`):

```ts
// casos:
// 1. modoCorreo() es "off" sin variable; destinatarios de ensayo y activo por defecto.
// 2. prepararCorreo con 2 PDF (uno no A4) → 1 fila pendiente con los 2 ficheros, asunto y para del modo actual.
// 3. prepararCorreo sin ficheros → fila sin_planteamiento con el aviso.
// 4. prepararCorreo con una ruta inexistente y otra buena → pendiente con la buena y error anotado; con todas malas → descartado; nunca lanza.
// 5. vueltaCorreo envía (enviar falso): Correo con de/para/responderA/asunto/texto y adjuntos con sus bytes; la fila pasa a enviado y las copias se borran.
// 6. ErrorGraph no reintentable → descartado y la vuelta sigue con la siguiente fila.
// 7. ErrorGraph reintentable → intentos=1, sigue pendiente; no reintenta antes de esperaTras(1) y sí después.
// 8. Sin credenciales (GRAPH_* sin poner) → vueltaCorreo no llama a enviar.
// 9. reenviarUltimo crea otra fila pendiente con el mismo asunto y ficheros.
```
Escribe cada caso entero con `expect`s concretos, siguiendo el estilo de `impresion-cola.test.ts`. Para los PDF de prueba vale cualquier fichero existente, igual que allí. Pon `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` y `GRAPH_CLIENT_SECRET` falsos en `beforeEach`, salvo en el caso 8.

Run: `pnpm test src/lib/__tests__/correo-cola.test.ts` → FAIL.

- [ ] **Step 2: Implement** `correo-cola.ts` y `correo-worker.ts` según las reglas de arriba; la tabla, el arranque y `.env.example`:

```dotenv
# ── Correo del planteamiento ────────────────────────────────────────────────
# Al pasar un pedido de OT, se manda el planteamiento por correo desde
# coordina@ (Microsoft 365, aplicación «Coordina» de Entra ID).
#   · off    → no manda nada (por defecto).
#   · ensayo → solo a CORREO_ENSAYO_PARA (Iván), para probar.
#   · activo → a Oficina Técnica y Producción.
CORREO_PLANTEAMIENTO=off
GRAPH_TENANT_ID=e14fdfc8-6713-46da-b5d3-ac73653cfca9
GRAPH_CLIENT_ID=33563a1d-357d-41ca-8f7d-3f81dee4941c
# OJO: el secreto SOLO en el .env del servidor; caduca hacia el 13/10/2027.
GRAPH_CLIENT_SECRET=
CORREO_REMITENTE=coordina@toldosgomez.com
CORREO_PARA=of.tecnica@toldosgomez.com,produccion@toldosgomez.com
CORREO_RESPONDER_A=of.tecnica@toldosgomez.com
CORREO_ENSAYO_PARA=ivan.sanchez@toldosgomez.com
```

Run: `pnpm test src/lib/__tests__/correo-cola.test.ts` → PASS. Después, la suite completa, `tsc` y `lint`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/estado-db.ts src/lib/server/correo-cola.ts src/lib/server/correo-worker.ts src/instrumentation.ts .env.example src/lib/__tests__/correo-cola.test.ts
git commit -m "feat(correo): cola del correo del planteamiento y su trabajador"
```

---

### Task 4: Mandarlo al pasar, y las rutas

**Files:**
- Modify: `src/app/api/estado/route.ts` (bloque final donde se lanza `prepararImpresion`)
- Modify: `src/app/api/planteamiento/route.ts`
- Create: `src/app/api/planteamiento/reenviar/route.ts`
- Modify: `src/lib/__tests__/api-estado.test.ts`, `src/lib/__tests__/api-planteamiento.test.ts`

**Interfaces:**
- Consumes: `prepararCorreo`, `modoCorreo`, `leerCorreosDe`, `reenviarUltimo` (Task 3); `DatosCorreo` (Task 2); `planteamientosDe`; `leerPersona` (`src/lib/server/personas-db.ts`).
- Produces:
  - body de `/api/estado`: `mandarCorreo?: boolean` (ausente = sí);
  - `GET /api/planteamiento` añade `correo: { modo: ModoCorreo; envios: FilaCorreo[] }`;
  - `POST /api/planteamiento/reenviar` con `{ pedido, operarioId }` → `{ ok: true }`, 404 si no hay nada que reenviar, 409 en `off`.

**`/api/estado`:**
- Guarda también los datos para el correo cuando se lee el pedido (donde ya se pone `codigoPedido = pedido.codigo`):

```ts
    datosCorreo = {
      pedido: pedido.codigo,
      cliente: pedido.cliente,
      ofs: pedido.ofs.filter((of) => of.estado !== "anulada" && !of.ajenaOT).map((of) => of.codigo),
      entrega: pedido.fechaEntrega || null,
      minutosPlanteo: pedido.ofs.filter((of) => !of.ajenaOT).reduce((n, of) => n + of.tiempoPlanteoMin, 0),
      pasadoPor: leerPersona(operarioId)?.nombre ?? operarioId,
    };
```

- La búsqueda del PDF se hace UNA vez para las dos cosas:

```ts
    if (seccion === "ot" && codigoPedido && esCodigoPedido(codigoPedido)) {
      const codigo = codigoPedido;
      // Una sola búsqueda para imprimir y para el correo: es contra una carpeta
      // de red y no hace falta hacerla dos veces.
      let busqueda: Promise<Planteamientos> | null = null;
      const buscar = () => (busqueda ??= planteamientosDe(codigo));
      if (body.imprimirPlanteamiento !== false && modoImpresion() !== "off") {
        void prepararImpresion(codigo, operarioId, undefined, buscar).catch((e) =>
          console.error(`[impresion] no se pudo preparar ${codigo}:`, (e as Error).message));
      }
      if (body.mandarCorreo !== false && modoCorreo() !== "off" && datosCorreo) {
        const d = datosCorreo;
        void prepararCorreo(d, operarioId, undefined, buscar).catch((e) =>
          console.error(`[correo] no se pudo preparar ${codigo}:`, (e as Error).message));
      }
    }
```

  Comprueba la firma real del parámetro `buscar` de `prepararImpresion`, que recibe el código. Adapta el envoltorio para que las dos funciones compartan la misma promesa.
- Tests en `api-estado.test.ts`, mockeando `../server/correo-cola`:
  - pase de OT → `prepararCorreo` llamado con `pedido`, `cliente`, `ofs`, `pasadoPor`;
  - `mandarCorreo: false` → no se llama;
  - Diseño → no se llama, comprobando que el pase da 200;
  - si `prepararCorreo` falla, el pase da 200 igual;
  - modo `off` → no se llama.

**`GET /api/planteamiento`:** añade `correo: { modo: modoCorreo(), envios: leerCorreosDe(pedido) }`, envuelto en try/catch: si falla, `envios: []`.

**`POST /api/planteamiento/reenviar`:** como `reimprimir/route.ts` (identidad `tecnico`, 409 en `off`). `reenviarUltimo` devuelve `false` → 404 «No hay correo que reenviar».

- [ ] Steps: tests que fallan → implementación → suite completa, `tsc` y `lint` → commit:

```bash
git commit -m "feat(correo): al pasar un pedido de OT se manda el correo del planteamiento; reenviar"
```

---

### Task 5: Pantalla, comprobación y novedad

**Files:**
- Modify: `src/lib/planteamiento-textos.ts` (+ test `src/lib/__tests__/planteamiento-textos.test.ts`)
- Modify: `src/components/Board.tsx` (diálogo de pasar: segunda casilla)
- Modify: `src/components/PlanteamientoPedido.tsx` (estado del correo + «Reenviar»)
- Create: `scripts/verificar-correo.test.ts`

**Interfaces:**
- Consumes: `VistaPlanteamiento` amplía su tipo con `correo?: { modo: ModoCorreo; envios: FilaCorreo[] }`, opcional para no romper nada.
- Produces:
  - `textoCorreoAntesDePasar(d: VistaPlanteamiento): string | null`
  - `textoCorreo(f: FilaCorreo): string`

**Textos** (con su test):

| Caso | Texto |
|---|---|
| Antes de pasar, `activo` con ficheros | «Se mandará por correo a Oficina Técnica y Producción» |
| Antes de pasar, `ensayo` | «Se mandará por correo solo a ti (prueba)» |
| Antes de pasar, sin ficheros | null (ya lo dice la línea de impresión) |
| Antes de pasar, `off` | null |
| Historial, `enviado` | «Correo enviado el 13/10 a las 13:05 a of.tecnica@…, produccion@…» (direcciones de `para`; en ensayo, «(prueba)» al final) |
| Historial, `pendiente` | «Correo pendiente: {error} ({n} intentos)», o «Correo pendiente» sin error |
| Historial, `sin_planteamiento` | «Sin correo: no había planteamiento» |
| Historial, `descartado` | «Correo no enviado: {error}» |

**Board:**
- Estado `mandarCorreoAlPasar`, `true` al abrir el diálogo.
- Si `textoCorreoAntesDePasar` no es null: su línea y la casilla «Mandar por correo», debajo de las de impresión.
- `completarPedidoAhora` pasa `mandarCorreo` en el `persistir` de `completar`, igual que `imprimirPlanteamiento`.

**PlanteamientoPedido:**
- Las 3 últimas líneas de `correo.envios` con `textoCorreo`.
- Botón «Reenviar» si hay algún envío con PDF y no es solo lectura (`useSoloLectura()`), contra `/api/planteamiento/reenviar`.

**`scripts/verificar-correo.test.ts`** (opt-in, `ENVIAR_CORREO_PRUEBA=direccion@…`): manda un correo de prueba con `enviarCorreo` y un PDF pequeño, usando `credencialesGraph()`. Sin la variable, se salta. **No lo ejecutes.**

- [ ] Steps: tests de textos que fallan → implementación → UI → suite completa, `tsc` y `lint` → commit final con novedad:

```bash
git commit -F - <<'EOF'
feat(correo): el diálogo de pasar y el Historial cuentan el correo del planteamiento

Novedad: nuevo | Al pasar un pedido a Producción se manda solo el correo del planteamiento
Detalle: Llega a Oficina Técnica y a Producción con el PDF adjunto y los datos del pedido. Ya no hace falta mandarlo a mano.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
