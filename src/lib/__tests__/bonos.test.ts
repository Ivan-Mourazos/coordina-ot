import { describe, expect, it } from "vitest";
import { bonosDe, partesLocales, BONO_FIJO } from "../bonos";
import type { Intervalo } from "../fichaje";

// Todas las horas de referencia van en verano peninsular (UTC+2), que es cuando
// el desfase con UTC es máximo: si la conversión estuviera mal, se ve enseguida.
//   2026-08-03T08:00:00Z = 10:00 en Madrid = 36000 s desde medianoche.

const iv = (inicio: string, fin: string | null, ofIds: string[]): Intervalo => ({
  inicio,
  fin,
  ofIds,
  rol: "plantear",
  operarioId: "ivan",
});

const COD = { ivan: "195" };

describe("partesLocales", () => {
  it("convierte a fecha y segundos desde medianoche en hora del taller", () => {
    expect(partesLocales(Date.parse("2026-08-03T08:00:00Z"))).toEqual({
      fecha: "2026-08-03",
      segundos: 36000,
    });
  });
  it("aplica el horario de invierno (UTC+1), no un desfase fijo", () => {
    expect(partesLocales(Date.parse("2026-01-15T08:00:00Z"))).toEqual({
      fecha: "2026-01-15",
      segundos: 32400,
    });
  });
  it("la medianoche local son 0 segundos, no 86400", () => {
    expect(partesLocales(Date.parse("2026-08-02T22:00:00Z"))).toEqual({
      fecha: "2026-08-03",
      segundos: 0,
    });
  });
});

describe("bonosDe: una sola OF", () => {
  it("genera un bono con el tramo entero", () => {
    const filas = bonosDe([iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0230344:2"])], COD);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      of: "0230344",
      numope: "2",
      operario: "195",
      ini: "2026-08-03",
      horaini: 36000,
      fin: "2026-08-03",
      horafin: 37800,
    });
  });

  it("rellena las columnas fijas con los valores que usa el mini-olanet", () => {
    const [fila] = bonosDe([iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["0230344:2"])], COD);
    expect(fila).toMatchObject(BONO_FIJO);
  });
});

describe("bonosDe: reparto entre varias OFs", () => {
  it("parte el tramo en sub-tramos iguales, contiguos y sin huecos", () => {
    const filas = bonosDe(
      [iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["A:1", "B:2"])],
      COD,
    );
    expect(filas.map((f) => [f.of, f.horaini, f.horafin])).toEqual([
      ["A", 36000, 36900],
      ["B", 36900, 37800],
    ]);
  });

  it("la cadena empieza y acaba en la hora real: el resto va al último tramo", () => {
    // 100 s entre 3 OFs → 33 + 33 + 34, no 33+33+33 dejando un segundo huérfano.
    const filas = bonosDe(
      [iv("2026-08-03T08:00:00Z", "2026-08-03T08:01:40Z", ["A:1", "B:2", "C:3"])],
      COD,
    );
    expect(filas.map((f) => f.horafin - f.horaini)).toEqual([33, 33, 34]);
    expect(filas[0].horaini).toBe(36000);
    expect(filas[filas.length - 1].horafin).toBe(36100);
  });

  it("respeta el orden de ofIds", () => {
    const filas = bonosDe(
      [iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["C:3", "A:1", "B:2"])],
      COD,
    );
    expect(filas.map((f) => f.of)).toEqual(["C", "A", "B"]);
  });

  it("reparte el tiempo, no lo duplica", () => {
    const filas = bonosDe(
      [iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["A:1", "B:2", "C:3"])],
      COD,
    );
    const total = filas.reduce((s, f) => s + (f.horafin - f.horaini), 0);
    expect(total).toBe(1800);
  });
});

describe("bonosDe: casos que no generan bono", () => {
  it("un intervalo abierto no genera nada (aún no ha terminado)", () => {
    expect(bonosDe([iv("2026-08-03T08:00:00Z", null, ["A:1"])], COD)).toEqual([]);
  });

  it("un intervalo de duración cero no genera nada", () => {
    expect(
      bonosDe([iv("2026-08-03T08:00:00Z", "2026-08-03T08:00:00Z", ["A:1"])], COD),
    ).toEqual([]);
  });

  it("una OF sin CodTarea en el id no genera bono: numope vacío no sube a RPS", () => {
    expect(bonosDe([iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["A"])], COD)).toEqual([]);
  });
});

describe("bonosDe: operario", () => {
  it("revienta si el operario no tiene código de RPS", () => {
    const i = { ...iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["A:1"]), operarioId: "nadie" };
    expect(() => bonosDe([i], COD)).toThrow(/nadie/);
  });

  it("el tiempo de revisión también se ficha: RPS solo tiene una tarea por OF", () => {
    const i = { ...iv("2026-08-03T08:00:00Z", "2026-08-03T08:30:00Z", ["A:1"]), rol: "revisar" as const };
    expect(bonosDe([i], COD)).toHaveLength(1);
  });
});

describe("bonosDe: contraste con datos reales de OLANET", () => {
  // Operario 10 (alberto) en A-OTEC el 2025-05-05: el mini-olanet grabó el
  // tramo 35811→43171 (09:56:51 → 11:59:31 local) repartido en 16 OFs de 460 s
  // cada una, contiguas. Este test fija que generamos exactamente lo mismo.
  const OFS_REALES = [
    "0216311:5", "0216315:5", "0216317:5", "0216314:5", "0216303:5", "0216312:5",
    "0216310:5", "0216306:5", "0216307:5", "0216313:5", "0216318:5", "0216316:5",
    "0216308:5", "0216305:5", "0216309:5", "0216304:5",
  ];

  it("reproduce el reparto que hizo el mini-olanet", () => {
    const filas = bonosDe(
      [
        {
          inicio: "2025-05-05T09:56:51+02:00",
          fin: "2025-05-05T11:59:31+02:00",
          ofIds: OFS_REALES,
          rol: "plantear",
          operarioId: "alberto",
        },
      ],
      { alberto: "10" },
    );
    expect(filas.map((f) => [f.horaini, f.horafin])).toEqual(
      OFS_REALES.map((_, i) => [35811 + i * 460, 35811 + (i + 1) * 460]),
    );
    expect(filas.map((f) => f.of)).toEqual(OFS_REALES.map((id) => id.split(":")[0]));
  });
});

describe("bonosDe: cruce de medianoche", () => {
  it("parte el bono en dos días: ini/horaini son por día", () => {
    // 23:50 → 00:10 hora local.
    const filas = bonosDe(
      [iv("2026-08-03T21:50:00Z", "2026-08-03T22:10:00Z", ["A:1"])],
      COD,
    );
    expect(filas.map((f) => [f.ini, f.horaini, f.horafin])).toEqual([
      ["2026-08-03", 85800, 86400],
      ["2026-08-04", 0, 600],
    ]);
  });

  it("el total no cambia al partir por medianoche", () => {
    const filas = bonosDe(
      [iv("2026-08-03T21:50:00Z", "2026-08-03T22:10:00Z", ["A:1", "B:2"])],
      COD,
    );
    const total = filas.reduce((s, f) => s + (f.horafin - f.horaini), 0);
    expect(total).toBe(1200);
  });
});
