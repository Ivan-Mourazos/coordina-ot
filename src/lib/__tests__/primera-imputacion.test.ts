import { describe, expect, it } from "vitest";
import { primeraImputacion } from "../server/rps";

// `fichadaDesde`: el día en que se empezó a fichar una OF en RPS, aunque fuera
// años antes de que existiera CoordinaOT. Sale de MIN(ImputationDate) por
// empleado, así que a esta función le llega UNA fecha por cada persona que le
// echó tiempo a la OF y tiene que quedarse con la primera de todas.
//
// Las fechas se construyen con el constructor local (año, mes, día) a
// propósito: `fechaISO` lee el día en hora local, y un `new Date("2026-07-21")`
// es medianoche UTC, que en otro huso cae en el día anterior y haría que el
// test pasara o fallara según dónde se ejecute.

describe("primeraImputacion", () => {
  it("se queda con la más temprana, llegue en el orden que llegue", () => {
    // El caso de verdad: la query agrupa por empleado y nadie garantiza el
    // orden de las filas. Si Ana empezó en marzo y Luis en julio, la OF se
    // empezó en marzo — leer la fila de Luis diría julio.
    expect(
      primeraImputacion([new Date(2026, 6, 21), new Date(2026, 2, 4), new Date(2026, 4, 9)]),
    ).toBe("2026-03-04");
  });

  it("compara por fecha, no por cómo se escriba el mes", () => {
    // Diciembre contra enero del año siguiente, y septiembre contra octubre:
    // los dos pares se ordenan mal si el mes no va con su cero delante.
    expect(primeraImputacion([new Date(2026, 0, 1), new Date(2025, 11, 31)])).toBe("2025-12-31");
    expect(primeraImputacion([new Date(2026, 9, 1), new Date(2026, 8, 30)])).toBe("2026-09-30");
  });

  it("ignora las filas sin fecha", () => {
    expect(primeraImputacion([null, new Date(2026, 6, 21), undefined])).toBe("2026-07-21");
  });

  it("ignora el centinela de RPS: 1900 no es la fecha en que se empezó", () => {
    // RPS usa 1900-01-01 como "sin fecha". Si colara, sería la más temprana
    // siempre y todas las OF dirían que se empezaron hace un siglo.
    expect(primeraImputacion([new Date(1900, 0, 1), new Date(2026, 6, 21)])).toBe("2026-07-21");
  });

  it("sin ninguna fecha utilizable no se inventa nada", () => {
    // undefined = "nunca se le imputó tiempo", que es justo lo que el panel
    // necesita para seguir diciendo "Aún sin fichar" con razón.
    expect(primeraImputacion([])).toBeUndefined();
    expect(primeraImputacion([null, undefined])).toBeUndefined();
    expect(primeraImputacion([new Date(1900, 0, 1)])).toBeUndefined();
    expect(primeraImputacion([new Date(NaN)])).toBeUndefined();
  });
});
