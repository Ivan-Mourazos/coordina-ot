import { describe, expect, it } from "vitest";
import { deducirRoles } from "../server/historial-db";
import type { HistorialOF } from "../historial";

const of = (extra: Partial<HistorialOF> = {}): HistorialOF => ({
  codigo: "0230951",
  descripcion: "TECHO CAMION",
  tiempoImputadoMin: 0,
  quien: [],
  ...extra,
});

describe("deducirRoles", () => {
  it("el que más tiempo lleva planteó y el que lleva poco revisó", () => {
    const r = deducirRoles(of(), new Map([["Alberto", 120], ["Jaime", 15]]));
    expect(r.rolDeducido).toEqual({ quienPlanteo: ["Alberto"], quienReviso: ["Jaime"] });
  });

  it("con reparto parejo cuenta a los dos como autores", () => {
    // 50/50 no es "uno revisó": es trabajo repartido, y decir lo contrario
    // le quitaría el planteo a alguien que sí lo hizo.
    const r = deducirRoles(of(), new Map([["Alberto", 60], ["Tamara", 55]]));
    expect(r.rolDeducido?.quienPlanteo).toEqual(["Alberto", "Tamara"]);
    expect(r.rolDeducido?.quienReviso).toEqual([]);
  });

  it("con una sola persona no se inventa un revisor", () => {
    const r = deducirRoles(of(), new Map([["Adrián", 90]]));
    expect(r.rolDeducido).toEqual({ quienPlanteo: ["Adrián"], quienReviso: [] });
  });

  it("separa varios revisores de varios autores", () => {
    const r = deducirRoles(
      of(),
      new Map([["Alberto", 100], ["Tamara", 80], ["Jaime", 10], ["Ángel", 5]]),
    );
    expect(r.rolDeducido?.quienPlanteo).toEqual(["Alberto", "Tamara"]);
    expect(r.rolDeducido?.quienReviso).toEqual(["Jaime", "Ángel"]);
  });

  it("los roles fichados en CoordinaOT mandan sobre la deducción", () => {
    const conRol = of({
      rol: { planteoMin: 30, revisionMin: 5, quienPlanteo: ["Iván"], quienReviso: ["Ángel"] },
    });
    const r = deducirRoles(conRol, new Map([["Alberto", 999]]));
    expect(r.rolDeducido).toBeUndefined();
    expect(r.rol?.quienPlanteo).toEqual(["Iván"]);
  });

  it("sin minutos no deduce nada, en vez de inventarse un autor", () => {
    expect(deducirRoles(of(), undefined).rolDeducido).toBeUndefined();
    expect(deducirRoles(of(), new Map()).rolDeducido).toBeUndefined();
    expect(deducirRoles(of(), new Map([["Alberto", 0], ["Jaime", 0]])).rolDeducido).toBeUndefined();
  });
});
