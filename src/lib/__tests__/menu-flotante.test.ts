import { describe, expect, it } from "vitest";
import { MARGEN, sitioDeMenu } from "../menu-flotante";

const ventana = { ancho: 1200, alto: 800 };
const caja = (p: Partial<{ left: number; right: number; top: number; bottom: number; width: number }> = {}) => ({
  left: 500,
  right: 620,
  top: 300,
  bottom: 330,
  width: 120,
  ...p,
});

describe("sitioDeMenu", () => {
  it("cuelga del botón cuando hay sitio debajo", () => {
    expect(sitioDeMenu(caja(), { ventana, alto: 260 })).toMatchObject({ top: 334, left: 500 });
  });

  it("abre hacia arriba si abajo no cabe", () => {
    // Botón pegado al borde inferior: colgando hacia abajo, medio menú se
    // quedaba fuera de la pantalla.
    const s = sitioDeMenu(caja({ top: 700, bottom: 730 }), { ventana, alto: 260 });
    expect(s.top).toBeUndefined();
    expect(s.bottom).toBe(800 - 700 + 4);
  });

  it("no se sale por la izquierda", () => {
    expect(sitioDeMenu(caja({ left: -40, right: 80 }), { ventana, alto: 260 }).left).toBe(MARGEN);
  });

  it("anclado a la derecha, tampoco se sale por ninguno de los dos lados", () => {
    // Este es el caso de la bandeja de "Sin asignar": el botón está pegado al
    // borde IZQUIERDO, y anclar solo por la derecha mandaba el menú fuera de la
    // pantalla por ese otro lado.
    const pegadoAlBorde = sitioDeMenu(caja({ left: 4, right: 60 }), {
      ventana,
      alto: 260,
      alignRight: true,
    });
    expect(pegadoAlBorde.right).toBeLessThanOrEqual(ventana.ancho - MARGEN);

    const fueraPorLaDerecha = sitioDeMenu(caja({ left: 1150, right: 1260 }), {
      ventana,
      alto: 260,
      alignRight: true,
    });
    expect(fueraPorLaDerecha.right).toBe(MARGEN);
  });

  it("con el ancho sabido, se sujeta por los DOS lados", () => {
    // El fallo real del menú "Asignar" (176 px fijos): pegado al borde
    // izquierdo y anclado por la derecha, su borde izquierdo caía en negativo y
    // media lista de nombres quedaba fuera de la pantalla. Limitar el `right`
    // no lo arregla, porque `right` no sabe cuánto mide el menú.
    const pegadoIzquierda = sitioDeMenu(caja({ left: 20, right: 76 }), {
      ventana,
      alto: 260,
      alignRight: true,
      ancho: 176,
    });
    expect(pegadoIzquierda.left).toBe(MARGEN);
    expect(pegadoIzquierda.right).toBeUndefined();

    const pegadoDerecha = sitioDeMenu(caja({ left: 1150, right: 1195 }), {
      ventana,
      alto: 260,
      alignRight: true,
      ancho: 176,
    });
    expect(pegadoDerecha.left! + 176).toBeLessThanOrEqual(ventana.ancho - MARGEN);
  });

  it("y en una ventana más estrecha que el propio menú, no se va por la izquierda", () => {
    const s = sitioDeMenu(caja(), { ventana: { ancho: 150, alto: 800 }, alto: 260, ancho: 176 });
    expect(s.left).toBe(MARGEN);
  });

  it("nunca es más ancho que la ventana", () => {
    const s = sitioDeMenu(caja(), { ventana: { ancho: 320, alto: 800 }, alto: 260 });
    expect(s.maxWidth).toBe(320 - 2 * MARGEN);
  });
});
