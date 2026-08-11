import { describe, expect, it } from "vitest";
import { familiaDeTexto } from "../server/rps";
import { familiaMeta } from "../familia";

// El vocabulario del taller, tal como lo definió Iván. Los casos vienen de
// descripciones REALES de TGM_PENDIENTE_OT.
//
// La regla de oro: manda la DESCRIPCIÓN. El catálogo de RPS reparte lo mismo
// entre "SUMINISTRO", "CONFECCION" y "LONASNUEVAS" sin criterio que sirva para
// agrupar; la descripción sí distingue una lona de piscina de un lateral de
// tautliner. La subfamilia solo entra cuando la descripción no dice nada.

describe("las seis familias grandes", () => {
  const f = (d: string) => familiaDeTexto(d, null);

  it("camiones: tautliner, cisterna y lo que se describe empezando por LONA", () => {
    // Casi todo esto empieza por "LONA…", y por eso la regla de camión va la
    // primera de todas: si no, acabarían en Lonas.
    expect(f("LATERAL CORREDERA TAUTLINER XL HOMOLOGADO 12641")).toBe("CAMION");
    expect(f("LATERAL CORREDERA SIN TENSORES INOX TAUTLINER 1")).toBe("CAMION");
    expect(f("TECHO FIJO CAMION CISTERNA")).toBe("CAMION");
    expect(f("LONA SEPARA MERCANCIAS MONARD:247,5X212,5CM")).toBe("CAMION");
    expect(f("LONAS SISTEMA COMPOCAR:SISTEMA COMPLETO")).toBe("CAMION");
    expect(f("SEMITAUTLINER TECHO")).toBe("CAMION");
    expect(f("TECHO CAMIÓN")).toBe("CAMION");
  });

  it("remolques: baquetón, arquillado, ganado y caballos", () => {
    expect(f("LONA REMOLQUE ARQUILLADA")).toBe("REMOLQUE");
    expect(f("BAQUETÓN LATERAL")).toBe("REMOLQUE"); // toUpperCase() no quita tildes
    expect(f("BAQUETON LATERAL")).toBe("REMOLQUE");
    expect(f("LONA BOTELLERO")).toBe("REMOLQUE");
    expect(f("LONA PARA REMOLQUE DE GANADO")).toBe("REMOLQUE");
    expect(f("REMOLQUE PARA CABALLOS")).toBe("REMOLQUE");
    expect(f("CAPOTA NUEVA :RECTA")).toBe("REMOLQUE");
  });

  it("pero una capota de TERRAZA no es de remolque", () => {
    // "ESTRUCTURA CAPOTA CON PIES PARA TERRAZA O SIMILAR" es de la casa, no de
    // transporte, y con la regla de capota a secas acababa en Remolques.
    expect(f("ESTRUCTURA CAPOTA CON PIES PARA TERRAZA O SIMILAR")).not.toBe("REMOLQUE");
  });

  it("puertas: enrollables, plegables y apilables", () => {
    expect(f("PUERTA RÁPIDA APILABLE")).toBe("PUERTA");
    expect(f("PUERTA ENROLLABLE AUTOREPARABLE")).toBe("PUERTA");
    // Empieza por LONA y aun así es una puerta: por eso la regla va antes.
    expect(f("LONA PARA PUERTA PLEGABLE")).toBe("PUERTA");
  });

  it("fundas, y antes que toldos: una funda para toldo es una funda", () => {
    expect(f("TODO TIPO DE FUNDAS")).toBe("FUNDA");
    expect(f("FUNDA PARA TOLDO NUEVA")).toBe("FUNDA");
    expect(f("FUNDA A MEDIDA")).toBe("FUNDA");
  });

  it("lonas: lo que EMPIEZA por lona", () => {
    // La lista es de Iván: con riel, de techo para estructura, cerramiento
    // textil, de piscina, confeccionada, con ollaos.
    expect(f("LONA (TECHO, LATERAL,,,) PARA ESTRUCTURA CLIENTE")).toBe("LONA");
    expect(f("LONA CUBRE PISCINAS BICOLOR")).toBe("LONA");
    expect(f("LONA PLASTICA CONFECCIONADA NO RECTANGULAR")).toBe("LONA");
    expect(f("LONA CON OLLAOS 3X2")).toBe("LONA");
    expect(f("LONA CORTADA PARA SACOS PVC:NEGRO")).toBe("LONA");
    expect(f("LONA SEMI CONFECCIONADA :PVC")).toBe("LONA");
    expect(f("CERRAMIENTO TEXTIL CON LONA:FIJA TUBOS")).toBe("LONA");
  });

  it("un cerramiento ENROLLABLE de lona sigue siendo lona, no una puerta", () => {
    // "CERRAMIENTO TEXTIL CON LONA:ENROLLABLE CON MOTOR CORREDERA" lleva
    // "enrollable" y caía en Puertas.
    expect(f("CERRAMIENTO TEXTIL CON LONA:ENROLLABLE CON MOTOR CORREDERA")).toBe("LONA");
  });

  it("toldos: todos, incluidos los modelos que se venden por su nombre", () => {
    for (const d of [
      "TOLDO VERTICAL ELECTRA (ELIT DE LLAZA):SIN COFRE:CON GUIA",
      "TOLDO MODELO SCREEN ROLL-SYSTEM NUEVO Ø56",
      "TOLDO BRAZOS INVISIBLES MODELO ART 325 NUEVO",
      "TOLDO COFRE SPLENBOX 400 DE LLAZA",
      "CAMBIO DE TELA A TOLDO DE FACHADA",
      "FALDON LATERAL O FRONTAL NUEVO PARA TOLDO FACHADA",
      "BAMBALINA NUEVA",
      "CORTINA CRISTAL TERRAZA",
      "PERLABOX 300",
      "AMBAR BOX 250",
      "ARZUA COFRE",
      "XACOBEO PLANO",
    ]) {
      expect(familiaDeTexto(d, null), d).toBe("TOLDO");
    }
  });

  it("una carpa es una carpa, aunque se describa como lona de techo", () => {
    expect(f("LONA PARA TECHO DE CARPA")).toBe("CARPA");
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

describe("cuando la descripción no dice nada", () => {
  it("entonces sí manda la subfamilia de RPS", () => {
    expect(familiaDeTexto("PIEZA ESPECIAL", "18 - SUMINISTRO", { subfamilia: "PISCINA" })).toBe(
      "PISCINA",
    );
    expect(familiaDeTexto("PIEZA ESPECIAL", "1 - CERRAMIENTOS", { subfamilia: "PORTALES" })).toBe(
      "PORTALES",
    );
  });

  it("las subfamilias genéricas llevan la familia delante", () => {
    // LONASNUEVAS cuelga de REMOLQUE, CAMION, CARPAS, SUMINISTRO y AGRIGANA:
    // sola, metería en un montón cosas que no se parecen en nada.
    const sub = { subfamilia: "LONASNUEVAS" };
    expect(familiaDeTexto("PIEZA", "1 - CAMION", sub)).toBe("CAMION/LONASNUEVAS");
    expect(familiaDeTexto("PIEZA", "1 - CARPAS", sub)).toBe("CARPA/LONASNUEVAS");
  });

  it("y sin subfamilia, la familia de RPS", () => {
    // Pasa de verdad: 450 OF de OTR.ESTRUCTURAS y 422 de SUMINISTRO no tienen
    // subfamilia puesta en el artículo.
    expect(familiaDeTexto("TORNILLERIA", "1 - SUMINISTRO")).toBe("SUMINISTRO");
    expect(familiaDeTexto("PIEZA", "18 - SUMINISTRO", { subfamilia: "" })).toBe("SUMINISTRO");
  });

  it("lo que no se reconoce se queda con el nombre del grupo, no se fuerza", () => {
    expect(familiaDeTexto("ALGO RARO", "1 - ACABADOS")).toBe("ACABADOS");
    expect(familiaDeTexto(null, null)).toBe("OTRO");
  });
});

describe("clientes que valen por una familia", () => {
  it("mandan sobre todo lo demás, incluida la descripción", () => {
    const assa = { cliente: "ASSA ABLOY ENTRANCE SYSTEMS PRODUCTION ROMANIA SRL" };
    expect(familiaDeTexto("PUERTA RAPIDA ENROLLABLE", "18 - SUMINISTRO", assa)).toBe("ASSAABLOY");
    expect(familiaDeTexto("TOLDO COFRE", "1 - TOLDO FACHADA", assa)).toBe("ASSAABLOY");
    // Y sin cliente reconocido, todo sigue como estaba.
    expect(familiaDeTexto("TOLDO COFRE", "1 - TOLDO FACHADA", { cliente: "MAHOU" })).toBe("TOLDO");
  });

  it("cada uno tiene sus razones sociales, y no se pisan entre ellos", () => {
    const f = (cliente: string) => familiaDeTexto("PIEZA", "1 - CAMION", { cliente });
    // Assa Abloy: en RPS hay cuatro nombres, uno con la errata "PRDUCTION".
    expect(f("ASSA ABLOY ENTRANCE  SYSTEMS PRDUCTION SPAIN")).toBe("ASSAABLOY");
    expect(f("ASSA ABLOY ENTRANCE SYSTEM SPAIN S.A.")).toBe("ASSAABLOY");
    // Layher: dos sociedades.
    expect(f("LAYHER, S. A. ")).toBe("LAYHER");
    expect(f("LAYHER IBERICA S.L.")).toBe("LAYHER");
    // Carrocerías Inteligentes se pide por el nombre ENTERO: hay dos docenas de
    // "CARROCERIAS <algo>" en RPS que no son este cliente.
    expect(f("CCI CARROCERIAS INTELIGENTES S.L.")).toBe("CCI");
    expect(f("CARROCERIAS TAMBRE, S. A.")).toBe("CAMION");
    expect(f("CARROCEROS DEL NOROESTE, S. L.")).toBe("CAMION");
  });
});

describe("familiaMeta", () => {
  it("los seis grandes se llaman en plural: son nombres de montón", () => {
    expect(familiaMeta("TOLDO").label).toBe("Toldos");
    expect(familiaMeta("LONA").label).toBe("Lonas");
    expect(familiaMeta("PUERTA").label).toBe("Puertas");
    expect(familiaMeta("FUNDA").label).toBe("Fundas");
    expect(familiaMeta("REMOLQUE").label).toBe("Remolques");
    expect(familiaMeta("CAMION").label).toBe("Camiones");
  });

  it("las compuestas juntan los dos nombres, con el color de la familia", () => {
    // El color va por la FAMILIA porque es el eje que la subfamilia sola
    // borraba: un camión y una carpa no son lo mismo aunque las dos lleven
    // lona nueva. El icono, por la subfamilia, que es lo que se hace.
    const camion = familiaMeta("CAMION/LONASNUEVAS");
    const carpa = familiaMeta("CARPA/LONASNUEVAS");
    expect(camion.label).toBe("Camiones · Lonas nuevas");
    expect(carpa.label).toBe("Carpa · Lonas nuevas");
    expect(camion.color).not.toBe(carpa.color);
    expect(camion.icon).toBe(carpa.icon);
  });

  it("una compuesta con trozos desconocidos no revienta ni queda en mayúsculas", () => {
    expect(familiaMeta("AGRIGANA/LONASNUEVAS").label).toBe("Agrigana · Lonas nuevas");
    expect(familiaMeta("XXX/YYY").label).toBe("Xxx · Yyy");
  });
});
