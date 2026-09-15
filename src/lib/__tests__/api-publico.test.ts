import { beforeAll, expect, test } from "vitest";

// ─── Las rutas del invitado: sin sesión, con RPS apagado ─────────────────────
// DATASOURCE se fija ANTES de importar las rutas: son ellas las que arrastran
// la conexión a RPS (vía historial-db.ts / publico-db.ts), y si el mock no
// está puesto desde el principio, el primer import intenta abrir un pool real.
process.env.DATASOURCE = "mock";

let pedidos: typeof import("../../app/api/publico/pedidos/route");
let detalle: typeof import("../../app/api/publico/pedidos/[pedido]/route");
let documento: typeof import("../../app/api/publico/pedidos/[pedido]/documento/[indice]/route");
let visitas: typeof import("../../app/api/publico/visitas/route");

beforeAll(async () => {
  pedidos = await import("../../app/api/publico/pedidos/route");
  detalle = await import("../../app/api/publico/pedidos/[pedido]/route");
  documento = await import("../../app/api/publico/pedidos/[pedido]/documento/[indice]/route");
  visitas = await import("../../app/api/publico/visitas/route");
});

const getLista = (qs: string) =>
  pedidos.GET(new Request(`http://x/api/publico/pedidos?${qs}`));

const getDetalle = (codigo: string) =>
  detalle.GET(new Request(`http://x/api/publico/pedidos/${codigo}`), {
    params: Promise.resolve({ pedido: codigo }),
  });

const getDocumento = (codigo: string, indice: string) =>
  documento.GET(new Request("http://x/"), {
    params: Promise.resolve({ pedido: codigo, indice }),
  });

// ─── GET /api/publico/pedidos (la lista) ─────────────────────────────────────

test("la lista contesta sin sesión, con el estado con que filtró", async () => {
  const res = await getLista("estado=proximas");
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.pedidos)).toBe(true);
  expect(json.estado).toBe("proximas");
});

test("buscar sin elegir estado busca en todos", async () => {
  const json = await (await getLista("q=AR")).json();
  expect(json.estado).toBe("todos");
});

test("no se escapa NADA interno en la lista", async () => {
  const res = await getLista("estado=todos");
  const crudo = JSON.stringify(await res.json()).toLowerCase();
  for (const prohibido of ["nota", "causa", "devolucion", "devolución", "marca", "observacion", "comentario"]) {
    expect(crudo).not.toContain(prohibido);
  }
});

test("un estado que no existe cae en próximas entregas, no revienta", async () => {
  const res = await getLista("estado=loquesea&page=-3");
  expect(res.status).toBe(200);
});

// ─── GET /api/publico/pedidos/[pedido] (el detalle) ──────────────────────────

test("el detalle de un pedido responde 200 con lo básico", async () => {
  const res = await getDetalle("AR.26.03453");
  expect(res.status).toBe(200);
  const data = (await res.json()) as { codigo: string; ofs: unknown[]; documentos: unknown[] };
  expect(data.codigo).toBe("AR.26.03453");
  expect(Array.isArray(data.ofs)).toBe(true);
  expect(Array.isArray(data.documentos)).toBe(true);
});

test("el detalle ya no lleva scanUrl: el PDF del pedido sale entre los documentos de RPS, no en un botón aparte", async () => {
  const res = await getDetalle("AR.26.03453");
  const claves = Object.keys(await res.json());
  expect(claves).not.toContain("scanUrl");
});

test("el detalle rechaza un código de pedido que no lo es", async () => {
  const res = await getDetalle("xxx");
  expect(res.status).toBe(400);
});

test("el detalle no trae cabecera interna ni notas, y sí dónde está", async () => {
  // AR.26.05501 trae, en el mock, una OF "en_revision" con autor y revisor.
  const data = (await (await getDetalle("AR.26.05501")).json()) as Record<string, unknown>;
  for (const clave of ["comentarioVenta", "prioridad", "estadoActual", "scanUrl", "fechaFinalizacion"]) {
    expect(data).not.toHaveProperty(clave);
  }
  expect(JSON.stringify(data)).not.toContain("notasProduccion");
  // Lo que SÍ vuelve en esta versión: la situación del pedido y por dónde va.
  expect(Array.isArray(data.donde)).toBe(true);
  expect(data).toHaveProperty("situacion");
});

// La lista blanca del detalle (`detalleConsulta`) se prueba aparte, con un
// objeto fabricado a mano: ver publico-detalle.test.ts.

// ─── GET /api/publico/pedidos/[pedido]/documento/[indice] ───────────────────

test("el documento público rechaza el código de pedido que no lo es", async () => {
  const res = await getDocumento("xxx", "0");
  expect(res.status).toBe(400);
});

test("el documento público da 404 en mock (no hay share que consultar)", async () => {
  const res = await getDocumento("AR.26.03453", "0");
  expect(res.status).toBe(404);
});

// ─── GET /api/publico/visitas ────────────────────────────────────────────────

test("las visitas contestan sin sesión", async () => {
  const res = await visitas.GET(new Request("http://x/api/publico/visitas?ambito=pendientes&page=0"));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { visitas: unknown[]; hasMore: boolean };
  expect(Array.isArray(data.visitas)).toBe(true);
  expect(typeof data.hasMore).toBe("boolean");
});
