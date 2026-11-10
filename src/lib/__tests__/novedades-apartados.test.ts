import { describe, expect, it, vi } from "vitest";
import { novedadesDe } from "../novedades-commits.mjs";
import { NOVEDADES, agruparCambios, cambiosSinLeer, cuantasNuevas, type ApartadoNovedades, type Cambio, type Novedad } from "../novedades";

const c = (titulo: string, apartado?: ApartadoNovedades, tanda = 1): Cambio => ({ tipo: "mejor", titulo, apartado, tanda });
const general = c("Para todos");
const ot = c("OT", "ot");
const diseno = c("Diseño", "diseno");
const impresion = c("Impresión", "impresion");
const produccion = c("Producción", "produccion", 2);
const lista: Novedad[] = [
  { id: "hoy", hasta: null, cambios: [produccion, general, ot, diseno, impresion] },
  { id: "ayer", hasta: null, cambios: [c("Anterior")] },
];

describe("novedades por apartado", () => {
  it.each(["ot", "diseno", "impresion", "produccion"] as const)("%s lee lo general y lo suyo; el resto está plegado", (perfil) => {
    const grupos = agruparCambios(lista[0].cambios, perfil);
    expect(grupos.propios).toEqual(lista[0].cambios.filter((x) => !x.apartado || x.apartado === perfil));
    expect(grupos.otros).toHaveLength(3);
    expect(grupos.otros.flatMap((g) => g.cambios)).not.toContain(general);
  });

  it("Dirección recibe todo en detalle", () => {
    expect(agruparCambios(lista[0].cambios, "direccion")).toEqual({ propios: lista[0].cambios, otros: [] });
  });

  it("quien trabaja en dos apartados recibe ambos, aunque esté mirando otra lista", () => {
    const perfil = ["impresion", "diseno"] as const;
    expect(agruparCambios(lista[0].cambios, perfil).propios).toEqual([general, diseno, impresion]);
    expect(agruparCambios(lista[0].cambios, perfil).otros.map((g) => g.apartado)).toEqual(["ot", "produccion"]);
    const entradas = [{ id: "dos-secciones", hasta: null, cambios: [diseno] }, ...lista];
    expect(cuantasNuevas("hoy·5", perfil, entradas)).toBe(1);
    expect(cuantasNuevas("hoy·5", "impresion", entradas)).toBe(0);
  });

  it("una tanda de Producción no avisa ni resalta a las otras secciones", () => {
    for (const perfil of ["ot", "diseno", "impresion"] as const) {
      expect(cuantasNuevas("hoy·4", perfil, lista)).toBe(0);
      expect(cambiosSinLeer("hoy·4", lista, perfil).size).toBe(0);
    }
    expect(cuantasNuevas("hoy·4", "produccion", lista)).toBe(1);
    expect(cuantasNuevas("hoy·4", "direccion", lista)).toBe(1);
    expect([...cambiosSinLeer("hoy·4", lista, "produccion")]).toEqual([produccion]);
  });

  it("varios días y marcas antiguas solo cuentan actualizaciones relevantes", () => {
    const entradas = [{ id: "solo-produccion", hasta: null, cambios: [produccion] }, ...lista];
    expect(cuantasNuevas("ayer·1", "ot", entradas)).toBe(1);
    expect(cuantasNuevas("ayer", "ot", entradas)).toBe(1);
    expect(cuantasNuevas("ayer·1", "produccion", entradas)).toBe(2);
    expect(cuantasNuevas(null, "ot", entradas)).toBe(0);
    expect(cuantasNuevas("desconocida", "ot", entradas)).toBe(2);
    expect(cuantasNuevas("hoy·5", "ot", entradas)).toBe(0);
  });

  it("una tanda propia pendiente sigue contando aunque después llegue un día solo de otros", () => {
    const entradas = [{ id: "solo-ot", hasta: null, cambios: [ot] }, ...lista];
    expect(cuantasNuevas("hoy·4", "produccion", entradas)).toBe(1);
  });

  it("reclasificar lo publicado conserva ids, cantidades y marcas de lectura", () => {
    const belen = NOVEDADES.filter((n) => ["2026-11-09", "2026-11-10"].includes(n.id))
      .flatMap((n) => n.cambios).filter((x) => /pantalla de Belén|comprobaciones de Belén/.test(x.titulo));
    expect(belen.length).toBeGreaterThan(0);
    expect(belen.every((x) => x.apartado === "produccion")).toBe(true);
    expect(cuantasNuevas("hoy·5", "ot", lista)).toBe(0);
  });
});

describe("pies de commit", () => {
  it("mezcla destinatarios, generales y detalles sin perder compatibilidad", () => {
    expect(novedadesDe("Novedad[produccion]: mejor | Para Belén\nDetalle: Su detalle\nNovedad: nuevo | Para todos\nNovedad[DISENO]: arreglado | Diseño"))
      .toEqual([
        { tipo: "mejor", titulo: "Para Belén", apartado: "produccion", detalle: "Su detalle" },
        { tipo: "nuevo", titulo: "Para todos" },
        { tipo: "arreglado", titulo: "Diseño", apartado: "diseno" },
      ]);
  });

  it("los ejemplos sangrados no se publican", () => {
    expect(novedadesDe("  Novedad[ot]: nuevo | Ejemplo\n  Detalle: Ejemplo\nDetalle: Suelto")).toEqual([]);
  });

  it("no convierte un apartado desconocido en un aviso general ni mezcla su detalle", () => {
    const avisar = vi.fn();
    expect(novedadesDe("Novedad: nuevo | Válida\nNovedad[producion]: mejor | Errata\nDetalle: De la errata\nNovedad[ot]: otro | Tipo incorrecto", avisar))
      .toEqual([{ tipo: "nuevo", titulo: "Válida" }]);
    expect(avisar).toHaveBeenCalledTimes(2);
  });
});
