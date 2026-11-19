// src/lib/__tests__/visita.test.ts
import { describe, expect, it } from "vitest";
import {
  agruparDias, ausentesPorDia, diaCorto, diaLargo, diaSemana, diasLaborables, diasNoEstamos,
  fechaCorta, lineaTramo, sumarDias, unirNombres, validarAusencias, validarVisita,
} from "../visita";

const T = { operarioId: "tamara", dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05" }] };
const A = { operarioId: "alberto", dias: [4], rangos: [] };
const NOMBRES: Record<string, string> = { tamara: "Tamara", alberto: "Alberto", ivan: "Iván" };

describe("fechas", () => {
  it("día de la semana con lunes = 1", () => {
    expect(diaSemana("2026-11-16")).toBe(1);
    expect(diaSemana("2026-11-19")).toBe(4);
    expect(diaSemana("2026-11-22")).toBe(7);
  });
  it("suma días cruzando de mes", () => {
    expect(sumarDias("2026-11-30", 2)).toBe("2026-12-02");
  });
  it("tres semanas L–V desde el lunes de esta semana", () => {
    const d = diasLaborables("2026-11-19");
    expect(d).toHaveLength(15);
    expect(d[0]).toBe("2026-11-16");
    expect(d[14]).toBe("2026-12-04");
    expect(d).not.toContain("2026-11-22");
  });
  it("formatos", () => {
    expect(fechaCorta("2026-11-25")).toBe("25/11");
    expect(fechaCorta("2026-12-02")).toBe("2/12");
    expect(diaCorto("2026-11-24")).toBe("mar 24/11");
    expect(diaLargo("2026-11-24")).toBe("martes 24/11");
  });
});

describe("ausencias", () => {
  const dias = diasLaborables("2026-11-19");
  it("fijos y rangos, solo de quien atiende, en su orden", () => {
    const a = ausentesPorDia(dias, [T, A], ["tamara", "alberto"]);
    expect(a["2026-11-19"]).toEqual(["alberto"]);
    expect(a["2026-11-20"]).toEqual(["tamara"]);
    expect(a["2026-12-02"]).toEqual(["tamara"]);
    expect(a["2026-12-03"]).toEqual(["tamara", "alberto"]);
    expect(a["2026-11-17"]).toEqual([]);
    expect(ausentesPorDia(dias, [T, A], ["tamara"])["2026-11-19"]).toEqual([]);
  });
  it("retoques: true marca a todos, false quita", () => {
    const a = ausentesPorDia(dias, [T, A], ["tamara", "alberto"]);
    const f = diasNoEstamos(dias, a, { "2026-11-17": true, "2026-11-19": false }, ["tamara", "alberto"]);
    expect(f.find((d) => d.fecha === "2026-11-17")?.quien).toEqual(["tamara", "alberto"]);
    expect(f.find((d) => d.fecha === "2026-11-19")).toBeUndefined();
    expect(f.find((d) => d.fecha === "2026-11-20")?.quien).toEqual(["tamara"]);
  });
});

describe("agrupado para el correo", () => {
  const nombreDe = (id: string) => NOMBRES[id] ?? id;
  it("une días seguidos con la misma gente; el finde no corta", () => {
    expect(agruparDias([
      { fecha: "2026-11-27", quien: ["tamara"] },
      { fecha: "2026-11-30", quien: ["tamara"] },
    ], nombreDe)).toEqual([{ desde: "2026-11-27", hasta: "2026-11-30", quien: "Tamara" }]);
  });
  it("corta si falta un día o cambia la gente", () => {
    const t = agruparDias([
      { fecha: "2026-11-27", quien: ["tamara"] },
      { fecha: "2026-12-01", quien: ["tamara"] },
      { fecha: "2026-12-02", quien: ["tamara"] },
      { fecha: "2026-12-04", quien: ["tamara", "alberto"] },
    ], nombreDe);
    expect(t.map(lineaTramo)).toEqual(["vie 27/11 · Tamara", "1/12 al 2/12 · Tamara", "vie 4/12 · Tamara y Alberto"]);
  });
  it("une nombres en castellano", () => {
    expect(unirNombres(["Tamara"])).toBe("Tamara");
    expect(unirNombres(["Tamara", "Alberto"])).toBe("Tamara y Alberto");
    expect(unirNombres(["Iván", "Tamara", "Alberto"])).toBe("Iván, Tamara y Alberto");
  });
});

describe("validarAusencias", () => {
  it("acepta días L–V y rangos ordenados", () => {
    expect(validarAusencias({ dias: [5, 3, 3], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: " vacaciones " }] }))
      .toEqual({ dias: [3, 5], rangos: [{ desde: "2026-12-02", hasta: "2026-12-05", nota: "vacaciones" }] });
  });
  it("rechaza sábado, fechas malas y rangos al revés", () => {
    expect(validarAusencias({ dias: [6], rangos: [] })).toBeNull();
    expect(validarAusencias({ dias: [], rangos: [{ desde: "2026-13-01", hasta: "2026-13-02" }] })).toBeNull();
    expect(validarAusencias({ dias: [], rangos: [{ desde: "2026-12-05", hasta: "2026-12-02" }] })).toBeNull();
  });
});

describe("validarVisita", () => {
  const base = {
    pedido: "AR.26.05448", cliente: "Belts Vigo", solicitada: "2026-11-27", prioridad: 3,
    ofs: [{ codigo: "26/10234", descripcion: "Toldo cofre 5×3" }], viene: " Juan Castro ",
    cuando: { tipo: "dia", fecha: "2026-11-25" }, motivo: "", atienden: ["tamara"], noEstamos: [],
  };
  it("limpia y acepta", () => {
    const r = validarVisita(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entrada.viene).toBe("Juan Castro");
      expect(r.entrada.motivo).toBeNull();
    }
  });
  it("pide OF, quién viene y quién atiende", () => {
    expect(validarVisita({ ...base, ofs: [] })).toMatchObject({ ok: false, campo: "ofs" });
    expect(validarVisita({ ...base, viene: "  " })).toMatchObject({ ok: false, campo: "viene" });
    expect(validarVisita({ ...base, atienden: [] })).toMatchObject({ ok: false, campo: "atienden" });
    expect(validarVisita({ ...base, cuando: { tipo: "dia" } })).toMatchObject({ ok: false, campo: "cuando" });
  });
});
