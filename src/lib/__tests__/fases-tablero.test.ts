import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import {
  FASES,
  agruparPorFase,
  autoresQueFaltan,
  conTope,
  faseDeOF,
  faseDePedido,
  motivoBloqueo,
  pedidoListoParaPasar,
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
  it("anulada → sin empezar, aunque conserve tiempo fichado: no es trabajo activo", () => {
    expect(faseDeOF(of({ estado: "anulada" }))).toBe("sinEmpezar");
    expect(faseDeOF(of({ estado: "anulada", tiempoPlanteoMin: 30 }))).toBe("sinEmpezar");
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

describe("motivoBloqueo", () => {
  it("si alguien está fichando ahora, ese es el motivo", () => {
    expect(motivoBloqueo({ ofs: [of({ fichandoRol: "plantear" })] })).toBe("fichando");
  });
  it("fichando manda sobre el tiempo ya acumulado", () => {
    expect(
      motivoBloqueo({ ofs: [of({ fichandoRol: "revisar", tiempoRevisionMin: 10 })] }),
    ).toBe("fichando");
  });
  it("con tiempo ya fichado (planteo o revisión) está empezado", () => {
    expect(motivoBloqueo({ ofs: [of({ tiempoPlanteoMin: 5 })] })).toBe("empezado");
    expect(motivoBloqueo({ ofs: [of({ tiempoRevisionMin: 5 })] })).toBe("empezado");
  });
  it("sin tiempo pero con revisor asignado: con revisor", () => {
    expect(motivoBloqueo({ ofs: [of({ revisorId: "ana" })] })).toBe("con revisor");
  });
  it("sin nada de lo anterior: no disponible", () => {
    expect(motivoBloqueo({ ofs: [of({})] })).toBe("no disponible");
  });
  it("un pedido sin OFs: no disponible", () => {
    expect(motivoBloqueo({ ofs: [] })).toBe("no disponible");
  });
});

describe("pedidoListoParaPasar", () => {
  it("un pedido repartido no se pasa hasta que TODOS acaban", () => {
    const p = {
      ofs: [
        of({ id: "a", estado: "aprobada", autorId: "ivan" }),
        of({ id: "b", estado: "aprobada", autorId: "ivan" }),
        of({ id: "c", estado: "en_curso", autorId: "tamara" }),
      ],
    };
    // Mis dos OF están listas, pero Producción recibe el pedido entero: si
    // esto devolviera true, pasaría a Producción la OF que Tamara tiene a
    // medias.
    expect(pedidoListoParaPasar(p)).toBe(false);
  });
  it("con todas aprobadas se puede pasar", () => {
    const p = {
      ofs: [
        of({ id: "a", estado: "aprobada", autorId: "ivan" }),
        of({ id: "b", estado: "aprobada", autorId: "tamara" }),
      ],
    };
    expect(pedidoListoParaPasar(p)).toBe(true);
  });
  it("las anuladas no cuentan: no son trabajo de OT", () => {
    const p = {
      ofs: [
        of({ id: "a", estado: "aprobada", autorId: "ivan" }),
        of({ id: "b", estado: "anulada", autorId: "tamara" }),
      ],
    };
    expect(pedidoListoParaPasar(p)).toBe(true);
  });
  it("un pedido sin OF activas no se puede pasar", () => {
    expect(pedidoListoParaPasar({ ofs: [of({ estado: "anulada", autorId: "ivan" })] })).toBe(
      false,
    );
  });
});

describe("autoresQueFaltan", () => {
  it("dice quién tiene OF sin aprobar todavía, y cuántas", () => {
    const p = {
      ofs: [
        of({ id: "a", estado: "aprobada", autorId: "ivan" }),
        of({ id: "b", estado: "aprobada", autorId: "ivan" }),
        of({ id: "c", estado: "en_curso", autorId: "tamara" }),
      ],
    };
    expect(autoresQueFaltan(p)).toEqual([{ autorId: "tamara", n: 1 }]);
  });
  it("con todas aprobadas no falta nadie", () => {
    const p = {
      ofs: [
        of({ id: "a", estado: "aprobada", autorId: "ivan" }),
        of({ id: "b", estado: "aprobada", autorId: "tamara" }),
      ],
    };
    expect(autoresQueFaltan(p)).toEqual([]);
  });
});
