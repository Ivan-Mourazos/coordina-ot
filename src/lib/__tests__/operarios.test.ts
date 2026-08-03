import { describe, expect, it } from "vitest";
import {
  COD_RPS_POR_OPERARIO,
  codigoRpsDe,
  operarioDeEmpleado,
} from "../server/operarios";

describe("mapa operario ↔ empleado de RPS", () => {
  it("las dos direcciones son coherentes", () => {
    for (const [operario, cod] of Object.entries(COD_RPS_POR_OPERARIO)) {
      expect(operarioDeEmpleado(cod)).toBe(operario);
    }
  });

  it("ningún operario comparte código con otro", () => {
    const codigos = Object.values(COD_RPS_POR_OPERARIO);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("devuelve el código de RPS de un operario del tablero", () => {
    expect(codigoRpsDe("ivan")).toBe("195");
  });

  it("un operario desconocido no tiene código (no se inventa uno)", () => {
    expect(codigoRpsDe("nadie")).toBeNull();
  });
});
