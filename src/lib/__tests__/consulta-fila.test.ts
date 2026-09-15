import { expect, test } from "vitest";
import { lineaTiempo, urgenciaRecorrido } from "../linea-tiempo";
import { recorridoPublico } from "../publico";

// ─── La regla que no puede romperse en la pantalla del invitado ─────────────
// `PedidoPublico` (lib/publico.ts) no trae `fechaPlanificacion`: esa fecha la
// recalcula el planificador de RPS en bloque (613 filas de golpe, ver la
// memoria del proyecto) y fuera de Oficina Técnica no significa nada. Para
// quien no tiene sesión, el recorrido se mide contra la ENTREGA, con
// `planificacionEstimada: true` — la misma convención que ya usa
// `lineaTiempo` para los pedidos sin fecha de planteo.
//
// Se prueba contra `recorridoPublico`, el que de VERDAD usan la fila (el
// aviso de vencido) y la línea de tiempo (`LineaTiempoPublica`,
// ConsultaPendientes.tsx): antes este test montaba su propia copia del
// truco, que podía quedar bien escrita aquí y mal en el componente sin que
// nada lo avisara.

test("el recorrido del invitado se mide contra la entrega", () => {
  const p = recorridoPublico({ fechaPedido: "2026-09-01", fechaEntrega: "2026-09-20" });
  const linea = lineaTiempo(p, "2026-09-10");
  expect(linea.diasParaEntrega).toBe(10);
  const u = urgenciaRecorrido(linea, p, "2026-09-10");
  expect(u.sinPlanificar).toBe(true);
});

test("pasada la entrega, el recorrido lo dice", () => {
  const p = recorridoPublico({ fechaPedido: "2026-08-01", fechaEntrega: "2026-09-01" });
  const linea = lineaTiempo(p, "2026-09-10");
  expect(linea.diasParaEntrega).toBeLessThan(0);
});

test("sin fecha de entrada, el recorrido igual mide contra la entrega (solo se omite el hito de llegada)", () => {
  // La fila calcula "vencido" aunque el pedido no tenga fechaPedido (ver
  // FilaPublica, ConsultaPendientes.tsx): `fechaPedido` es opcional aquí a
  // propósito, y sin ella `lineaTiempo` no revienta, solo dibuja un hito
  // menos.
  const p = recorridoPublico({ fechaEntrega: "2026-09-01" });
  expect(p).not.toHaveProperty("fechaCreacion");
  const linea = lineaTiempo(p, "2026-09-10");
  expect(linea.diasParaEntrega).toBeLessThan(0);
});
