import { describe, expect, it } from "vitest";
import { asuntoCorreo, cuerpoCorreo, cuerpoCorreoHtml, minutosATexto } from "../correo-planteamiento";

const D = {
  pedido: "AR.26.05023",
  cliente: "Bar Central",
  ofs: [
    { codigo: "0232963", descripcion: "TOLDO PUNTO RECTO", planteoMin: 70, autor: "Tamara", revisionMin: 10, revisor: "Ángel" },
    { codigo: "0232964", descripcion: "LONA FRONTAL PVC", planteoMin: 40, autor: "Tamara", revisionMin: 0, revisor: null },
  ],
  pasadoPor: "Iván Sánchez",
};

describe("correo del planteamiento", () => {
  it("asunto: «Planteamiento» si lleva adjuntos (PVC), «Impreso» si solo se imprimió (toldos)", () => {
    expect(asuntoCorreo(D, true)).toBe("Planteamiento AR.26.05023 · Bar Central");
    expect(asuntoCorreo(D, false)).toBe("Impreso AR.26.05023 · Bar Central");
    expect(asuntoCorreo({ ...D, cliente: "" }, true)).toBe("Planteamiento AR.26.05023");
  });

  it("una línea por OF con su descripción, tiempos, autor y revisor; lo impreso y lo adjunto", () => {
    expect(
      cuerpoCorreo(D, { adjuntos: ["AR2605023-10.pdf"], impresos: ["AR2605023-1.pdf"], aMano: [], dondeImprime: "Producción" }),
    ).toBe(
      [
        "PLANTEAMIENTO",
        "",
        "Pedido AR.26.05023 · Bar Central",
        "",
        "OF 0232963 · TOLDO PUNTO RECTO",
        "   Planteo 1 h 10 min (Tamara) · Revisión 10 min (Ángel)",
        "OF 0232964 · LONA FRONTAL PVC",
        "   Planteo 40 min (Tamara) · Sin revisión",
        "",
        "Impreso en Producción: AR2605023-1.pdf",
        "Adjunto: AR2605023-10.pdf",
        "Pasado a Producción por: Iván Sánchez",
        "",
        "Enviado automáticamente por CoordinaOT.",
      ].join("\n"),
    );
  });

  it("solo toldos: avisa de lo impreso y no habla de adjuntos", () => {
    const c = cuerpoCorreo(D, { adjuntos: [], impresos: ["AR2605023-1.pdf"], aMano: [], dondeImprime: "Producción" });
    expect(c).toContain("Impreso en Producción: AR2605023-1.pdf");
    expect(c).not.toContain("Adjunto");
    expect(c.split("\n").slice(0, 3)).toEqual(["IMPRESO", "", "Pedido AR.26.05023 · Bar Central"]);
  });

  it("varios adjuntos, en ensayo, y lo que hay que imprimir a mano", () => {
    const c = cuerpoCorreo(D, {
      adjuntos: ["A-10.pdf", "A-11.pdf"],
      impresos: ["A-1.pdf"],
      aMano: ["A-2.pdf"],
      dondeImprime: "la impresora de OT (prueba)",
    });
    expect(c).toContain("Impreso en la impresora de OT (prueba): A-1.pdf");
    expect(c).toContain("Para imprimir a mano (no es todo A4): A-2.pdf");
    expect(c).toContain("Adjuntos: A-10.pdf, A-11.pdf");
  });

  it("con la impresión apagada no dice «impreso»", () => {
    const c = cuerpoCorreo(D, { adjuntos: [], impresos: ["A-1.pdf"], aMano: [], dondeImprime: null });
    expect(c).toContain("Para imprimir: A-1.pdf");
    expect(c).not.toContain("Impreso");
  });

  it("OF sin tiempo ni autor, y revisión con tiempo pero sin revisor nombrado", () => {
    const c = cuerpoCorreo(
      { ...D, ofs: [{ codigo: "1", descripcion: "X", planteoMin: 0, autor: null, revisionMin: 5, revisor: null }] },
      { adjuntos: ["A-10.pdf"], impresos: [], aMano: [], dondeImprime: "Producción" },
    );
    expect(c).toContain("   Planteo sin fichar · Revisión 5 min");
  });

  it("minutos a texto", () => {
    expect(minutosATexto(25)).toBe("25 min");
    expect(minutosATexto(60)).toBe("1 h");
    expect(minutosATexto(85)).toBe("1 h 25 min");
  });
});

describe("versión HTML del correo", () => {
  const F = { adjuntos: ["AR2605023-10.pdf"], impresos: ["AR2605023-1.pdf"], aMano: [], dondeImprime: "Producción" };

  it("lleva lo mismo que el texto: título, pedido, cada OF con tiempos y quién lo pasó", () => {
    const h = cuerpoCorreoHtml(D, F);
    expect(h).toContain("PLANTEAMIENTO");
    expect(h).toContain("AR.26.05023");
    expect(h).toContain("Bar Central");
    expect(h).toContain("0232963");
    expect(h).toContain("TOLDO PUNTO RECTO");
    expect(h).toContain("Planteo 1 h 10 min (Tamara) · Revisión 10 min (Ángel)");
    expect(h).toContain("AR2605023-1.pdf");
    expect(h).toContain("Iván Sánchez");
  });

  it("IMPRESO cuando no lleva adjuntos", () => {
    const h = cuerpoCorreoHtml(D, { ...F, adjuntos: [] });
    expect(h).toContain("IMPRESO");
    expect(h).not.toContain("PLANTEAMIENTO");
  });

  it("escapa lo que viene de RPS: un cliente con «<» no rompe el correo", () => {
    const h = cuerpoCorreoHtml({ ...D, cliente: "A & B <Toldos>" }, F);
    expect(h).toContain("A &amp; B &lt;Toldos&gt;");
    expect(h).not.toContain("<Toldos>");
  });
});
