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

  it("y con roles registrados que no casan con nadie, tampoco", () => {
    const r = personasConRol([ivan], ["Quien Sea"], [], true);
    expect(r[0].rol).toBeUndefined();
  });
});
