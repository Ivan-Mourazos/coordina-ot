import { describe, expect, it } from "vitest";
import {
  CAUSAS,
  anulacionCompleta,
  codificarAnulacion,
  leerAnulacion,
  textoAnulacion,
} from "../anulacion";

// Anular decía que OT no la hace, pero no POR QUÉ, que es justo lo que hace
// falta al repasar las anuladas: no es lo mismo "la hace el taller" que "se
// cayó el pedido entero".

describe("guardar y volver a leer la causa", () => {
  it("va y vuelve sin perder nada", () => {
    for (const c of CAUSAS) {
      const a = c.pideNota ? { causa: c.id, nota: "lo pidió el cliente" } : { causa: c.id };
      expect(leerAnulacion(codificarAnulacion(a))).toEqual(a);
    }
  });

  it("la nota puede llevar dos puntos, que solo cuenta el primero", () => {
    const a = { causa: "otro" as const, nota: "aviso: lo retiran ellos" };
    expect(leerAnulacion(codificarAnulacion(a))).toEqual(a);
  });

  it("las anuladas de antes de que esto existiera no tienen causa, y se nota", () => {
    // Su `observacion` está vacía o lleva texto libre viejo: ni una ni otra
    // debe colar como causa.
    expect(leerAnulacion(null)).toBeNull();
    expect(leerAnulacion("")).toBeNull();
    expect(leerAnulacion("   ")).toBeNull();
    expect(leerAnulacion("la hace Pepe")).toBeNull();
  });

  it("y la nota de una devolución tampoco cuela", () => {
    // El campo lo comparten devolución y anulación; lo que las separa es el
    // estado de la OF, pero conviene que el texto tampoco encaje por azar.
    expect(leerAnulacion("Falta la cota del lateral, revisar plano")).toBeNull();
  });
});

describe("cómo se lee en el distintivo", () => {
  it("las causas fijas van con su palabra corta", () => {
    expect(textoAnulacion({ causa: "taller" })).toBe("Taller");
    expect(textoAnulacion({ causa: "proveedor" })).toBe("Proveedor");
    expect(textoAnulacion({ causa: "pedido" })).toBe("Pedido anulado");
  });

  it('"otro" enseña la nota, que sin ella no diría nada', () => {
    expect(textoAnulacion({ causa: "otro", nota: "duplicada" })).toBe("duplicada");
  });
});

describe("qué se puede confirmar", () => {
  it("las causas fijas se bastan solas", () => {
    expect(anulacionCompleta({ causa: "taller" })).toBe(true);
  });

  it('pero "otro" sin explicar no vale: sería el cajón de todo', () => {
    expect(anulacionCompleta({ causa: "otro" })).toBe(false);
    expect(anulacionCompleta({ causa: "otro", nota: "   " })).toBe(false);
    expect(anulacionCompleta({ causa: "otro", nota: "duplicada" })).toBe(true);
  });
});
