import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let dir: string;
let db: typeof import("../server/estado-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-estado-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  db = await import("../server/estado-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

test("el log guarda el estado PREVIO, no solo el nuevo", () => {
  const of = {
    ofId: "of-p1",
    autorId: "ivan",
    revisorId: null,
    estado: "en_curso" as const,
    observacion: null,
  };
  db.guardarMutacion({ operarioId: "ivan", motivo: "asignar", cambiosOF: [of] });
  db.guardarMutacion({
    operarioId: "ivan",
    motivo: "traspaso",
    cambiosOF: [{ ...of, autorId: "tamara" }],
  });

  const filas = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  const traspaso = filas.find((f) => f.motivo === "traspaso")!;
  // Sin el previo no se puede decir "antes Iván": el cliente solo manda el
  // snapshot nuevo, así que el anterior lo tiene que leer el servidor.
  expect(traspaso.previos).toEqual([expect.objectContaining({ ofId: "of-p1", autorId: "ivan" })]);
  expect(traspaso.cambiosOF).toEqual([expect.objectContaining({ autorId: "tamara" })]);
});

test("una OF que sale por primera vez de la bandeja no tiene previo: se descarta, no se inventa", () => {
  // Esta es la mitad de la regla que el test de arriba no cubre: si alguien
  // cambiase el .filter de guardarMutacion por un valor por defecto, este es
  // el único test que lo detectaría. Sin fila anterior en of_overlay, el
  // aviso de traspaso NO puede decir "antes era de nadie" como si fuera un
  // operario real.
  const of = {
    ofId: "of-nueva-1",
    autorId: "jaime",
    revisorId: null,
    estado: "pendiente" as const,
    observacion: null,
  };
  db.guardarMutacion({ operarioId: "jaime", motivo: "asignar", cambiosOF: [of] });

  const filas = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  const primera = filas.find(
    (f) => f.motivo === "asignar" && f.cambiosOF.some((c) => c.ofId === "of-nueva-1"),
  )!;
  expect(primera.previos).toEqual([]);
});

test("una fila antigua sin `previos` en su JSON se lee como previos: [] en vez de romper", () => {
  // Filas grabadas antes de que guardarMutacion empezara a guardar `previos`
  // no tienen esa clave en el JSON de `detalle`. leerAccionesDesde tiene que
  // seguir sabiendo leerlas.
  const ahora = new Date().toISOString();
  db.getDb()
    .prepare("INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, ?, ?)")
    .run(
      ahora,
      "adrian",
      "asignar-vieja",
      JSON.stringify({
        cambiosOF: [{ ofId: "of-vieja-1", autorId: "adrian", revisorId: null, estado: "pendiente", observacion: null }],
        completarPedidoId: null,
        // sin `previos`
      }),
    );

  const filas = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  const vieja = filas.find((f) => f.motivo === "asignar-vieja")!;
  expect(vieja.previos).toEqual([]);
});

test("una fila con `detalle` = \"null\" (JSON válido) se descarta sin tumbar el resto de la lectura", () => {
  // JSON.parse('null') NO lanza: es JSON sintácticamente válido. El bug es
  // que el try/catch original solo envolvía el JSON.parse, así que el acceso
  // posterior a d.cambiosOF reventaba FUERA del try y tiraba toda la lectura,
  // no solo esta fila.
  const ahora = new Date().toISOString();
  db.getDb()
    .prepare("INSERT INTO acciones_log (ts, operario_id, motivo, detalle) VALUES (?, ?, ?, ?)")
    .run(ahora, "sara", "motivo-corrupto", "null");
  db.guardarMutacion({
    operarioId: "sara",
    motivo: "asignar-tras-corrupta",
    cambiosOF: [
      { ofId: "of-tras-corrupta-1", autorId: "sara", revisorId: null, estado: "pendiente", observacion: null },
    ],
  });

  // No debe lanzar, y la fila corrupta se descarta sin arrastrar a las demás.
  const filas = db.leerAccionesDesde("1970-01-01T00:00:00.000Z");
  expect(filas.some((f) => f.motivo === "motivo-corrupto")).toBe(false);
  expect(filas.some((f) => f.motivo === "asignar-tras-corrupta")).toBe(true);
});

test("lo visto se guarda por operario, no globalmente", () => {
  expect(db.leerAvisosVistos("tamara").size).toBe(0);
  db.marcarAvisosVistos("tamara", ["1:recibida:of-001", "2:cedida:of-002"]);
  db.marcarAvisosVistos("tamara", ["2:cedida:of-002"]); // repetir no duplica ni revienta

  expect([...db.leerAvisosVistos("tamara")].sort()).toEqual([
    "1:recibida:of-001",
    "2:cedida:of-002",
  ]);
  // Que Tamara lo haya visto no lo apaga para Jaime: el mismo movimiento le
  // llega a los dos y cada uno lo ve cuando abre el pedido.
  expect(db.leerAvisosVistos("jaime").size).toBe(0);
});
