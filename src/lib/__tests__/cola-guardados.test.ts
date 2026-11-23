import { describe, expect, it } from "vitest";
import { crearColaGuardados } from "../cola-guardados";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("crearColaGuardados", () => {
  it("manda en orden aunque el primero tarde más (fichar desde la bandeja)", async () => {
    const cola = crearColaGuardados();
    const llegadas: string[] = [];
    // «asignar» tarda más que «empezar_planteo»: sin cola llegaba el segundo
    // antes y el servidor se quedaba con la foto de «sin empezar».
    const a = cola.encolar(async () => { await esperar(20); llegadas.push("asignar"); });
    const b = cola.encolar(async () => { llegadas.push("empezar_planteo"); });
    await Promise.all([a, b]);
    expect(llegadas).toEqual(["asignar", "empezar_planteo"]);
  });

  it("un guardado que falla no bloquea al siguiente", async () => {
    const cola = crearColaGuardados();
    const fallo = cola.encolar(async () => { throw new Error("HTTP 500"); });
    await expect(fallo).rejects.toThrow("HTTP 500");
    await expect(cola.encolar(async () => "ok")).resolves.toBe("ok");
    expect(cola.enVuelo).toBe(0);
  });

  it("lleva la cuenta para que el sondeo descarte fotos tomadas mientras se guardaba", async () => {
    const cola = crearColaGuardados();
    const antes = cola.seq;
    const g = cola.encolar(() => esperar(5));
    expect(cola.enVuelo).toBe(1);
    await g;
    expect(cola.enVuelo).toBe(0);
    expect(cola.seq).not.toBe(antes);
  });
});
