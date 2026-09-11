import { describe, expect, it } from "vitest";
import { repartoDe } from "../historial";

// AR.26.04489: dos OF gemelas. Adrián fichó la revisión en una y no en la otra,
// e Iván la planteó sin darle al reloj (sus minutos vienen de RPS). Mirando
// solo el reloj, la ficha decía quién revisó y callaba quién planteó.

type OFReparto = Parameters<typeof repartoDe>[0][number];
const of = (extra: OFReparto = {}): OFReparto => extra;

describe("manda el reparto registrado", () => {
  it("aunque no haya ni un minuto fichado en la web", () => {
    const r = repartoDe([of({ autorRegistrado: "Iván Sánchez", revisorRegistrado: "Adrián Quinteiro" })]);
    expect(r).toEqual({ autores: ["Iván Sánchez"], revisores: ["Adrián Quinteiro"], consta: true });
  });

  it("y se junta el de todas las OF del grupo", () => {
    const r = repartoDe([
      of({ autorRegistrado: "Iván Sánchez" }),
      of({ autorRegistrado: "Iván Sánchez", revisorRegistrado: "Adrián Quinteiro" }),
    ]);
    expect(r.autores).toEqual(["Iván Sánchez"]);
    expect(r.revisores).toEqual(["Adrián Quinteiro"]);
  });

  it("quien plantea una y revisa otra cuenta como autor, no como las dos cosas", () => {
    const r = repartoDe([
      of({ autorRegistrado: "Iván Sánchez" }),
      of({ autorRegistrado: "Adrián Quinteiro", revisorRegistrado: "Iván Sánchez" }),
    ]);
    expect([...r.autores].sort()).toEqual(["Adrián Quinteiro", "Iván Sánchez"]);
    expect(r.revisores).toEqual([]);
  });
});

describe("el reloj completa, pero no manda", () => {
  it("sin registro, sirve lo fichado en la web", () => {
    const r = repartoDe([
      of({
        rol: {
          planteoMin: 7,
          revisionMin: 3,
          planteo: [{ nombre: "Ana López", min: 7 }],
          revision: [{ nombre: "Zoe Ruiz", min: 3 }],
        },
      }),
    ]);
    expect(r).toEqual({ autores: ["Ana López"], revisores: ["Zoe Ruiz"], consta: true });
  });

  it("quien fichó cero no cuenta: tener el turno no es haberlo hecho", () => {
    const r = repartoDe([
      of({ rol: { planteoMin: 0, revisionMin: 0, planteo: [{ nombre: "Ana López", min: 0 }], revision: [] } }),
    ]);
    expect(r.autores).toEqual([]);
  });

  it("sin registro ni reloj, no consta nada y no se marca", () => {
    expect(repartoDe([of()])).toEqual({ autores: [], revisores: [], consta: false });
  });
});
