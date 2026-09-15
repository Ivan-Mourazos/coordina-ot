import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let route: typeof import("../../app/api/fichaje/route");
let avisoVisto: typeof import("../../app/api/fichaje/aviso-visto/route");
let fichajeDb: typeof import("../server/fichaje-db");
let estadoDb: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-api-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  route = await import("../../app/api/fichaje/route");
  avisoVisto = await import("../../app/api/fichaje/aviso-visto/route");
  fichajeDb = await import("../server/fichaje-db");
  estadoDb = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows: better-sqlite3 mantiene el handle del fichero WAL abierto
    // (conexión global cacheada a propósito para reuso en HMR), así que
    // borrar el directorio temporal puede dar EPERM aquí. Limpieza best
    // effort: el SO recicla el temp dir igualmente; no afecta a las aserciones.
  }
});

function post(body: unknown): Request {
  return new Request("http://x/api/fichaje", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Los operarioId ya no pueden ser inventados ("op-1", "op-2"…): identidad()
// exige apagado una persona ACTIVA de verdad (ver src/lib/server/sesion.ts),
// así que se usan ids reales de la siembra de /lib/server/estado-db.ts. Cada
// test usa uno distinto para no compartir fichaje entre ellos.

test("POST abre un intervalo y lo devuelve", async () => {
  const res = await route.POST(post({ operarioId: "alberto", ofIds: ["OF-1"], rol: "plantear" }));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { fichaje: { intervalos: unknown[] } };
  expect(data.fichaje.intervalos).toHaveLength(1);
});

test("POST con ofIds vacío pausa (cierra el intervalo abierto)", async () => {
  await route.POST(post({ operarioId: "jaime", ofIds: ["OF-1"], rol: "plantear" }));
  const res = await route.POST(post({ operarioId: "jaime", ofIds: [] }));
  const data = (await res.json()) as { fichaje: { intervalos: { fin: string | null }[] } };
  expect(data.fichaje.intervalos.every((i) => i.fin !== null)).toBe(true);
});

test("GET devuelve el fichaje del operario", async () => {
  await route.POST(post({ operarioId: "tamara", ofIds: ["OF-7"], rol: "revisar" }));
  const res = await route.GET(new Request("http://x/api/fichaje?operarioId=tamara"));
  const data = (await res.json()) as { fichaje: { intervalos: { ofIds: string[] }[] } };
  expect(data.fichaje.intervalos[0].ofIds).toEqual(["OF-7"]);
});

test("GET sin aviso pendiente devuelve avisoCierre: null", async () => {
  const res = await route.GET(new Request("http://x/api/fichaje?operarioId=adrian"));
  const data = (await res.json()) as { avisoCierre: unknown };
  expect(data.avisoCierre).toBeNull();
});

test("GET repite el aviso de cierre hasta que el cliente acusa recibo", async () => {
  fichajeDb.registrarAvisoCierre("ivan", ["OF-9"], "2026-08-04T18:05:00.000Z");
  const pedir = () => route.GET(new Request("http://x/api/fichaje?operarioId=ivan"));
  const esperado = { ofIds: ["OF-9"], fin: "2026-08-04T18:05:00.000Z" };

  const data1 = (await (await pedir()).json()) as { avisoCierre: unknown };
  expect(data1.avisoCierre).toEqual(esperado);
  // Recargar la página no lo hace desaparecer: leerlo no lo consume.
  const data2 = (await (await pedir()).json()) as { avisoCierre: unknown };
  expect(data2.avisoCierre).toEqual(esperado);

  const ack = await avisoVisto.POST(
    new Request("http://x/api/fichaje/aviso-visto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: "ivan" }),
    }),
  );
  expect(ack.status).toBe(200);

  const data3 = (await (await pedir()).json()) as { avisoCierre: unknown };
  expect(data3.avisoCierre).toBeNull();
});

test("aviso-visto sin operarioId responde 400", async () => {
  const res = await avisoVisto.POST(
    new Request("http://x/api/fichaje/aviso-visto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  expect(res.status).toBe(400);
});

test("POST sin operarioId responde 400", async () => {
  const res = await route.POST(post({ ofIds: [], rol: "plantear" }));
  expect(res.status).toBe(400);
});

test("POST con rol inválido y ofIds no vacío responde 400", async () => {
  const res = await route.POST(post({ operarioId: "angel", ofIds: ["OF-1"], rol: "xxx" }));
  expect(res.status).toBe(400);
});

// Fallo I-A (revisión Task 6): el candado en memoria de cierre-of-en-curso.ts
// solo dura los segundos que tarda "Dar por terminada en RPS"; la marca
// guardada en el overlay es para siempre, y es la que hace falta cuando el
// navegador de quien estaba fichando esa OF no se ha enterado todavía del
// cierre (lo hizo otra persona, en otro equipo) y reenvía la OF cerrada como
// si siguiera abierta.
test("Fallo I-A: no se puede fichar en una OF cerrada en RPS aunque el candado del cierre ya se soltara", async () => {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{
      ofId: "0232300:9", autorId: "alberto", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T10:00:00.000Z", por: "ivan", modo: "activo" },
    }],
  });
  const res = await route.POST(post({ operarioId: "adrian", ofIds: ["0232300:9"], rol: "plantear" }));
  expect(res.status).toBe(409);
  const data = (await res.json()) as { error: string };
  expect(data.error).toContain("0232300");

  // No se ha abierto ningún intervalo: el rechazo es entero, no un fichaje a
  // medias.
  const g = await route.GET(new Request("http://x/api/fichaje?operarioId=adrian"));
  const gd = (await g.json()) as { fichaje: { intervalos: unknown[] } };
  expect(gd.fichaje.intervalos).toHaveLength(0);
});

test("Fallo I-A: reenviar una OF cerrada junto a otras abiertas no tumba el fichaje del resto", async () => {
  estadoDb.guardarMutacion({
    operarioId: "ivan", motivo: "cerrar_en_rps", seccion: "ot",
    cambiosOF: [{
      ofId: "0232301:9", autorId: "tamara", revisorId: null, estado: "aprobada", observacion: null,
      cerradaRps: { at: "2026-09-15T10:05:00.000Z", por: "ivan", modo: "activo" },
    }],
  });
  // El escenario del revisor: quien la tenía fichando todavía cree que la
  // tiene abierta y, al pulsar fichar en otra OF, `ficharOFs` (Board.tsx)
  // reenvía las dos juntas.
  const res = await route.POST(post({ operarioId: "angel", ofIds: ["0232301:9", "OF-2"], rol: "plantear" }));
  expect(res.status).toBe(200);
  const data = (await res.json()) as { fichaje: { intervalos: { ofIds: string[] }[] } };
  expect(data.fichaje.intervalos).toHaveLength(1);
  // La cerrada se descarta; el resto de la lista sigue fichándose sin ella.
  expect(data.fichaje.intervalos[0].ofIds).toEqual(["OF-2"]);
});

test("POST con body JSON no-objeto (null) responde 400, no 500", async () => {
  const req = new Request("http://x/api/fichaje", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "null",
  });
  const res = await route.POST(req);
  expect(res.status).toBe(400);
});
