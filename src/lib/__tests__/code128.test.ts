import { describe, expect, test } from "vitest";
import { anchosCode128, PARADA, PATRONES, simbolos } from "../informes-rps/code128";

/** Lee los anchos como lo haría un lector y devuelve el texto. Usa la tabla,
 *  así que lo que prueba de verdad son las reglas de codificación; la tabla se
 *  comprueba aparte por sus propiedades. */
function leer(anchos: number[]): string {
  const sim: number[] = [];
  for (let i = 0; i + 6 <= anchos.length - 7; i += 6) sim.push(PATRONES.indexOf(anchos.slice(i, i + 6).join("")));
  expect(anchos.slice(-7).join("")).toBe(PARADA);
  const [inicio, ...resto] = sim;
  const control = resto.pop()!;
  expect([inicio, ...resto].reduce((a, v, i) => a + v * (i === 0 ? 1 : i), 0) % 103).toBe(control);
  let modo = inicio === 105 ? "C" : "B";
  let texto = "";
  for (const v of resto) {
    if (modo === "C" && v === 100) modo = "B";
    else if (modo === "B" && v === 99) modo = "C";
    else texto += modo === "C" ? String(v).padStart(2, "0") : String.fromCharCode(v + 32);
  }
  return texto;
}

describe("tabla Code128", () => {
  test("106 símbolos y la parada, cada uno de 11 módulos, barras pares y sin repetirse", () => {
    expect(PATRONES).toHaveLength(106); // 0-102 + tres inicios; la parada va aparte
    for (const p of PATRONES) {
      const n = [...p].map(Number);
      expect(n.reduce((a, b) => a + b, 0)).toBe(11);
      expect((n[0] + n[2] + n[4]) % 2).toBe(0);
    }
    expect(new Set(PATRONES).size).toBe(PATRONES.length);
    expect([...PARADA].map(Number).reduce((a, b) => a + b, 0)).toBe(13);
  });
});

describe("codificar lo que imprime RPS", () => {
  test.each(["0233881", "0233881-02", "0233881-1", "1324091976", "ACRILI2979P120", "AR.26.05479", "0", "A1234B", "12345"])("%s se lee igual", (t) => {
    expect(leer(anchosCode128(t))).toBe(t);
  });

  test("las cifras van en parejas (código C) y el guion en B", () => {
    // 0233881-02: «0» en B, «233881» en C, «-02» en B.
    expect(simbolos("0233881-02")).toEqual([104, 16, 99, 23, 38, 81, 100, 13, 16, 18]);
  });

  test("rechaza lo que no cabe en Code128", () => {
    expect(() => anchosCode128("año")).toThrow();
  });
});
