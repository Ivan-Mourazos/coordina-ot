import { describe, expect, it } from "vitest";
import { familiaDeTexto } from "../server/rps";

// El vocabulario del taller, tal como lo definió Iván. Los casos vienen de
// filas reales de TGM_PENDIENTE_OT: son los que estaban mal clasificados.

describe("familiaDeTexto", () => {
  it("el grupo de RPS manda sobre la descripción", () => {
    // Este era EL fallo: la descripción empieza por LONA y el grupo dice
    // CAMION, así que un remolque acababa en la familia Lona y los remolques
    // no aparecían en el filtro.
    //
    // El grupo CAMION ya no cae en REMOLQUE: RPS los tiene separados en su
    // catálogo (grupos CAMION y CAPOTA) y no son el mismo trabajo — los
    // juntábamos nosotros, y un camión salía bajo "Remolque".
    expect(familiaDeTexto("LONA SEPARA MERCANCIAS MONARD", "100 - CAMION")).toBe("CAMION");
    expect(familiaDeTexto("LATERAL CORREDERA TAUTLINER XL", "2 - CAMION")).toBe("CAMION");
    expect(familiaDeTexto("TECHO FIJO CAMION CISTERNA", "1 - CAMION")).toBe("CAMION");
    // Las capotas sí siguen siendo remolque.
    expect(familiaDeTexto("CAPOTA NUEVA", "1 - CAPOTA")).toBe("REMOLQUE");
  });

  it("un cliente puede valer por una familia, y manda sobre todo lo demás", () => {
    // De Assa Abloy entra trabajo sin parar y siempre del mismo tipo (34 de sus
    // 40 OF pendientes eran SUMINISTRO/PUERTAS el 11/08/2026). Mezclado con el
    // resto de "Suministro" —el cajón de sastre de RPS— quedaba escondido.
    const assa = { cliente: "ASSA ABLOY ENTRANCE SYSTEMS PRODUCTION ROMANIA SRL" };
    expect(familiaDeTexto("PUERTA RAPIDA ENROLLABLE", "18 - SUMINISTRO", assa)).toBe("ASSAABLOY");
    // Manda incluso sobre un grupo que sí diría algo.
    expect(familiaDeTexto("TOLDO COFRE", "1 - TOLDO FACHADA", assa)).toBe("ASSAABLOY");
    // Y sin cliente reconocido, todo sigue como estaba.
    expect(familiaDeTexto("TOLDO COFRE", "1 - TOLDO FACHADA", { cliente: "MAHOU" })).toBe("TOLDO");
  });

  it("la subfamilia rescata lo que 'SUMINISTRO' no distingue", () => {
    // "SUMINISTRO" es el cajón de sastre de RPS: ahí conviven las puertas
    // rápidas y el material suelto. La subfamilia sí lo separa.
    expect(familiaDeTexto("PUERTA", "18 - SUMINISTRO", { subfamilia: "PUERTAS" })).toBe("PUERTA");
    // Sin subfamilia concluyente, se queda en su familia de siempre.
    expect(familiaDeTexto("MATERIAL", "18 - SUMINISTRO", { subfamilia: "CONFECCION" })).toBe(
      "SUMINISTRO",
    );
    expect(familiaDeTexto("MATERIAL", "18 - SUMINISTRO")).toBe("SUMINISTRO");
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
