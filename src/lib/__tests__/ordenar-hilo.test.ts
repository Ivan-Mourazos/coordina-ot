import { expect, test } from "vitest";
import { ordenarHilo, type NotaPedido } from "../nota-pedido";

const nota = (id: number, padreId: number | null, extra: Partial<NotaPedido> = {}): NotaPedido => ({
  id,
  pedido: "AR.1",
  operarioId: "ivan",
  texto: `n${id}`,
  creadoAt: "2026-11-16T09:00:00.000Z",
  editadoAt: null,
  para: [],
  enConsultaPublica: false,
  menciones: [],
  padreId,
  ...extra,
});

const nada = () => undefined;

test("cada nota seguida de sus respuestas, en profundidad y sin tope de nivel", () => {
  const notas = [nota(1, null), nota(2, null), nota(3, 1), nota(4, 3), nota(5, 4), nota(6, 5), nota(7, 1)];
  expect(ordenarHilo(notas, nada).map((f) => [f.nota.id, f.nivel, f.raizId])).toEqual([
    [1, 0, 1],
    [3, 1, 1],
    [4, 2, 1],
    [5, 3, 1],
    [6, 4, 1],
    [7, 1, 1],
    [2, 0, 2],
  ]);
  expect(ordenarHilo(notas, nada)[0].respuestas).toBe(5);
});

test("las resueltas salen plegadas salvo que se abran a mano; las borradas no cuentan", () => {
  const notas = [nota(1, null, { resueltaAt: "x" }), nota(2, 1), nota(3, 1, { borrada: true }), nota(4, 3)];
  const plegada = ordenarHilo(notas, nada);
  expect(plegada.map((f) => f.nota.id)).toEqual([1]);
  expect(plegada[0]).toMatchObject({ plegada: true, respuestas: 2 });
  expect(ordenarHilo(notas, () => false).map((f) => f.nota.id)).toEqual([1, 2, 3, 4]);
  // Y una abierta se puede plegar.
  expect(ordenarHilo([nota(1, null), nota(2, 1)], () => true).map((f) => f.nota.id)).toEqual([1]);
});

test("una respuesta cuyo padre no llegó sale como raíz, no se pierde", () => {
  expect(ordenarHilo([nota(5, 99)], nada).map((f) => [f.nota.id, f.nivel])).toEqual([[5, 0]]);
});
