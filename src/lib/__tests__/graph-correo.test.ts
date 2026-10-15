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
    expect(cuerpo.message).not.toHaveProperty("ccRecipients");
    expect(cuerpo.message.attachments[0]).toMatchObject({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "AR2605016-10.pdf",
      contentType: "application/pdf",
      contentBytes: "JVBERg==",
    });
  });

  it("manda ccRecipients cuando hay copias y lo omite si la lista está vacía", async () => {
    const { f, llamadas } = fetchFalso([
      { status: 200, json: { access_token: "TOK", expires_in: 3600 } },
      { status: 202 }, { status: 202 },
    ]);
    await g.enviarCorreo({ ...CORREO, cc: ["tamara@toldosgomez.com", "angel@toldosgomez.com"] }, CRED, f, () => 0);
    expect(JSON.parse(String(llamadas[1].init.body)).message.ccRecipients).toEqual([
      { emailAddress: { address: "tamara@toldosgomez.com" } },
      { emailAddress: { address: "angel@toldosgomez.com" } },
    ]);
    await g.enviarCorreo({ ...CORREO, cc: [] }, CRED, f, () => 0);
    expect(JSON.parse(String(llamadas[2].init.body)).message).not.toHaveProperty("ccRecipients");
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

describe("correo en HTML", () => {
  it("si trae html, el cuerpo va como HTML", async () => {
    const { f, llamadas } = fetchFalso([
      { status: 200, json: { access_token: "TOK", expires_in: 3600 } },
      { status: 202 },
    ]);
    await g.enviarCorreo({ ...CORREO, html: "<b>hola</b>" }, CRED, f, () => 0);
    expect(JSON.parse(String(llamadas[1].init.body)).message.body).toEqual({ contentType: "HTML", content: "<b>hola</b>" });
  });
});

describe("aviso de que el secreto caduca", () => {
  it("nada hasta 30 días antes; luego los días que quedan, y 0 o menos si ya caducó", async () => {
    const { avisoCaducidadSecreto } = await import("../server/graph-correo");
    delete process.env.GRAPH_SECRETO_CADUCA;
    expect(avisoCaducidadSecreto(new Date("2027-09-01T10:00:00Z"))).toBeNull();
    expect(avisoCaducidadSecreto(new Date("2027-09-13T10:00:00Z"))).toEqual({ fecha: "2027-10-13", dias: 30 });
    expect(avisoCaducidadSecreto(new Date("2027-10-12T10:00:00Z"))).toEqual({ fecha: "2027-10-13", dias: 1 });
    expect(avisoCaducidadSecreto(new Date("2027-10-14T10:00:00Z"))!.dias).toBeLessThanOrEqual(0);
  });

  it("la fecha del .env manda; si está mal escrita, vale la de por defecto", async () => {
    const { avisoCaducidadSecreto } = await import("../server/graph-correo");
    try {
      process.env.GRAPH_SECRETO_CADUCA = "2028-10-01";
      expect(avisoCaducidadSecreto(new Date("2027-10-12T10:00:00Z"))).toBeNull();
      process.env.GRAPH_SECRETO_CADUCA = "13/10/2027";
      expect(avisoCaducidadSecreto(new Date("2027-10-12T10:00:00Z"))?.fecha).toBe("2027-10-13");
    } finally {
      delete process.env.GRAPH_SECRETO_CADUCA;
    }
  });
});
