import { expect, test } from "vitest";
import { negocioAparte } from "../negocio";

test("el nombre comercial se enseña", () => {
  expect(negocioAparte("MAHOU, S.A.", "CAFE BAR LUMA")).toBe("CAFE BAR LUMA");
});

test("si repite al cliente, no", () => {
  expect(negocioAparte("CABALLERO PESCADOR, LUIS ANGEL", "CABALLERO PESCADOR, LUIS ANGEL")).toBeNull();
  // Da igual la puntuación, los acentos o las mayúsculas: sigue siendo el mismo.
  expect(negocioAparte("Talleres López Vilar, S.L.", "TALLERES LOPEZ VILAR SL")).toBeNull();
});

test("vacío o sin negocio, nada", () => {
  expect(negocioAparte("X", null)).toBeNull();
  expect(negocioAparte("X", "  ")).toBeNull();
});
