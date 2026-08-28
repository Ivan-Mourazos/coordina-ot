import { describe, expect, it } from "vitest";
import { deducirRoles } from "../server/historial-db";
import { PARTE_AUTOR, repartirPorTiempo, type HistorialOF } from "../historial";

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
      rol: {
        planteoMin: 30,
        revisionMin: 5,
        planteo: [{ nombre: "Iván", min: 30 }],
        revision: [{ nombre: "Ángel", min: 5 }],
      },
    });
    const r = deducirRoles(conRol, new Map([["Alberto", 999]]));
    expect(r.rolDeducido).toBeUndefined();
    expect(r.rol?.planteo).toEqual([{ nombre: "Iván", min: 30 }]);
  });

  it("sin minutos no deduce nada, en vez de inventarse un autor", () => {
    expect(deducirRoles(of(), undefined).rolDeducido).toBeUndefined();
    expect(deducirRoles(of(), new Map()).rolDeducido).toBeUndefined();
    expect(deducirRoles(of(), new Map([["Alberto", 0], ["Jaime", 0]])).rolDeducido).toBeUndefined();
  });
});

// El criterio de deducción vive en `repartirPorTiempo` y lo comparten el
// detalle (por OF, vía `deducirRoles`) y la lista del historial (por pedido,
// vía `autoresDePagina`). Se prueba aparte porque el umbral de empate — el
// "si dudas, pon los dos" — es una decisión de producto, no un detalle interno.
describe("repartirPorTiempo (umbral de empate)", () => {
  it("el umbral es el 25 % del tiempo total del pedido", () => {
    expect(PARTE_AUTOR).toBe(0.25);
  });

  it("con 100 y 40 minutos van los dos: el segundo pasa del umbral", () => {
    // 40/140 = 28,5 % ≥ 25 %. Es el caso "se lo repartieron" del que habla el
    // usuario: poner solo a uno le quitaría el planteo a alguien que sí lo hizo.
    expect(repartirPorTiempo(new Map([["Alberto", 100], ["Tamara", 40]]))).toEqual({
      autores: ["Alberto", "Tamara"],
      revisores: [],
    });
  });

  it("con 100 y 20 minutos solo va el primero: el segundo revisó", () => {
    // 20/120 = 16,6 % < 25 %. Un repaso no es plantear.
    expect(repartirPorTiempo(new Map([["Alberto", 100], ["Jaime", 20]]))).toEqual({
      autores: ["Alberto"],
      revisores: ["Jaime"],
    });
  });

  it("justo en el umbral entra como autor, y un minuto por debajo no", () => {
    // Frontera exacta: 25/100 = 25 % entra; 24/100 = 24 % no. Se fija con un
    // test para que nadie la mueva sin querer al tocar el redondeo.
    expect(repartirPorTiempo(new Map([["Alberto", 75], ["Tamara", 25]]))?.autores).toEqual([
      "Alberto",
      "Tamara",
    ]);
    expect(repartirPorTiempo(new Map([["Alberto", 76], ["Tamara", 24]]))?.autores).toEqual([
      "Alberto",
    ]);
  });

  it("ordena a los autores por tiempo, de más a menos", () => {
    const r = repartirPorTiempo(new Map([["Jaime", 30], ["Alberto", 120], ["Tamara", 60]]));
    expect(r?.autores).toEqual(["Alberto", "Tamara"]);
    expect(r?.revisores).toEqual(["Jaime"]);
  });

  it("devuelve null cuando no hay nada que interpretar", () => {
    // null es "no se sabe quién lo planteó", que no es lo mismo que "nadie":
    // la lista deja el pedido sin autores en vez de inventarse uno.
    expect(repartirPorTiempo(undefined)).toBeNull();
    expect(repartirPorTiempo(new Map())).toBeNull();
    expect(repartirPorTiempo(new Map([["Alberto", 0], ["Jaime", 0]]))).toBeNull();
  });

  it("una sola persona es la autora aunque no tenga minutos", () => {
    // Sin nadie con quien comparar no hay reparto que dude: si solo ella tocó
    // la OF, la planteó ella.
    expect(repartirPorTiempo(new Map([["Adrián", 0]]))).toEqual({
      autores: ["Adrián"],
      revisores: [],
    });
  });
});
