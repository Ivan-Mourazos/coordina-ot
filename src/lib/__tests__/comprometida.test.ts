import { describe, expect, test } from "vitest";
import { comprometidaVencida, ultimaComprometida } from "../comprometida";
import { FILTROS_VACIOS, aplicarFiltros, filtrosAParams, filtrosActivos, paramsAFiltros } from "../filtros";
import type { OF, Pedido } from "../types";

const HOY = "2026-10-30";

const fila = (pedido: string | null, fecha: string | null, grabada: string) => ({ pedido, fecha, grabada });

describe("ultimaComprometida", () => {
  test("de varios formularios del pedido vale el último que se grabó", () => {
    // La mayor fecha no es la buena: se puede adelantar lo comprometido.
    const m = ultimaComprometida([
      fila("AR.26.01813", "2026-11-20", "2026-10-01T08:00:00Z"),
      fila("AR.26.01813", "2026-11-03", "2026-10-20T08:00:00Z"),
      fila("AR.26.01813", "2026-11-10", "2026-10-10T08:00:00Z"),
    ]);
    expect(m.get("AR.26.01813")).toBe("2026-11-03");
  });

  test("un formulario sin fecha o sin pedido no borra ni inventa nada", () => {
    const m = ultimaComprometida([
      fila("AR.26.04842", "2026-11-03", "2026-10-26T08:00:00Z"),
      fila("AR.26.04842", null, "2026-10-27T08:00:00Z"),
      fila(null, "2026-11-05", "2026-10-27T08:00:00Z"),
      fila("  ", "2026-11-05", "2026-10-27T08:00:00Z"),
    ]);
    expect([...m]).toEqual([["AR.26.04842", "2026-11-03"]]);
  });

  test("el código llega limpio aunque RPS lo traiga con espacios", () => {
    const m = ultimaComprometida([fila("AR.26.04842  ", "2026-11-03", "2026-10-26T08:00:00Z")]);
    expect(m.get("AR.26.04842")).toBe("2026-11-03");
  });
});

describe("comprometidaVencida", () => {
  test("solo si ya pasó: el mismo día todavía se llega", () => {
    expect(comprometidaVencida({ fechaComprometida: "2026-10-29", situacion: "procesado" }, HOY)).toBe(true);
    expect(comprometidaVencida({ fechaComprometida: "2026-10-30", situacion: "procesado" }, HOY)).toBe(false);
  });

  test("pasado a Producción ya no es problema de la web", () => {
    expect(comprometidaVencida({ fechaComprometida: "2026-10-29", situacion: "completado" }, HOY)).toBe(false);
  });

  test("sin fecha comprometida no hay nada que vencer", () => {
    expect(comprometidaVencida({ situacion: "procesado" }, HOY)).toBe(false);
  });
});

describe("filtro «Con fecha comprometida»", () => {
  const of = { id: "1:1", estado: "pendiente", familia: "TOLDOS", autorId: null, revisorId: null } as unknown as OF;
  const pedido = (codigo: string, fechaComprometida?: string) =>
    ({
      id: codigo, codigo, cliente: "X", situacion: "procesado", prioridad: 1,
      fechaPlanificacion: "2026-11-01", fechaEntrega: "2026-11-05", fechaSolicitud: "2026-10-01",
      ofs: [of], fechaComprometida,
    }) as unknown as Pedido;

  test("deja solo los pedidos que la tienen", () => {
    const p = aplicarFiltros(
      [pedido("A", "2026-11-03"), pedido("B")],
      { ...FILTROS_VACIOS, soloComprometidos: true },
      HOY,
    );
    expect(p.map((x) => x.codigo)).toEqual(["A"]);
  });

  test("viaja en la URL y cuenta como filtro activo", () => {
    const f = { ...FILTROS_VACIOS, soloComprometidos: true };
    expect(paramsAFiltros(filtrosAParams(f)).soloComprometidos).toBe(true);
    expect(filtrosActivos(f)).toContain("con fecha comprometida");
  });
});
