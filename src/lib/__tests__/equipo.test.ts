import { describe, expect, it } from "vitest";
import { partirEquipo } from "../equipo";

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
