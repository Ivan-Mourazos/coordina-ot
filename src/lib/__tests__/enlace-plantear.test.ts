import { describe, expect, it } from "vitest";
import { PUERTAS_EN_PLANTEAMIENTOS, botonPlantear, enlacePlantear, esLonaSystemDock, esPuertaDeLona } from "../herramientas";

describe("enlacePlantear", () => {
  it("abre Planteamientos TGM con el pedido, sin puntos", () => {
    expect(enlacePlantear("AR.26.04351", ["TOLDO"])).toBe(
      "http://192.168.0.90:4400/?pedido=AR2604351",
    );
  });

  it("vale para toldos y para remolques, aunque el pedido lleve más cosas", () => {
    expect(enlacePlantear("AR.26.00001", ["TOLDO NUEVO"])).not.toBeNull();
    expect(enlacePlantear("AR.26.00001", ["SUMINISTRO", "REMOLQUE"])).not.toBeNull();
  });

  it("sin toldo ni remolque no hay nada que plantear allí", () => {
    expect(enlacePlantear("AR.26.00001", ["LONA", "CARPA"])).toBeNull();
    expect(enlacePlantear("AR.26.00001", [])).toBeNull();
  });
});

describe("botonPlantear", () => {
  const of = (familia: string, estado: string, autorId: string | null = null) => ({ familia, estado, autorId });
  const PEDIDO = "http://192.168.0.90:4400/?pedido=AR2604351";
  const REVISAR = "http://192.168.0.90:4400/?revisar=AR2604351";

  // ── Un caso por modo ──
  it("con una OF devuelta es Corregir, y abre el pedido en Pedidos", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "devuelta")])).toEqual({ modo: "corregir", url: REVISAR });
  });

  it("mientras queda algo por plantear, es Plantear y carga el formulario", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "en_curso"), of("TOLDO", "por_revisar")])).toEqual({
      modo: "plantear",
      url: PEDIDO,
    });
    expect(botonPlantear("AR.26.04351", [of("REMOLQUE", "pendiente")])?.modo).toBe("plantear");
  });

  it("mandado a revisión, es Revisar y abre el pedido en Pedidos", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "por_revisar"), of("TOLDO", "aprobada")])).toEqual({
      modo: "revisar",
      url: REVISAR,
    });
    expect(botonPlantear("AR.26.04351", [of("REMOLQUE", "en_revision")])?.modo).toBe("revisar");
  });

  it("todo aprobado es Abrir: ya no hay nada que plantear ni revisar", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "aprobada"), of("REMOLQUE", "aprobada")])).toEqual({
      modo: "abrir",
      url: REVISAR,
    });
  });

  // ── Mezclas: manda el orden Corregir > Plantear > Revisar > Abrir ──
  it("una devuelta y otra aprobada: Corregir", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "devuelta"), of("TOLDO", "aprobada")])?.modo).toBe("corregir");
  });

  it("una devuelta gana también a una sin plantear", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "pendiente"), of("TOLDO", "devuelta")])?.modo).toBe("corregir");
  });

  it("una sin plantear y otra en revisión: Plantear", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "pendiente"), of("TOLDO", "en_revision")])).toEqual({
      modo: "plantear",
      url: PEDIDO,
    });
  });

  // ── Lo que no cuenta ──
  it("las anuladas no cuentan", () => {
    // Sin la anulada, todo aprobado: Abrir, no Plantear.
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "aprobada"), of("TOLDO", "anulada")])?.modo).toBe("abrir");
    // Una anulada sola no deja nada que plantear allí.
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "anulada")])).toBeNull();
  });

  it("solo miran las OF que se plantean allí", () => {
    expect(
      botonPlantear("AR.26.04351", [of("TOLDO", "por_revisar"), of("LONA", "en_curso"), of("TOLDO", "anulada")])?.modo,
    ).toBe("revisar");
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "aprobada"), of("LONA", "devuelta")])?.modo).toBe("abrir");
  });

  // ── Corregir es del autor ──
  it("sabiendo quién mira, Corregir solo le sale al autor; a los demás, Abrir", () => {
    const ofs = [of("TOLDO", "devuelta", "ana")];
    expect(botonPlantear("AR.26.04351", ofs, "ana")).toEqual({ modo: "corregir", url: REVISAR });
    expect(botonPlantear("AR.26.04351", ofs, "luis")).toEqual({ modo: "abrir", url: REVISAR });
  });

  it("con varias devueltas basta con que una sea de quien mira", () => {
    const ofs = [of("TOLDO", "devuelta", "ana"), of("REMOLQUE", "devuelta", "luis")];
    expect(botonPlantear("AR.26.04351", ofs, "luis")?.modo).toBe("corregir");
    expect(botonPlantear("AR.26.04351", ofs, "pepe")?.modo).toBe("abrir");
  });

  it("si no se sabe quién mira o de quién es la OF, se queda en Corregir", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "devuelta", "ana")])?.modo).toBe("corregir");
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "devuelta", null)], "luis")?.modo).toBe("corregir");
  });

  it("sin toldo ni remolque, nada", () => {
    expect(botonPlantear("AR.26.04351", [of("LONA", "por_revisar")])).toBeNull();
  });
});

