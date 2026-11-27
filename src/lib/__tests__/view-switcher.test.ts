import { describe, expect, it } from "vitest";
import { cuantasPestanasCaben } from "@/components/ViewSwitcher";

describe("reparto de pestañas de la cabecera", () => {
  const anchos = [60, 90, 90, 60, 100, 80];
  const mas = [0, 0, 0, 65, 65, 65];

  it("mantiene todas en la tira si caben al píxel", () => {
    expect(cuantasPestanasCaben(480, anchos, mas, 3)).toBe(6);
  });

  it("cede pestañas desde el final y reserva sitio para Más", () => {
    expect(cuantasPestanasCaben(465, anchos, mas, 3)).toBe(5);
    expect(cuantasPestanasCaben(464, anchos, mas, 3)).toBe(4);
  });

  it("tiene en cuenta el ancho que añaden el nombre activo y los contadores", () => {
    expect(cuantasPestanasCaben(465, anchos, [0, 0, 0, 90, 90, 90], 3)).toBe(4);
  });

  it("conserva las pestañas prioritarias de cada sección", () => {
    expect(cuantasPestanasCaben(305, anchos, mas, 3)).toBe(3);
    expect(cuantasPestanasCaben(215, [60, 90, 60, 100], [0, 0, 65, 65], 2)).toBe(2);
  });
});
