import { describe, expect, it } from "vitest";
import type { OF, Pedido } from "../types";
import { contarRevisorEnEstado, facetsQueReviso, facetsRevisorEnEstado } from "../revision";

const of = (extra: Partial<OF>): OF => ({
  id: "of1",
  codigo: "OF-01",
  descripcion: "LONA toldo",
  familia: "LONA",
  piezas: 1,
  autorId: "ana",
  revisorId: null,
  estado: "pendiente",
  fichandoRol: null,
  tiempoEstimadoMin: 0,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
  ...extra,
});

const pedido = (id: string, ofs: OF[]): Pedido => ({
  id,
  codigo: `AR.${id}`,
  cliente: "Cliente X",
  situacion: "procesado",
  fechaSolicitud: "2026-01-01",
  fechaPlanificacion: "2026-01-05",
  fechaEntrega: "2026-01-10",
  prioridad: 2,
  ofs,
  accent: "ninguno",
  lineas: 0,
  croquis: false,
});

describe("facetsRevisorEnEstado", () => {
  it("sin identidad elegida (miId null) no hay nada mío", () => {
    const pedidos = [pedido("1", [of({ id: "1:1", estado: "por_revisar", revisorId: "tamara" })])];
    expect(facetsRevisorEnEstado(pedidos, "por_revisar", null)).toEqual([]);
  });

  it("solo entra la OF cuyo revisor soy yo, no las de compañeros", () => {
    const mia = of({ id: "1:1", estado: "por_revisar", revisorId: "tamara" });
    const ajena = of({ id: "1:2", estado: "por_revisar", revisorId: "angel" });
    const pedidos = [pedido("1", [mia, ajena])];
    const facets = facetsRevisorEnEstado(pedidos, "por_revisar", "tamara");
    expect(facets).toHaveLength(1);
    expect(facets[0].ofs.map((o) => o.id)).toEqual(["1:1"]);
  });

  it("filtra también por estado: en_revision no aparece en la columna por_revisar", () => {
    const pedidos = [
      pedido("1", [of({ id: "1:1", estado: "en_revision", revisorId: "tamara" })]),
    ];
    expect(facetsRevisorEnEstado(pedidos, "por_revisar", "tamara")).toEqual([]);
    expect(facetsRevisorEnEstado(pedidos, "en_revision", "tamara")).toHaveLength(1);
  });

  it("un pedido con varias OF solo agrupa las que son mías y de ese estado", () => {
    const pedidos = [
      pedido("1", [
        of({ id: "1:1", estado: "por_revisar", revisorId: "tamara" }),
        of({ id: "1:2", estado: "por_revisar", revisorId: "angel" }),
        of({ id: "1:3", estado: "aprobada", revisorId: "tamara" }),
      ]),
    ];
    const facets = facetsRevisorEnEstado(pedidos, "por_revisar", "tamara");
    expect(facets).toHaveLength(1);
    expect(facets[0].ofs.map((o) => o.id)).toEqual(["1:1"]);
  });

  it("pedidos sin ninguna OF mía en ese estado no aparecen (no hay facets vacíos)", () => {
    const pedidos = [
      pedido("1", [of({ id: "1:1", estado: "por_revisar", revisorId: "angel" })]),
      pedido("2", [of({ id: "2:1", estado: "por_revisar", revisorId: "tamara" })]),
    ];
    const facets = facetsRevisorEnEstado(pedidos, "por_revisar", "tamara");
    expect(facets.map((f) => f.pedido.id)).toEqual(["2"]);
  });
});

describe("contarRevisorEnEstado", () => {
  it("sin identidad, cuenta cero", () => {
    const pedidos = [pedido("1", [of({ estado: "por_revisar", revisorId: "tamara" })])];
    expect(contarRevisorEnEstado(pedidos, "por_revisar", null)).toBe(0);
  });

  it("cuenta OF sueltas, no pedidos: dos OF mías en el mismo pedido cuentan dos", () => {
    const pedidos = [
      pedido("1", [
        of({ id: "1:1", estado: "en_revision", revisorId: "tamara" }),
        of({ id: "1:2", estado: "en_revision", revisorId: "tamara" }),
        of({ id: "1:3", estado: "en_revision", revisorId: "angel" }),
      ]),
    ];
    expect(contarRevisorEnEstado(pedidos, "en_revision", "tamara")).toBe(2);
  });

  it("no mezcla estados distintos", () => {
    const pedidos = [
      pedido("1", [
        of({ id: "1:1", estado: "por_revisar", revisorId: "tamara" }),
        of({ id: "1:2", estado: "en_revision", revisorId: "tamara" }),
      ]),
    ];
    expect(contarRevisorEnEstado(pedidos, "por_revisar", "tamara")).toBe(1);
    expect(contarRevisorEnEstado(pedidos, "en_revision", "tamara")).toBe(1);
  });
});

describe("facetsQueReviso", () => {
  it("sin identidad elegida (miId null) no hay nada mío", () => {
    const pedidos = [pedido("1", [of({ id: "1:1", estado: "por_revisar", revisorId: "tamara" })])];
    expect(facetsQueReviso(pedidos, null)).toEqual([]);
  });

  it("junta lo que está por empezar y lo que ya estoy revisando", () => {
    const pedidos = [
      pedido("1", [
        of({ id: "1:1", estado: "por_revisar", revisorId: "tamara" }),
        of({ id: "1:2", estado: "en_revision", revisorId: "tamara" }),
      ]),
    ];
    const facets = facetsQueReviso(pedidos, "tamara");
    expect(facets).toHaveLength(1);
    expect(facets[0].ofs.map((o) => o.id)).toEqual(["1:1", "1:2"]);
  });

  it("lo ya aprobado o devuelto por mí no entra: es historia", () => {
    const pedidos = [
      pedido("1", [
        of({ id: "1:1", estado: "aprobada", revisorId: "tamara" }),
        of({ id: "1:2", estado: "devuelta", revisorId: "tamara" }),
      ]),
    ];
    expect(facetsQueReviso(pedidos, "tamara")).toEqual([]);
  });

  it("no entran las de otro revisor ni las que planteo yo", () => {
    const pedidos = [
      pedido("1", [
        of({ id: "1:1", estado: "por_revisar", revisorId: "angel" }),
        of({ id: "1:2", estado: "por_revisar", autorId: "tamara", revisorId: "angel" }),
      ]),
    ];
    expect(facetsQueReviso(pedidos, "tamara")).toEqual([]);
  });

  it("una OF cerrada en RPS sale, como en el reparto por autor", () => {
    const pedidos = [
      pedido("1", [
        of({
          id: "1:1",
          estado: "por_revisar",
          revisorId: "tamara",
          cerradaRps: { at: "2026-09-15T10:00:00.000Z", por: "ana", modo: "activo" },
        }),
      ]),
    ];
    expect(facetsQueReviso(pedidos, "tamara")).toEqual([]);
  });

  it("ordena por fecha planificada y, a igualdad, por código; sin fecha, al final", () => {
    const mia = () => [of({ estado: "por_revisar", revisorId: "tamara" })];
    const pedidos = [
      { ...pedido("3", mia()), fechaPlanificacion: "" },
      { ...pedido("2", mia()), fechaPlanificacion: "2026-01-05" },
      { ...pedido("4", mia()), fechaPlanificacion: "2026-01-02" },
      { ...pedido("1", mia()), fechaPlanificacion: "2026-01-05" },
    ];
    expect(facetsQueReviso(pedidos, "tamara").map((f) => f.pedido.id)).toEqual(["4", "1", "2", "3"]);
  });
});
