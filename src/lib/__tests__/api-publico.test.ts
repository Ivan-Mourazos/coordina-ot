import { beforeAll, expect, test } from "vitest";
import { detallePublico } from "../publico";
import type { HistorialPedidoDetalle } from "../historial";

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

test("la lista de pendientes contesta sin sesión", async () => {
  const res = await getLista("lista=pendientes");
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.pedidos)).toBe(true);
});

test("no se escapa NADA interno en la lista", async () => {
  const res = await getLista("lista=pendientes");
  const crudo = JSON.stringify(await res.json()).toLowerCase();
  for (const prohibido of ["nota", "causa", "devolucion", "devolución", "marca", "observacion"]) {
    expect(crudo).not.toContain(prohibido);
  }
});

test("una lista que no existe cae en pendientes, no revienta", async () => {
  const res = await getLista("lista=loquesea&page=-3");
  expect(res.status).toBe(200);
});

// ─── GET /api/publico/pedidos/[pedido] (el detalle) ──────────────────────────

test("el detalle de un pedido responde 200 con lo básico", async () => {
  const res = await getDetalle("AR.26.03453");
  expect(res.status).toBe(200);
  const data = (await res.json()) as { codigo: string; ofs: unknown[]; scanUrl: string; documentos: unknown[] };
  expect(data.codigo).toBe("AR.26.03453");
  expect(Array.isArray(data.ofs)).toBe(true);
  // El PDF sí está aprobado para el invitado, pero por una ruta pública: la
  // interna (/api/pedidos/...) pasa a exigir sesión en la Task 5 (ver
  // scanUrlPublica en lib/publico.ts).
  expect(data.scanUrl).toBe("/api/publico/pedidos/AR.26.03453/pdf");
  expect(Array.isArray(data.documentos)).toBe(true);
});

test("el detalle rechaza un código de pedido que no lo es", async () => {
  const res = await getDetalle("xxx");
  expect(res.status).toBe(400);
});

test("el detalle no trae ni cabecera interna ni marcas de revisión por OF", async () => {
  // AR.26.05501 trae, en el mock, una OF "en_revision" con autor y revisor:
  // si algo de eso se colara, sería aquí.
  const res = await getDetalle("AR.26.05501");
  const crudo = JSON.stringify(await res.json());
  // Cabecera: comentarioVenta, prioridad y estadoActual no están en la lista
  // blanca (PUBLICOS) y no pueden aparecer como CLAVE de la respuesta.
  const claves = Object.keys(await (await getDetalle("AR.26.05501")).json());
  expect(claves).not.toContain("comentarioVenta");
  expect(claves).not.toContain("prioridad");
  expect(claves).not.toContain("estadoActual");
  // Por OF: ni el rol (planteo/revisión), ni quién consta como autor o
  // revisor registrado. Es la marca de revisión que el brief prohíbe.
  expect(crudo).not.toMatch(/"rol"\s*:/);
  expect(crudo).not.toContain("autorRegistrado");
  expect(crudo).not.toContain("revisorRegistrado");
});

// ─── detallePublico: la función pura que hace el recorte ────────────────────
// Se prueba también aparte y con un objeto fabricado a mano: el mock de
// desarrollo no genera ni `notasProduccion` ni `materiales` en ninguna OF (esos
// campos solo los pone RPS), así que sin este test la lista blanca de `ofs`
// nunca se ejercitaría de verdad.

function detalleDeEjemplo(): HistorialPedidoDetalle {
  return {
    estadoActual: "En curso",
    codigo: "AR.26.09999",
    cliente: "Cliente de prueba",
    negocio: "Negocio",
    ciudadEntrega: "Arzúa",
    prioridad: 2,
    fechaSolicitud: "2026-01-01",
    fechaFinalizacion: null,
    piezas: 3,
    familias: ["TOLDO NUEVO"],
    comentarioVenta: "Entre nosotros: cliente pesado, avisar a ventas",
    scanUrl: "/api/pedidos/AR.26.09999.pdf",
    ofs: [
      {
        codigo: "0230001",
        descripcion: "Toldo cofre",
        tiempoImputadoMin: 120,
        quien: ["Juan Pérez"],
        centro: "ot",
        personas: [{ nombre: "Juan Pérez", min: 120 }],
        tareas: [{ codigo: "010", descripcion: "Plantear", tiempoImputadoMin: 120, personas: [] }],
        autorRegistrado: "Juan Pérez",
        revisorRegistrado: "Jaime López",
        rol: { planteoMin: 100, revisionMin: 20, planteo: [], revision: [] },
        materiales: [{ texto: "LONA ACRÍLICA · 5", apartado: true }],
        notasProduccion: "BELEN AB - se devolvió por medidas mal tomadas",
      },
    ],
    documentos: [
      {
        descripcion: "Planteamiento",
        archivo: "plan.pdf",
        clase: "Planteamiento",
        url: "/api/historial/AR.26.09999/documento/0",
      },
      { descripcion: "Sin fichero", archivo: "x.msg", clase: "Documento", url: null },
    ],
  };
}

test("detallePublico quita la cabecera interna", () => {
  const publico = detallePublico(detalleDeEjemplo());
  expect(publico).not.toHaveProperty("estadoActual");
  expect(publico).not.toHaveProperty("prioridad");
  expect(publico).not.toHaveProperty("comentarioVenta");
  expect(publico.codigo).toBe("AR.26.09999");
});

test("detallePublico quita las notas y las marcas de revisión de cada OF", () => {
  const publico = detallePublico(detalleDeEjemplo());
  const of = publico.ofs[0] as Record<string, unknown>;
  expect(of).not.toHaveProperty("notasProduccion");
  expect(of).not.toHaveProperty("materiales");
  expect(of).not.toHaveProperty("autorRegistrado");
  expect(of).not.toHaveProperty("revisorRegistrado");
  expect(of).not.toHaveProperty("rol");
  // Lo autorizado sigue ahí.
  expect(of.codigo).toBe("0230001");
  expect(of.tiempoImputadoMin).toBe(120);
  expect(of.quien).toEqual(["Juan Pérez"]);
  expect(of.personas).toEqual([{ nombre: "Juan Pérez", min: 120 }]);
  expect(of.tareas).toHaveLength(1);
});

test("detallePublico reescribe la URL de los documentos a la ruta pública", () => {
  const publico = detallePublico(detalleDeEjemplo());
  expect(publico.documentos[0].url).toBe("/api/publico/pedidos/AR.26.09999/documento/0");
  // Sin URL (no hay fichero que abrir) se queda en null, no se inventa nada.
  expect(publico.documentos[1].url).toBeNull();
});

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
