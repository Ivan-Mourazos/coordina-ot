import { describe, expect, it } from "vitest";
import {
  COD_RPS_POR_OPERARIO,
  MAQUINA_POR_OPERARIO,
  operarioDeEmpleado,
  operariosDeSeccion,
  seccionDeOperario,
} from "../server/operarios";
import { SECCIONES } from "../secciones";
import { OPERARIOS } from "../mock";
import { bonosDe } from "../bonos";
import type { Intervalo } from "../fichaje";

describe("quién es de qué sección", () => {
  it("los tres de Diseño Gráfico son los que imputan en A-DGRA", () => {
    // Sacados de sus imputaciones del último año (2026-09-01). Ojo con Manuel:
    // en GENEmployee hay tres "Manuel Gómez" y el de diseño es GOMEZ CAMINO,
    // MANUEL RAMON (22); los dos GOMEZ ALAMANCOS (58, 67) no pisan A-DGRA.
    expect(operarioDeEmpleado("88")).toBe("carron");
    expect(operarioDeEmpleado("22")).toBe("manuel");
    expect(operarioDeEmpleado("48")).toBe("smith");
    expect(operariosDeSeccion("diseno").sort()).toEqual(["carron", "manuel", "smith"]);
  });

  it("los de Oficina Técnica siguen donde estaban", () => {
    expect(operariosDeSeccion("ot").sort()).toEqual([
      "adrian",
      "alberto",
      "angel",
      "ivan",
      "jaime",
      "tamara",
    ]);
  });

  it("los que NO son de la casa no entran en ninguna", () => {
    // 58 y 67 son los GOMEZ ALAMANCOS, que no son de diseño.
    for (const cod of ["58", "67", "999", "S58", ""]) {
      expect(operarioDeEmpleado(cod)).toBeNull();
    }
  });

  it("un operario desconocido cae en OT y no revienta", () => {
    // El id lo manda el navegador (modelo sin login): uno raro no puede tumbar
    // el tablero. Lo peor que pasa es que vea lo que veía todo el mundo antes.
    expect(seccionDeOperario("no-existe")).toBe("ot");
    expect(seccionDeOperario("")).toBe("ot");
    expect(seccionDeOperario("carron")).toBe("diseno");
  });
});

describe("el catálogo del tablero y el de RPS no pueden descuadrarse", () => {
  it("todos los del selector tienen código de empleado", () => {
    // Sin código no se puede fichar en su nombre: alguien saldría en la
    // pantalla de "¿quién eres?" y su reloj no llegaría a RPS.
    for (const o of OPERARIOS) {
      expect(COD_RPS_POR_OPERARIO[o.id], `${o.nombre} sin código de RPS`).toBeTruthy();
    }
  });

  it("la sección del selector coincide con la de RPS", () => {
    for (const o of OPERARIOS) {
      expect(seccionDeOperario(o.id), `${o.nombre}`).toBe(o.seccion ?? "ot");
    }
  });
});

describe("con qué máquina ficha cada uno", () => {
  it("cada sección con la suya", () => {
    expect(MAQUINA_POR_OPERARIO.ivan).toBe(SECCIONES.ot.maquina);
    expect(MAQUINA_POR_OPERARIO.carron).toBe(SECCIONES.diseno.maquina);
    expect(MAQUINA_POR_OPERARIO.manuel).toBe("A-DGRA");
  });

  it("el bono de Carrón NO se escribe en la máquina de OT", () => {
    // Es el fallo que le metería las horas de diseño a Oficina Técnica, y no
    // se vería hasta mirar los tiempos de RPS a fin de mes.
    const iv: Intervalo = {
      inicio: "2026-09-01T08:00:00.000Z",
      fin: "2026-09-01T09:00:00.000Z",
      ofIds: ["0231160:5"],
      rol: "plantear",
      operarioId: "carron",
    };
    const [bono] = bonosDe([iv], COD_RPS_POR_OPERARIO, MAQUINA_POR_OPERARIO);
    expect(bono.maquina).toBe("A-DGRA");
    expect(bono.operario).toBe("88");
  });

  it("sin mapa de máquinas todo el mundo ficha en A-OTEC, como antes", () => {
    const iv: Intervalo = {
      inicio: "2026-09-01T08:00:00.000Z",
      fin: "2026-09-01T09:00:00.000Z",
      ofIds: ["0231160:5"],
      rol: "plantear",
      operarioId: "ivan",
    };
    expect(bonosDe([iv], COD_RPS_POR_OPERARIO)[0].maquina).toBe("A-OTEC");
  });
});
