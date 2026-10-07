import { describe, expect, it } from "vitest";
import {
  agruparAvisos,
  aplicarDescartes,
  avisaParteNuevo,
  esDescartable,
  identidadAviso,
  type NotifItem,
} from "../notificaciones";
import type { OF, Pedido } from "../types";

// Re-escanean el parte de un pedido que Producción tiene detenido: no se puede
// tocar, así que la campana no tiene por qué sonar. Cuando lo liberen, sí.

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

const pedido = (ofs: OF[], scanCambiado = true): Pedido => ({
  id: "1",
  codigo: "AR.26.00001",
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
  scanCambiado,
});

describe("aviso de parte re-escaneado", () => {
  it("suena en un pedido con trabajo de OT", () => {
    expect(avisaParteNuevo(pedido([of("a")]), "tamara")).toBe(true);
  });

  it("no suena si todo su trabajo está detenido por Producción", () => {
    expect(avisaParteNuevo(pedido([of("a", { detenida: true }), of("b", { detenida: true })]), "tamara")).toBe(false);
  });

  it("una detenida al lado de trabajo vivo no lo calla", () => {
    expect(avisaParteNuevo(pedido([of("a", { detenida: true }), of("b")]), "tamara")).toBe(true);
  });

  it("vuelve a sonar en cuanto Producción lo libera", () => {
    const parado = pedido([of("a", { detenida: true })]);
    const liberado = pedido([of("a", { detenida: false })]);
    expect(avisaParteNuevo(parado, "tamara")).toBe(false);
    expect(avisaParteNuevo(liberado, "tamara")).toBe(true);
  });

  it("sin re-escaneo no hay aviso", () => {
    expect(avisaParteNuevo(pedido([of("a")], false), "tamara")).toBe(false);
  });
});

// Sonaba a todo el equipo, y para quitárselo de encima había que apagárselo a
// todos. Ahora es de quien lleva el pedido, y cada uno lo quita de su campana.
describe("a quién le suena el parte re-escaneado", () => {
  it("con autor, solo a él", () => {
    const p = pedido([of("a", { autorId: "ana" })]);
    expect(avisaParteNuevo(p, "ana")).toBe(true);
    expect(avisaParteNuevo(p, "tamara")).toBe(false);
  });

  it("repartido entre varios, a todos los que lo llevan y a nadie más", () => {
    const p = pedido([of("a", { autorId: "ana" }), of("b", { autorId: "angel" }), of("c")]);
    expect(avisaParteNuevo(p, "ana")).toBe(true);
    expect(avisaParteNuevo(p, "angel")).toBe(true);
    expect(avisaParteNuevo(p, "tamara")).toBe(false);
  });

  it("sin autor todavía, a todo el equipo: lo puede coger cualquiera", () => {
    expect(avisaParteNuevo(pedido([of("a")]), "tamara")).toBe(true);
  });

  it("ser el revisor no basta", () => {
    const p = pedido([of("a", { autorId: "ana", revisorId: "tamara", estado: "por_revisar" })]);
    expect(avisaParteNuevo(p, "tamara")).toBe(false);
  });

  it("el autor de una OF anulada no cuenta como quien lo lleva", () => {
    const p = pedido([of("a", { autorId: "ana", estado: "anulada" }), of("b")]);
    expect(avisaParteNuevo(p, "tamara")).toBe(true);
  });
});

describe("quitar el parte re-escaneado de mi campana", () => {
  const aviso = (marca: string): NotifItem =>
    agruparAvisos([{ tipo: "parteNuevo", pedido: pedido([of("a")]), of: null, clave: `parte:${marca}` }])[0];

  it("se puede descartar, y el descarte lo quita de lo visible", () => {
    const item = aviso("abc");
    expect(esDescartable(item)).toBe(true);
    const { visibles } = aplicarDescartes([item], [identidadAviso(item, "ot")], "ot");
    expect(visibles).toEqual([]);
  });

  it("un re-escaneo posterior vuelve a sonar aunque quitara el anterior", () => {
    const descartado = identidadAviso(aviso("abc"), "ot");
    const { visibles } = aplicarDescartes([aviso("def")], [descartado], "ot");
    expect(visibles).toHaveLength(1);
  });
});
