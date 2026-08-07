import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AvisoMovimiento } from "../avisos";

let dir: string;
let route: typeof import("../../app/api/avisos/route");
let estadoDb: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-avisos-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/avisos/route");
  estadoDb = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const of = (ofId: string, autorId: string | null) => ({
  ofId,
  autorId,
  revisorId: null,
  estado: "en_curso" as const,
  observacion: null,
});

async function avisosDe(operarioId: string): Promise<AvisoMovimiento[]> {
  const res = await route.GET(new Request(`http://x/api/avisos?operarioId=${operarioId}`));
  const data = (await res.json()) as { avisos: AvisoMovimiento[] };
  return data.avisos;
}

test("GET devuelve los movimientos que le tocan y POST los apaga", async () => {
  estadoDb.guardarMutacion({ operarioId: "ivan", motivo: "asignar", cambiosOF: [of("of-a", "ivan")] });
  estadoDb.guardarMutacion({
    operarioId: "ivan",
    motivo: "traspaso",
    cambiosOF: [of("of-a", "tamara")],
  });

  const avisos = await avisosDe("tamara");
  expect(avisos).toHaveLength(1);
  expect(avisos[0]).toMatchObject({ tipo: "recibida", ofId: "of-a", quien: "ivan" });

  const ack = await route.POST(
    new Request("http://x/api/avisos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: "tamara", claves: [avisos[0].clave] }),
    }),
  );
  expect(ack.status).toBe(200);
  expect(await avisosDe("tamara")).toHaveLength(0);
});

test("GET sin operarioId responde 400", async () => {
  const res = await route.GET(new Request("http://x/api/avisos"));
  expect(res.status).toBe(400);
});

test("POST con claves que no son cadenas responde 400", async () => {
  const res = await route.POST(
    new Request("http://x/api/avisos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: "tamara", claves: [7] }),
    }),
  );
  expect(res.status).toBe(400);
});
