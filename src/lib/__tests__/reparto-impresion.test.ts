import { expect, test } from "vitest";
import { claveParte, hayQueGirar, leerAjustesImpresion, papelDe, partesDe } from "../planteamiento";

test("reconoce A3, A4 y A5 en cualquier orientación", () => {
  expect(papelDe(595, 842)).toBe("A4");
  expect(papelDe(842, 595)).toBe("A4");
  expect(papelDe(420, 595)).toBe("A5");
  expect(papelDe(595, 420)).toBe("A5");
  expect(papelDe(842, 1191)).toBe("A3");
  expect(papelDe(612, 792)).toBeNull(); // carta
});

test("parte el PDF por papel: A4 a Producción, A5 y A3 a OT, lo raro a mano", () => {
  const partes = partesDe([
    { papel: "A4", horizontal: false },
    { papel: "A5", horizontal: true },
    { papel: "A4", horizontal: false },
    { papel: null, horizontal: false },
  ]);
  expect(partes).toEqual([
    { papel: "A4", paginas: [1, 3], destino: "produccion", horizontal: false },
    { papel: "A5", paginas: [2], destino: "ot", horizontal: true },
    { papel: null, paginas: [4], destino: "manual", horizontal: false },
  ]);
});

test("solo se gira si se eligió lo contrario de como viene", () => {
  expect(hayQueGirar({ horizontal: true }, "horizontal")).toBe(false);
  expect(hayQueGirar({ horizontal: true }, "vertical")).toBe(true);
  expect(hayQueGirar({ horizontal: false }, undefined)).toBe(false);
});

test("los ajustes que manda el navegador se comprueban", () => {
  const k = claveParte("AR2605333-10.pdf", "A5");
  expect(leerAjustesImpresion({ orientaciones: { [k]: "vertical", "malo": "vertical", [claveParte("x.pdf", "A4")]: "de lado" }, aMano: [k, 7, "x|A6"] }))
    .toEqual({ orientaciones: { [k]: "vertical" }, aMano: [k] });
  expect(leerAjustesImpresion(null)).toBeNull();
});
