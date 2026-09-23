import { describe, expect, it } from "vitest";
import { adelantarTiempos, hayTiempoVivo } from "../tiempo-vivo";
import type { OF, Pedido } from "../types";

// Con la ficha abierta el "Tiempo" se quedaba quieto hasta la siguiente vuelta
// del tablero (30 s): el navegador adelanta lo que sigue corriendo desde la
// hora a la que el servidor lo calculó.

const CALCULADO = "2026-09-23T10:00:00.000Z";
const tras = (min: number) => Date.parse(CALCULADO) + min * 60_000;

function of(p: Partial<OF> = {}): OF {
  return {
    id: "0232360:11", codigo: "0232360", descripcion: "", familia: "LONA", piezas: 1,
    autorId: "carron", revisorId: null, estado: "en_curso", fichandoRol: "plantear",
    tiempoEstimadoMin: 0, tiempoPlanteoMin: 10, tiempoRevisionMin: 2,
    planteoWebMin: 10, revisionWebMin: 2,
    fichadoWeb: [{ operarioId: "carron", planteoMin: 10, revisionMin: 2 }],
    ...p,
  } as OF;
}
const pedido = (ofs: OF[]): Pedido =>
  ({ id: "AR1", codigo: "AR1", cliente: "C", situacion: "procesado", ofs }) as unknown as Pedido;

const vivo = {
  ritmoVivo: { plantear: 1, revisar: 0, porOperario: [{ operarioId: "carron", planteoMin: 1, revisionMin: 0 }] },
};

describe("adelantarTiempos", () => {
  it("suma a los minutos lo que ha corrido desde el cálculo", () => {
    const [p] = adelantarTiempos([pedido([of(vivo)])], CALCULADO, tras(3));
    const o = p.ofs[0];
    expect(o.tiempoPlanteoMin).toBeCloseTo(13);
    expect(o.planteoWebMin).toBeCloseTo(13);
    expect(o.tiempoRevisionMin).toBe(2);
    expect(o.fichadoWeb?.[0].planteoMin).toBeCloseTo(13);
  });

  it("repartido entre dos OF, cada una sube a su ritmo", () => {
    const medio = { ritmoVivo: { plantear: 0.5, revisar: 0, porOperario: [{ operarioId: "carron", planteoMin: 0.5, revisionMin: 0 }] } };
    const [p] = adelantarTiempos([pedido([of(medio)])], CALCULADO, tras(4));
    expect(p.ofs[0].tiempoPlanteoMin).toBeCloseTo(12);
  });

  it("una persona que aún no tenía minutos en la OF entra en el desglose", () => {
    const ritmo = { plantear: 1, revisar: 0, porOperario: [{ operarioId: "smith", planteoMin: 1, revisionMin: 0 }] };
    const [p] = adelantarTiempos([pedido([of({ ritmoVivo: ritmo })])], CALCULADO, tras(2));
    expect(p.ofs[0].fichadoWeb?.find((f) => f.operarioId === "smith")?.planteoMin).toBeCloseTo(2);
  });

  it("sin ritmo, los pedidos salen tal cual (misma referencia)", () => {
    const pedidos = [pedido([of()])];
    expect(adelantarTiempos(pedidos, CALCULADO, tras(5))).toBe(pedidos);
  });

  it("sin hora de cálculo, o con el reloj por detrás, no adelanta nada", () => {
    const pedidos = [pedido([of(vivo)])];
    expect(adelantarTiempos(pedidos, undefined, tras(5))).toBe(pedidos);
    expect(adelantarTiempos(pedidos, CALCULADO, tras(-1))).toBe(pedidos);
  });

  it("no adelanta más de 5 minutos: si el tablero no llega, mejor quieto que inventado", () => {
    const [p] = adelantarTiempos([pedido([of(vivo)])], CALCULADO, tras(60));
    expect(p.ofs[0].tiempoPlanteoMin).toBeCloseTo(15);
  });
});

describe("lo mío se cuenta con mi fichaje", () => {
  const tramo = (desdeMin: number, hastaMin: number | null) => ({
    inicio: new Date(tras(desdeMin)).toISOString(),
    fin: hastaMin === null ? null : new Date(tras(hastaMin)).toISOString(),
    ofIds: ["0232360:11"],
    rol: "plantear" as const,
    operarioId: "carron",
  });

  it("al pausar deja de subir, aunque el servidor todavía diga que corre", () => {
    // El servidor calculó con el reloj en marcha; Carrón pausó un minuto después.
    const propio = { operarioId: "carron", intervalos: [tramo(-10, 1)] };
    const [p] = adelantarTiempos([pedido([of(vivo)])], CALCULADO, tras(3), propio);
    expect(p.ofs[0].tiempoPlanteoMin).toBeCloseTo(11);
  });

  it("al fichar empieza a subir sin esperar al servidor", () => {
    // Ficha dos minutos después del cálculo: el servidor aún no sabe nada.
    const propio = { operarioId: "carron", intervalos: [tramo(2, null)] };
    const [p] = adelantarTiempos([pedido([of()])], CALCULADO, tras(3), propio);
    expect(p.ofs[0].tiempoPlanteoMin).toBeCloseTo(11);
  });

  it("lo de los demás sigue saliendo de su ritmo", () => {
    const ritmo = {
      plantear: 2,
      revisar: 0,
      porOperario: [
        { operarioId: "carron", planteoMin: 1, revisionMin: 0 },
        { operarioId: "smith", planteoMin: 1, revisionMin: 0 },
      ],
    };
    const propio = { operarioId: "carron", intervalos: [tramo(-10, 1)] };
    const [p] = adelantarTiempos([pedido([of({ ritmoVivo: ritmo })])], CALCULADO, tras(3), propio);
    // 10 + 1 de Carrón (pausó) + 3 de Smith
    expect(p.ofs[0].tiempoPlanteoMin).toBeCloseTo(14);
  });
});

describe("hayTiempoVivo", () => {
  it("también con solo mi reloj en marcha", () => {
    const propio = {
      operarioId: "carron",
      intervalos: [{ inicio: CALCULADO, fin: null, ofIds: ["x"], rol: "plantear" as const, operarioId: "carron" }],
    };
    expect(hayTiempoVivo([pedido([of()])], propio)).toBe(true);
  });

  it("dice si alguna OF está subiendo", () => {
    expect(hayTiempoVivo([pedido([of()])])).toBe(false);
    expect(hayTiempoVivo([pedido([of(), of(vivo)])])).toBe(true);
  });
});
