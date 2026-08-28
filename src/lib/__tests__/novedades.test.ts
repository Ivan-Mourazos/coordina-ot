import { afterAll, beforeAll, describe, expect, it, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NOVEDADES, cuantasNuevas } from "../novedades";

describe("qué actualizaciones se ha perdido cada uno", () => {
  it("quien vio la última no tiene nada nuevo", () => {
    expect(cuantasNuevas(NOVEDADES[0].id)).toBe(0);
  });

  it("quien no ha visto nada NO recibe aviso", () => {
    // Estrenar la web con un aviso de "novedades" de cosas que nunca ha visto
    // de otra forma es ruido: se da por leído al vuelo y se entera de la
    // siguiente.
    expect(cuantasNuevas(null)).toBe(0);
  });

  it("cuenta TODAS las que se perdió, no solo la última", () => {
    // Quien vuelve de dos semanas fuera tiene que ver que hay varias.
    const id = NOVEDADES[NOVEDADES.length - 1].id;
    expect(cuantasNuevas(id)).toBe(NOVEDADES.length - 1);
  });

  it("un `visto` que ya no existe enseña de más, no de menos", () => {
    // Si se borrara una entrada, es mejor volver a enseñar el log que tragarse
    // el aviso sin que nadie se entere.
    expect(cuantasNuevas("no-existe")).toBe(NOVEDADES.length);
  });

  it("los ids no se repiten: son lo que compara «ya lo he leído»", () => {
    const ids = NOVEDADES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("la fecha de salida", () => {
  let dir: string;
  let db: typeof import("../server/estado-db");

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "coordina-novedades-"));
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

  test("se sella la primera vez y NO se mueve al volver a pedirla", async () => {
    // Lo que se defiende: reconstruir o reiniciar no puede cambiar la fecha de
    // algo que ya salió. Es el motivo de que la fecha no esté escrita en el
    // código —ahí habria que acordarse de corregirla antes de cada despliegue—
    // ni se saque de la compilación, que cambia en cada `build`.
    const primera = db.fechasDeNovedades(["v1"]);
    expect(primera.v1).toBeTruthy();

    await new Promise((r) => setTimeout(r, 15));
    const segunda = db.fechasDeNovedades(["v1"]);
    expect(segunda.v1).toBe(primera.v1);
  });

  test("una entrada nueva se sella sin tocar las de antes", () => {
    const antes = db.fechasDeNovedades(["v1"]).v1;
    const ahora = db.fechasDeNovedades(["v1", "v2"]);
    expect(ahora.v1).toBe(antes);
    expect(ahora.v2).toBeTruthy();
  });

  test("sin entradas no hace nada", () => {
    expect(db.fechasDeNovedades([])).toEqual({});
  });
});
