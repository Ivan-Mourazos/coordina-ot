import { describe, expect, it } from "vitest";
import {
  causasParecidas,
  claveDeCausa,
  codificarDevolucion,
  devolucionCompleta,
  etiquetaValida,
  leerDevolucion,
} from "../devolucion";

describe("ida y vuelta por `observacion`", () => {
  it("guarda las causas delante y la nota detrás", () => {
    const codificada = codificarDevolucion({
      causas: [2, 1],
      nota: "Pusiste mal la cota del primer ollao y el largo 2 cm de más.",
    });
    // Ordenadas, para que la misma devolución se escriba siempre igual y dos
    // registros iguales no se lean como distintos.
    expect(codificada).toBe(
      "[1,2] Pusiste mal la cota del primer ollao y el largo 2 cm de más.",
    );
    expect(leerDevolucion(codificada)).toEqual({
      causas: [1, 2],
      nota: "Pusiste mal la cota del primer ollao y el largo 2 cm de más.",
    });
  });

  it("sin causas guarda solo la nota, sin marca que estorbe", () => {
    expect(codificarDevolucion({ causas: [], nota: "Faltan las medidas" })).toBe(
      "Faltan las medidas",
    );
  });

  it("una devolución de las de ANTES se lee entera, como nota", () => {
    // Las anteriores a esto son texto libre. No son datos corruptos: su nota
    // sigue valiendo, y lo que no se sabe es de qué tipo fue el fallo.
    expect(leerDevolucion("Faltan las medidas de anclaje de la nave")).toEqual({
      causas: [],
      nota: "Faltan las medidas de anclaje de la nave",
    });
  });

  it("una nota con dos puntos no se confunde con causas", () => {
    // El formato de `anulacion.ts` es `causa: texto`, y ahí vale porque las
    // causas son un conjunto conocido. Aquí la lista crece, así que la marca
    // son números entre corchetes: una frase normal no puede parecerse.
    expect(leerDevolucion("cotas: mira las del ollao")).toEqual({
      causas: [],
      nota: "cotas: mira las del ollao",
    });
  });

  it("sin nota no hay devolución, aunque se marquen causas", () => {
    // Una causa sola no le dice al autor dónde mirar.
    expect(devolucionCompleta({ causas: [1, 2], nota: "   " })).toBe(false);
    expect(devolucionCompleta({ causas: [], nota: "el largo" })).toBe(true);
  });
});

describe("no crear dos veces la misma causa", () => {
  it("mayúsculas, acentos y espacios de más son la misma causa", () => {
    const esperado = claveDeCausa("Error en cotas");
    expect(claveDeCausa("  ERROR   EN  COTAS ")).toBe(esperado);
    expect(claveDeCausa("Error en cótas")).toBe(claveDeCausa("Error en cotas"));
  });

  it("propone las parecidas antes de dejar crear una nueva", () => {
    const existentes = [
      { etiqueta: "Error en cotas" },
      { etiqueta: "Error en medidas" },
      { etiqueta: "Material equivocado" },
    ];
    // Se escribe de memoria y sale distinto; la de verdad tiene que aparecer.
    expect(causasParecidas("cotas", existentes)).toEqual([{ etiqueta: "Error en cotas" }]);
    // Y al revés: lo escrito contiene a la que ya está.
    expect(causasParecidas("error en cotas del ollao", existentes)).toEqual([
      { etiqueta: "Error en cotas" },
    ]);
    // Sin parecido, vía libre para crearla.
    expect(causasParecidas("color", existentes)).toEqual([]);
  });

  it("con dos letras no propone nada: engancharía media lista", () => {
    expect(causasParecidas("er", [{ etiqueta: "Error en cotas" }])).toEqual([]);
  });
});

describe("qué etiqueta vale", () => {
  it("ni vacía, ni de una letra, ni un párrafo", () => {
    expect(etiquetaValida("  ")).toBe(false);
    expect(etiquetaValida("ok")).toBe(false);
    expect(etiquetaValida("Error en cotas")).toBe(true);
    // Lo que necesita más letras que esto es una nota, no una causa: tiene que
    // caber en el distintivo sin partirlo.
    expect(etiquetaValida("x".repeat(41))).toBe(false);
  });
});
