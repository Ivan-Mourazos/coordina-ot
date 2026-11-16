import { describe, expect, it } from "vitest";
import { fichandoDesdeLaWeb } from "../vista-belen";

const AHORA = Date.parse("2026-11-16T10:44:00Z");
const nombre = (op: string) => (op === "jaime" ? "Jaime Vázquez" : "Alguien");
const maquina = () => "A-OTEC";

describe("fichandoDesdeLaWeb", () => {
  it("un reloj en tres pedidos sale solo en la OF del pedido abierto, con sus minutos", () => {
    // Jaime planteando AR.26.05563/64/65 a la vez (16/11/2026).
    const filas = fichandoDesdeLaWeb(
      [{ operarioId: "jaime", ofIds: ["0234013:5", "0234014:5", "0234015:5"], desde: "2026-11-16T10:32:00Z" }],
      new Set(["0234014"]),
      AHORA,
      nombre,
      maquina,
    );
    expect(filas).toEqual([{ of: "0234014", tarea: "5", persona: "Jaime Vázquez", minutos: 12, maquina: "A-OTEC" }]);
  });

  it("respeta la tarea tal cual («02» no es «2») e ignora ids sin tarea", () => {
    const filas = fichandoDesdeLaWeb(
      [{ operarioId: "x", ofIds: ["0234014:02", "0234014", "0234014:"], desde: "2026-11-16T10:44:00Z" }],
      new Set(["0234014"]),
      AHORA,
      nombre,
      maquina,
    );
    expect(filas.map((f) => [f.tarea, f.minutos])).toEqual([["02", 0]]);
  });

  it("nadie fichando en el pedido: lista vacía", () => {
    expect(
      fichandoDesdeLaWeb([{ operarioId: "jaime", ofIds: ["0234013:5"], desde: "2026-11-16T10:00:00Z" }], new Set(["0234014"]), AHORA, nombre, maquina),
    ).toEqual([]);
  });
});
