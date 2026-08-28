import { describe, expect, it } from "vitest";
import {
  calcularMetricas,
  proporcionDevueltas,
  type MovimientoRegistrado,
} from "../metricas";

const mov = (
  at: string,
  motivo: string,
  ofId: string,
  observacion: string | null = null,
): MovimientoRegistrado => ({ at, motivo, ofId, observacion });

describe("cuántas vuelven", () => {
  it("cuenta cada devolución, aunque sea la misma OF otra vez", () => {
    // El motivo de contar desde el REGISTRO y no desde el estado de la OF:
    // `observacion` guarda solo la última, así que una OF que vuelve dos veces
    // se contaría una sola. Aquí son dos, que es lo que pasó.
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1] la cota"),
      mov("2026-08-05T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-05T11:00:00.000Z", "devolver", "of1", "[1] otra vez la cota"),
    ]);
    expect(m.devoluciones).toBe(2);
    // Y dos repasos: el segundo también podía haber acabado bien.
    expect(m.revisiones).toBe(2);
  });

  it("lo que no es revisar ni devolver no entra", () => {
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "aprobar", "of1"),
      mov("2026-08-03T10:00:00.000Z", "asignar", "of1"),
    ]);
    expect(m).toMatchObject({ revisiones: 0, devoluciones: 0, porCausa: [], porMes: [] });
  });
});

describe("por qué vuelven", () => {
  it("una devolución con tres causas cuenta en las tres", () => {
    // Es el caso real: el revisor repasa entera y apunta todo lo que ve. Por
    // eso las causas suman MÁS que las devoluciones, y así se lee.
    const m = calcularMetricas([
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1,2,4] cota, largo y color"),
    ]);
    expect(m.devoluciones).toBe(1);
    expect(m.porCausa).toEqual([
      { id: 1, n: 1 },
      { id: 2, n: 1 },
      { id: 4, n: 1 },
    ]);
  });

  it("ordena de más frecuente a menos", () => {
    const m = calcularMetricas([
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1,2] a"),
      mov("2026-08-04T11:00:00.000Z", "devolver", "of2", "[2] b"),
      mov("2026-08-05T11:00:00.000Z", "devolver", "of3", "[2] c"),
    ]);
    expect(m.porCausa).toEqual([
      { id: 2, n: 3 },
      { id: 1, n: 1 },
    ]);
  });

  it("las de antes de las causas se cuentan aparte, no se esconden", () => {
    // Esconderlas haría que los porcentajes no cuadraran con el total sin
    // decir por qué. Van con `id: null`, y a igualdad de cuenta las últimas:
    // ese cajón no dice nada y no puede encabezar la lista.
    const m = calcularMetricas([
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "Faltan las medidas"),
      mov("2026-08-04T11:00:00.000Z", "devolver", "of2", "[3] material"),
    ]);
    expect(m.porCausa).toEqual([
      { id: 3, n: 1 },
      { id: null, n: 1 },
    ]);
  });

  it("la misma causa repetida en una devolución cuenta una vez", () => {
    const m = calcularMetricas([mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[2,2] x")]);
    expect(m.porCausa).toEqual([{ id: 2, n: 1 }]);
  });
});

describe("si va a mejor", () => {
  it("agrupa por mes, del más antiguo al más reciente", () => {
    const m = calcularMetricas([
      mov("2026-09-02T10:00:00.000Z", "empezar_revision", "of3"),
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1] x"),
      mov("2026-08-10T10:00:00.000Z", "empezar_revision", "of2"),
    ]);
    expect(m.porMes).toEqual([
      { mes: "2026-08", revisiones: 2, devoluciones: 1 },
      { mes: "2026-09", revisiones: 1, devoluciones: 0 },
    ]);
  });
});

describe("la proporción", () => {
  it("es devoluciones entre revisiones", () => {
    expect(proporcionDevueltas({ revisiones: 20, devoluciones: 4 })).toBe(0.2);
  });

  it("sin revisiones no hay proporción, y no es cero", () => {
    // Un 0 % diria que todo va bien; lo que pasa es que no se ha revisado nada.
    expect(proporcionDevueltas({ revisiones: 0, devoluciones: 0 })).toBeNull();
  });
});
