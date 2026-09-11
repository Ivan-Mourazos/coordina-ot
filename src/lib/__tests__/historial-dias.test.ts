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

  it("con más páginas por cargar, el último día queda marcado como incompleto", () => {
    const dias = agruparPorDia(
      [item("A", new Date(2026, 8, 11, 10)), item("B", new Date(2026, 8, 10, 10))],
      { hayMas: true, hoy },
    );
    expect(dias.map((d) => d.incompleto)).toEqual([false, true]);
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
