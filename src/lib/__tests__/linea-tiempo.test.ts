import { describe, expect, it } from "vitest";
import {
  TRAMO,
  lineaTiempo,
  repartirEtiquetas,
  tramosRecorrido,
  urgenciaRecorrido,
} from "../linea-tiempo";

// Vocabulario de la herramienta vieja, que es el del taller:
//   llegada       = cuándo se crearon sus OF: el día que el parte llega a OT
//   planificación = el día de PLANTEAR (FechaPlanificada de la vista)
//   fabricación   = fin de fabricación previsto (PlannedEndDate de la OF)
//   solicitada    = la ENTREGA que pide el cliente (FechaSolicitada)
const p = (creacion: string, planificacion: string, entrega: string) => ({
  fechaCreacion: creacion,
  fechaPlanificacion: planificacion,
  fechaEntrega: entrega,
});

describe("lineaTiempo", () => {
  it("reparte las fechas a escala real, no a intervalos iguales", () => {
    // La planificación cae al 25 % del recorrido: 10 días de 40.
    const l = lineaTiempo(p("2026-08-01", "2026-08-11", "2026-09-10"), "2026-08-01");
    expect(l.hitos.map((h) => Math.round(h.pct))).toEqual([0, 25, 100]);
    expect(l.hitos.map((h) => h.etiqueta)).toEqual([
      "Llegada",
      "Planificación",
      "Solicitada",
    ]);
  });

  it("sitúa hoy donde toca", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-11", "2026-08-21"), "2026-08-11");
    expect(Math.round(l.hoyPct)).toBe(50);
    expect(l.hoyFuera).toBe(false);
    expect(l.diasParaEntrega).toBe(10);
  });

  it("con la entrega pasada, hoy se queda en el extremo y se marca fuera", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-05", "2026-08-10"), "2026-08-20");
    expect(l.hoyPct).toBe(100);
    expect(l.hoyFuera).toBe(true);
    expect(l.diasParaEntrega).toBe(-10);
  });

  it("con un pedido que aún no ha entrado, hoy se queda al principio", () => {
    const l = lineaTiempo(p("2026-08-10", "2026-08-15", "2026-08-20"), "2026-08-01");
    expect(l.hoyPct).toBe(0);
    expect(l.hoyFuera).toBe(true);
  });

  it("si las tres fechas son el mismo día no revienta: reparte iguales", () => {
    // Sin recorrido no hay escala posible; la línea tiene que seguir siendo
    // legible en vez de amontonar los tres hitos en el mismo punto.
    const l = lineaTiempo(p("2026-08-05", "2026-08-05", "2026-08-05"), "2026-08-05");
    expect(l.hitos.map((h) => h.pct)).toEqual([0, 50, 100]);
    expect(l.diasParaEntrega).toBe(0);
  });

  it("aguanta fechas desordenadas (entrega antes que la creación)", () => {
    const l = lineaTiempo(p("2026-08-20", "2026-08-15", "2026-08-10"), "2026-08-12");
    expect(l.hitos.every((h) => Number.isFinite(h.pct))).toBe(true);
    expect(l.hoyPct).toBeGreaterThanOrEqual(0);
    expect(l.hoyPct).toBeLessThanOrEqual(100);
  });

  it("sin fecha de creación arranca en la planificación, sin inventarse la entrada", () => {
    const l = lineaTiempo(
      { fechaPlanificacion: "2026-08-05", fechaEntrega: "2026-08-25" },
      "2026-08-05",
    );
    expect(l.hitos.map((h) => h.etiqueta)).toEqual(["Planificación", "Solicitada"]);
    expect(l.hitos[0].pct).toBe(0);
  });
});

describe("con fecha de fabricación", () => {
  it("añade el hito entre planificación y solicitada, a escala", () => {
    const l = lineaTiempo(
      {
        ...p("2026-08-01", "2026-08-05", "2026-08-21"),
        fechaFabricacion: "2026-08-11",
      },
      "2026-08-01",
    );
    expect(l.hitos.map((h) => h.etiqueta)).toEqual([
      "Llegada",
      "Planificación",
      "Fabricación",
      "Solicitada",
    ]);
    expect(l.hitos.map((h) => Math.round(h.pct))).toEqual([0, 20, 50, 100]);
  });

  it("sin ella, la línea sigue teniendo tres hitos", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-05", "2026-08-21"), "2026-08-01");
    expect(l.hitos).toHaveLength(3);
    expect(l.hitos[1].etiqueta).toBe("Planificación");
  });

  it("con la fabricación después de la solicitada, la escala la marca la fabricación", () => {
    // Pasa de verdad en RPS: un pedido que va tarde. El hito no puede salirse
    // de la línea, así que el extremo derecho es la fecha más tardía.
    const l = lineaTiempo(
      {
        ...p("2026-08-01", "2026-08-05", "2026-08-21"),
        fechaFabricacion: "2026-08-31",
      },
      "2026-08-01",
    );
    const pcts = Object.fromEntries(l.hitos.map((h) => [h.clave, Math.round(h.pct)]));
    expect(pcts.fabricacion).toBe(100);
    expect(pcts.solicitada).toBe(67);
    expect(l.hitos.every((h) => h.pct >= 0 && h.pct <= 100)).toBe(true);
  });
});

