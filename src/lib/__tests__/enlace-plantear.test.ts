import { describe, expect, it } from "vitest";
import { botonPlantear, enlacePlantear } from "../herramientas";

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
