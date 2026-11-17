import { describe, expect, it } from "vitest";
import {
  fueraEnFecha,
  juntarMeses,
  limitesMes,
  mesAnterior,
  mesSiguiente,
  mesValido,
  nombrePersona,
  normalizarDia,
  type PersonaDisponibilidad,
} from "@/lib/disponibilidad";
import { operarioDeCorreo } from "@/lib/server/operarios";

const turno = { time_ranges: [{ start_at: "08:00:00", end_at: "15:00:00" }], telework: false as const };

describe("normalizarDia", () => {
  it("día de trabajo con su horario", () => {
    expect(normalizarDia({ date: "2026-11-17", kind: "working_day", shifts: [turno] })).toEqual({
      estado: "trabaja",
      nota: "8:00–15:00",
    });
  });

  it("teletrabajo solo si todo el día es en casa", () => {
    const casa = { ...turno, telework: { type: "all_day" } };
    expect(normalizarDia({ date: "x", kind: "working_day", shifts: [casa] }).estado).toBe("teletrabajo");
    expect(normalizarDia({ date: "x", kind: "working_day", shifts: [casa, turno] }).estado).toBe("trabaja");
  });

  it("vacaciones se distinguen; cualquier otra ausencia es «fuera»", () => {
    expect(normalizarDia({ date: "x", kind: "absence", absences: [{ name: "Vacaciones 2026" }] })).toEqual({
      estado: "vacaciones",
    });
    expect(normalizarDia({ date: "x", kind: "loggable_absence", absences: [{ name: "Baja médica" }] })).toEqual({
      estado: "fuera",
    });
    expect(normalizarDia({ date: "x", kind: "absence", absences: [] }).estado).toBe("fuera");
  });

  it("el motivo de la ausencia no sale nunca", () => {
    const dias = [
      normalizarDia({ date: "x", kind: "absence", absences: [{ name: "Baja médica" }] }),
      normalizarDia({
        date: "x",
        kind: "partial_absence",
        absences: [{ name: "Cita médica", duration: "2h", start_at: "10:30:00" }],
      }),
    ];
    for (const d of dias) expect(JSON.stringify(d)).not.toMatch(/m[ée]dic/i);
  });

  it("ausencia por horas: desde qué hora y cuánto", () => {
    expect(
      normalizarDia({ date: "x", kind: "partial_absence", absences: [{ name: "x", duration: "1h 30m", start_at: "09:05:00" }] }),
    ).toEqual({ estado: "parcial", nota: "Fuera desde las 9:05 (1 h 30 min)" });
    expect(normalizarDia({ date: "x", kind: "loggable_partial_absence", absences: [] })).toEqual({
      estado: "parcial",
      nota: "Fuera parte del día",
    });
  });

  it("festivo, libre y sin horario", () => {
    expect(normalizarDia({ date: "x", kind: "non_working_day", public_holiday: "Día de Galicia" })).toEqual({
      estado: "festivo",
      nota: "Día de Galicia",
    });
    expect(normalizarDia({ date: "x", kind: "day_off", public_holiday: { name: "Navidad" } }).nota).toBe("Navidad");
    expect(normalizarDia({ date: "x", kind: "day_off" }).estado).toBe("libre");
    expect(normalizarDia({ date: "x", kind: "without_schedules" }).estado).toBe("sin_dato");
    expect(normalizarDia({ date: "x", kind: "working_day", shifts: [] }).estado).toBe("sin_dato");
  });
});

function persona(id: number, nombre: string, dias: PersonaDisponibilidad["dias"]): PersonaDisponibilidad {
  return { id, nombre, grupo: "OT", operarioId: null, dias };
}

describe("fueraEnFecha", () => {
  const personas = [
    persona(1, "Zoe", {
      "2026-11-17": { estado: "vacaciones" },
      "2026-11-18": { estado: "vacaciones" },
      "2026-11-21": { estado: "libre" },
      "2026-11-19": { estado: "festivo" },
      "2026-11-23": { estado: "trabaja" },
      "2026-11-20": { estado: "fuera" },
    }),
    persona(2, "Ana", { "2026-11-17": { estado: "teletrabajo" } }),
    persona(3, "Bea", { "2026-11-17": { estado: "parcial", nota: "Fuera desde las 12:00" } }),
    persona(4, "Carla", { "2026-11-17": { estado: "trabaja" } }),
    persona(5, "Dani", { "2026-11-17": { estado: "fuera" } }),
  ];

  it("solo quien no está entero, ordenados por gravedad y nombre", () => {
    expect(fueraEnFecha(personas, "2026-11-17").map((f) => f.nombre)).toEqual(["Dani", "Zoe", "Bea", "Ana"]);
  });

  it("vuelve = primer día de trabajo después, en orden de fecha", () => {
    const r = fueraEnFecha(personas, "2026-11-17");
    expect(r.find((f) => f.nombre === "Zoe")?.vuelve).toBe("2026-11-23");
    expect(r.find((f) => f.nombre === "Dani")?.vuelve).toBeNull();
    expect(r.find((f) => f.nombre === "Bea")?.vuelve).toBeNull();
  });

  it("juntarMeses cose la vuelta que cae en el mes siguiente", () => {
    const nov = { mes: "2026-11", actualizado: "", personas: [persona(1, "Zoe", { "2026-11-30": { estado: "vacaciones" as const } })] };
    const dic = { mes: "2026-12", actualizado: "", personas: [persona(1, "Zoe", { "2026-12-01": { estado: "trabaja" as const } })] };
    const juntas = juntarMeses([nov, dic]);
    expect(juntas).toHaveLength(1);
    expect(fueraEnFecha(juntas, "2026-11-30")[0].vuelve).toBe("2026-12-01");
    // No toca los datos de entrada.
    expect(Object.keys(nov.personas[0].dias)).toEqual(["2026-11-30"]);
  });
});

describe("meses", () => {
  it("valida YYYY-MM", () => {
    expect(mesValido("2026-11")).toBe("2026-11");
    expect(mesValido("2026-13")).toBeNull();
    expect(mesValido("2026-1")).toBeNull();
    expect(mesValido(null)).toBeNull();
  });

  it("límites, incluido febrero bisiesto", () => {
    expect(limitesMes("2026-11")).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" });
    expect(limitesMes("2028-02").hasta).toBe("2028-02-29");
  });

  it("siguiente y anterior cruzan el año", () => {
    expect(mesSiguiente("2026-12")).toBe("2027-01");
    expect(mesAnterior("2027-01")).toBe("2026-12");
    expect(mesSiguiente("2026-09")).toBe("2026-10");
  });
});

describe("nombres y correos", () => {
  it("nombrePersona limpia espacios", () => {
    expect(nombrePersona("  Ana ", " Pérez  López ")).toBe("Ana Pérez López");
    expect(nombrePersona(null, undefined)).toBe("Sin nombre");
  });

  it("operarioDeCorreo casa sin mayúsculas", () => {
    expect(operarioDeCorreo(" Alberto@ToldosGomez.com ")).toBe("alberto");
    expect(operarioDeCorreo("nadie@ejemplo.com")).toBeNull();
    expect(operarioDeCorreo("")).toBeNull();
  });
});
