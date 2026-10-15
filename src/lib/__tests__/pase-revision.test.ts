import { describe, expect, it, vi } from "vitest";
import { PEDIDOS } from "../mock";
import { motivoNoPasaRevision, prepararPaseRevision, solicitarPaseRevision } from "../pase-revision";
import type { OF, Pedido } from "../types";

const of = (id: string, extra: Partial<OF> = {}): OF => ({
  ...PEDIDOS[0].ofs[0], id, codigo: `OF-${id}`, autorId: "ivan", revisorId: null,
  estado: "en_curso", ajenaOT: false, detenida: false, cerradaRps: undefined, ...extra,
});
const pedido = (ofs: OF[]): Pedido => ({ ...PEDIDOS[0], ofs });

describe("pasar a revisión en una sola operación", () => {
  it("calcula estado y revisor finales sin modificar las OF originales", () => {
    const originales = [of("a"), of("b", { estado: "devuelta", revisorId: "tamara", observacion: "Corregir medida" })];
    const r = prepararPaseRevision([pedido(originales)], ["a", "b"], "jaime", "ivan");
    expect(r.cambiosOF).toEqual(originales.map((o) => expect.objectContaining({
      ofId: o.id, revisorId: "jaime", estado: "por_revisar", observacion: o.observacion ?? null,
    })));
    expect(r.previosOF.map((o) => o.estado)).toEqual(["en_curso", "devuelta"]);
    expect(originales.map((o) => o.revisorId)).toEqual([null, "tamara"]);
  });

  it.each([
    ["pendiente", { estado: "pendiente" as const }, "no se ha empezado"],
    ["otro autor", { autorId: "tamara" }, "quien la plantea"],
    ["cerrada", { cerradaRps: { at: "2026-10-15", por: "ivan", modo: "activo" as const } }, "terminada en RPS"],
  ])("rechaza el lote entero si hay una OF %s", (_caso, extra, motivo) => {
    const originales = [of("a"), of("b", extra)];
    expect(() => prepararPaseRevision([pedido(originales)], ["a", "b"], "jaime", "ivan"))
      .toThrow(new RegExp(`OF-b: .*${motivo}`));
    expect(originales.every((o) => o.revisorId === null)).toBe(true);
  });

  it("no silencia una OF desaparecida ni permite que el autor se revise", () => {
    expect(() => prepararPaseRevision([pedido([of("a")])], ["a", "desaparecida"], "jaime", "ivan"))
      .toThrow("desaparecida: ya no está");
    expect(() => prepararPaseRevision([pedido([of("a")])], ["a"], "ivan", "ivan"))
      .toThrow("el autor no puede revisarse");
  });

  it("explica las OF que se quedan atrás por reloj o planteo sin empezar", () => {
    const p = pedido([of("a"), of("b"), of("c", { estado: "pendiente" })]);
    const r = prepararPaseRevision([p], ["a"], "jaime", "ivan", new Set(["b"]));
    expect(r.pendientes).toEqual(["OF-b: para primero el reloj de esta OF", "OF-c: todavía no se ha empezado a plantear"]);
    expect(() => prepararPaseRevision([p], ["a", "b"], "jaime", "ivan", new Set(["b"])))
      .toThrow("OF-b: para primero el reloj");
    expect(motivoNoPasaRevision(p.ofs[0], "ivan", new Set())).toBeNull();
  });

  it("envía un único POST con la intención, sin instantáneas atrasadas", async () => {
    const resultado = prepararPaseRevision([pedido([of("a")])], ["a"], "jaime", "ivan");
    const enviar = vi.fn<typeof fetch>().mockResolvedValue(Response.json(resultado));
    expect(await solicitarPaseRevision(["a"], "jaime", "ivan", "ot", enviar)).toEqual(resultado);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(enviar.mock.calls[0][1]!.body as string)).toEqual({
      motivo: "terminar_planteo", operarioId: "ivan", seccion: "ot", pasarRevision: { ofIds: ["a"], revisorId: "jaime" },
    });
  });

  it.each([409, 500])("un error HTTP %s no devuelve un pase confirmado", async (status) => {
    const enviar = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "No se ha guardado ninguna OF" }, { status }));
    await expect(solicitarPaseRevision(["a"], "jaime", "ivan", "ot", enviar)).rejects.toThrow("No se ha guardado ninguna OF");
  });

  it("si falla la red no devuelve datos que la UI pueda aplicar", async () => {
    const enviar = vi.fn<typeof fetch>().mockRejectedValue(new Error("Sin conexión"));
    await expect(solicitarPaseRevision(["a"], "jaime", "ivan", "ot", enviar)).rejects.toThrow("No se ha podido conectar");
  });
});
