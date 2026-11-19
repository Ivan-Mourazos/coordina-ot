import { describe, expect, it } from "vitest";
import { asuntoVisita, COLORES_TECNICO, coloresPorTecnico, cuerpoVisita, cuerpoVisitaHtml, fraseVisita, notaVisita, mesesCalendario, type DatosVisita } from "../correo-visita";

const D: DatosVisita = {
  pedido: "AR.26.05448", cliente: "Belts Vigo", solicitada: "2026-11-26", prioridad: 3,
  ofs: [
    { codigo: "26/10234", descripcion: "Toldo cofre 5×3" },
    { codigo: "26/10235", descripcion: "Lona PVC frontal" },
  ],
  viene: "Juan Castro", cuando: { tipo: "dia", fecha: "2026-11-24" },
  motivo: "Confirmar medidas del cofre", atienden: ["Tamara", "Alberto"],
  noEstamos: [{ desde: "2026-11-18", hasta: "2026-11-20", quien: "Tamara" }],
  diasFuera: [
    { fecha: "2026-11-18", quien: ["Tamara"] }, { fecha: "2026-11-19", quien: ["Tamara", "Alberto"] },
    { fecha: "2026-11-20", quien: ["Tamara"] }, { fecha: "2026-12-03", quien: ["Alberto"] },
  ],
  pide: "Tamara", hoy: "2026-11-19",
};

describe("correo de visita", () => {
  it("frase sin fecha; el día va aparte", () => {
    expect(fraseVisita(D)).toBe("Se solicita visita de Juan Castro a Oficina Técnica con Tamara y Alberto.");
    expect(fraseVisita({ ...D, atienden: ["Tamara"] })).toBe("Se solicita visita de Juan Castro a Oficina Técnica con Tamara.");
    expect(cuerpoVisita(D)).toContain("Día pedido para la visita: mar 24/11 · Fecha de entrega del pedido: jue 26/11 · Prioridad 3");
    expect(cuerpoVisita({ ...D, cuando: { tipo: "sinPrisa" } })).not.toContain("Día pedido");
    // Con calendario, arriba solo la prioridad; sin él, las fechas en texto.
    expect(cuerpoVisitaHtml(D)).not.toContain("Día pedido para la visita");
    expect(cuerpoVisitaHtml(D)).toContain("Prioridad 3");
    expect(cuerpoVisitaHtml({ ...D, noEstamos: [], diasFuera: [] })).toContain("Fecha de entrega del pedido: jue 26/11");
  });
  it("asunto: solo Visita y el pedido", () => {
    expect(asuntoVisita(D)).toBe("Visita AR.26.05448");
    expect(asuntoVisita({ ...D, cuando: { tipo: "sinPrisa" } })).toBe("Visita AR.26.05448");
  });
  it("cuerpo en texto: pedido, OF, motivo, días y firma; nada de responder", () => {
    const t = cuerpoVisita(D);
    expect(t).toContain("AR.26.05448 · Belts Vigo");
    expect(t).toContain("Fecha de entrega del pedido: jue 26/11 · Prioridad 3");
    expect(t).toContain("26/10234 Toldo cofre 5×3");
    expect(t).toContain("Motivo: Confirmar medidas del cofre");
    expect(t).toContain("Esos días no estamos en OT, por favor no pongáis la visita:");
    expect(t).toContain("18/11 al 20/11 · Tamara");
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
  it("calendario: de este mes al de la entrega, ni uno más", () => {
    expect(mesesCalendario(D)).toEqual(["2026-11-01"]);
    expect(mesesCalendario({ ...D, solicitada: "2026-12-10" })).toEqual(["2026-11-01", "2026-12-01"]);
    expect(mesesCalendario({ ...D, solicitada: "2027-03-01" })).toEqual(["2026-11-01", "2026-12-01"]);
    // Sin entrega, hasta la última ausencia.
    expect(mesesCalendario({ ...D, solicitada: null, cuando: { tipo: "sinPrisa" } })).toEqual(["2026-11-01", "2026-12-01"]);
    // Entrega ya pasada: el mes en curso.
    expect(mesesCalendario({ ...D, solicitada: "2026-10-01", cuando: { tipo: "sinPrisa" } })).toEqual(["2026-11-01"]);
    expect(mesesCalendario({ ...D, solicitada: null, diasFuera: [], cuando: { tipo: "sinPrisa" } })).toEqual([]);
  });
  it("calendario: pasado en gris, ausencias tachadas del color de cada uno, entrega marcada", () => {
    const c = coloresPorTecnico(D);
    expect(c.get("Tamara")).toBe(COLORES_TECNICO[0]);
    expect(c.get("Alberto")).toBe(COLORES_TECNICO[1]);
    const h = cuerpoVisitaHtml(D);
    expect(h).toContain("Noviembre 2026");
    expect(h).not.toContain("Diciembre 2026");
    // 18/11 es pasado: sin ✕. 19/11 dos, 20/11 una; 3/12 fuera de vista. + 2 en la leyenda.
    expect(h.match(/>✕</g)?.length).toBe(3 + 2);
    expect(h).toContain("line-through");
    expect(h).toContain('bgcolor="#e4e4e7"');
    expect(h).toContain('bgcolor="#fee2e2"'); // 20/11, solo Tamara
    expect(h).toContain("2px solid #18181b"); // entrega
    expect(h).toContain("entrega del pedido");
    expect(h).toContain("visita pedida");
    expect(h).toContain("ya pasado");
  });
  it("sin ausencias no hay calendario", () => {
    expect(cuerpoVisitaHtml({ ...D, noEstamos: [], diasFuera: [] })).not.toContain("<table");
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
