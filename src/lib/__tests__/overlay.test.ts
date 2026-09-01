import { describe, expect, it } from "vitest";
import { aplicarOverlay, type Overlay } from "../server/overlay";
import type { Tablero } from "../data";
import type { OF, Pedido } from "../types";

function of(id: string, extra: Partial<OF> = {}): OF {
  return {
    id,
    codigo: id,
    descripcion: "x",
    familia: "TOLDO",
    piezas: 1,
    autorId: null,
    revisorId: null,
    estado: "pendiente",
    fichandoRol: null,
    tiempoEstimadoMin: 0,
    tiempoPlanteoMin: 0,
    tiempoRevisionMin: 0,
    ...extra,
  };
}

function pedido(id: string, ofs: OF[]): Pedido {
  return {
    id,
    codigo: id,
    cliente: "CLI",
    situacion: "procesado",
    fechaSolicitud: "2026-07-01",
    fechaPlanificacion: "2026-07-10",
    fechaEntrega: "2026-07-20",
    prioridad: 2,
    ofs,
    accent: "ninguno",
    lineas: 1,
    croquis: false,
  };
}

const vacio: Overlay = { ofs: new Map(), pedidosCompletados: new Set() };

describe("aplicarOverlay", () => {
  it("overlay vacío devuelve el mismo tablero (misma referencia)", () => {
    const t: Tablero = { operarios: [], pedidos: [pedido("P1", [of("A")])] };
    expect(aplicarOverlay(t, vacio)).toBe(t);
  });

  it("sustituye los 4 campos de flujo de la OF con fila en overlay", () => {
    const t: Tablero = {
      operarios: [],
      pedidos: [pedido("P1", [of("A", { autorId: "rps-dice-otro" }), of("B")])],
    };
    const overlay: Overlay = {
      ofs: new Map([
        [
          "A",
          {
            ofId: "A",
            autorId: "ivan",
            revisorId: "tamara",
            estado: "en_revision",
            observacion: null,
          },
        ],
      ]),
      pedidosCompletados: new Set(),
    };
    const res = aplicarOverlay(t, overlay);
    const a = res.pedidos[0].ofs[0];
    expect(a.autorId).toBe("ivan");
    expect(a.revisorId).toBe("tamara");
    expect(a.estado).toBe("en_revision");
    // OF sin fila: intacta (misma referencia)
    expect(res.pedidos[0].ofs[1]).toBe(t.pedidos[0].ofs[1]);
  });

  it("observación del overlay pisa la de RPS; null la limpia", () => {
    const t: Tablero = {
      operarios: [],
      pedidos: [pedido("P1", [of("A", { observacion: "vieja" })])],
    };
    const overlay: Overlay = {
      ofs: new Map([
        ["A", { ofId: "A", autorId: null, revisorId: null, estado: "devuelta", observacion: "falta cota" }],
      ]),
      pedidosCompletados: new Set(),
    };
    expect(aplicarOverlay(t, overlay).pedidos[0].ofs[0].observacion).toBe("falta cota");
  });

  it("pedido completado cambia situacion sin tocar sus OFs", () => {
    // La OF va aprobada porque es lo que tiene un pedido pasado a Producción:
    // su trabajo hecho. Con una OF sin hacer el pedido ya no está completado
    // —vuelve al tablero, ver el bloque de abajo—, y entonces esto mediría
    // otra cosa.
    const t: Tablero = {
      operarios: [],
      pedidos: [pedido("P1", [of("A", { estado: "aprobada" })])],
    };
    const overlay: Overlay = { ofs: new Map(), pedidosCompletados: new Set(["P1"]) };
    const res = aplicarOverlay(t, overlay);
    expect(res.pedidos[0].situacion).toBe("completado");
    expect(res.pedidos[0].ofs[0]).toBe(t.pedidos[0].ofs[0]);
  });

  it("no muta el tablero de entrada", () => {
    const t: Tablero = { operarios: [], pedidos: [pedido("P1", [of("A")])] };
    const overlay: Overlay = {
      ofs: new Map([
        ["A", { ofId: "A", autorId: "ivan", revisorId: null, estado: "en_curso", observacion: null }],
      ]),
      pedidosCompletados: new Set(),
    };
    aplicarOverlay(t, overlay);
    expect(t.pedidos[0].ofs[0].autorId).toBeNull();
    expect(t.pedidos[0].situacion).toBe("procesado");
  });
});

describe("una OF nueva en un pedido ya pasado a Producción", () => {
  // El caso real (AR.26.03914): se pasó a Producción con su trabajo hecho y
  // DESPUÉS habilitaron en RPS una OF que antes no había que hacer. Como la
  // marca de "pasado" es del pedido entero y no se volvía a mirar nunca, el
  // pedido seguía en Pasados y la OF nueva quedaba escondida ahí dentro, sin
  // autor y sin que nadie supiera que existía.
  const pasado = (ofs: OF[]) => ({
    tablero: { operarios: [], pedidos: [pedido("P1", ofs)] },
    overlay: { ofs: new Map(), pedidosCompletados: new Set(["P1"]) },
  });

  it("devuelve el pedido al tablero y lo marca como reabierto", () => {
    const { tablero, overlay } = pasado([of("A", { estado: "aprobada" }), of("NUEVA")]);
    const [p] = aplicarOverlay(tablero, overlay).pedidos;
    expect(p.situacion).not.toBe("completado");
    expect(p.reabiertoPor).toEqual(["NUEVA"]);
  });

  it("con todo el trabajo hecho se queda completado", () => {
    const { tablero, overlay } = pasado([of("A", { estado: "aprobada" })]);
    const [p] = aplicarOverlay(tablero, overlay).pedidos;
    expect(p.situacion).toBe("completado");
    expect(p.reabiertoPor).toBeUndefined();
  });

  it("las anuladas no lo reabren: no son trabajo que hacer", () => {
    const { tablero, overlay } = pasado([
      of("A", { estado: "aprobada" }),
      of("B", { estado: "anulada" }),
    ]);
    expect(aplicarOverlay(tablero, overlay).pedidos[0].situacion).toBe("completado");
  });

  it("las que no son de OT tampoco: ese trabajo no es nuestro", () => {
    const { tablero, overlay } = pasado([
      of("A", { estado: "aprobada" }),
      of("C", { ajenaOT: true }),
    ]);
    expect(aplicarOverlay(tablero, overlay).pedidos[0].situacion).toBe("completado");
  });

  it("un pedido que nunca se pasó no se toca", () => {
    const t = { operarios: [], pedidos: [pedido("P1", [of("A")])] };
    const r = aplicarOverlay(t, { ofs: new Map(), pedidosCompletados: new Set(["OTRO"]) });
    expect(r.pedidos[0].situacion).toBe("procesado");
    expect(r.pedidos[0].reabiertoPor).toBeUndefined();
  });
});
