import { describe, expect, test } from "vitest";
import { nombreDocumento, ordenarDocumentos } from "../documentos-belen";
import type { DocumentoRps } from "../historial";

const doc = (clase: string, descripcion: string, archivo: string, url: string | null = `/d/${archivo}`): DocumentoRps => ({ clase, descripcion, archivo, url });

// Los documentos reales de AR.26.05385 (11/11/2026), en el orden en que los da RPS.
const PEDIDO: DocumentoRps[] = [
  doc("Presupuesto", "PDF adjunto oferta PT26002352-1, versión 1", "PT26002352-1.pdf"),
  doc("Pedido escaneado", "PDF adjunto pedido AR.26.05385", "AR.26.05385.pdf"),
  doc("Presupuesto", "PDF adjunto oferta PT26002352-4, versión 4", "PT26002352-4.pdf"),
  doc("Planteamiento", "Planteamiento del pedido AR.26.05385, version 1", "AR.26.05385-1.pdf"),
  doc("Planteamiento", "Planteamiento del pedido ar.26.05385, version -", "ar.26.05385-.pdf"),
  doc("Mantenimiento (SAT)", "Foto 2 orden mantenimiento OM0252579", "OM0252579_S8_2.jpg"),
  doc("Mantenimiento (SAT)", "Foto 1 orden mantenimiento OM0249861", "OM0249861_S8_1.jpg"),
  doc("Mantenimiento (SAT)", "Foto 1 orden mantenimiento OM0252579", "OM0252579_S8_1.jpg"),
  doc("Documento", "Document adjunto", "x", null),
];

describe("nombres legibles", () => {
  test.each([
    ["Planteamiento", "Planteamiento del pedido AR.26.05385, version 2", "Versión 2"],
    ["Planteamiento", "Planteamiento del pedido ar.26.05385, version -", "Sin número de versión"],
    ["Presupuesto", "PDF adjunto oferta PT26002352-4, versión 4", "PT26002352 · versión 4"],
    ["Mantenimiento (SAT)", "Foto 3 orden mantenimiento OM0252579", "Foto 3 · OM0252579"],
    ["Pedido escaneado", "PDF adjunto pedido AR.26.05385", "Pedido escaneado"],
    ["Adjunto de la OF", "Adjunto OF 0231158", "Adjunto OF 0231158"],
  ])("%s: «%s» → «%s»", (clase, descripcion, esperado) => {
    expect(nombreDocumento({ clase, descripcion, archivo: "f.pdf" })).toBe(esperado);
  });
  test("sin descripción, el nombre del fichero", () => {
    expect(nombreDocumento({ clase: "Documento", descripcion: "", archivo: "plano.dwg" })).toBe("plano.dwg");
  });
});

describe("orden y destacados", () => {
  const r = ordenarDocumentos(PEDIDO);
  test("grupos de taller primero y versión más alta arriba", () => {
    expect(r.grupos.map((g) => g.grupo)).toEqual(["Planteamiento", "Pedido escaneado", "Presupuesto", "Fotos"]);
    expect(r.grupos[0].documentos.map((d) => d.nombre)).toEqual(["Versión 1", "Sin número de versión"]);
    expect(r.grupos[2].documentos.map((d) => d.version)).toEqual([4, 1]);
  });
  test("las fotos del SAT, juntas por orden de mantenimiento y por número", () => {
    expect(r.grupos[3].documentos.map((d) => d.nombre)).toEqual(["Foto 1 · OM0249861", "Foto 1 · OM0252579", "Foto 2 · OM0252579"]);
  });
  test("destacados: último planteamiento, pedido escaneado y último presupuesto", () => {
    expect(r.destacados.map((d) => [d.titulo, d.doc.nombre])).toEqual([
      ["Planteamiento", "Versión 1"],
      ["Pedido escaneado", "Pedido escaneado"],
      ["Presupuesto", "PT26002352 · versión 4"],
    ]);
  });
  test("lo que no tiene fichero se cuenta aparte", () => {
    expect(r.sinFichero).toBe(1);
  });
});
