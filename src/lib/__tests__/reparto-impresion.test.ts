import { expect, test } from "vitest";
import {
  claveTrabajo, consultaTrabajo, leerAjustesImpresion, paginasSinImpresora, papelDe, partesDe, seleccionDeSerie, trabajosDe,
  type PaginaPdf, type SeleccionPaginas,
} from "../planteamiento";

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

const PDF: PaginaPdf[] = [
  { papel: "A4", horizontal: false },
  { papel: "A5", horizontal: true },
  { papel: "A4", horizontal: false },
  { papel: null, horizontal: false },
];

test("de serie: A4 a Producción, A5 y A3 a OT, cada una como viene", () => {
  expect(seleccionDeSerie(PDF)).toEqual({
    produccion: [{ pagina: 1, orientacion: "vertical" }, { pagina: 3, orientacion: "vertical" }],
    ot: [{ pagina: 2, orientacion: "horizontal" }],
  });
  expect(trabajosDe(PDF, seleccionDeSerie(PDF))).toEqual([
    { impresora: "produccion", papel: "A4", paginas: [{ pagina: 1, girar: false, ajustar: false }, { pagina: 3, girar: false, ajustar: false }] },
    { impresora: "ot", papel: "A5", paginas: [{ pagina: 2, girar: false, ajustar: false }] },
  ]);
  // La de un tamaño raro no la tiene ninguna: a mano, solo si es lo de serie.
  expect(paginasSinImpresora(PDF, seleccionDeSerie(PDF), true)).toEqual([4]);
  expect(paginasSinImpresora(PDF, seleccionDeSerie(PDF), false)).toEqual([]);
});

test("el A5 en Producción sale en A4 y vertical, sin quitarlo de la de OT", () => {
  const sel: SeleccionPaginas = {
    produccion: [{ pagina: 3, orientacion: "vertical" }, { pagina: 2, orientacion: "vertical" }, { pagina: 1, orientacion: "vertical" }],
    ot: [{ pagina: 2, orientacion: "horizontal" }, { pagina: 1, orientacion: "vertical" }, { pagina: 4, orientacion: "vertical" }],
  };
  expect(trabajosDe(PDF, sel)).toEqual([
    {
      impresora: "produccion",
      papel: "A4",
      paginas: [
        { pagina: 1, girar: false, ajustar: false },
        { pagina: 2, girar: true, ajustar: true },
        { pagina: 3, girar: false, ajustar: false },
      ],
    },
    // La de OT, un trabajo por bandeja; lo raro, ajustado a A4.
    { impresora: "ot", papel: "A4", paginas: [{ pagina: 1, girar: false, ajustar: false }, { pagina: 4, girar: false, ajustar: true }] },
    { impresora: "ot", papel: "A5", paginas: [{ pagina: 2, girar: false, ajustar: false }] },
  ]);
});

test("la dirección del PDF de un trabajo", () => {
  expect(consultaTrabajo({ papel: "A4", paginas: [{ pagina: 1, girar: false, ajustar: false }, { pagina: 2, girar: true, ajustar: true }] }))
    .toEqual({ paginas: "1,2", girar: "0,1", papel: "A4" });
  expect(consultaTrabajo({ papel: "A5", paginas: [{ pagina: 2, girar: false, ajustar: false }] }))
    .toEqual({ paginas: "2", girar: "0", papel: "" });
});

test("los ajustes que manda el navegador se comprueban", () => {
  const k = claveTrabajo("AR2605333-10.pdf", "ot");
  const buena = { produccion: [{ pagina: 2, orientacion: "vertical" }], ot: [] };
  expect(
    leerAjustesImpresion({
      paginas: { "AR2605333-10.pdf": buena, "malo.pdf": { produccion: [{ pagina: 0, orientacion: "vertical" }], ot: [] }, "otro.pdf": { produccion: [] } },
      aMano: [k, 7, "x|impresora"],
    }),
  ).toEqual({ paginas: { "AR2605333-10.pdf": buena }, aMano: [k] });
  // Lo que mandaba el aviso de antes: lo de serie.
  expect(leerAjustesImpresion({ orientaciones: { "x|A5": "vertical" }, aMano: ["x|A5"] })).toEqual({ paginas: {}, aMano: [] });
  expect(leerAjustesImpresion(null)).toBeNull();
});
