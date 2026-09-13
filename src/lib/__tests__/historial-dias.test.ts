import { describe, expect, it } from "vitest";
import { agruparPorDia, tituloDia } from "../historial-dias";
import type { HistorialItem } from "../historial";

// El Historial va por días: un separador por día con cuántos pedidos salieron
// y el tiempo de la sección. Fechas locales (sin "Z") para no depender del
// huso horario de la máquina que pase los tests.

const hoy = new Date(2026, 8, 11, 12, 0); // viernes 11/09/2026
const item = (pedido: string, fecha: Date, extra: Partial<HistorialItem> = {}): HistorialItem => ({
  pedido,
  cliente: "MAHOU",
  finalizada: fecha.toISOString(),
  nOf: 1,
  ...extra,
});

describe("agruparPorDia", () => {
  it("agrupa en el orden en que llegan y cuenta el tiempo de la sección", () => {
    const dias = agruparPorDia(
      [
        item("A", new Date(2026, 8, 11, 10), { minutos: 12 }),
        item("B", new Date(2026, 8, 11, 9), { minutos: 30 }),
        item("C", new Date(2026, 8, 10, 17), { minutos: 5 }),
      ],
      { hayMas: false, hoy },
    );
    expect(dias.map((d) => [d.clave, d.items.map((i) => i.pedido), d.minutos])).toEqual([
      ["2026-09-11", ["A", "B"], 42],
      ["2026-09-10", ["C"], 5],
    ]);
  });

  it("los pedidos de otro centro salen en su día pero no suman al tiempo de la sección", () => {
    const [dia] = agruparPorDia(
      [
        item("A", new Date(2026, 8, 11, 10), { minutos: 12 }),
        item("T", new Date(2026, 8, 11, 9), { minutos: 468, otrosCentros: ["taller"] }),
      ],
      { hayMas: false, hoy },
    );
    expect(dia.items).toHaveLength(2);
    expect(dia.minutos).toBe(12);
  });

  it("manda la fecha en que se pasó en CoordinaOT sobre el cierre de RPS", () => {
    const dias = agruparPorDia(
      [item("A", new Date(2026, 8, 8, 10), { pasadoAt: new Date(2026, 8, 11, 8).toISOString() })],
      { hayMas: false, hoy },
    );
    expect(dias[0].clave).toBe("2026-09-11");
  });

  it("con más páginas por cargar, el último día queda marcado como parcial", () => {
    const dias = agruparPorDia(
      [item("A", new Date(2026, 8, 11, 10)), item("B", new Date(2026, 8, 10, 10))],
      { hayMas: true, hoy },
    );
    expect(dias.map((d) => d.parcial)).toEqual([false, true]);
  });

  it("sin fecha va a su propio grupo", () => {
    const dias = agruparPorDia([{ ...item("A", hoy), finalizada: "" }], { hayMas: false, hoy });
    expect(dias[0]).toMatchObject({ clave: "sin-fecha", titulo: "Sin fecha" });
  });
});

describe("tituloDia", () => {
  it("hoy y ayer se nombran; el resto, día de la semana y fecha", () => {
    expect(tituloDia(new Date(2026, 8, 11, 9), hoy)).toBe("Hoy, viernes 11/09/26");
    expect(tituloDia(new Date(2026, 8, 10, 9), hoy)).toBe("Ayer, jueves 10/09/26");
    expect(tituloDia(new Date(2026, 8, 8, 9), hoy)).toBe("Martes 08/09/26");
  });
});

describe("cuántos pedidos tuvo el día de verdad", () => {
  // El separador contaba solo lo cargado, así que el número crecía según
  // bajabas: «16+ pedidos» pasaba a 24 sin que hubiera cambiado nada. El
  // servidor sabe el total de cada día —la lista entera está en su memoria—,
  // así que lo manda y aquí se usa.
  it("usa el total del servidor aunque falten filas por cargar", () => {
    const dias = agruparPorDia(
      [item("A", new Date(2026, 8, 11, 10), { minutos: 12 })],
      { hayMas: true, hoy, totales: { "2026-09-11": 24 } },
    );
    expect(dias[0].total).toBe(24);
    // Y queda dicho que el TIEMPO sí es solo el de lo cargado: los minutos de
    // cada fila se piden a RPS por página, no están en la lista en memoria.
    expect(dias[0].parcial).toBe(true);
  });

  it("con el día entero cargado, ni total que corregir ni parcial", () => {
    const dias = agruparPorDia(
      [
        item("A", new Date(2026, 8, 11, 10), { minutos: 12 }),
        item("B", new Date(2026, 8, 11, 9), { minutos: 30 }),
      ],
      { hayMas: true, hoy, totales: { "2026-09-11": 2 } },
    );
    expect(dias[0].total).toBe(2);
    expect(dias[0].parcial).toBe(false);
  });

  it("sin totales del servidor se sigue como hasta ahora", () => {
    // La consulta SQL de respaldo no los trae. Ahí el número es el de lo
    // cargado y se dice con un «+», que es lo honesto.
    const dias = agruparPorDia(
      [item("A", new Date(2026, 8, 11, 10)), item("C", new Date(2026, 8, 10, 17))],
      { hayMas: true, hoy },
    );
    expect(dias.map((d) => [d.total, d.parcial])).toEqual([
      [null, false],
      [null, true],
    ]);
  });
});
