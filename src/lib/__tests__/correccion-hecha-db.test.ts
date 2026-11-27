import { beforeAll, expect, test, vi } from "vitest";
import type { CambioOF } from "../server/overlay";

vi.hoisted(() => {
  process.env.COORDINA_DB_PATH = ":memory:";
});

let db: typeof import("../server/estado-db");
beforeAll(async () => {
  db = await import("../server/estado-db");
});

const nota = "[2;p11] ✗ Las medidas — Faltan 3 cm\n✗ Las cotas — Falta la cota";
const of = (estado: CambioOF["estado"], observacion: string | null = null): CambioOF => ({
  ofId: "of-x",
  autorId: "tamara",
  revisorId: "ivan",
  estado,
  observacion,
});

test("quién la devolvió, en qué vuelta va y lo que el autor marca (fase 2)", () => {
  db.guardarMutacion({ operarioId: "tamara", motivo: "terminar_planteo", cambiosOF: [of("por_revisar")] });
  db.guardarMutacion({ operarioId: "ivan", motivo: "devolver", cambiosOF: [of("devuelta", "[1] primera")] });
  db.guardarMutacion({ operarioId: "tamara", motivo: "terminar_planteo", cambiosOF: [of("por_revisar", "[1] primera")] });
  db.guardarMutacion({ operarioId: "angel", motivo: "devolver", cambiosOF: [of("devuelta", nota)] });

  let info = db.leerOverlay().devoluciones?.get("of-x");
  expect(info).toMatchObject({ por: "angel", vuelta: 2, hechas: [] });

  // Solo el autor marca, y no bloquea nada: es información.
  expect(db.guardarCorreccionHecha("of-x", [1], "ivan")).toBe("no_autor");
  expect(db.guardarCorreccionHecha("of-x", [1, 0], "tamara")).toBe("ok");
  info = db.leerOverlay().devoluciones?.get("of-x");
  expect(info?.hechas).toEqual([0, 1]);

  // Sigue mientras se corrige y ya reenviada.
  db.guardarMutacion({ operarioId: "tamara", motivo: "retomar", cambiosOF: [of("en_curso", nota)] });
  expect(db.leerOverlay().devoluciones?.get("of-x")?.hechas).toEqual([0, 1]);

  // Otra devolución, otra nota: lo marcado de la anterior no se le pasa.
  db.guardarMutacion({ operarioId: "ivan", motivo: "devolver", cambiosOF: [of("devuelta", "[3] otra cosa")] });
  info = db.leerOverlay().devoluciones?.get("of-x");
  expect(info).toMatchObject({ por: "ivan", vuelta: 3, hechas: [] });

  // Aprobada: ya no hay corrección que enseñar ni que marcar.
  db.guardarMutacion({ operarioId: "ivan", motivo: "aprobar", cambiosOF: [of("aprobada", "[3] otra cosa")] });
  expect(db.leerOverlay().devoluciones?.has("of-x")).toBe(false);
  expect(db.guardarCorreccionHecha("of-x", [0], "tamara")).toBe("sin_correccion");
});
