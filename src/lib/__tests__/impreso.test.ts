import { describe, expect, it } from "vitest";
import type { OF, Pedido } from "../types";
import { pedidoListoParaPasar, puedePasarAProduccion } from "../fases-tablero";
import { marcarComoImpreso, ofsParaImpreso } from "../impreso";

// Mismo fabricante de OF que fases-tablero.test.ts (allí no se exporta).
const of = (p: Partial<OF>): OF =>
  ({
    id: "0230001:5",
    codigo: "0230001",
    descripcion: "LONA",
    familia: "LONA",
    piezas: 1,
    autorId: null,
    revisorId: null,
    estado: "pendiente",
    fichandoRol: null,
    tiempoEstimadoMin: 0,
    tiempoPlanteoMin: 0,
    tiempoRevisionMin: 0,
    ...p,
  }) as OF;

const pedido = (ofs: OF[]): Pedido =>
  ({ id: "P-1", codigo: "AR.26.00001", situacion: "procesado", ofs }) as unknown as Pedido;

describe("Impreso", () => {
  it("coge mis OF en curso y las sin empezar sin dueño", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "pendiente", autorId: null }),
      of({ id: "c", estado: "aprobada", autorId: "manuel" }),
      of({ id: "d", estado: "anulada", autorId: null }),
    ]);
    expect(ofsParaImpreso(p, "manuel").map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("no sale si queda trabajo de otra persona", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "en_curso", autorId: "carron" }),
    ]);
    expect(ofsParaImpreso(p, "manuel")).toEqual([]);
  });

  it("no sale si hay una OF en revisión", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "por_revisar", autorId: "manuel", revisorId: "carron" }),
    ]);
    expect(ofsParaImpreso(p, "manuel")).toEqual([]);
  });

  it("sin identidad no sale nada", () => {
    expect(ofsParaImpreso(pedido([of({ id: "a", estado: "pendiente", autorId: null })]), null)).toEqual([]);
  });

  it("marca aprobada, sin revisión, y adopta la OF huérfana", () => {
    const r = marcarComoImpreso(of({ id: "b", estado: "pendiente", autorId: null }), "manuel");
    expect(r).toMatchObject({ estado: "aprobada", autorId: "manuel" });
    expect(r.revisada).not.toBe(true);
  });

  it("apaga el reloj de la OF que estaba fichando", () => {
    const r = marcarComoImpreso(of({ id: "a", estado: "en_curso", autorId: "manuel", fichandoRol: "plantear" }), "manuel");
    expect(r.fichandoRol).toBeNull();
  });

  it("con todas marcadas, el pedido queda listo para pasar y Manuel puede pasarlo", () => {
    const p = pedido([
      of({ id: "a", estado: "en_curso", autorId: "manuel" }),
      of({ id: "b", estado: "pendiente", autorId: null }),
    ]);
    const marcado = { ...p, ofs: p.ofs.map((o) => marcarComoImpreso(o, "manuel")) };
    expect(pedidoListoParaPasar(marcado)).toBe(true);
    expect(puedePasarAProduccion(marcado, "manuel")).toBe(true);
  });
});