// ── Puertas de lona (22/10/2026) ──
const PEDIDO = "http://192.168.0.90:4400/?pedido=AR2604351";
const REVISAR = "http://192.168.0.90:4400/?revisar=AR2604351";
const toldo = (estado: string) => ({ familia: "TOLDO", estado, autorId: null });
const puerta = (estado: string, extra: { descripcion?: string; codigoArticulo?: string }) => ({
  familia: "PUERTA",
  estado,
  autorId: null,
  ...extra,
});

describe("esPuertaDeLona", () => {
  it("enrollables, plegables (apilables) y autorreparables", () => {
    expect(esPuertaDeLona(puerta("pendiente", { codigoArticulo: "PUERTAPLE" }))).toBe(true);
    expect(esPuertaDeLona(puerta("pendiente", { codigoArticulo: "PUERTAENR" }))).toBe(true);
    // Sin código de artículo, por la descripción.
    expect(esPuertaDeLona(puerta("pendiente", { descripcion: "LONA PARA PUERTA APILABLE" }))).toBe(true);
    // RPS escribe «AUTOREPARABLE» con una sola R.
    expect(esPuertaDeLona(puerta("pendiente", { descripcion: "LONA PARA PUERTA  AUTOREPARABLE" }))).toBe(true);
  });

  it("ni seccionales, ni muelles, ni tramos, ni puertas rápidas", () => {
    expect(esPuertaDeLona(puerta("pendiente", { descripcion: "PUERTA SECCIONAL INDUSTRIAL" }))).toBe(false);
    expect(esPuertaDeLona(puerta("pendiente", { descripcion: "LONA PARA MUELLE DE CARGA" }))).toBe(false);
    expect(esPuertaDeLona(puerta("pendiente", { codigoArticulo: "PUERTAPLET", descripcion: "TRAMO PUERTA PLEGABLE" }))).toBe(false);
    expect(esPuertaDeLona(puerta("pendiente", { codigoArticulo: "PUERTAPLETRAM" }))).toBe(false);
    expect(esPuertaDeLona(puerta("pendiente", { descripcion: "TRAMO PUERTA PLEGABLE" }))).toBe(false);
    expect(esPuertaDeLona(puerta("pendiente", { codigoArticulo: "PUERTARAPIDA", descripcion: "PUERTA RAPIDA" }))).toBe(false);
  });

  it("con código de artículo manda el código, no la descripción", () => {
    expect(esPuertaDeLona(puerta("pendiente", { codigoArticulo: "PUERTAENR", descripcion: "OTRA COSA" }))).toBe(true);
    expect(esPuertaDeLona(puerta("pendiente", { codigoArticulo: "SECCIONAL1", descripcion: "PUERTA PLEGABLE" }))).toBe(false);
  });
});

