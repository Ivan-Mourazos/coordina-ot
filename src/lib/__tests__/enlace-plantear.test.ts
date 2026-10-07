import { describe, expect, it } from "vitest";
import { enlacePlantear } from "../herramientas";

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
