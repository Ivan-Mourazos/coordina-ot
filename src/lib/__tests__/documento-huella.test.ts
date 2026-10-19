import { expect, test } from "vitest";

// La dirección de un documento lleva su posición Y una huella del fichero
// (19/10/2026). Antes era solo la posición, y el navegador la guardaba un día:
// cuando RPS colgó una versión nueva del planteamiento de AR.26.04748 la lista
// se corrió un puesto, y pinchar en «version 1» abría el documento que antes
// estaba en ese sitio.

process.env.DATASOURCE = "mock";
const { aDocumentosDelCliente, elegirDocumento, huellaDocumento } = await import("../server/historial-db");

const R = "file://\\\\192.168.0.128\\RPS\\VENTAS\\";
const presupuesto = { descripcion: "Presupuesto", ruta: String.raw`${R}PRESUPUESTOS\2026\PT1.pdf` };
const v0 = { descripcion: "Planteamiento, version 0", ruta: String.raw`${R}PLANTEAMIENTOS\2026\AR.26.04748-10.pdf` };
const v1 = { descripcion: "Planteamiento, version 1", ruta: String.raw`${R}PLANTEAMIENTOS\2026\AR.26.04748-1.pdf` };

test("la URL lleva la posición y la huella del fichero", () => {
  const [doc] = aDocumentosDelCliente("AR.26.04748", [v1]);
  expect(doc.url).toBe(`/api/historial/AR.26.04748/documento/0-${huellaDocumento(v1.ruta)}`);
  expect(huellaDocumento(v1.ruta)).toMatch(/^[0-9a-f]{10}$/);
});

test("si la lista se corre, la huella encuentra el fichero que se pidió", () => {
  const antes = [v0, presupuesto];
  const clave = `1-${huellaDocumento(presupuesto.ruta)}`;
  // RPS cuelga la versión 1 delante: el presupuesto ya no está en el 1.
  const despues = [v0, v1, presupuesto];
  expect(elegirDocumento(antes, clave)).toBe(presupuesto);
  expect(elegirDocumento(despues, clave)).toBe(presupuesto);
});

test("una huella que ya no está no sirve el de esa posición", () => {
  expect(elegirDocumento([v0, v1], `1-${huellaDocumento(presupuesto.ruta)}`)).toBeNull();
});

test("las direcciones viejas, solo con el número, siguen valiendo", () => {
  expect(elegirDocumento([v0, v1], "1")).toBe(v1);
  expect(elegirDocumento([v0, v1], "7")).toBeNull();
});

test("lo que no es una clave no llega a buscar", () => {
  for (const mala of ["", "-1", "1-xyz", "1-ABCDEF0123", "1000", "1-0123456789a", "../1"]) {
    expect(elegirDocumento([v0, v1], mala)).toBeNull();
  }
});