// Apagado mientras se configuran en Planteamientos TGM: ver PUERTAS_EN_PLANTEAMIENTOS.
describe.runIf(!PUERTAS_EN_PLANTEAMIENTOS)("con las puertas apagadas", () => {
  it("una puerta de lona no lleva botón", () => {
    expect(botonPlantear("AR.26.04351", [puerta("pendiente", { codigoArticulo: "PUERTAPLE" })])).toBeNull();
  });
  it("en un pedido mixto solo cuenta el toldo", () => {
    expect(botonPlantear("AR.26.04351", [toldo("aprobada"), puerta("pendiente", { codigoArticulo: "PUERTAPLE" })])?.modo).toBe("abrir");
  });
});

describe.runIf(PUERTAS_EN_PLANTEAMIENTOS)("botonPlantear con puertas", () => {
  it("una puerta apilable pendiente es Plantear, con ?pedido=", () => {
    expect(botonPlantear("AR.26.04351", [puerta("pendiente", { codigoArticulo: "PUERTAPLE" })])).toEqual({ modo: "plantear", url: PEDIDO });
  });

  it("una puerta en revisión es Revisar, con ?revisar=", () => {
    expect(botonPlantear("AR.26.04351", [puerta("en_revision", { codigoArticulo: "PUERTAENR" })])).toEqual({ modo: "revisar", url: REVISAR });
  });

  it("una seccional no da botón", () => {
    expect(botonPlantear("AR.26.04351", [puerta("pendiente", { descripcion: "PUERTA SECCIONAL INDUSTRIAL" })])).toBeNull();
  });

  it("un pedido de toldo y puerta mira el estado de todas sus OF", () => {
    expect(botonPlantear("AR.26.04351", [toldo("aprobada"), puerta("pendiente", { codigoArticulo: "PUERTAPLE" })])?.modo).toBe("plantear");
    expect(botonPlantear("AR.26.04351", [toldo("aprobada"), puerta("en_revision", { codigoArticulo: "PUERTAPLE" })])?.modo).toBe("revisar");
    expect(botonPlantear("AR.26.04351", [toldo("aprobada"), puerta("aprobada", { codigoArticulo: "PUERTAPLE" })])?.modo).toBe("abrir");
    // La seccional no cuenta: con el toldo aprobado queda Abrir, no Plantear.
    expect(botonPlantear("AR.26.04351", [toldo("aprobada"), puerta("pendiente", { descripcion: "PUERTA SECCIONAL" })])?.modo).toBe("abrir");
  });
});

// ── Lonas de System Dock (27/10/2026) ──
const lonaSd = (estado: string) => ({
  familia: "LONA",
  estado,
  autorId: null,
  descripcion: "LONA PERIMETRAL 10400X550 (ESTANDAR)",
  codigoArticulo: "A110210400550-4",
});

describe("esLonaSystemDock", () => {
  it("la lona perimetral de System Dock, sea cual sea su familia aquí", () => {
    expect(esLonaSystemDock({ descripcion: "LONA PERIMETRAL 10400X550 (ESTANDAR)" })).toBe(true);
    expect(esLonaSystemDock({ descripcion: "LONA PERIMETRAL 12700X550" })).toBe(true);
  });
  it("otras lonas no", () => {
    expect(esLonaSystemDock({ descripcion: "LONA PARA PUERTA ENROLLABLE" })).toBe(false);
    expect(esLonaSystemDock({ descripcion: "LONA CUBRE PISCINAS BICOLOR" })).toBe(false);
    expect(esLonaSystemDock({})).toBe(false);
  });
});

describe.runIf(PUERTAS_EN_PLANTEAMIENTOS)("botonPlantear con System Dock", () => {
  it("una lona perimetral pendiente es Plantear, con ?pedido=", () => {
    expect(botonPlantear("AR.26.04351", [lonaSd("pendiente")])).toEqual({ modo: "plantear", url: PEDIDO });
  });
  it("los portes del pedido no cuentan", () => {
    expect(botonPlantear("AR.26.04351", [lonaSd("aprobada"), { familia: "OTRO", estado: "pendiente", autorId: null, descripcion: "PORTES" }])?.modo).toBe("abrir");
  });
});
