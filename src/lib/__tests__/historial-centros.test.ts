import { describe, expect, test } from "vitest";
import { agruparCentros, agruparTiemposPorCentro, centroDeTareaHistorial, claveTareaHistorial, type FilaTiempoCentro } from "../historial-centros";

const fila = (extra: Partial<FilaTiempoCentro> = {}): FilaTiempoCentro => ({
  orden: "0230001", descripcion: "Lona", centro: "ot", tarea: "01", empleado: "Alberto", minutos: 7, ...extra,
});

describe("tiempos del Historial por centro", () => {
  test("AR.26.03626: plantear en taller mueve la tarea completa, también los minutos de OT", () => {
    const filas = [
      fila({ orden: "0230697", empleado: "Iván", minutos: 35, descripcionTarea: "PLANTEAR " }),
      fila({ orden: "0230697", empleado: "Jaime", minutos: 6, descripcionTarea: "PLANTEAR " }),
      fila({ orden: "0230699", empleado: "127", minutos: 37, descripcionTarea: "PLANTEAR EN TALLER" }),
      fila({ orden: "0230699", empleado: "Jaime", minutos: 1, descripcionTarea: "PLANTEAR EN TALLER" }),
      fila({ orden: "0230699", empleado: "Iván", minutos: 0, descripcionTarea: "PLANTEAR EN TALLER" }),
    ].map((f) => ({ ...f, centro: centroDeTareaHistorial(f.centro, f.descripcionTarea ?? null) }));
    const [ot, , taller] = agruparCentros(agruparTiemposPorCentro(filas, (n) => n));
    expect(ot.totalMin).toBe(41);
    expect(ot.personas).toEqual([{ nombre: "Iván", min: 35 }, { nombre: "Jaime", min: 6 }]);
    expect(taller.totalMin).toBe(38);
    expect(taller.ofs.map((o) => o.codigo)).toEqual(["0230699"]);
    expect(ot.totalMin + taller.totalMin).toBe(79);
    expect(centroDeTareaHistorial("ot", " plantear  en taller ")).toBe("taller");
    expect(centroDeTareaHistorial("ot", "PLANTEAR")).toBe("ot");
    expect(centroDeTareaHistorial("diseno", "DISEÑAR ROTULACION")).toBe("diseno");
  });
  test("una OF compartida conserva separados OT, Diseño y Taller", () => {
    const ofs = agruparTiemposPorCentro([
      fila(), fila({ empleado: "Tamara", minutos: 2 }),
      fila({ centro: "diseno", empleado: "Carrón", tarea: "02", minutos: 45 }),
      fila({ centro: "taller", empleado: "Corte", tarea: "03", minutos: 998 }),
      fila({ centro: "ot", empleado: "Alberto", orden: "0230002", minutos: 5 }),
    ], (nombre) => nombre);
    const [ot, diseno, taller] = agruparCentros(ofs);
    expect(ot.totalMin).toBe(14);
    expect(ot.personas).toEqual([{ nombre: "Alberto", min: 12 }, { nombre: "Tamara", min: 2 }]);
    expect(diseno.totalMin).toBe(45);
    expect(diseno.personas).toEqual([{ nombre: "Carrón", min: 45 }]);
    expect(taller.totalMin).toBe(998);
    expect(ot.ofs).toHaveLength(2);
    expect(diseno.ofs[0].codigo).toBe(ot.ofs[0].codigo);
  });

  test("no pierde las OF sin imputaciones ni atribuye tiempo del taller a OT", () => {
    const centros = agruparCentros(agruparTiemposPorCentro([
      fila({ centro: "diseno", empleado: null, minutos: null }),
      fila({ centro: "taller", empleado: "Confección", minutos: 147 }),
      fila({ orden: " ", minutos: 500 }),
    ], (nombre) => nombre));
    expect(centros.map((c) => c.totalMin)).toEqual([0, 0, 147]);
    expect(centros[0].ofs).toHaveLength(0);
    expect(centros[1].ofs).toHaveLength(1);
    expect(centros[1].personas).toEqual([]);
  });

  test("conserva minutos sin empleado y agrega varias tareas de una persona", () => {
    const [ot] = agruparCentros(agruparTiemposPorCentro([
      fila({ minutos: 1.25 }), fila({ tarea: "02", minutos: 0.5 }),
      fila({ empleado: null, minutos: 3 }),
    ], (nombre) => nombre));
    expect(ot.totalMin).toBe(4.75);
    expect(ot.personas).toEqual([{ nombre: "Alberto", min: 1.75 }]);
  });

  test("los ids de tareas de RPS y fichaje coinciden con y sin cero inicial", () => {
    expect(claveTareaHistorial(" 0230001 ", "02")).toBe(claveTareaHistorial("0230001", "2"));
    expect(claveTareaHistorial("0230001", "01")).not.toBe(claveTareaHistorial("0230001", "02"));
  });
});
