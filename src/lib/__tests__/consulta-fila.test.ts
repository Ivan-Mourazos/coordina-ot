import { expect, test } from "vitest";
import { lineaTiempo, urgenciaRecorrido } from "../linea-tiempo";

// ─── La regla que no puede romperse en la pantalla del invitado ─────────────
// `PedidoPublico` (lib/publico.ts) no trae `fechaPlanificacion`: esa fecha la
// recalcula el planificador de RPS en bloque (613 filas de golpe, ver la
// memoria del proyecto) y fuera de Oficina Técnica no significa nada. Para
// quien no tiene sesión, el recorrido se mide contra la ENTREGA, con
// `planificacionEstimada: true` — la misma convención que ya usa
// `lineaTiempo` para los pedidos sin fecha de planteo.

/** Lo que la fila del invitado le pasa a la línea de tiempo. */
const recorridoPublico = (p: { fechaCreacion: string; fechaEntrega: string }) => ({
  fechaCreacion: p.fechaCreacion,
  fechaPlanificacion: p.fechaEntrega,
  planificacionEstimada: true,
  fechaEntrega: p.fechaEntrega,
});

test("el recorrido del invitado se mide contra la entrega", () => {
  const p = recorridoPublico({ fechaCreacion: "2026-09-01", fechaEntrega: "2026-09-20" });
  const linea = lineaTiempo(p, "2026-09-10");
  expect(linea.diasParaEntrega).toBe(10);
  const u = urgenciaRecorrido(linea, p as never, "2026-09-10");
  expect(u.sinPlanificar).toBe(true);
});

test("pasada la entrega, el recorrido lo dice", () => {
  const p = recorridoPublico({ fechaCreacion: "2026-08-01", fechaEntrega: "2026-09-01" });
  const linea = lineaTiempo(p, "2026-09-10");
  expect(linea.diasParaEntrega).toBeLessThan(0);
});