describe("repartirEtiquetas", () => {
  it("deja en paz lo que ya cabe", () => {
    expect(repartirEtiquetas([0, 50, 100], 15)).toEqual([0, 50, 100]);
  });

  it("separa dos fechas pegadas sin mover el resto", () => {
    // 40 y 44 se pisan con separación 15: la segunda se va a 55.
    expect(repartirEtiquetas([0, 40, 44, 100], 15)).toEqual([0, 40, 55, 100]);
  });

  it("recoge hacia atrás cuando el empuje se sale por la derecha", () => {
    const r = repartirEtiquetas([80, 90, 100], 15);
    expect(r).toEqual([70, 85, 100]);
    expect(Math.max(...r)).toBeLessThanOrEqual(100);
  });

  it("respeta el margen de los extremos", () => {
    const r = repartirEtiquetas([0, 100], 15, 6);
    expect(r).toEqual([6, 94]);
  });

  it("devuelve las posiciones en el orden de entrada, no en el de la línea", () => {
    // Fechas desordenadas: la 3ª de pintado cae la primera en el tiempo.
    const r = repartirEtiquetas([90, 95, 10], 15);
    expect(r[2]).toBe(10);
    expect(r[1]).toBeGreaterThan(r[0]);
  });

  it("aprieta al mínimo cuando no cabe ninguna separación", () => {
    const r = repartirEtiquetas([50, 50, 50, 50, 50], 40);
    expect(Math.min(...r)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...r)).toBeLessThanOrEqual(100);
  });
});

// ─── Fechas que RPS da mal, o que no da ─────────────────────────────────────
// La mitad del tablero real tiene alguna fecha que no cuadra: 32 de 93 con la
// fabricación antes que el planteo, y 25 sin fecha de planificación. La línea
// tiene que seguir contando algo cierto en esos casos.
describe("lineaTiempo con datos malos de RPS", () => {
  it("descarta la fabricación anterior al planteo: no se acaba lo que no se ha empezado", () => {
    // Caso real AR.25.02771: planteo el 07/08 y fabricación el 21/05.
    const l = lineaTiempo(
      {
        fechaPlanificacion: "2026-08-07",
        fechaFabricacion: "2026-05-21",
        fechaEntrega: "2026-06-01",
      },
      "2026-08-10",
    );
    expect(l.hitos.map((h) => h.clave)).toEqual(["planificacion", "solicitada"]);
  });

  it("fabricar DESPUÉS de la solicitada sí se pinta: es un pedido que va tarde", () => {
    const l = lineaTiempo(
      {
        fechaPlanificacion: "2026-08-01",
        fechaFabricacion: "2026-09-15",
        fechaEntrega: "2026-09-01",
      },
      "2026-08-10",
    );
    expect(l.hitos.map((h) => h.clave)).toEqual([
      "planificacion",
      "fabricacion",
      "solicitada",
    ]);
  });

  it("sin fecha de planteo NO se pinta hito de planificación: sería la solicitada repetida", () => {
    const l = lineaTiempo(
      {
        fechaPlanificacion: "2026-09-01", // = la entrega, puesta por rps.ts
        planificacionEstimada: true,
        fechaFabricacion: "2026-08-20",
        fechaEntrega: "2026-09-01",
      },
      "2026-08-10",
    );
    expect(l.hitos.map((h) => h.clave)).toEqual(["fabricacion", "solicitada"]);
  });

  it("sin fecha de planteo, la REFERENCIA pasa a ser la solicitada", () => {
    const l = lineaTiempo(
      { fechaPlanificacion: "2026-09-01", planificacionEstimada: true, fechaEntrega: "2026-09-01" },
      "2026-08-10",
    );
    expect(l.hitos.find((h) => h.referencia)?.clave).toBe("solicitada");
  });

  it("con fecha de planteo, la referencia es la planificación y solo ella", () => {
    const l = lineaTiempo(p("2026-08-01", "2026-08-11", "2026-09-10"), "2026-08-01");
    expect(l.hitos.filter((h) => h.referencia).map((h) => h.clave)).toEqual(["planificacion"]);
  });

  it("la planificación prestada no descarta la fabricación anterior a ella", () => {
    // Comparar la fabricación contra una fecha que no es la de planteo no dice
    // nada de si es imposible, así que ahí no se descarta nada.
    const l = lineaTiempo(
      {
        fechaPlanificacion: "2026-09-01",
        planificacionEstimada: true,
        fechaFabricacion: "2026-08-20",
        fechaEntrega: "2026-09-01",
      },
      "2026-08-10",
    );
    expect(l.hitos.some((h) => h.clave === "fabricacion")).toBe(true);
  });
});

