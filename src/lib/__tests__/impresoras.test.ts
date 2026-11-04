import { expect, test } from "vitest";
import { avisosDe, estadoImpresora, estadoTrabajo, papelLegible, tonerBajo } from "../impresoras";
import { leerGrupos, trabajosDe } from "../server/impresoras";

/** Una respuesta de IPP de mentira: grupos de atributos [tag, nombre, valor]. */
function respuesta(grupos: Array<[number, Array<[number, string, string | number]>]>): Uint8Array {
  const enc = new TextEncoder();
  const b: number[] = [0x02, 0x00, 0x00, 0x00, 0, 0, 0, 1];
  for (const [tagGrupo, atributos] of grupos) {
    b.push(tagGrupo);
    for (const [tag, nombre, valor] of atributos) {
      const n = enc.encode(nombre);
      const v = typeof valor === "number"
        ? [(valor >> 24) & 255, (valor >> 16) & 255, (valor >> 8) & 255, valor & 255]
        : [...enc.encode(valor)];
      b.push(tag, n.length >> 8, n.length & 255, ...n, v.length >> 8, v.length & 255, ...v);
    }
  }
  b.push(0x03);
  return new Uint8Array(b);
}

test("lee los trabajos de una respuesta de Get-Jobs, uno por grupo", () => {
  const bytes = respuesta([
    [0x01, [[0x47, "attributes-charset", "utf-8"]]],
    [0x02, [[0x21, "job-id", 42238], [0x42, "job-name", "Planteamiento AR.26.05367"], [0x23, "job-state", 9], [0x42, "job-originating-user-name", "Coordina"]]],
    [0x02, [[0x21, "job-id", 42240], [0x42, "job-name", "Planteamiento AR.26.05358"], [0x23, "job-state", 3]]],
  ]);
  const { estado, grupos } = leerGrupos(bytes);
  expect(estado).toBe(0);
  expect(trabajosDe(grupos)).toEqual([
    { id: 42238, nombre: "Planteamiento AR.26.05367", usuario: "Coordina", estado: "impreso", creado: null },
    { id: 42240, nombre: "Planteamiento AR.26.05358", usuario: null, estado: "en_cola", creado: null },
  ]);
});

test("los valores sin nombre son más valores del atributo de antes", () => {
  const bytes = respuesta([[0x04, [[0x44, "media-ready", "iso_a4_210x297mm"], [0x44, "", "iso_a5_148x210mm"]]]]);
  expect(leerGrupos(bytes).grupos[0].atributos["media-ready"]).toEqual(["iso_a4_210x297mm", "iso_a5_148x210mm"]);
});

test("una respuesta cortada no rompe la lectura", () => {
  const bytes = respuesta([[0x02, [[0x21, "job-id", 1]]]]);
  expect(() => leerGrupos(bytes.slice(0, bytes.length - 6))).not.toThrow();
});

test("traduce estados, avisos y papeles", () => {
  expect(estadoImpresora(3)).toBe("libre");
  expect(estadoImpresora(5)).toBe("parada");
  expect(estadoImpresora(null)).toBe("sin_respuesta");
  expect(estadoTrabajo(8)).toBe("abortado");
  expect(avisosDe(["none"])).toEqual([]);
  expect(avisosDe(["media-empty-error", "media-empty-warning", "media-jam-error"])).toEqual(["Sin papel", "Atasco de papel"]);
  // Lo que dicen las Konica con todo bien: ni «other» ni el tóner por aquí.
  expect(avisosDe(["other-report", "media-low-warning", "toner-empty-warning", "toner-low-warning"])).toEqual(["Queda poco papel"]);
  expect(tonerBajo(["Toner Cartridge (C)", "Toner Cartridge (K)", "Waste Toner Box"], [51, 12, 0], ["toner", "toner", "waste-toner"])).toEqual(["Negro 12 %"]);
  expect(papelLegible("iso_a5_148x210mm")).toBe("A5");
  expect(papelLegible("na_letter_8.5x11in")).toBe("na_letter_8.5x11in");
});
