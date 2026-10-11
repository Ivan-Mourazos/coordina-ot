import { expect, test } from "vitest";
import {
  causasDeLoQueFalla,
  guiaDeFamilias,
  sinMirar,
  yaExiste,
  type EstadoPunto,
  type PuntoGuia,
} from "../guia-revision";

const CAUSAS = [
  { id: 1, etiqueta: "Medidas" },
  { id: 2, etiqueta: "Material y acabados" },
  { id: 3, etiqueta: "Corte" },
  { id: 4, etiqueta: "Elementos y accesorios" },
];

const paso = (id: number, texto: string, familia: string | null, causaId: number, retirado = false) => ({
  id,
  texto,
  familia,
  causaId,
  retirado,
});

const PASOS = [
  // Un paso de lona entre los comunes: la guía tiene que ordenarlos igual.
  paso(13, "Medidas de la lona hecha", "LONA", 1),
  paso(11, "Las medidas", null, 1),
  paso(12, "El material apuntado", null, 2),
  paso(14, "Todas las piezas en el corte", "LONA", 3),
  paso(15, "El motor y su lado", "TOLDO", 4),
  // Retirado: se sigue viendo en las marcas viejas, pero ya no se pide.
  paso(16, "La lona", "LONA", 2, true),
];

test("un trabajo de lona repasa los comunes y luego los suyos", () => {
  expect(guiaDeFamilias(PASOS, CAUSAS, ["LONA"]).map((p) => p.mira)).toEqual([
    "Las medidas",
    "El material apuntado",
    "Medidas de la lona hecha",
    "Todas las piezas en el corte",
  ]);
});

test("cada paso lleva el nombre de la causa que marca si falla", () => {
  const motor = guiaDeFamilias(PASOS, CAUSAS, ["TOLDO"]).find((p) => p.id === 15);
  expect(motor).toMatchObject({ causaId: 4, etiqueta: "Elementos y accesorios" });
});

test("un pedido con toldo y lona repasa los de las dos", () => {
  const miras = guiaDeFamilias(PASOS, CAUSAS, ["TOLDO", "LONA"]).map((p) => p.mira);
  expect(miras).toContain("Medidas de la lona hecha");
  expect(miras).toContain("El motor y su lado");
});

test("una familia sin pasos propios se queda con los comunes", () => {
  expect(guiaDeFamilias(PASOS, CAUSAS, ["FUNDA"]).map((p) => p.id)).toEqual([11, 12]);
});

test("no entran los retirados, y la familia no distingue mayúsculas", () => {
  const ids = guiaDeFamilias(PASOS, CAUSAS, ["lona"]).map((p) => p.id);
  expect(ids).not.toContain(16);
  expect(ids).toContain(13);
});

test("van a la devolución las causas de los pasos que fallan, sin repetir", () => {
  // Dos pasos de medidas fallando son UNA causa marcada.
  const puntos: PuntoGuia[] = guiaDeFamilias(PASOS, CAUSAS, ["LONA"]);
  const marcas: Record<number, EstadoPunto> = { 11: "falla", 12: "bien", 13: "falla", 14: "falla" };
  expect(causasDeLoQueFalla(puntos, marcas)).toEqual([1, 3]);
});

test("quedan por mirar los que nadie ha tocado", () => {
  const puntos = guiaDeFamilias(PASOS, CAUSAS, ["LONA"]);
  expect(sinMirar(puntos, {})).toBe(4);
  expect(sinMirar(puntos, { 11: "bien", 13: "falla" })).toBe(2);
});

test("avisa de que otra causa ya dice lo mismo, escrita distinta", () => {
  expect(yaExiste("  material Y acabados ", CAUSAS)).toBe(true);
  // La propia no cuenta: editarla para corregirle una tilde tiene que valer.
  expect(yaExiste("Material y acabados", CAUSAS, 2)).toBe(false);
  expect(yaExiste("Falta el croquis", CAUSAS)).toBe(false);
});
