import { describe, expect, it } from "vitest";
import { inicialesDe, nombrePersona } from "../nombre-persona";

// Los casos de verdad: son los once responsables de visitas COT que hay en RPS
// (consulta del 14/08/2026), tal cual los guarda `GENEmployee.Description`.
describe("nombrePersona", () => {
  it("da la vuelta a la coma y pone las tildes", () => {
    expect(nombrePersona("CASTRO MOURIÑO, JUAN JOSE")).toBe("Juan José Castro Mouriño");
    expect(nombrePersona("GARCIA GARCIA, OSCAR")).toBe("Óscar García García");
    expect(nombrePersona("RIVADULLA CACHARRON, JOSE MANUEL")).toBe(
      "José Manuel Rivadulla Cacharrón",
    );
    expect(nombrePersona("GOMEZ QUINTELA, FELIX")).toBe("Félix Gómez Quintela");
    expect(nombrePersona("DURO VILA, CARLOS JAVIER")).toBe("Carlos Javier Duro Vila");
    expect(nombrePersona("VALIÑO ALAMANCOS, JOSE LUIS")).toBe("José Luis Valiño Alamancos");
    expect(nombrePersona("NUÑEZ FERNANDEZ, JAVIER")).toBe("Javier Núñez Fernández");
    expect(nombrePersona("VARELA MARTINEZ, LUIS")).toBe("Luis Varela Martínez");
    expect(nombrePersona("GOMEZ BREA, PABLO")).toBe("Pablo Gómez Brea");
  });

  it("las partículas van en minúscula dentro del nombre", () => {
    expect(nombrePersona("DE LA TORRE DOS SANTOS, MARIA")).toBe(
      "María de la Torre dos Santos",
    );
  });

  it("pero no si abren el nombre", () => {
    expect(nombrePersona("DEL RIO, ANA")).toBe("Ana del Rio");
    expect(nombrePersona("DA SILVA")).toBe("Da Silva");
  });

  it("sin coma no se inventa dónde acaban los apellidos", () => {
    expect(nombrePersona("JUAN JOSE CASTRO")).toBe("Juan José Castro");
  });

  it("los compuestos con guion llevan mayúscula en las dos mitades", () => {
    expect(nombrePersona("VILA-REAL PEREZ, ANA")).toBe("Ana Vila-Real Pérez");
  });

  it("lo que no está en el diccionario se queda sin tilde, no se inventa", () => {
    expect(nombrePersona("PLA NOE, NOE")).toBe("Noe Pla Noe");
  });

  it("aguanta el espaciado sucio y el vacío", () => {
    expect(nombrePersona("  CASTRO   MOURIÑO ,  JUAN  ")).toBe("Juan Castro Mouriño");
    expect(nombrePersona("")).toBe("");
    expect(nombrePersona("   ")).toBe("");
  });
});

describe("inicialesDe", () => {
  it("toma la del nombre y la del primer apellido, no las dos del nombre", () => {
    expect(inicialesDe("Juan José Castro Mouriño")).toBe("JC");
  });
  it("con nombre y un apellido, las dos que hay", () => {
    expect(inicialesDe("Luis Varela")).toBe("LV");
  });
  it("una sola palabra da una sola inicial", () => {
    expect(inicialesDe("Tamara")).toBe("T");
  });
  it("las partículas no cuentan como apellido", () => {
    expect(inicialesDe("María de la Torre")).toBe("MT");
  });
  it("sin nombre no revienta", () => {
    expect(inicialesDe("")).toBe("?");
  });
});
