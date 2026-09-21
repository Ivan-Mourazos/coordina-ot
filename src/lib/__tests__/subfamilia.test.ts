import { expect, test } from "vitest";
import { subfamiliaAparte } from "../familia";

test("la subfamilia que repite la familia no se enseña, aunque cambie una S", () => {
  // La ficha pintaba "Puertas · PUERTAS": el id es PUERTA y RPS escribe PUERTAS.
  expect(subfamiliaAparte("PUERTA", "PUERTAS")).toBeNull();
});

test("la que añade algo, sí", () => {
  expect(subfamiliaAparte("PUERTA", "TOLDO NUEVO")).toBe("TOLDO NUEVO");
});

test("vacía, nada", () => {
  expect(subfamiliaAparte("PUERTA", null)).toBeNull();
  expect(subfamiliaAparte("PUERTA", "  ")).toBeNull();
});
