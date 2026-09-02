import { describe, expect, it } from "vitest";
import {
  SECCIONES,
  SECCION_POR_DEFECTO,
  esFaseDe,
  esSeccionId,
  recursosSql,
  seccionDe,
} from "../secciones";
import { esFaseDeOT } from "../fase-pendiente";

describe("las dos secciones", () => {
  it("no comparten ni vista ni máquina ni recursos", () => {
    // Si alguna de las tres coincidiera, una sección estaría leyendo o
    // escribiendo lo de la otra: Carrón vería el trabajo de OT, o su tiempo se
    // le sumaría a Oficina Técnica.
    const { ot, diseno } = SECCIONES;
    expect(ot.vista).not.toBe(diseno.vista);
    expect(ot.maquina).not.toBe(diseno.maquina);
    expect(ot.recursos.some((r) => diseno.recursos.includes(r))).toBe(false);
  });

  it("los recursos son los que filtran las vistas de RPS", () => {
    // Comprobado contra la definición de las vistas el 2026-09-01: las dos son
    // la misma consulta y solo cambia esta línea.
    expect(SECCIONES.ot.recursos).toEqual(["a-otec", "otec-a"]);
    expect(SECCIONES.diseno.recursos).toEqual(["a-dgra", "dgra-a"]);
  });
});

describe("qué sección es", () => {
  it("un id conocido da la suya", () => {
    expect(seccionDe("diseno").id).toBe("diseno");
    expect(seccionDe("ot").id).toBe("ot");
  });

  it("cualquier otra cosa cae en la de siempre y NO revienta", () => {
    // Esto llega de la URL y de la BD: un valor raro no puede tumbar el
    // tablero, y lo que había antes de que existieran las secciones era OT.
    for (const malo of [null, undefined, "", "OT", "produccion", 7, {}]) {
      expect(seccionDe(malo).id).toBe(SECCION_POR_DEFECTO);
    }
  });

  it("esSeccionId no se deja colar nada", () => {
    expect(esSeccionId("ot")).toBe(true);
    expect(esSeccionId("diseno")).toBe(true);
    expect(esSeccionId("DISENO")).toBe(false);
    expect(esSeccionId(null)).toBe(false);
  });
});

describe("de quién es una fase", () => {
  it("recoge las erratas reales del centro", () => {
    // En scg_Fases esa columna trae `A-OTECP` y `24A-OTEC`: por eso se busca un
    // trozo y no el nombre entero.
    for (const m of ["A-OTEC", "OTEC-A", "U-A-OTEC", "S-OTEC", "B-OTEC", "A-OTECP", "24A-OTEC"]) {
      expect(esFaseDe(m, SECCIONES.ot)).toBe(true);
    }
    for (const m of ["A-DGRA", "DGRA-A", "a-dgra"]) {
      expect(esFaseDe(m, SECCIONES.diseno)).toBe(true);
    }
  });

  it("una fase no puede ser de las dos", () => {
    expect(esFaseDe("A-OTEC", SECCIONES.diseno)).toBe(false);
    expect(esFaseDe("A-DGRA", SECCIONES.ot)).toBe(false);
    // Ni de ninguna: el resto del taller queda fuera de las dos.
    for (const m of ["A-MONT", "A-ROTU", "A-COST", "P-FINAL"]) {
      expect(esFaseDe(m, SECCIONES.ot)).toBe(false);
      expect(esFaseDe(m, SECCIONES.diseno)).toBe(false);
    }
  });

  it("esFaseDeOT sigue diciendo lo mismo que decía", () => {
    // Es el atajo que usan los sitios que solo hablan de OT. Si dejara de
    // coincidir con su sección, media app estaría mirando una regla y la otra
    // media otra distinta.
    for (const m of ["A-OTEC", "A-OTECP", "A-DGRA", "A-MONT", "otec-a"]) {
      expect(esFaseDeOT(m)).toBe(esFaseDe(m, SECCIONES.ot));
    }
  });
});

describe("los recursos en SQL", () => {
  it("salen entrecomillados y separados por coma", () => {
    expect(recursosSql(SECCIONES.ot)).toBe("'a-otec','otec-a'");
    expect(recursosSql(SECCIONES.diseno)).toBe("'a-dgra','dgra-a'");
  });

  it("dobla la comilla, aunque hoy no haga falta", () => {
    // Los valores salen de la tabla de secciones y nunca de fuera, así que no
    // hay nada que inyectar. Es para que quien añada una sección no tenga que
    // acordarse.
    const inventada = { ...SECCIONES.ot, recursos: ["a-o'tec"] };
    expect(recursosSql(inventada)).toBe("'a-o''tec'");
  });
});

describe("de dónde saca cada sección su trabajo", () => {
  it("OT se queda con su vista y Diseño lee OLANET", () => {
    // El `PercentProgress < 100` de las vistas no dice "sin acabar": cada
    // imputación entra con 100, así que la tarea vale 0 hasta que alguien
    // ficha el primer minuto. En OT eso coincide con "ya está planteada y
    // pasada a Producción" y se nota como acierto; en Diseño esconde el
    // trabajo a medias.
    expect(SECCIONES.ot.fuente).toBe("vista");
    expect(SECCIONES.diseno.fuente).toBe("olanet");
  });
});
