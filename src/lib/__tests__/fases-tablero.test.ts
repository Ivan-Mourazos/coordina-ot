import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import {
  FASES,
  agruparPorFase,
  arrastrableDeCompanero,
  conTope,
  faseDeOF,
  faseDePedido,
} from "../fases-tablero";

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

describe("FASES", () => {
  it("son cuatro, en orden de ciclo y con los nombres nuevos", () => {
    expect(FASES.map((f) => f.id)).toEqual([
      "sinEmpezar",
      "planteando",
      "esperandoRevision",
      "listoParaPasar",
    ]);
    // "Esperando revisión" y no "Para revisar": es mi trabajo en manos de otro,
    // no trabajo que me toque revisar a mí.
    expect(FASES[2].label).toBe("Esperando revisión");
    expect(FASES[3].label).toBe("Listo para pasar");
  });
});

describe("faseDeOF", () => {
  it("aprobada → listo para pasar", () => {
    expect(faseDeOF(of({ estado: "aprobada" }))).toBe("listoParaPasar");
  });
  it("por_revisar y en_revision → esperando revisión", () => {
    expect(faseDeOF(of({ estado: "por_revisar" }))).toBe("esperandoRevision");
    expect(faseDeOF(of({ estado: "en_revision" }))).toBe("esperandoRevision");
  });
  it("en_curso y devuelta → planteando", () => {
    expect(faseDeOF(of({ estado: "en_curso" }))).toBe("planteando");
    expect(faseDeOF(of({ estado: "devuelta" }))).toBe("planteando");
  });
  it("pendiente sin tiempo ni fichaje → sin empezar", () => {
    expect(faseDeOF(of({ estado: "pendiente" }))).toBe("sinEmpezar");
  });
  it("pendiente pero con tiempo o fichándose ya cuenta como planteando", () => {
    expect(faseDeOF(of({ estado: "pendiente", tiempoPlanteoMin: 12 }))).toBe("planteando");
    expect(faseDeOF(of({ estado: "pendiente", fichandoRol: "plantear" }))).toBe("planteando");
  });
});

describe("faseDePedido", () => {
  it("todas aprobadas → listo para pasar", () => {
    expect(faseDePedido({ ofs: [of({ estado: "aprobada" }), of({ estado: "aprobada" })] }))
      .toBe("listoParaPasar");
  });
  it("si alguna se está planteando, manda planteando", () => {
    expect(faseDePedido({ ofs: [of({ estado: "aprobada" }), of({ estado: "en_curso" })] }))
      .toBe("planteando");
  });
  it("todas sin empezar → sin empezar", () => {
    expect(faseDePedido({ ofs: [of({}), of({})] })).toBe("sinEmpezar");
  });
  it("mezcla de sin empezar y esperando revisión → esperando revisión", () => {
    expect(faseDePedido({ ofs: [of({}), of({ estado: "por_revisar" })] }))
      .toBe("esperandoRevision");
  });
  it("un pedido sin OFs no revienta", () => {
    expect(faseDePedido({ ofs: [] })).toBe("sinEmpezar");
  });
});

describe("agruparPorFase", () => {
  it("devuelve las cuatro fases, en orden, aunque estén vacías", () => {
    const g = agruparPorFase([{ ofs: [of({ estado: "en_curso" })] }]);
    expect(g.map((x) => x.id)).toEqual(FASES.map((f) => f.id));
    expect(g[1].items).toHaveLength(1);
    expect(g[0].items).toHaveLength(0);
  });
});

describe("conTope", () => {
  it("por debajo del tope no oculta nada", () => {
    expect(conTope([1, 2], 3)).toEqual({ visibles: [1, 2], resto: 0 });
  });
  it("por encima recorta y dice cuántos quedan", () => {
    expect(conTope([1, 2, 3, 4, 5], 3)).toEqual({ visibles: [1, 2, 3], resto: 2 });
  });
  it("justo en el tope no deja resto", () => {
    expect(conTope([1, 2, 3], 3)).toEqual({ visibles: [1, 2, 3], resto: 0 });
  });
});

describe("arrastrableDeCompanero", () => {
  it("solo se mueve lo que no ha empezado", () => {
    expect(arrastrableDeCompanero({ ofs: [of({}), of({})] })).toBe(true);
  });
  it("con tiempo ya fichado no se mueve: las horas quedarían a nombre de otro", () => {
    expect(arrastrableDeCompanero({ ofs: [of({}), of({ tiempoPlanteoMin: 5 })] })).toBe(false);
  });
  it("si alguien la está fichando ahora, tampoco", () => {
    expect(arrastrableDeCompanero({ ofs: [of({ fichandoRol: "plantear" })] })).toBe(false);
  });
  it("fuera de pendiente, tampoco", () => {
    expect(arrastrableDeCompanero({ ofs: [of({ estado: "por_revisar" })] })).toBe(false);
  });
  it("un pedido sin OFs no es arrastrable", () => {
    expect(arrastrableDeCompanero({ ofs: [] })).toBe(false);
  });
});
