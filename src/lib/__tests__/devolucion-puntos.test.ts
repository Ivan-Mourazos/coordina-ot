import { expect, test } from "vitest";
import { correccionDe, notaDeLaGuia, puntosDeCorreccion } from "@/lib/devolucion";

test("la corrección se enseña mientras se corrige y se pliega al reenviarla", () => {
  const nota = "[2;p11] ✗ Las medidas — Faltan 3 cm";
  expect(correccionDe({ estado: "devuelta", observacion: nota })).toBe("a_corregir");
  expect(correccionDe({ estado: "en_curso", observacion: nota })).toBe("a_corregir");
  expect(correccionDe({ estado: "por_revisar", observacion: nota })).toBe("enviada");
  expect(correccionDe({ estado: "en_revision", observacion: nota })).toBe("enviada");
  expect(correccionDe({ estado: "aprobada", observacion: nota })).toBeNull();
  expect(correccionDe({ estado: "en_curso", observacion: null })).toBeNull();
  // Una OF restaurada guarda el motivo de la anulación en el mismo campo.
  expect(correccionDe({ estado: "en_curso", observacion: "taller" })).toBeNull();
});

test("lo que hay que hacer va delante y el paso detrás", () => {
  const nota = notaDeLaGuia(
    [
      { mira: "Las medidas", comentario: "Faltan 3 cm en el lateral derecho" },
      { mira: "Las cotas del croquis", comentario: "Falta la cota del primer ollao — y la del segundo" },
    ],
    "Revisa también la etiqueta del cliente.",
  );
  expect(puntosDeCorreccion(nota)).toEqual({
    puntos: [
      { que: "Faltan 3 cm en el lateral derecho", paso: "Las medidas" },
      { que: "Falta la cota del primer ollao — y la del segundo", paso: "Las cotas del croquis" },
    ],
    extra: "Revisa también la etiqueta del cliente.",
  });
});

test("una ✗ sin texto se queda con el nombre del paso", () => {
  expect(puntosDeCorreccion("✗ El material apuntado").puntos).toEqual([{ que: "El material apuntado" }]);
});

test("una nota escrita a mano: cada línea es un punto y no hay extra", () => {
  expect(puntosDeCorreccion("- cotas\n- tornillería")).toEqual({
    puntos: [{ que: "cotas" }, { que: "tornillería" }],
    extra: "",
  });
  expect(puntosDeCorreccion("")).toEqual({ puntos: [], extra: "" });
});
