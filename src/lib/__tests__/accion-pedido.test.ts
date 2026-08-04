import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import { accionPrimariaDePedido, ofsFichablesDe, ofsPara } from "../accion-pedido";

const of = (p: Partial<OF>): OF =>
  ({
    id: "0230001:5",
    codigo: "0230001",
    descripcion: "LONA",
    familia: "LONA",
    piezas: 1,
    autorId: "ivan",
    revisorId: null,
    estado: "pendiente",
    fichandoRol: null,
    tiempoEstimadoMin: 0,
    tiempoPlanteoMin: 0,
    tiempoRevisionMin: 0,
    ...p,
  }) as OF;

describe("accionPrimariaDePedido", () => {
  it("pendiente con autor → empezar planteo", () => {
    expect(accionPrimariaDePedido({ ofs: [of({})] })?.id).toBe("empezar_planteo");
  });

  it("en curso → pasar a revisión", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ estado: "en_curso" })] })?.id)
      .toBe("terminar_planteo");
  });

  it("devuelta → retomar planteo", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ estado: "devuelta" })] })?.id).toBe("retomar");
  });

  it("aprobada no ofrece accion primaria: lo que toca es pasar el pedido", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ estado: "aprobada" })] })).toBeNull();
  });

  it("pendiente SIN autor no ofrece empezar: la accion lo exige", () => {
    expect(accionPrimariaDePedido({ ofs: [of({ autorId: null })] })).toBeNull();
  });

  it("con OFs en estados distintos manda la de la fase del pedido", () => {
    // El pedido está "planteando" porque una OF está en curso; la acción tiene
    // que ser la de esa fase, no la de la OF que sigue pendiente.
    const p = { ofs: [of({ estado: "pendiente" }), of({ estado: "en_curso" })] };
    expect(accionPrimariaDePedido(p)?.id).toBe("terminar_planteo");
  });

  it("un pedido sin OFs no ofrece nada", () => {
    expect(accionPrimariaDePedido({ ofs: [] })).toBeNull();
  });
});

describe("ofsPara", () => {
  it("devuelve solo las OFs que admiten esa accion", () => {
    const a = of({ id: "a:1", estado: "en_curso" });
    const b = of({ id: "b:1", estado: "aprobada" });
    expect(ofsPara({ ofs: [a, b] }, "terminar_planteo").map((o) => o.id)).toEqual(["a:1"]);
  });

  it("lista vacia si ninguna la admite", () => {
    expect(ofsPara({ ofs: [of({ estado: "aprobada" })] }, "empezar_planteo")).toEqual([]);
  });
});

describe("ofsFichablesDe", () => {
  it("excluye anuladas, aprobadas y detenidas", () => {
    const ok = of({ id: "ok:1", estado: "en_curso" });
    const p = {
      ofs: [
        ok,
        of({ id: "x:1", estado: "aprobada" }),
        of({ id: "y:1", estado: "anulada" }),
        of({ id: "z:1", estado: "en_curso", detenida: true }),
      ],
    };
    expect(ofsFichablesDe(p).map((o) => o.id)).toEqual(["ok:1"]);
  });
});
