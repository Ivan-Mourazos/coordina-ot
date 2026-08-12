import { describe, expect, it } from "vitest";
import { autorDeImputaciones, desgloseImputaciones } from "../server/rps";

// El desglose de "quién echó cuánto" en una OF, que es lo que el panel enseña
// debajo del autor. Antes solo existía el total y el autor deducido, y en una OF
// con dos personas el total salía entero bajo el que más llevaba: en la 0217537
// real son 21 h 27 de Alberto y 1 h 33 de Jaime, y se leían como 23 h suyas.
//
// Códigos de empleado reales del mapa de OT (server/operarios.ts): 10 = Alberto,
// 120 = Jaime. 188 (Lucía) no es de OT: imputa en tareas nuestras y aparece en
// el desglose, pero no puede ser autor.
//
// Las fechas se construyen con el constructor local (año, mes, día): `fechaISO`
// lee el día en hora local y un `new Date("2026-07-21")` es medianoche UTC, que
// en otro huso cae en el día anterior.

const fila = (empleado: string, nombre: string, minutos: number, desde?: Date) => ({
  orden: "0217537",
  tarea: "5",
  empleado,
  nombre,
  minutos,
  desde,
});

describe("desgloseImputaciones", () => {
  it("una línea por persona, de más minutos a menos", () => {
    const d = desgloseImputaciones([
      fila("120", "VAZQUEZ VILLARES, JAIME", 93),
      fila("10", "CARBON SEXTO, ALBERTO", 1287),
    ]);
    expect(d.map((i) => [i.operarioId, i.minutos])).toEqual([
      ["alberto", 1287],
      ["jaime", 93],
    ]);
  });

  it("los minutos suman el total: el desglose no puede contradecir al reloj", () => {
    const filas = [
      fila("10", "CARBON SEXTO, ALBERTO", 1287),
      fila("120", "VAZQUEZ VILLARES, JAIME", 93),
    ];
    const total = desgloseImputaciones(filas).reduce((n, i) => n + i.minutos, 0);
    expect(total).toBe(1380);
  });

  it("suma las filas repetidas del mismo empleado y guarda su fecha más temprana", () => {
    // La SQL ya agrupa por empleado, pero la función no depende de ello.
    const d = desgloseImputaciones([
      fila("10", "CARBON SEXTO, ALBERTO", 40, new Date(2026, 6, 21)),
      fila("10", "CARBON SEXTO, ALBERTO", 20, new Date(2025, 9, 10)),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].minutos).toBe(60);
    expect(d[0].desde).toBe("2025-10-10");
  });

  it("las fechas inservibles de RPS no dejan fecha puesta", () => {
    // 1900-01-01 es el centinela de RPS para 'sin fecha'.
    const d = desgloseImputaciones([
      fila("10", "CARBON SEXTO, ALBERTO", 5, new Date(1900, 0, 1)),
      fila("120", "VAZQUEZ VILLARES, JAIME", 5),
    ]);
    expect(d.every((i) => i.desde === undefined)).toBe(true);
  });

  it("quien no es de OT también sale, con su nombre de RPS", () => {
    // Su tiempo está dentro del total que se ve arriba, así que esconderlo
    // dejaría minutos sin dueño. operarioId null = no hay a quién asignarle.
    const d = desgloseImputaciones([fila("188", "GOMEZ CAMINO, LUCIA", 726)]);
    expect(d[0].operarioId).toBeNull();
    expect(d[0].nombre).toBe("GOMEZ CAMINO, LUCIA");
  });

  it("sin nombre en RPS queda el código, no un hueco", () => {
    expect(desgloseImputaciones([fila("999", "  ", 3)])[0].nombre).toBe("Empleado 999");
  });

  it("filas sin empleado se descartan", () => {
    expect(desgloseImputaciones([{ orden: "x", tarea: "5", empleado: null, minutos: 9 }]))
      .toEqual([]);
  });
});

describe("autorDeImputaciones", () => {
  it("el operario de OT con más minutos", () => {
    const d = desgloseImputaciones([
      fila("10", "CARBON SEXTO, ALBERTO", 1287),
      fila("120", "VAZQUEZ VILLARES, JAIME", 93),
    ]);
    expect(autorDeImputaciones(d)).toBe("alberto");
  });

  it("se salta a los de fuera de OT aunque lleven más tiempo", () => {
    // Lucía no está en el tablero: no se le puede asignar la OF. El autor es el
    // de OT que haya, y el desglose sigue enseñando las horas de ella.
    const d = desgloseImputaciones([
      fila("188", "GOMEZ CAMINO, LUCIA", 726),
      fila("120", "VAZQUEZ VILLARES, JAIME", 93),
    ]);
    expect(autorDeImputaciones(d)).toBe("jaime");
  });

  it("sin nadie de OT no hay autor: la OF va a Sin asignar", () => {
    expect(autorDeImputaciones(desgloseImputaciones([fila("188", "GOMEZ CAMINO, LUCIA", 726)])))
      .toBeNull();
    expect(autorDeImputaciones([])).toBeNull();
  });
});
