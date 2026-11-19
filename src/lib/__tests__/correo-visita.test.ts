import { describe, expect, it } from "vitest";
import { asuntoVisita, cuerpoVisita, cuerpoVisitaHtml, fraseVisita, notaVisita, type DatosVisita } from "../correo-visita";

const D: DatosVisita = {
  pedido: "AR.26.05448", cliente: "Belts Vigo", solicitada: "2026-11-26", prioridad: 3,
  ofs: [
    { codigo: "26/10234", descripcion: "Toldo cofre 5×3" },
    { codigo: "26/10235", descripcion: "Lona PVC frontal" },
  ],
  viene: "Juan Castro", cuando: { tipo: "dia", fecha: "2026-11-24" },
  motivo: "Confirmar medidas del cofre", atienden: ["Tamara", "Alberto"],
  noEstamos: [{ desde: "2026-12-02", hasta: "2026-12-05", quien: "Tamara" }], pide: "Tamara",
};

describe("correo de visita", () => {
  it("frase según cuándo", () => {
    expect(fraseVisita(D)).toBe("Visita de Juan Castro a Oficina Técnica con Tamara y Alberto el martes 24/11.");
    expect(fraseVisita({ ...D, cuando: { tipo: "pronto" } })).toBe("Visita de Juan Castro a Oficina Técnica con Tamara y Alberto lo antes posible.");
    expect(fraseVisita({ ...D, cuando: { tipo: "sinPrisa" } })).toBe("Visita de Juan Castro a Oficina Técnica con Tamara y Alberto.");
  });
  it("asunto", () => {
    expect(asuntoVisita(D)).toBe("Visita de Juan Castro a Oficina Técnica · mar 24/11 · AR.26.05448");
    expect(asuntoVisita({ ...D, cuando: { tipo: "pronto" } })).toBe("Visita de Juan Castro a Oficina Técnica · lo antes posible · AR.26.05448");
    expect(asuntoVisita({ ...D, cuando: { tipo: "sinPrisa" } })).toBe("Visita de Juan Castro a Oficina Técnica · AR.26.05448");
  });
  it("cuerpo en texto: pedido, OF, motivo, días y firma; nada de responder", () => {
    const t = cuerpoVisita(D);
    expect(t).toContain("AR.26.05448 · Belts Vigo");
    expect(t).toContain("Solicitada: jue 26/11 · Prioridad 3");
    expect(t).toContain("26/10234 Toldo cofre 5×3");
    expect(t).toContain("Motivo: Confirmar medidas del cofre");
    expect(t).toContain("Esos días no estamos en OT, por favor no pongáis la visita:");
    expect(t).toContain("2/12 al 5/12 · Tamara");
    expect(t).toContain("Pedido desde Coordina por Tamara.");
    expect(t.toLowerCase()).not.toContain("respond");
    expect(t.indexOf("26/10235")).toBeLessThan(t.indexOf("Motivo"));
  });
  it("sin días fuera no sale el bloque; sin motivo, tampoco", () => {
    const t = cuerpoVisita({ ...D, noEstamos: [], motivo: null });
    expect(t).not.toContain("no estamos");
    expect(t).not.toContain("Motivo");
  });
  it("HTML escapa lo que escribe la gente", () => {
    const h = cuerpoVisitaHtml({ ...D, motivo: "<b>ojo</b> & más" });
    expect(h).toContain("&lt;b&gt;ojo&lt;/b&gt; &amp; más");
    expect(h).toContain("<b>Juan Castro</b>");
  });
  it("nota del pedido", () => {
    expect(notaVisita(D)).toBe(
      "Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto, preferible mar 24/11. OF 26/10234, 26/10235. Motivo: Confirmar medidas del cofre",
    );
    expect(notaVisita({ ...D, cuando: { tipo: "pronto" }, motivo: null }))
      .toBe("Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto, lo antes posible. OF 26/10234, 26/10235.");
    expect(notaVisita({ ...D, cuando: { tipo: "sinPrisa" }, motivo: null }))
      .toBe("Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto. OF 26/10234, 26/10235.");
  });
});
