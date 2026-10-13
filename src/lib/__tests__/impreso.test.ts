import { describe, expect, it } from "vitest";
import type { OF, Pedido } from "../types";
import { pedidoListoParaPasar, puedePasarAProduccion } from "../fases-tablero";
import { accionOcultaSinRevision, marcarComoImpreso, ofsParaImpreso } from "../impreso";
import { SECCIONES } from "../secciones";
import type { AccionOF } from "../acciones";

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

describe("qué acciones de fila no salen donde nadie revisa", () => {
  // La regla que aplica la ficha del pedido (Drawer) a cada OF. En Impresión
  // el único final es «Impreso»: con "Pasar a revisión" o "Dar por bueno sin
  // revisión" en la fila, la OF podía acabar en revisión sin nadie que la mire.
  const todas: AccionOF[] = [
    "empezar_planteo", "terminar_planteo", "recuperar_planteo",
    "empezar_revision", "aprobar", "aprobar_corregida", "aprobar_sin_revision",
    "devolver", "reabrir", "recuperar_aprobada", "soltar_revision",
    "retomar", "anular", "restaurar", "cerrar_en_rps", "volver_a_plantear",
  ];

  it("en Impresión se esconden las dos que llevan a revisión o la saltan", () => {
    const fuera = todas.filter((a) => accionOcultaSinRevision(SECCIONES.impresion, a));
    expect(fuera.sort()).toEqual(["aprobar_sin_revision", "terminar_planteo"]);
  });

  it("en OT y Diseño no se esconde nada por esto", () => {
    for (const s of [SECCIONES.ot, SECCIONES.diseno]) {
      expect(todas.filter((a) => accionOcultaSinRevision(s, a))).toEqual([]);
    }
  });
});
