import { describe, expect, it } from "vitest";
import { agruparAvisos, type AvisoSuelto } from "../notificaciones";
import type { OF, Pedido } from "../types";

const of = (id: string, extra: Partial<OF> = {}): OF => ({
  id,
  codigo: `OF-${id}`,
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
});

const pedido = (id: string, ofs: OF[]): Pedido => ({
  id,
  codigo: `AR.26.0000${id}`,
  cliente: "MAHOU",
  situacion: "procesado",
  fechaSolicitud: "2026-09-01",
  fechaPlanificacion: "2026-08-20",
  fechaEntrega: "2026-09-01",
  prioridad: 2,
  ofs,
  accent: "ninguno",
  lineas: 0,
  croquis: false,
});

describe("agruparAvisos", () => {
  it("un pedido mandado entero a revisar es UN aviso, no uno por OF", () => {
    const ofs = [of("a"), of("b"), of("c")];
    const p = pedido("1", ofs);
    const sueltos: AvisoSuelto[] = ofs.map((o) => ({ tipo: "revisar", pedido: p, of: o }));
    const r = agruparAvisos(sueltos);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pedidoEntero: true, totalOFs: 3 });
    expect(r[0].ofs).toHaveLength(3);
  });

  it("OF sueltas de un pedido de varias NO son el pedido entero", () => {
    const ofs = [of("a"), of("b"), of("c"), of("d"), of("e")];
    const p = pedido("1", ofs);
    const r = agruparAvisos([
      { tipo: "revisar", pedido: p, of: ofs[0] },
      { tipo: "revisar", pedido: p, of: ofs[1] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pedidoEntero: false, totalOFs: 5 });
    expect(r[0].ofs.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("las anuladas no cuentan: tres de cuatro con una anulada SÍ es el pedido entero", () => {
    const vivas = [of("a"), of("b"), of("c")];
    const p = pedido("1", [...vivas, of("z", { estado: "anulada" })]);
    const r = agruparAvisos(vivas.map((o) => ({ tipo: "revisar" as const, pedido: p, of: o })));
    expect(r[0]).toMatchObject({ pedidoEntero: true, totalOFs: 3 });
  });

  it("tipos distintos del mismo pedido no se mezclan", () => {
    const ofs = [of("a"), of("b")];
    const p = pedido("1", ofs);
    const r = agruparAvisos([
      { tipo: "revisar", pedido: p, of: ofs[0] },
      { tipo: "devuelta", pedido: p, of: ofs[1] },
    ]);
    expect(r.map((i) => i.tipo)).toEqual(["revisar", "devuelta"]);
  });

  it("pedidos distintos no se mezclan", () => {
    const p1 = pedido("1", [of("a")]);
    const p2 = pedido("2", [of("b")]);
    const r = agruparAvisos([
      { tipo: "revisar", pedido: p1, of: p1.ofs[0] },
      { tipo: "revisar", pedido: p2, of: p2.ofs[0] },
    ]);
    expect(r).toHaveLength(2);
  });

  it("el aviso de pedido completo no lleva OF y no se dice entero", () => {
    const p = pedido("1", [of("a"), of("b")]);
    const r = agruparAvisos([{ tipo: "pedidoCompleto", pedido: p, of: null }]);
    expect(r[0]).toMatchObject({ ofs: [], pedidoEntero: false });
  });

  it("conserva el orden de aparición y los datos del primero", () => {
    const p1 = pedido("1", [of("a")]);
    const p2 = pedido("2", [of("b")]);
    const r = agruparAvisos([
      { tipo: "recibida", pedido: p2, of: p2.ofs[0], quien: "Tamara", otro: "Iván" },
      { tipo: "recibida", pedido: p1, of: p1.ofs[0], quien: "Jaime" },
    ]);
    expect(r.map((i) => i.pedido.id)).toEqual(["2", "1"]);
    expect(r[0]).toMatchObject({ quien: "Tamara", otro: "Iván" });
  });
});
