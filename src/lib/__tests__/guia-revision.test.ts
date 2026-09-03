import { expect, test } from "vitest";
import {
  GUIA_REVISION,
  causasDeLoQueFalla,
  idsDeCausas,
  sinMirar,
  type EstadoPunto,
} from "../guia-revision";

test("cada punto de la guía tiene su causa de devolución", () => {
  // Si un punto se quedara sin causa, marcarlo como fallo no llevaría nada al
  // cuadro de devolver y el revisor tendría que buscarla a mano — que es lo
  // que la guía viene a evitar.
  for (const p of GUIA_REVISION) {
    expect(p.causa.length, `${p.id} sin causa`).toBeGreaterThan(0);
  }
  expect(new Set(GUIA_REVISION.map((p) => p.id)).size).toBe(GUIA_REVISION.length);
});

test("solo van a la devolución los puntos marcados como fallo", () => {
  // Lo que está bien y lo que no se ha mirado no son causas de nada.
  const marcas: Record<string, EstadoPunto> = {
    "medidas-lona": "falla",
    "tipo-lona": "bien",
    simetria: "falla",
  };
  expect(causasDeLoQueFalla(marcas)).toEqual(["Medidas de la lona mal", "Falta la simetría"]);
});

test("las causas van en el orden de la guía, no en el que se marcaron", () => {
  // El revisor puede bajar y volver a subir; la devolución tiene que leerse
  // igual da el camino que siguiera.
  const marcas: Record<string, EstadoPunto> = { simetria: "falla", "medidas-lona": "falla" };
  expect(causasDeLoQueFalla(marcas)).toEqual(["Medidas de la lona mal", "Falta la simetría"]);
});

test("las etiquetas se resuelven a los ids de ESTA instalación", () => {
  // Los ids los pone la base al sembrar y no coinciden entre desarrollo y el
  // servidor: el vínculo va por etiqueta normalizada.
  const causas = [
    { id: 7, etiqueta: "  medidas de la LONA mal " },
    { id: 9, etiqueta: "Falta la simetría" },
  ];
  expect(idsDeCausas(["Medidas de la lona mal", "Falta la simetría"], causas)).toEqual([7, 9]);
});

test("una causa retirada o renombrada se cae sin romper la devolución", () => {
  // Pasa de verdad: las causas se pueden retirar desde el propio cuadro de
  // devolver. Mejor una causa menos marcada que un error por algo que el
  // revisor no ha hecho.
  const causas = [{ id: 9, etiqueta: "Falta la simetría" }];
  expect(idsDeCausas(["Medidas de la lona mal", "Falta la simetría"], causas)).toEqual([9]);
});

test("quedan por mirar los que nadie ha tocado", () => {
  expect(sinMirar({})).toBe(GUIA_REVISION.length);
  expect(sinMirar({ "medidas-lona": "bien", simetria: "falla" })).toBe(GUIA_REVISION.length - 2);
  expect(sinMirar({ "medidas-lona": "sin_mirar" })).toBe(GUIA_REVISION.length);
});
