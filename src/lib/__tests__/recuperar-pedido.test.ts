import { afterEach, beforeEach, expect, test, vi } from "vitest";
import sql from "mssql";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const query = vi.fn();
const input = vi.fn().mockReturnThis();
const request = vi.fn(() => ({ input, query }));
const getPool = vi.fn(async () => ({ request }));
vi.mock("../server/db", () => ({ getPool: () => getPool() }));

let rps: typeof import("../server/rps");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  rps = await import("../server/rps");
});
afterEach(() => vi.resetModules());

test("el parámetro del pedido va tipado VarChar(25)", async () => {
  query.mockResolvedValue({ recordset: [] });
  await rps.fasesDeSeccionDelPedido("AR.26.04351", rps.SECCIONES.ot);
  // El brief pedía `{ type: 2 }`, pero mssql no representa VarChar como un
  // entero: `sql.VarChar(25)` es `{ type: sql.VarChar, length: 25 }`. Se
  // compara con la forma real, igual que en historial-db-gastado.test.ts.
  expect(input).toHaveBeenCalledWith("pedido", expect.objectContaining({ type: sql.VarChar, length: 25 }), "AR.26.04351");
});

test("deduce fichable de PermiteImputaciones, y descarta filas sin OF o fase", async () => {
  query.mockResolvedValue({
    recordset: [
      { orden: "0232086 ", fase: " 9 ", descripcion: "FINALIZAR", SitOF: "LANZADA", PermiteImputaciones: null },
      { orden: "0232087", fase: "3", descripcion: "FINALIZADA", SitOF: "FINALIZADA", PermiteImputaciones: false },
      { orden: null, fase: "9", descripcion: "sin orden", SitOF: null, PermiteImputaciones: null },
    ],
  });
  const r = await rps.fasesDeSeccionDelPedido("AR.26.04351", rps.SECCIONES.ot);
  expect(r).toEqual([
    { of: "0232086", fase: "9", descripcion: "FINALIZAR", fichable: true },
    { of: "0232087", fase: "3", descripcion: "FINALIZADA", fichable: false },
  ]);
});

// ── ofsARecuperar ──
// Comparten BD temporal y mock de `query`: dentro de un fichero vitest ya los
// corre en serie, así que van como `test` normales y en este orden.
let dir: string;
let estadoDb: typeof import("../server/estado-db");
let recuperar: typeof import("../server/recuperar-pedido");

test("setup de BD temporal para ofsARecuperar", async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-recuperar-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estadoDb = await import("../server/estado-db");
});

test("con of_ids guardados, se usan esos y su orden, con los datos de RPS", async () => {
  estadoDb.guardarMutacion({
    operarioId: "tamara", motivo: "completar", completarPedidoId: "AR.26.04351",
    seccion: "ot", ofIdsPedido: ["0232086:9", "0232087:9"],
  });
  query.mockResolvedValue({ recordset: [
    { orden: "0232086", fase: "9", descripcion: "Toldo cofre", SitOF: "LANZADA", PermiteImputaciones: true },
    { orden: "0232087", fase: "9", descripcion: "Pérgola", SitOF: "FINALIZADA", PermiteImputaciones: false },
    // De la sección pero NO en la lista del último paso (p. ej. anulada): no vuelve.
    { orden: "0232088", fase: "9", descripcion: "Anulada", SitOF: "LANZADA", PermiteImputaciones: true },
  ] });
  recuperar = await import("../server/recuperar-pedido");
  const r = await recuperar.ofsARecuperar("AR.26.04351", "ot");
  expect(r).toEqual([
    { ofId: "0232086:9", codigo: "0232086", descripcion: "Toldo cofre", autorId: null, fichable: true },
    { ofId: "0232087:9", codigo: "0232087", descripcion: "Pérgola", autorId: null, fichable: false },
  ]);
});

test("sin of_ids guardados, salen las que traiga RPS para el pedido", async () => {
  query.mockResolvedValue({ recordset: [
    { orden: "0232200", fase: "2", descripcion: "Muestra", SitOF: "LANZADA", PermiteImputaciones: true },
  ] });
  const r = await recuperar.ofsARecuperar("AR.26.09999", "ot");
  expect(r).toEqual([{ ofId: "0232200:2", codigo: "0232200", descripcion: "Muestra", autorId: null, fichable: true }]);
});

test("el autor sale del overlay cuando hay fila", async () => {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "asignar",
    cambiosOF: [{ ofId: "0232086:9", autorId: "ivan", revisorId: null, estado: "aprobada", observacion: null }],
  });
  query.mockResolvedValue({ recordset: [
    { orden: "0232086", fase: "9", descripcion: "Toldo cofre", SitOF: "LANZADA", PermiteImputaciones: true },
  ] });
  const r = await recuperar.ofsARecuperar("AR.26.04351", "ot");
  expect(r.find((o) => o.ofId === "0232086:9")?.autorId).toBe("ivan");
});

test("limpieza", () => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows/WAL: best effort */ }
});