describe("fabricación anterior a la creación del pedido", () => {
  it("no se pinta: no se acaba de fabricar lo que nadie ha pedido todavía", () => {
    // Caso real AR.26.03947: pedido de venta del 07/08, OF creada el 10/08 y
    // ManualEndDate del 06/08 — el mismo valor en sus cuatro OF.
    const l = lineaTiempo(
      {
        fechaCreacion: "2026-08-07",
        fechaPlanificacion: "2026-08-13",
        planificacionEstimada: true,
        fechaFabricacion: "2026-08-06",
        fechaEntrega: "2026-08-13",
      },
      "2026-08-10",
    );
    expect(l.hitos.map((h) => h.clave)).toEqual(["creacion", "solicitada"]);
  });

  it("la comprobación NO depende del planteo, así que vale sin planificación", () => {
    const conPlanteo = lineaTiempo(
      {
        fechaCreacion: "2026-08-07",
        fechaPlanificacion: "2026-08-09",
        fechaFabricacion: "2026-08-06",
        fechaEntrega: "2026-08-20",
      },
      "2026-08-10",
    );
    expect(conPlanteo.hitos.some((h) => h.clave === "fabricacion")).toBe(false);
  });
});

// ─── La escalada de urgencia ─────────────────────────────────────────────────
// Vivía dentro de ListaView y no se podía probar sin montar la tabla entera.
// Ahora la comparten la fila de Pendientes y la línea del detalle, así que un
// fallo aquí cambia el color en los dos sitios a la vez.

describe("tramosRecorrido", () => {
  it("parte la línea en holgado · trabajo · ajustado", () => {
    expect(tramosRecorrido(40, 70)).toEqual([
      { desde: 0, hasta: 40, color: TRAMO.holgado },
      { desde: 40, hasta: 70, color: TRAMO.trabajo },
      { desde: 70, hasta: 100, color: TRAMO.ajustado },
    ]);
  });

  it("sin fabricación, el tramo de trabajo llega hasta el final", () => {
    expect(tramosRecorrido(40, undefined)).toEqual([
      { desde: 0, hasta: 40, color: TRAMO.holgado },
      { desde: 40, hasta: 100, color: TRAMO.trabajo },
    ]);
  });

  it("una fabricación anterior al planteo no dibuja un tramo negativo", () => {
    expect(tramosRecorrido(70, 40).every((t) => t.hasta > t.desde)).toBe(true);
  });

  it("recorta fuera de [0, 100]", () => {
    expect(tramosRecorrido(-20, 150)).toEqual([
      { desde: 0, hasta: 100, color: TRAMO.trabajo },
    ]);
  });
});

describe("urgenciaRecorrido", () => {
  // Planteo el 11, fabricación el 21, entrega el 31: el pedido entra el 01.
  const pedido = {
    fechaCreacion: "2026-08-01",
    fechaPlanificacion: "2026-08-11",
    fechaFabricacion: "2026-08-21",
    fechaEntrega: "2026-08-31",
  };
  const el = (hoy: string) => urgenciaRecorrido(lineaTiempo(pedido, hoy), pedido, hoy);

  it("antes de la planificada va en verde", () => {
    const u = el("2026-08-05");
    expect(u.color).toBe(TRAMO.holgado);
    expect(u.actual?.color).toBe(TRAMO.holgado);
  });

  it("EL DÍA de la planificada sigue en verde y con tramo pintado", () => {
    // Es el caso que se veía mal: `hoyPct` cae justo en el corte y el tramo de
    // trabajo se lo llevaba, así que la línea se ponía naranja a primera hora
    // del día en que tocaba plantear. Y luego, al dejar de pintar el tramo ese
    // día, la barra se quedaba gris — que en el resto de la lista significa
    // "sin fecha".
    const u = el("2026-08-11");
    expect(u.esHoyLaPlanificada).toBe(true);
    expect(u.enPlazo).toBe(true);
    expect(u.color).toBe(TRAMO.holgado);
    expect(u.actual).toEqual({ desde: 0, hasta: expect.any(Number), color: TRAMO.holgado });
  });

  it("al día siguiente ya es tramo de trabajo", () => {
    const u = el("2026-08-12");
    expect(u.diasTarde).toBe(1);
    expect(u.color).toBe(TRAMO.trabajo);
  });

  it("pasada la fabricación, el retraso come el margen de Producción", () => {
    expect(el("2026-08-25").color).toBe(TRAMO.ajustado);
  });

  it("pasada la entrega manda el morado, fuera de la escalada", () => {
    const u = el("2026-09-05");
    expect(u.vencido).toBe(true);
    expect(u.color).toBe(TRAMO.fuera);
  });

  it("sin fecha de planteo no se colorea nada: no hay retraso que afirmar", () => {
    const prestada = {
      fechaCreacion: "2026-08-07",
      fechaPlanificacion: "2026-08-13",
      planificacionEstimada: true,
      fechaEntrega: "2026-08-13",
    };
    const u = urgenciaRecorrido(lineaTiempo(prestada, "2026-08-20"), prestada, "2026-08-20");
    expect(u.sinPlanificar).toBe(true);
    expect(u.color).toBeUndefined();
    expect(u.tramos).toEqual([]);
    expect(u.actual).toBeNull();
  });
});
