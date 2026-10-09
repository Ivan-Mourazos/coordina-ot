import { describe, expect, it } from "vitest";
import { bloquesDeCarga, partirEquipo } from "../equipo";

const op = (id: string) => ({ id, nombre: id });

describe("partirEquipo", () => {
  it("separa a quien no tiene nada de quien sí, en el orden del tablero", () => {
    const ocupados = new Set(["jaime", "adrian"]);
    const { conTrabajo, libres } = partirEquipo(
      [op("alberto"), op("jaime"), op("tamara"), op("adrian")],
      (id) => ocupados.has(id),
    );
    expect(conTrabajo.map((o) => o.id)).toEqual(["jaime", "adrian"]);
    expect(libres.map((o) => o.id)).toEqual(["alberto", "tamara"]);
  });

  it("con todos ocupados no hay libres", () => {
    const { conTrabajo, libres } = partirEquipo([op("a"), op("b")], () => true);
    expect(conTrabajo).toHaveLength(2);
    expect(libres).toEqual([]);
  });

  it("con nadie ocupado, todos van a libres y no queda ninguna tarjeta", () => {
    const { conTrabajo, libres } = partirEquipo([op("a"), op("b")], () => false);
    expect(conTrabajo).toEqual([]);
    expect(libres.map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("bloquesDeCarga", () => {
  const grupos = [
    { id: "devuelta", label: "A corregir", color: "#red", items: [{ id: "p1", atrasado: false }] },
    { id: "sinEmpezar", label: "Sin empezar", color: "#gris", items: [] },
    {
      id: "planteando",
      label: "Planteando",
      color: "#verde",
      items: [
        { id: "p2", atrasado: true },
        { id: "p3", atrasado: false },
      ],
    },
  ];

  it("un bloque por pedido: primero lo que revisa y luego las fases, como en la zona de arriba", () => {
    const b = bloquesDeCarga({
      revisiones: [{ id: "r1", atrasado: false }],
      grupos,
      vivo: null,
      colorRevisar: "#violeta",
    });
    expect(b.map((x) => [x.id, x.color])).toEqual([
      ["r1", "#violeta"],
      ["p1", "#red"],
      ["p2", "#verde"],
      ["p3", "#verde"],
    ]);
    expect(b.map((x) => x.fase)).toEqual(["Por revisar", "A corregir", "Planteando", "Planteando"]);
  });

  it("marca lo atrasado y el pedido que se está fichando", () => {
    const b = bloquesDeCarga({
      revisiones: [{ id: "r1", atrasado: true }],
      grupos,
      vivo: { id: "p3", revisando: false },
      colorRevisar: "#violeta",
    });
    expect(b.filter((x) => x.atrasado).map((x) => x.id)).toEqual(["r1", "p2"]);
    expect(b.filter((x) => x.vivo).map((x) => x.id)).toEqual(["p3"]);
  });

  it("si revisa un pedido que también plantea, el pulso va solo en el bloque del rol que ficha", () => {
    const revisando = bloquesDeCarga({
      revisiones: [{ id: "p1", atrasado: false }],
      grupos,
      vivo: { id: "p1", revisando: true },
      colorRevisar: "#violeta",
    });
    expect(revisando.filter((x) => x.vivo).map((x) => x.color)).toEqual(["#violeta"]);
    const planteando = bloquesDeCarga({
      revisiones: [{ id: "p1", atrasado: false }],
      grupos,
      vivo: { id: "p1", revisando: false },
      colorRevisar: "#violeta",
    });
    expect(planteando.filter((x) => x.vivo).map((x) => x.color)).toEqual(["#red"]);
  });

  it("sin nada, ningún bloque", () => {
    expect(bloquesDeCarga({ revisiones: [], grupos: [], vivo: null, colorRevisar: "#v" })).toEqual([]);
  });
});
