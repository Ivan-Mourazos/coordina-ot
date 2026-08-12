import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import {
  FASES,
  FASES_DE_TRABAJO,
  agruparPorFase,
  autoresQueFaltan,
  conTope,
  faseDeOF,
  faseDePedido,
  motivoBloqueo,
  ofOcultaDeOT,
  ofsQueCuentan,
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
      // Fuera del recorrido y la última: no es una etapa del trabajo, es la
      // espera a que Producción libere el pedido. No se pinta como columna
      // (ver FASES_DE_TRABAJO y el contador de ZonaPersonal).
      "parado",
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
  it("un pedido sin nada pendiente en OT SÍ se puede pasar", () => {
    // Antes se exigía al menos una OF aprobada que mandar, y eso dejaba
    // atrapados los pedidos donde OT ya no pinta nada: el botón apagado sin
    // forma de encenderlo. Pasarlo es como se dice "por mí, hecho".
    expect(pedidoListoParaPasar({ ofs: [of({ estado: "anulada", autorId: "ivan" })] })).toBe(
      true,
    );
  });
  it("pero un pedido sin OF ninguna no: no es que no quede trabajo, es que no se sabe", () => {
    expect(pedidoListoParaPasar({ ofs: [] })).toBe(false);
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

describe("ofsQueCuentan: lo que de verdad tiene que plantear Oficina Técnica", () => {
  // El caso es AR.26.03626: su toldo estaba aprobado y el pedido seguía
  // diciendo "Planteando" y sin dejar pasarlo a Producción, porque contaban
  // tres OF detenidas por Producción y una capota que entra por taller.
  const como03626 = {
    ofs: [
      of({ id: "toldo", estado: "aprobada" }),
      of({ id: "det1", detenida: true }),
      of({ id: "det2", detenida: true }),
      of({ id: "capota", ajenaOT: true }),
      of({ id: "anulada", estado: "anulada" }),
    ],
  };

  it("deja fuera las anuladas, las de taller y las detenidas", () => {
    expect(ofsQueCuentan(como03626).map((o) => o.id)).toEqual(["toldo"]);
  });

  it("y con eso el pedido SÍ está listo para pasar a Producción", () => {
    expect(pedidoListoParaPasar(como03626)).toBe(true);
    expect(faseDePedido(como03626)).toBe("listoParaPasar");
  });

  it("una detenida por Producción no es trabajo pendiente de OT: no la podemos ni fichar", () => {
    // Antes bastaba una detenida para dejar el pedido colgado para siempre:
    // liberarla no está en mano de Oficina Técnica.
    const p = { ofs: [of({ estado: "aprobada" }), of({ id: "d", detenida: true })] };
    expect(pedidoListoParaPasar(p)).toBe(true);
  });

  it("un pedido detenido por Producción está PARADO, no 'sin empezar'", () => {
    // El caso AR.26.03703: dos OFs que Jaime ya tenía empezadas y que
    // Producción paró para volver a medir. Caían en "Sin empezar" por descarte
    // —no tenían ninguna OF que contar— y volvían al panel como si tocara
    // empezarlas, cuando no se pueden ni fichar. Tampoco es "listo para pasar":
    // no hay nada que mandar, y RPS ni siquiera acepta darlas por terminadas
    // mientras estén detenidas.
    expect(faseDePedido({ ofs: [of({ detenida: true })] })).toBe("parado");
    expect(faseDePedido({ ofs: [of({ detenida: true }), of({ ajenaOT: true })] })).toBe("parado");
    // Y no se sueltan: en cuanto Producción las libere hay que replantearlas,
    // así que pasarlas las sacaría del tablero para siempre.
    expect(pedidoListoParaPasar({ ofs: [of({ detenida: true }), of({ ajenaOT: true })] }))
      .toBe(false);
  });

  it("pero una detenida NO estorba mientras quede trabajo de OT", () => {
    // AR.26.03626 otra vez: su toldo aprobado manda, y las detenidas de al lado
    // no bloquean el paso a Producción. La espera solo cuenta cuando no queda
    // nada más.
    const p = { ofs: [of({ estado: "aprobada" }), of({ id: "d", detenida: true })] };
    expect(faseDePedido(p)).toBe("listoParaPasar");
    expect(pedidoListoParaPasar(p)).toBe(true);
  });

  it("sin nada detenido, lo que queda es decisión de OT y sí se suelta", () => {
    // Todo anulado o de taller: ahí OT ya ha dicho lo suyo.
    const p = { ofs: [of({ estado: "anulada" }), of({ id: "t", ajenaOT: true })] };
    expect(faseDePedido(p)).toBe("listoParaPasar");
    expect(pedidoListoParaPasar(p)).toBe(true);
  });

  it("tampoco se espera a nadie por una OF que no cuenta", () => {
    // "falta sin asignar (3 OF)" señalando detenidas y capotas mandaba a buscar
    // trabajo que no espera nadie.
    expect(autoresQueFaltan(como03626)).toEqual([]);
  });
});

// Dónde acaba un pedido parado según tenga autor o no. Son los dos caminos por
// los que un pedido llega a la pantalla, y ninguno debe ofrecerlo como trabajo:
// una OF detenida no se puede fichar ni terminar, la coja quien la coja.
describe("parados: con autor y sin autor", () => {
  it("con autor: sale de las columnas de trabajo y va a 'parado'", () => {
    // El facet del autor lleva SOLO sus OF, así que la fase se decide con lo
    // suyo: si todo lo suyo está detenido, su tarjeta está parada aunque otro
    // compañero siga teniendo trabajo en el mismo pedido.
    const mio = { ofs: [of({ detenida: true, autorId: "jaime", estado: "en_curso" })] };
    expect(faseDePedido(mio)).toBe("parado");
    expect(FASES_DE_TRABAJO.some((f) => f.id === "parado")).toBe(false);
  });

  it("sin autor: la bandeja no lo ofrece, porque no se puede coger", () => {
    // La bandeja "Sin asignar" filtra por la categoría `normal`, que excluye
    // las detenidas (ver lib/filtros.ts). Aquí se comprueba la otra mitad: que
    // la fase tampoco lo disfrace de trabajo por empezar.
    const suelto = { ofs: [of({ detenida: true, autorId: null })] };
    expect(faseDePedido(suelto)).toBe("parado");
    expect(pedidoListoParaPasar(suelto)).toBe(false);
  });

  it("en cuanto Producción lo libera vuelve solo a su sitio", () => {
    // Sin marca de detenida, la misma OF es trabajo normal otra vez: no hay
    // estado propio que mantener ni nada que deshacer a mano.
    const liberado = { ofs: [of({ detenida: false, autorId: "jaime", estado: "en_curso" })] };
    expect(faseDePedido(liberado)).toBe("planteando");
  });
});
