import { describe, expect, it } from "vitest";
import {
  ESTADO_OF,
  esFaseDeOT,
  finalizables,
  resumen,
  situacionDe,
  type FaseDeOF,
} from "../fase-pendiente";

const f = (maquina: string, estado: number, of = "0227619"): FaseDeOF => ({
  of,
  fase: "02",
  descripcion: "PLANTEAR",
  maquina,
  estado,
});

describe("situacionDe", () => {
  it("los tres estados a medias son 'sin finalizar'", () => {
    expect(situacionDe(ESTADO_OF.cargada)).toBe("sin_finalizar");
    expect(situacionDe(ESTADO_OF.iniciada)).toBe("sin_finalizar");
    expect(situacionDe(ESTADO_OF.interrumpida)).toBe("sin_finalizar");
  });

  it("finalizada y eliminada se distinguen", () => {
    expect(situacionDe(ESTADO_OF.finalizada)).toBe("finalizada");
    expect(situacionDe(ESTADO_OF.eliminada)).toBe("eliminada");
  });

  it("un estado que no conocemos NO se cuela como 'sin finalizar'", () => {
    // Si el catálogo de OLANET crece, ofrecerle botón a un estado nuevo sería
    // escribir en RPS sobre algo que no entendemos.
    expect(situacionDe(7)).toBe("desconocida");
    expect(situacionDe(-1)).toBe("desconocida");
  });
});

describe("esFaseDeOT", () => {
  it("reconoce los centros de OT de las tres delegaciones y las urgencias", () => {
    for (const m of ["A-OTEC", "OTEC-A", "U-A-OTEC", "S-OTEC", "B-OTEC"])
      expect(esFaseDeOT(m)).toBe(true);
  });

  it("recoge también las erratas reales de esa columna", () => {
    // Vistas en scg_Fases/CPRMOResourceMachine: no son centros distintos, son
    // dedazos, y dejarlas fuera escondería fases que sí son nuestras.
    expect(esFaseDeOT("A-OTECP")).toBe(true);
    expect(esFaseDeOT("24A-OTEC")).toBe(true);
    expect(esFaseDeOT("a-otec")).toBe(true);
  });

  it("no se lleva por delante ninguna sección del taller", () => {
    for (const m of ["A-MONT", "A-DGRA", "A-COST", "P-IDUV", "CORT-P", "SOLD-P", ""])
      expect(esFaseDeOT(m)).toBe(false);
  });
});

describe("finalizables", () => {
  it("solo las de OT sin finalizar", () => {
    const r = finalizables([
      f("A-OTEC", ESTADO_OF.interrumpida, "1"),
      f("A-OTEC", ESTADO_OF.finalizada, "2"),
      f("A-MONT", ESTADO_OF.interrumpida, "3"), // de taller: no es cosa nuestra
      f("U-A-OTEC", ESTADO_OF.cargada, "4"),
    ]);
    expect(r.map((x) => x.of)).toEqual(["1", "4"]);
  });

  it("una fase ELIMINADA no se ofrece, aunque no esté finalizada", () => {
    // OLANET ya la retiró; escribirle un movimiento sería resucitarla.
    expect(finalizables([f("A-OTEC", ESTADO_OF.eliminada)])).toEqual([]);
  });

  it("un estado desconocido tampoco se ofrece", () => {
    expect(finalizables([f("A-OTEC", 9)])).toEqual([]);
  });

  it("sin fases, lista vacía y sin reventar", () => {
    expect(finalizables([])).toEqual([]);
  });
});

describe("resumen", () => {
  it("cuenta cada situación por separado y descarta lo que no es de OT", () => {
    expect(
      resumen([
        f("A-OTEC", ESTADO_OF.finalizada, "1"),
        f("A-OTEC", ESTADO_OF.interrumpida, "2"),
        f("U-A-OTEC", ESTADO_OF.eliminada, "3"),
        f("A-MONT", ESTADO_OF.interrumpida, "4"),
      ]),
    ).toEqual({ deOT: 3, finalizadas: 1, sinFinalizar: 1, eliminadas: 1 });
  });

  it("un pedido con todo cerrado no tiene nada que contar", () => {
    // Este es el caso normal, y es el que decide que la ficha se calle.
    expect(resumen([f("A-OTEC", ESTADO_OF.finalizada)]).sinFinalizar).toBe(0);
  });
});
