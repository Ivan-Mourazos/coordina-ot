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
    const centros = agruparCentros(agruparTiemposPorCentro(filas, (n) => n));
    const ot = centros.find((c) => c.id === "ot")!;
    const taller = centros.find((c) => c.id === "taller")!;
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
    const centros = agruparCentros(ofs);
    const ot = centros.find((c) => c.id === "ot")!;
    const diseno = centros.find((c) => c.id === "diseno")!;
    const taller = centros.find((c) => c.id === "taller")!;
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
    // OT, Diseño, Impresión digital y Taller, en ese orden.
    expect(centros.map((c) => c.totalMin)).toEqual([0, 0, 0, 147]);
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

describe("orden de las tareas", () => {
  // El orden del papel de la OF que reparte Producción es el de la ruta en RPS
  // (`CPRMOTask.Order`), NO el número de la tarea: en la 0232827 la «10 CORTAR
  // ROTULACION» va antes que la «9 DISEÑAR ROTULACION». Sin orden explícito
  // salían como las agrupaba SQL Server, comparando los códigos como texto.
  const filaRuta = (tarea: string, ordenRuta: number | null, minutos = 1) => ({
    orden: "0232827",
    descripcion: "LONA PARA PUERTA PLEGABLE",
    centro: "taller" as const,
    tarea,
    descripcionTarea: `T${tarea}`,
    ordenRuta,
    empleado: null,
    minutos,
  });

  test("van en el orden de la ruta, no por su número", () => {
    const [of] = agruparTiemposPorCentro([filaRuta("9", 36), filaRuta("41", 76), filaRuta("10", 35), filaRuta("15", 41)], (c) => c);
    expect(of.tareas!.map((t) => t.codigo)).toEqual(["10", "9", "15", "41"]);
  });

  test("con el mismo orden de ruta, desempata el número de la tarea", () => {
    const [of] = agruparTiemposPorCentro([filaRuta("20", 50), filaRuta("02", 50), filaRuta("5", 1)], (c) => c);
    expect(of.tareas!.map((t) => t.codigo)).toEqual(["5", "02", "20"]);
  });

  test("sin orden de ruta, al final y por número", () => {
    const [of] = agruparTiemposPorCentro([filaRuta("8", null), filaRuta("7", null), filaRuta("5", 1)], (c) => c);
    expect(of.tareas!.map((t) => t.codigo)).toEqual(["5", "7", "8"]);
  });
});

describe("Impresión digital, aparte de Taller", () => {
  // Decisión de Iván (09/10/2026): imprimir (IMDI-A, P-HPLA, P-PCMU) es el
  // trabajo de Manuel y no se mezcla con el de taller. Diseño no cambia.
  test("es un centro propio, con su nombre, entre Diseño y Taller", () => {
    const ofs = [
      { codigo: "1", descripcion: "", centro: "taller" as const, tiempoImputadoMin: 10, quien: [] },
      { codigo: "1", descripcion: "", centro: "impresion" as const, tiempoImputadoMin: 40, quien: [] },
      { codigo: "1", descripcion: "", centro: "diseno" as const, tiempoImputadoMin: 5, quien: [] },
    ];
    const centros = agruparCentros(ofs).filter((c) => c.ofs.length);
    expect(centros.map((c) => c.nombre)).toEqual(["Diseño Gráfico", "Impresión digital", "Taller"]);
    expect(centros.find((c) => c.id === "impresion")?.totalMin).toBe(40);
  });

  test("sus recursos no tocan los de Diseño Gráfico", async () => {
    const { RECURSOS_IMPRESION } = await import("../historial-centros");
    const { SECCIONES } = await import("../secciones");
    expect(RECURSOS_IMPRESION).toEqual(["imdi-a", "p-hpla", "p-pcmu"]);
    for (const r of RECURSOS_IMPRESION) expect(SECCIONES.diseno.recursos).not.toContain(r);
  });
});

describe("los días en que se echó el tiempo", () => {
  test("cada persona de la tarea lleva su primer y último día", () => {
    const filas = [
      { orden: "0232817", descripcion: "LONA", centro: "taller" as const, tarea: "20", descripcionTarea: "SOLDAR",
        empleado: "Óscar", minutos: 48, desde: new Date("2026-10-07T00:00:00Z"), hasta: new Date("2026-10-07T00:00:00Z") },
      { orden: "0232817", descripcion: "LONA", centro: "taller" as const, tarea: "20", descripcionTarea: "SOLDAR",
        empleado: "Óscar", minutos: 209, desde: "2026-10-08T00:00:00.000Z", hasta: "2026-10-08T00:00:00.000Z" },
    ];
    const [of] = agruparTiemposPorCentro(filas, (n) => n);
    expect(of.tareas![0].personas).toEqual([{ nombre: "Óscar", min: 257, desde: "2026-10-07", hasta: "2026-10-08" }]);
  });
});
