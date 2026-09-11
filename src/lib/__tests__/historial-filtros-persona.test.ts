import { describe, expect, it } from "vitest";
import { construirFiltros } from "../historial";

// Los dos filtros nuevos del Historial van en la consulta, no en el navegador:
// la lista se carga por páginas de 40 y filtrar en pantalla dejaría páginas
// medio vacías.

describe("filtros del Historial: sección y persona", () => {
  it("«solo con trabajo de la sección» deja fuera los pedidos de otros centros", () => {
    const { clausulas } = construirFiltros({ page: 0, soloSeccion: true });
    expect(clausulas).toContain("p.tiene_seccion = 1");
  });

  it("sin el interruptor no se añade nada", () => {
    expect(construirFiltros({ page: 0 }).clausulas).toEqual([]);
  });

  it("por persona: pedidos en los que ese empleado imputó tiempo, con el código como parámetro", () => {
    const { clausulas, params } = construirFiltros({ page: 0, operario: "ivan", empleado: "195" });
    expect(clausulas).toHaveLength(1);
    expect(clausulas[0]).toContain("e3.CodEmployee = @empleado");
    expect(clausulas[0]).not.toContain("195");
    expect(params).toEqual([{ nombre: "empleado", valor: "195" }]);
  });

  it("alguien que no es del equipo no trae ningún pedido, en vez de traerlos todos", () => {
    const { clausulas, params } = construirFiltros({ page: 0, operario: "desconocido" });
    expect(clausulas).toEqual(["1 = 0"]);
    expect(params).toEqual([]);
  });

  it("un código que no es numérico tampoco se cuela en la consulta", () => {
    const { clausulas } = construirFiltros({ page: 0, operario: "ivan", empleado: "195' OR 1=1 --" });
    expect(clausulas).toEqual(["1 = 0"]);
  });

  it("se combinan con familia y fechas", () => {
    const { clausulas } = construirFiltros({
      page: 0, operario: "ivan", empleado: "195", familia: "PUERTAS", desde: "2026-09-04", soloSeccion: true,
    });
    expect(clausulas).toHaveLength(4);
  });
});
