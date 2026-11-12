import { describe, expect, test } from "vitest";
import { avisosPendientes, leerMarca, marcarVistas } from "../avisos-belen";
import type { NotaPedido } from "../nota-pedido";

const nota = (id: number, pedido: string, creadoAt: string, extra: Partial<NotaPedido> = {}): NotaPedido =>
  ({ id, pedido, operarioId: "ot1", texto: `nota ${id}`, creadoAt, editadoAt: null, publica: true, autor: "OT", ...extra }) as NotaPedido;

const NOTAS = [
  nota(1, "AR.1", "2026-11-10T08:00:00Z"),
  nota(2, "AR.1", "2026-11-12T09:00:00Z"),
  nota(3, "AR.2", "2026-11-12T10:00:00Z"),
  nota(4, "AR.1", "2026-11-12T11:00:00Z"),
  nota(5, "AR.3", "2026-11-12T12:00:00Z", { publica: false }),
  nota(6, "AR.3", "2026-11-12T12:30:00Z", { operarioId: "belen" }),
];

describe("marca de la campana", () => {
  test("la primera vez empieza ahora: no salen las de antes", () => {
    const m = leerMarca(null, "2026-11-12T12:00:00Z");
    expect(m).toEqual({ desde: "2026-11-12T12:00:00Z", vistas: [] });
    expect(avisosPendientes(NOTAS, m, "belen")).toEqual([]);
  });
  test("la lista vieja de ids no vale: también empieza ahora", () => {
    expect(leerMarca("[1,2,3]", "2026-11-12T12:00:00Z").desde).toBe("2026-11-12T12:00:00Z");
    expect(leerMarca("roto{", "X").desde).toBe("X");
  });
  test("se lee la marca guardada", () => {
    expect(leerMarca(JSON.stringify({ desde: "2026-11-11T00:00:00Z", vistas: [2, "x"] }), "X")).toEqual({ desde: "2026-11-11T00:00:00Z", vistas: [2] });
  });
});

describe("avisos por pedido", () => {
  const marca = { desde: "2026-11-11T00:00:00Z", vistas: [] };
  test("un aviso por pedido, el más reciente arriba; sin internas ni las suyas", () => {
    const a = avisosPendientes(NOTAS, marca, "belen");
    expect(a.map((x) => [x.pedido, x.notas.map((n) => n.id)])).toEqual([
      ["AR.1", [4, 2]],
      ["AR.2", [3]],
    ]);
  });
  test("abrir un pedido da por vistas sus notas", () => {
    const m = marcarVistas(marca, [4, 2], NOTAS);
    expect(avisosPendientes(NOTAS, m, "belen").map((x) => x.pedido)).toEqual(["AR.2"]);
  });
  test("las vistas que ya no llegan se olvidan", () => {
    expect(marcarVistas({ desde: marca.desde, vistas: [99] }, [3], NOTAS).vistas).toEqual([3]);
  });
});
