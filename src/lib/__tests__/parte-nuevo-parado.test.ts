import { describe, expect, it } from "vitest";
import { avisaParteNuevo } from "../notificaciones";
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
    expect(avisaParteNuevo(pedido([of("a")]))).toBe(true);
  });

  it("no suena si todo su trabajo está detenido por Producción", () => {
    expect(avisaParteNuevo(pedido([of("a", { detenida: true }), of("b", { detenida: true })]))).toBe(false);
  });

  it("una detenida al lado de trabajo vivo no lo calla", () => {
    expect(avisaParteNuevo(pedido([of("a", { detenida: true }), of("b")]))).toBe(true);
  });

  it("vuelve a sonar en cuanto Producción lo libera", () => {
    const parado = pedido([of("a", { detenida: true })]);
    const liberado = pedido([of("a", { detenida: false })]);
    expect(avisaParteNuevo(parado)).toBe(false);
    expect(avisaParteNuevo(liberado)).toBe(true);
  });

  it("sin re-escaneo no hay aviso", () => {
    expect(avisaParteNuevo(pedido([of("a")], false))).toBe(false);
  });
});
