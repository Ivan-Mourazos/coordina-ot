import { expect, test } from "vitest";
import { aplicarTiemposFichaje } from "../server/tiempos";
import type { Tablero } from "../data";
import type { Intervalo } from "../fichaje";
import type { OF, Pedido } from "../types";

function of(id: string): OF {
  return {
    id, codigo: id, descripcion: "", familia: "TOLDO", piezas: 1,
    autorId: null, revisorId: null, estado: "pendiente", fichandoRol: null,
    tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0,
  };
}
function pedido(ofs: OF[]): Pedido {
  return {
    id: "AR1", codigo: "AR1", cliente: "C", situacion: "procesado",
    fechaSolicitud: "2026-07-22", fechaPlanificacion: "2026-07-22",
    fechaEntrega: "2026-07-22", prioridad: 2, ofs,
    accent: "ninguno", lineas: 0, croquis: false,
  };
}

test("suma minutos de planteo y revisión a la OF", () => {
  const tablero: Tablero = { operarios: [], pedidos: [pedido([of("OF-1")])] };
  const intervalos: Intervalo[] = [
    { inicio: "2026-07-22T08:00:00.000Z", fin: "2026-07-22T08:10:00.000Z", ofIds: ["OF-1"], rol: "plantear", operarioId: "a" },
    { inicio: "2026-07-22T09:00:00.000Z", fin: "2026-07-22T09:05:00.000Z", ofIds: ["OF-1"], rol: "revisar", operarioId: "b" },
  ];
  const out = aplicarTiemposFichaje(tablero, intervalos, "2026-07-22T10:00:00.000Z");
  const ofOut = out.pedidos[0].ofs[0];
  expect(ofOut.tiempoPlanteoMin).toBe(10);
  expect(ofOut.tiempoRevisionMin).toBe(5);
});

test("un intervalo abierto cuenta hasta 'ahora'", () => {
  const tablero: Tablero = { operarios: [], pedidos: [pedido([of("OF-1")])] };
  const intervalos: Intervalo[] = [
    { inicio: "2026-07-22T08:00:00.000Z", fin: null, ofIds: ["OF-1"], rol: "plantear", operarioId: "a" },
  ];
  const out = aplicarTiemposFichaje(tablero, intervalos, "2026-07-22T08:30:00.000Z");
  expect(out.pedidos[0].ofs[0].tiempoPlanteoMin).toBe(30);
});

test("sin intervalos devuelve el tablero sin tocar", () => {
  const tablero: Tablero = { operarios: [], pedidos: [pedido([of("OF-1")])] };
  const out = aplicarTiemposFichaje(tablero, [], "2026-07-22T10:00:00.000Z");
  expect(out).toBe(tablero);
});
