import { describe, expect, it } from "vitest";
import { esTrabajoInterno } from "../server/rps";

describe("esTrabajoInterno", () => {
  it("reconoce a la propia empresa como cliente", () => {
    // Los cuatro casos reales de la vista de OT.
    expect(esTrabajoInterno("TOLDOS GOMEZ S.L.")).toBe(true);
    expect(esTrabajoInterno("TOLDOS GÓMEZ S.L.")).toBe(true);
    expect(esTrabajoInterno("toldos gomez")).toBe(true);
    expect(esTrabajoInterno("TGM")).toBe(true);
  });

  it("no confunde a clientes de verdad", () => {
    // "GOMEZ" suelto no basta: hay clientes que lo llevan en el apellido y
    // desaparecerían de la lista sin que nadie entendiera por qué.
    expect(esTrabajoInterno("SANCHEZ GOMEZ, NURIA")).toBe(false);
    // Y "TGM" va delimitado, que si no cualquier nombre con esas tres letras
    // seguidas se marcaría como interno.
    expect(esTrabajoInterno("MTOLF GRUPO EMPRESARIAL S.L")).toBe(false);
    expect(esTrabajoInterno("HIJOS DE RIVERA, S.A.U.")).toBe(false);
    expect(esTrabajoInterno("BELTS VIGO, S.L")).toBe(false);
    expect(esTrabajoInterno("MTOLF GRUPO EMPRESARIAL S.L")).toBe(false);
    expect(esTrabajoInterno("TENZAMATIC S.L")).toBe(false);
    expect(esTrabajoInterno("S.A.T  VIRGEN DE FATIMA 1301")).toBe(false);
    expect(esTrabajoInterno("")).toBe(false);
  });

  it("ningún cliente real de la vista sale marcado por error", () => {
    // Lista sacada de RPS el 08/08/2026: 43 clientes distintos, uno interno.
    const reales = [
      "2006 PORTANOVA, S.L.", "ACCESUS GROUP S.L.", "AMORINFEST, S.L.",
      "ANGEL LOPEZ SOTO, S.L.", "ANTELO VILAS, ELISARDO", "AÑON PEREIRO, CARLOS",
      "BARROS VARELA, ANTONIO", "BELTS VIGO, S.L", "BLANCO REDONDO, JUAN ALBERTO",
      "BOTAS DIAZ, LUIS", "CHRONOPOST SAS", "COLLAZO CANCELA, JOSE LUIS",
      "DISGOBE, S. A.U.", "ENEL GREEN POWER ESPAÑA S.L.", "FREIRE PICOS, MARIA ANGELES",
      "FRINSA DEL NOROESTE, S. A.", "GARCIA FARIÑA, PATRICIA", "GARCIA LOPEZ, YOLANDA",
      "HIJOS DE RIVERA, S.A.U.", "INSUA PICO, VICTOR", "LAGUARDIA&MOREIRA, S.A.",
      "MAHOU, S.A.", "MARTINEZ OTERO, MARIA DOLORES", "MINIT SPAIN, S. A. ,",
      "MTOLF GRUPO EMPRESARIAL S.L", "NAVEIRA GONZALEZ, JOSE MANUEL",
      "NOVOA PRADO , CARLOS", "OTERO BLAS, ANGEL", "PARDO GONZALEZ, SARA",
      "PASTOR DEL RIO RIAL, JUAN", "REBOREDO FRAGA, GUMERSINDO",
      "RODRIGUEZ COUSILLAS, CARLOS", "S.A.T  VIRGEN DE FATIMA 1301",
      "SANCHEZ GOMEZ, NURIA", "SEDES DEL RIO, KIDIST", "SYSTEM DOCK, S.L",
      "TALLERES FRANCAL, S.L.", "TARRIO ALVAREZ, MARGARITA", "TENZAMATIC S.L",
      "TORIBIO VIQUEIRA OTERO, S. L.", "TRELLES PADIN, JOSE CARLOS",
      "VAZQUEZ QUINTEIRO, OTILIA",
    ];
    expect(reales.filter(esTrabajoInterno)).toEqual([]);
  });
});
