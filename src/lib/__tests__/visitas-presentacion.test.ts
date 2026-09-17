import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { VisitaCard, fmtAviso } from "../../components/VisitasCotView";
import type { VisitaCot } from "../visitas-cot";

const VISITA: VisitaCot = {
  idOrden: "5891234", incidencia: "INC.26.0412", pedido: "AR.26.03914",
  responsable: "JUAN JOSÉ PÉREZ", cliente: "MAHOU", fechaVisita: "2026-09-18",
  fechaAviso: "2026-09-04T11:32:00", motivo: "Medir el hueco del toldo",
  solucion: "Presupuestar", notas: "Llamar antes", estado: "pendiente",
  estadoRps: "PTE",
} as unknown as VisitaCot;

function pintar(v: Partial<VisitaCot> = {}) {
  return renderToStaticMarkup(
    createElement(VisitaCard, { visita: { ...VISITA, ...v } as VisitaCot }),
  );
}

test("el id de la orden y el estado crudo de RPS no se enseñan: no dicen nada", () => {
  const html = pintar();
  expect(html).not.toContain("5891234");
  expect(html).not.toContain("Estado RPS");
  expect(html).not.toContain("PTE");
});

test("lo que sí sirve para encontrar la visita en RPS se queda", () => {
  const html = pintar();
  expect(html).toContain("INC.26.0412");
  expect(html).toContain("AR.26.03914");
  expect(html).toContain("Presupuestar");
});

test("la visita se abre con la misma animación que el resto de la web", () => {
  const html = pintar();
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("Llamar antes");
});

test("una visita sin motivo lo dice como se diría hablando", () => {
  expect(pintar({ motivo: "" })).toContain("Sin motivo escrito");
});

test("sin código de incidencia no se escribe un hueco que rellenar", () => {
  const html = pintar({ incidencia: "" });
  expect(html).not.toContain("Sin código");
});

test("la fecha del aviso se lee, no se descifra", () => {
  expect(fmtAviso("2026-09-04T11:32:00")).toBe("Avisado el 4 sep, 11:32");
  expect(fmtAviso(null)).toBe("Sin fecha de aviso");
});
