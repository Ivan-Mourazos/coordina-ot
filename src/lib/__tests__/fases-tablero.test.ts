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
  ofOcultaDeOT,
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
  it("van en orden de ciclo, con las devoluciones delante", () => {
    expect(FASES.map((f) => f.id)).toEqual([
      // Fuera del recorrido y la primera: es la única fase que existe porque
      // alguien está esperando a que la atiendas.
      "devuelta",
      "sinEmpezar",
      "planteando",
      "esperandoRevision",
      "listoParaPasar",
    ]);
    expect(FASES[0].label).toBe("A corregir");
    // "Esperando revisión" y no "Para revisar": es mi trabajo en manos de otro,
    // no trabajo que me toque revisar a mí.
    expect(FASES[3].label).toBe("Esperando revisión");
    expect(FASES[4].label).toBe("Listo para pasar");
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
  it("en_curso → planteando", () => {
    expect(faseDeOF(of({ estado: "en_curso" }))).toBe("planteando");
  });
  it("devuelta tiene fase propia: metida en planteando no se distinguía de lo que ya tenías a medias", () => {
    expect(faseDeOF(of({ estado: "devuelta" }))).toBe("devuelta");
    // Y sigue siéndolo aunque lleve tiempo fichado de la primera vuelta.
    expect(faseDeOF(of({ estado: "devuelta", tiempoPlanteoMin: 45 }))).toBe("devuelta");
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
  it("una devolución manda sobre el resto del pedido", () => {
    // Lo primero que hay que saber de un pedido es si algo volvió a corregir,
    // aunque las demás OF vayan bien: es trabajo con alguien esperando.
    expect(faseDePedido({ ofs: [of({ estado: "en_curso" }), of({ estado: "devuelta" })] }))
      .toBe("devuelta");
    expect(faseDePedido({ ofs: [of({ estado: "aprobada" }), of({ estado: "devuelta" })] }))
      .toBe("devuelta");
  });
  it("pero un pedido ya aprobado entero no vuelve a 'a corregir'", () => {
    expect(faseDePedido({ ofs: [of({ estado: "aprobada" }), of({ estado: "aprobada" })] }))
      .toBe("listoParaPasar");
  });
  it("un pedido sin OFs no revienta", () => {
    expect(faseDePedido({ ofs: [] })).toBe("sinEmpezar");
  });
});

describe("agruparPorFase", () => {
  it("devuelve TODAS las fases, en orden, aunque estén vacías", () => {
    const g = agruparPorFase([{ ofs: [of({ estado: "en_curso" })] }]);
    expect(g.map((x) => x.id)).toEqual(FASES.map((f) => f.id));
    expect(g.find((x) => x.id === "planteando")!.items).toHaveLength(1);
    expect(g.find((x) => x.id === "devuelta")!.items).toHaveLength(0);
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
  it("con varios autores pendientes, respeta el orden en que aparecen las OF", () => {
    // PedidoLinea resume el aviso a "el primero + N más": para que ese
    // resumen sea estable necesita que el orden de esta lista no dependa
    // del azar de iteración de un Map, sino del orden de las OF del pedido.
    const p = {
      ofs: [
        of({ id: "a", estado: "en_curso", autorId: "cristina" }),
        of({ id: "b", estado: "en_curso", autorId: "cristina" }),
        of({ id: "c", estado: "por_revisar", autorId: "alejandro" }),
        of({ id: "d", estado: "en_curso", autorId: "tamara" }),
      ],
    };
    expect(autoresQueFaltan(p)).toEqual([
      { autorId: "cristina", n: 2 },
      { autorId: "alejandro", n: 1 },
      { autorId: "tamara", n: 1 },
    ]);
  });
});

describe("OF que entran por una tarea de taller", () => {
  const ajena = (autorId: string | null): OF =>
    of({ id: "t1", estado: "pendiente", autorId, ajenaOT: true });

  it("sin autor están fuera del trabajo de OT", () => {
    expect(ofOcultaDeOT(ajena(null))).toBe(true);
  });

  it("asignarle autor ES el rescate: no hace falta guardar nada más", () => {
    expect(ofOcultaDeOT(ajena("ivan"))).toBe(false);
  });

  it("devolverla a la bandeja la vuelve a esconder", () => {
    // Quitar el autor es lo que hace `moverOFs(ids, null)`, así que el camino
    // de vuelta sale gratis y no necesita su propia acción.
    expect(ofOcultaDeOT({ ...ajena("ivan"), autorId: null })).toBe(true);
  });

  it("una OF normal sin autor no se esconde nunca", () => {
    expect(ofOcultaDeOT(of({ id: "n1", estado: "pendiente", autorId: null }))).toBe(false);
  });
});
