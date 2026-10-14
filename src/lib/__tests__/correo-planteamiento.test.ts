import { describe, expect, it } from "vitest";
import { asuntoCorreo, cuerpoCorreo, minutosATexto } from "../correo-planteamiento";

const D = {
  pedido: "AR.26.05016",
  cliente: "Bar Central",
  ofs: ["0232968", "0232969"],
  entrega: "2026-10-24",
  minutosPlanteo: 85,
  pasadoPor: "Iván Sánchez",
};

describe("correo del planteamiento", () => {
  it("asunto con pedido y cliente", () => {
    expect(asuntoCorreo(D)).toBe("Planteamiento AR.26.05016 · Bar Central");
    expect(asuntoCorreo({ ...D, cliente: "" })).toBe("Planteamiento AR.26.05016");
  });

  it("cuerpo con los datos del pedido", () => {
    expect(cuerpoCorreo(D, ["AR2605016-10.pdf"])).toBe(
      [
        "Planteamiento del pedido AR.26.05016",
        "",
        "Cliente: Bar Central",
        "OF: 0232968, 0232969",
        "Entrega solicitada: 24/10/2026",
        "Tiempo de planteo: 1 h 25 min",
        "Pasado a Producción por: Iván Sánchez",
        "",
        "Adjunto: AR2605016-10.pdf",
        "",
        "Enviado automáticamente por CoordinaOT.",
      ].join("\n"),
    );
  });

  it("sin entrega ni tiempo, no inventa nada", () => {
    const c = cuerpoCorreo({ ...D, entrega: null, minutosPlanteo: 0 }, ["a.pdf", "b.pdf"]);
    expect(c).not.toContain("Entrega solicitada");
    expect(c).not.toContain("Tiempo de planteo");
    expect(c).toContain("Adjuntos: a.pdf, b.pdf");
  });

  it("minutos a texto", () => {
    expect(minutosATexto(25)).toBe("25 min");
    expect(minutosATexto(60)).toBe("1 h");
    expect(minutosATexto(85)).toBe("1 h 25 min");
  });
});
