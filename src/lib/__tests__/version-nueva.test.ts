import { describe, expect, it } from "vitest";
import type { Novedad } from "../novedades";
import { QUIETA_MS, cambiosDesde, cambiosParaAvisar, esTrozoPerdido, puedeRecargarSola } from "../version-nueva";

const ENTRADAS: Novedad[] = [
  {
    id: "2026-11-26",
    hasta: null,
    cambios: [
      { tipo: "nuevo", titulo: "Para OT", apartado: "ot" },
      { tipo: "nuevo", titulo: "Para Producción", apartado: "produccion", tanda: 2 },
    ],
  },
  { id: "2026-11-25", hasta: null, cambios: [{ tipo: "mejor", titulo: "Para todos" }] },
];

describe("cambiosDesde", () => {
  it("devuelve lo publicado después de la marca de la pestaña", () => {
    expect(cambiosDesde("2026-11-25·1", ENTRADAS).map((c) => c.titulo)).toEqual(["Para OT", "Para Producción"]);
  });

  it("dentro de la misma entrada, solo las tandas que la pestaña no traía", () => {
    expect(cambiosDesde("2026-11-26·1", ENTRADAS).map((c) => c.titulo)).toEqual(["Para Producción"]);
  });

  it("nada si la pestaña ya traía la última", () => {
    expect(cambiosDesde("2026-11-26·2", ENTRADAS)).toEqual([]);
  });

  it("nada sin marca o con una desconocida: mejor callar que avisar de todo", () => {
    expect(cambiosDesde(null, ENTRADAS)).toEqual([]);
    expect(cambiosDesde("", ENTRADAS)).toEqual([]);
    expect(cambiosDesde("2020-01-01·3", ENTRADAS)).toEqual([]);
  });
});

describe("cambiosParaAvisar", () => {
  const cambios = [...ENTRADAS[0].cambios, ...ENTRADAS[1].cambios];

  it("cada uno ve lo suyo y lo de todos", () => {
    expect(cambiosParaAvisar(cambios, "produccion").map((c) => c.titulo)).toEqual(["Para Producción", "Para todos"]);
    expect(cambiosParaAvisar(cambios, ["ot"]).map((c) => c.titulo)).toEqual(["Para OT", "Para todos"]);
  });

  it("Dirección lo ve todo", () => {
    expect(cambiosParaAvisar(cambios, "direccion")).toHaveLength(3);
  });

  it("una versión sin novedades no avisa a nadie", () => {
    expect(cambiosParaAvisar([], "direccion")).toEqual([]);
  });
});

describe("puedeRecargarSola", () => {
  const quieta = { inactivaMs: QUIETA_MS, hayVentana: false, escribiendo: false, hayBorrador: false };

  it("recarga con la pestaña quieta y sin nada abierto", () => {
    expect(puedeRecargarSola(quieta)).toBe(true);
  });

  it("no mientras alguien la está usando", () => {
    expect(puedeRecargarSola({ ...quieta, inactivaMs: QUIETA_MS - 1 })).toBe(false);
  });

  it("no con un cuadro abierto, el cursor en un campo o una nota a medias", () => {
    expect(puedeRecargarSola({ ...quieta, hayVentana: true })).toBe(false);
    expect(puedeRecargarSola({ ...quieta, escribiendo: true })).toBe(false);
    expect(puedeRecargarSola({ ...quieta, hayBorrador: true })).toBe(false);
  });
});

describe("esTrozoPerdido", () => {
  it("reconoce los errores de código que ya no está en el servidor", () => {
    expect(esTrozoPerdido("ChunkLoadError: Loading chunk 123 failed.")).toBe(true);
    expect(esTrozoPerdido("Loading CSS chunk app-pages failed")).toBe(true);
    expect(esTrozoPerdido("Failed to load chunk /_next/static/chunks/abc.js")).toBe(true);
    expect(esTrozoPerdido("TypeError: Failed to fetch dynamically imported module: https://x/a.js")).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(esTrozoPerdido("TypeError: Failed to fetch")).toBe(false);
    expect(esTrozoPerdido("Cannot read properties of undefined")).toBe(false);
  });
});
