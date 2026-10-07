import { describe, expect, it } from "vitest";
import { personasConRol } from "../historial";

// AR.26.04489: Iván lo planteó y Adrián lo revisó, 2 minutos cada uno. Con el
// orden por minutos a secas, el desempate alfabético dejaba a Adrián delante y
// el pedido parecía de quien lo repasó.

const ivan = { nombre: "Iván Sánchez", min: 2 };
const adrian = { nombre: "Adrián Quinteiro", min: 2 };

describe("quién planteó va delante", () => {
  it("con los roles registrados, aunque empaten a minutos", () => {
    const r = personasConRol([adrian, ivan], ["Iván Sánchez"], ["Adrián Quinteiro"], true);
    expect(r.map((p) => p.nombre)).toEqual(["Iván Sánchez", "Adrián Quinteiro"]);
    expect(r.map((p) => p.rol)).toEqual(["plantear", "revisar"]);
  });

  it("quien echó horas sin constar en ningún rol va al final", () => {
    const jaime = { nombre: "Jaime Vázquez", min: 40 };
    const r = personasConRol([jaime, adrian, ivan], ["Iván Sánchez"], ["Adrián Quinteiro"], true);
    expect(r.map((p) => p.nombre)).toEqual(["Iván Sánchez", "Adrián Quinteiro", "Jaime Vázquez"]);
    expect(r[2].rol).toBeUndefined();
  });

  it("entre varios del mismo papel, manda el tiempo", () => {
    const r = personasConRol(
      [{ nombre: "Ana López", min: 5 }, { nombre: "Zoe Ruiz", min: 30 }],
      ["Ana López", "Zoe Ruiz"],
      [],
      true,
    );
    expect(r.map((p) => p.nombre)).toEqual(["Zoe Ruiz", "Ana López"]);
  });
});

describe("sin roles registrados no se marca nada", () => {
  it("ni punto ni orden por rol: el rol deducido de las horas es una suposición", () => {
    const r = personasConRol([adrian, ivan], ["Iván Sánchez"], ["Adrián Quinteiro"], false);
    expect(r.map((p) => p.rol)).toEqual([undefined, undefined]);
    // Orden de siempre: por minutos y, a igualdad, alfabético.
    expect(r.map((p) => p.nombre)).toEqual(["Adrián Quinteiro", "Iván Sánchez"]);
  });

  it("quien echó horas y no consta en ningún rol sigue sin marca", () => {
    const r = personasConRol([ivan], ["Quien Sea"], [], true);
    expect(r.find((p) => p.nombre === "Iván Sánchez")?.rol).toBeUndefined();
  });
});

// AR.26.04928 y AR.26.04942 (07/10/2026): Iván los revisó en menos de un minuto.
// RPS guarda minutos enteros, así que su imputación quedó en 0 y no salía en la
// fila: la revisión constaba en CoordinaOT pero solo se pintaba a quien tenía
// tiempo.
describe("quien consta en un rol sale aunque no tenga tiempo", () => {
  const tamara = { nombre: "Tamara Villar", min: 12 };

  it("el revisor registrado con 0 minutos aparece, detrás de quien planteó", () => {
    const r = personasConRol([tamara], ["Tamara Villar"], ["Iván Sánchez"], true, ["Tamara Villar", "Iván Sánchez"]);
    expect(r).toEqual([
      { nombre: "Tamara Villar", min: 12, rol: "plantear" },
      { nombre: "Iván Sánchez", min: 0, rol: "revisar" },
    ]);
  });

  it("y el autor registrado sin tiempo, también", () => {
    const r = personasConRol(
      [{ nombre: "Iván Sánchez", min: 3 }],
      ["Tamara Villar"],
      ["Iván Sánchez"],
      true,
      ["Tamara Villar", "Iván Sánchez"],
    );
    expect(r.map((p) => `${p.nombre}:${p.rol}:${p.min}`)).toEqual(["Tamara Villar:plantear:0", "Iván Sánchez:revisar:3"]);
  });

  it("sin roles registrados no se añade a nadie", () => {
    expect(
      personasConRol([tamara], ["Tamara Villar"], ["Iván Sánchez"], false, ["Iván Sánchez"]),
    ).toEqual([tamara]);
  });

  it("quien solo sale del reloj de la web, sin registro, no se añade", () => {
    expect(personasConRol([tamara], ["Tamara Villar", "Iván Sánchez"], [], true).map((p) => p.nombre)).toEqual([
      "Tamara Villar",
    ]);
  });
});
