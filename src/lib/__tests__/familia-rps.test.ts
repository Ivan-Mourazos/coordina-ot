import { describe, expect, it } from "vitest";
import { familiaDeTexto } from "../server/rps";

// El vocabulario del taller, tal como lo definió Iván. Los casos vienen de
// filas reales de TGM_PENDIENTE_OT: son los que estaban mal clasificados.

describe("familiaDeTexto", () => {
  it("el grupo de RPS manda sobre la descripción", () => {
    // Este era EL fallo: la descripción empieza por LONA y el grupo dice
    // CAMION, así que un remolque acababa en la familia Lona y los remolques
    // no aparecían en el filtro.
    expect(familiaDeTexto("LONA SEPARA MERCANCIAS MONARD", "100 - CAMION")).toBe("REMOLQUE");
    expect(familiaDeTexto("LATERAL CORREDERA TAUTLINER XL", "2 - CAMION")).toBe("REMOLQUE");
    expect(familiaDeTexto("TECHO FIJO CAMION CISTERNA", "1 - CAMION")).toBe("REMOLQUE");
  });

  it("toldos: también cortinas, bambalinas y cambios de tela", () => {
    expect(familiaDeTexto("TOLDO COFRE 4X3", "1 - TOLDO FACHADA")).toBe("TOLDO");
    expect(familiaDeTexto("CORTINA CRISTAL TERRAZA", null)).toBe("TOLDO");
    expect(familiaDeTexto("BAMBALINA FRONTAL", null)).toBe("TOLDO");
    expect(familiaDeTexto("CAMBIO DE TELA TOLDO BRAZO", null)).toBe("TOLDO");
  });

  it("remolques: arquillados, baquetones y tautliners", () => {
    expect(familiaDeTexto("REMOLQUE ARQUILLADO 6M", null)).toBe("REMOLQUE");
    expect(familiaDeTexto("BAQUETON PARA REMOLQUE", null)).toBe("REMOLQUE");
    expect(familiaDeTexto("LONA TAUTLINER LATERAL", null)).toBe("REMOLQUE");
  });

  it("fundas y espectáculos tienen familia propia", () => {
    expect(familiaDeTexto("FUNDA PROTECTORA BELTS VIGO", null)).toBe("FUNDA");
    expect(familiaDeTexto("ESCENARIO ORQUESTA", null)).toBe("ESPECTACULO");
    expect(familiaDeTexto("LONA FRONTAL", "2 - ESPECTACULO")).toBe("ESPECTACULO");
  });

  it("lonas: de estructura, con riel y con ollaos", () => {
    expect(familiaDeTexto("LONA (TECHO, LATERAL) PARA ESTRUCTURA CLIENTE", "1 - OTR.ESTRUCTURAS"))
      .toBe("LONA");
    expect(familiaDeTexto("LONA CORTINA CON RIEL SUPERIOR", "1 - OTR.ESTRUCTURAS")).toBe("LONA");
    expect(familiaDeTexto("LONA CON OLLAOS 3X2", null)).toBe("LONA");
  });

  it("suministros, incluido system dock", () => {
    expect(familiaDeTexto("TORNILLERIA", "1 - SUMINISTRO")).toBe("SUMINISTRO");
    expect(familiaDeTexto("SYSTEM DOCK COMPLETO", null)).toBe("SUMINISTRO");
  });

  it("lo que no se reconoce se queda con el nombre del grupo, no se fuerza", () => {
    expect(familiaDeTexto("ALGO RARO", "1 - ACABADOS")).toBe("ACABADOS");
    expect(familiaDeTexto(null, null)).toBe("OTRO");
  });
});

describe("vocabulario ampliado del catálogo de Toldos Gómez", () => {
  it("lonas para el transporte, con y sin tilde", () => {
    for (const d of [
      "LONA REMOLQUE ARQUILLADA",
      "BAQUETÓN LATERAL",
      "BAQUETON LATERAL",
      "SEMITAUTLINER TECHO",
      "LONA BOTELLERO",
      "LONA CISTERNA",
      "LONA GANADO",
      "TECHO CAMIÓN",
    ]) {
      expect(familiaDeTexto(d, null), d).toBe("REMOLQUE");
    }
  });

  it("puertas rápidas industriales", () => {
    expect(familiaDeTexto("PUERTA RÁPIDA APILABLE", null)).toBe("PUERTA");
    expect(familiaDeTexto("PUERTA ENROLLABLE AUTOREPARABLE", null)).toBe("PUERTA");
  });

  it("protección solar: todos son toldos", () => {
    for (const d of ["TOLDO VERTICAL", "TOLDO PLANO", "TOLDO DE FACHADA"]) {
      expect(familiaDeTexto(d, null), d).toBe("TOLDO");
    }
  });

  it("confección textil: lonas y fundas", () => {
    expect(familiaDeTexto("LONA RECTANGULAR 4X3", null)).toBe("LONA");
    expect(familiaDeTexto("LONA PARA PISCINA", null)).toBe("LONA");
    expect(familiaDeTexto("FUNDA A MEDIDA", null)).toBe("FUNDA");
  });
});

describe("cortina: depende de con qué vaya", () => {
  it("toldo cortina y cambio de tela de cortina son toldos", () => {
    expect(familiaDeTexto("TOLDO CORTINA CRISTAL", null)).toBe("TOLDO");
    expect(familiaDeTexto("CAMBIO DE TELA CORTINA", null)).toBe("TOLDO");
    expect(familiaDeTexto("CORTINA CRISTAL TERRAZA", null)).toBe("TOLDO");
  });

  it("cortina de lona con riel es lona, en cualquier orden", () => {
    expect(familiaDeTexto("CORTINA LONA CON RIEL", null)).toBe("LONA");
    expect(familiaDeTexto("LONA CORTINA CON RIEL SUPERIOR", null)).toBe("LONA");
    expect(familiaDeTexto("CORTINA CON RIEL SUPERIOR", null)).toBe("LONA");
  });
});
