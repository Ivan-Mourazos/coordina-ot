import { expect, test } from "vitest";
import {
  causasDeLoQueFalla,
  guiaDeFamilias,
  sinMirar,
  yaExiste,
  type EstadoPunto,
  type PuntoGuia,
} from "../guia-revision";

const causa = (
  id: number,
  etiqueta: string,
  familia: string | null,
  mira: string | null,
  retirada = false,
) => ({ id, etiqueta, familia, mira, retirada });

const CAUSAS = [
  causa(1, "Error en medidas", null, "Las medidas"),
  causa(2, "Material equivocado", null, "El material apuntado"),
  causa(3, "Medidas de la lona mal", "LONA", "Medidas de la lona hecha"),
  causa(4, "Falta la simetría", "LONA", "Simetría hecha, si hace falta"),
  causa(5, "Motor equivocado", "TOLDO", "El motor"),
  // Una causa que se puede marcar al devolver pero no es un punto que repasar.
  causa(6, "Otro fallo del cliente", null, null),
  // Retirada: se sigue leyendo en el histórico, pero ya no se pide.
  causa(7, "Lona vieja", "LONA", "La lona", true),
];

test("un trabajo de lona repasa las genéricas y las suyas, en ese orden", () => {
  // Las genéricas primero porque valen para cualquier trabajo, y es el orden
  // en que se revisa: lo de siempre y luego lo propio de la lona.
  expect(guiaDeFamilias(CAUSAS, ["LONA"]).map((p) => p.mira)).toEqual([
    "Las medidas",
    "El material apuntado",
    "Medidas de la lona hecha",
    "Simetría hecha, si hace falta",
  ]);
});

test("un pedido con toldo y lona repasa las de las dos", () => {
  // Pasa a menudo: el toldo y su lona van en el mismo pedido y los revisa la
  // misma persona de una vez.
  const miras = guiaDeFamilias(CAUSAS, ["TOLDO", "LONA"]).map((p) => p.mira);
  expect(miras).toContain("Medidas de la lona hecha");
  expect(miras).toContain("El motor");
});

test("una familia sin puntos propios se queda con las genéricas", () => {
  // Es lo que pasa el primer día de cada familia: nadie ha dictado las suyas
  // todavía, y la guía tiene que servir igual.
  expect(guiaDeFamilias(CAUSAS, ["FUNDA"]).map((p) => p.mira)).toEqual([
    "Las medidas",
    "El material apuntado",
  ]);
});

test("no entran las retiradas ni las causas sin cara en positivo", () => {
  const ids = guiaDeFamilias(CAUSAS, ["LONA"]).map((p) => p.id);
  expect(ids).not.toContain(7); // retirada
  expect(ids).not.toContain(6); // sin `mira`: se marca al devolver, no se repasa
});

test("la familia se compara sin distinguir mayúsculas", () => {
  // Los códigos vienen de RPS y no siempre con la misma caja.
  expect(guiaDeFamilias(CAUSAS, ["lona"]).map((p) => p.id)).toContain(3);
});

test("solo van a la devolución los puntos marcados como fallo", () => {
  const puntos: PuntoGuia[] = guiaDeFamilias(CAUSAS, ["LONA"]);
  const marcas: Record<number, EstadoPunto> = { 1: "bien", 3: "falla", 4: "falla" };
  expect(causasDeLoQueFalla(puntos, marcas)).toEqual([3, 4]);
});

test("quedan por mirar los que nadie ha tocado", () => {
  const puntos = guiaDeFamilias(CAUSAS, ["LONA"]);
  expect(sinMirar(puntos, {})).toBe(4);
  expect(sinMirar(puntos, { 1: "bien", 3: "falla" })).toBe(2);
});

test("avisa de que otra causa ya dice lo mismo, escrita distinta", () => {
  // Es lo que evita que acaben existiendo "Falta la simetría" y "falta la
  // simetria": la lista deshilachada no se puede contar.
  expect(yaExiste("  falta LA simetria ", CAUSAS)).toBe(true);
  // La propia no cuenta: editarla para corregirle una tilde tiene que valer.
  expect(yaExiste("Falta la simetría", CAUSAS, 4)).toBe(false);
  expect(yaExiste("Falta el croquis", CAUSAS)).toBe(false);
});
