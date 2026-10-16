import { describe, expect, test } from "vitest";
import { codificarDevolucion, leerDevolucion, notaDeLaGuia, partirNota } from "../devolucion";
import { fallosDeLaGuia, type PuntoGuia } from "../guia-revision";
import { resumirOf } from "../integracion";

// 16/10/2026, con Iván y un compañero: se marcaba el fallo en la guía, se
// volvía a elegir la causa al devolver y se escribía la nota de memoria. Ahora
// todo sale de la guía, y los pasos que fallaron quedan en la devolución.
describe("la devolución que sale de la guía", () => {
  const puntos: PuntoGuia[] = [
    { id: 4, mira: "Medidas de la lona hecha", causaId: 1, etiqueta: "Medidas", familia: null },
    { id: 5, mira: "Tipo de lona", causaId: 3, etiqueta: "Material", familia: null },
    { id: 7, mira: "Las cotas del croquis", causaId: 1, etiqueta: "Medidas", familia: null },
  ];

  test("lo que falla, con su causa y lo que se escribió en el paso", () => {
    const f = fallosDeLaGuia(puntos, { 4: "falla", 5: "bien", 7: "falla" }, { 4: "2 cm de más" });
    expect(f).toEqual([
      { pasoId: 4, mira: "Medidas de la lona hecha", causaId: 1, comentario: "2 cm de más" },
      { pasoId: 7, mira: "Las cotas del croquis", causaId: 1, comentario: undefined },
    ]);
  });

  test("la nota, una línea por paso y lo añadido a mano detrás", () => {
    const nota = notaDeLaGuia(
      [{ mira: "Medidas de la lona hecha", comentario: "2 cm de más" }, { mira: "Las cotas del croquis" }],
      "Llámame si no lo ves",
    );
    expect(nota).toBe("✗ Medidas de la lona hecha — 2 cm de más\n✗ Las cotas del croquis\nLlámame si no lo ves");
    // Y lo que ve el autor: la lista y el texto aparte.
    expect(partirNota(nota)).toEqual({
      fallos: ["Medidas de la lona hecha — 2 cm de más", "Las cotas del croquis"],
      texto: "Llámame si no lo ves",
    });
  });

  test("los pasos viajan con las causas y se leen de vuelta; las de antes siguen valiendo", () => {
    const obs = codificarDevolucion({ causas: [3, 1, 1], pasos: [7, 4], nota: "✗ algo" });
    expect(obs).toBe("[1,3;p4,7] ✗ algo");
    expect(leerDevolucion(obs)).toEqual({ causas: [1, 3], pasos: [4, 7], nota: "✗ algo" });
    expect(leerDevolucion("[2] mira las medidas")).toEqual({ causas: [2], nota: "mira las medidas" });
    expect(leerDevolucion("sin causas")).toEqual({ causas: [], nota: "sin causas" });
  });

  test("una nota escrita a mano sale toda como texto", () => {
    expect(partirNota("Falta el lado del brazo")).toEqual({ fallos: [], texto: "Falta el lado del brazo" });
  });

  test("a la web de planteamientos le llega la nota limpia, sin el prefijo", () => {
    const r = resumirOf("0230700", [
      { estado: "devuelta", observacion: "[1,3;p4] ✗ Medidas — 2 cm", updatedAt: "2026-10-16T09:00:00Z", revisorId: null },
    ]);
    expect(r.nota).toBe("✗ Medidas — 2 cm");
  });
});

describe("qué paso falla más", () => {
  test("cuenta los pasos de cada devolución, una vez por devolución", async () => {
    const { calcularMetricas } = await import("../metricas");
    const m = calcularMetricas([
      { at: "2026-10-16T09:00:00.000Z", motivo: "empezar_revision", ofId: "a", observacion: null },
      { at: "2026-10-16T09:10:00.000Z", motivo: "devolver", ofId: "a", observacion: "[1;p4,7] ✗ x\n✗ y" },
      { at: "2026-10-16T10:00:00.000Z", motivo: "empezar_revision", ofId: "b", observacion: null },
      { at: "2026-10-16T10:10:00.000Z", motivo: "devolver", ofId: "b", observacion: "[1;p4] ✗ x" },
      // Una de antes, sin pasos: cuenta por causa, no por paso.
      { at: "2026-10-16T11:10:00.000Z", motivo: "devolver", ofId: "c", observacion: "[1] a mano" },
    ]);
    expect(m.porPaso).toEqual([{ id: 4, n: 2 }, { id: 7, n: 1 }]);
    expect(m.porCausa).toEqual([{ id: 1, n: 3 }]);
  });
});
