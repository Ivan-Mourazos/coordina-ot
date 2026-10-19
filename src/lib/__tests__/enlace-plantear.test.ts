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
  const of = (familia: string, estado: string) => ({ familia, estado });

  it("mientras queda algo por plantear, es Plantear", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "en_curso"), of("TOLDO", "por_revisar")])).toEqual({
      modo: "plantear",
      url: "http://192.168.0.90:4400/?pedido=AR2604351",
    });
  });

  it("mandado a revisión, es Revisar y abre el pedido en Pedidos", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "por_revisar"), of("TOLDO", "aprobada")])).toEqual({
      modo: "revisar",
      url: "http://192.168.0.90:4400/?revisar=AR2604351",
    });
    expect(botonPlantear("AR.26.04351", [of("REMOLQUE", "en_revision")])?.modo).toBe("revisar");
  });

  it("solo miran las OF que se plantean allí; las anuladas no cuentan", () => {
    expect(
      botonPlantear("AR.26.04351", [of("TOLDO", "por_revisar"), of("LONA", "en_curso"), of("TOLDO", "anulada")])?.modo,
    ).toBe("revisar");
  });

  it("todo aprobado vuelve a Plantear: no queda nada que revisar", () => {
    expect(botonPlantear("AR.26.04351", [of("TOLDO", "aprobada")])?.modo).toBe("plantear");
  });

  it("sin toldo ni remolque, nada", () => {
    expect(botonPlantear("AR.26.04351", [of("LONA", "por_revisar")])).toBeNull();
  });
});
