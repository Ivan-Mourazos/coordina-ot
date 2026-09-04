import { afterAll, beforeAll, describe, expect, it, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MARCA_ULTIMA, NOVEDADES, cuantasNuevas } from "../novedades";

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

  it("un día = una entrada: no hay dos con la misma fecha", () => {
    // Las de un mismo día se funden (ver scripts/novedades.mjs). Antes salían
    // `2026-09-04`, `-2` y `-3`, y el equipo veía tres actualizaciones seguidas
    // donde solo hubo una jornada de trabajo.
    const dias = NOVEDADES.map((n) => n.id.slice(0, 10));
    expect(new Set(dias).size).toBe(dias.length);
  });

  it("si a la entrada de hoy le añaden cambios, vuelve a avisar", () => {
    // El segundo despliegue de la jornada. Con el id a secas no avisaba a
    // nadie: la entrada se llama igual, así que para la campana no había
    // cambiado nada aunque llevara cinco novedades más.
    const vistoAntes = `${NOVEDADES[0].id}·${NOVEDADES[0].cambios.length - 1}`;
    expect(cuantasNuevas(vistoAntes)).toBe(1);
  });

  it("quien vio la entrada entera no tiene nada nuevo", () => {
    expect(cuantasNuevas(MARCA_ULTIMA)).toBe(0);
    expect(MARCA_ULTIMA).toBe(`${NOVEDADES[0].id}·${NOVEDADES[0].cambios.length}`);
  });

  it("las marcas viejas (solo el id) siguen valiendo", () => {
    // Lo que quedó guardado en los navegadores del equipo antes de este
    // cambio. Sin esto, el día del despliegue todos se habrían encontrado un
    // aviso de todas las novedades por algo que ya habían leído.
    expect(cuantasNuevas(NOVEDADES[0].id)).toBe(0);
    expect(cuantasNuevas(NOVEDADES[2].id)).toBe(2);
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
