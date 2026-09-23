import { describe, expect, test } from "vitest";
import { aplicarTiemposFichaje } from "../server/tiempos";
import type { Tablero } from "../data";
import type { Intervalo } from "../fichaje";
import type { OF, Pedido } from "../types";

function of(id: string, rpsMin = 0): OF {
  return {
    id, codigo: id, descripcion: "", familia: "TOLDO", piezas: 1,
    autorId: null, revisorId: null, estado: "pendiente", fichandoRol: null,
    // `tiempoPlanteoMin` es lo que trae RPS: el fichaje de la herramienta vieja.
    tiempoEstimadoMin: 0, tiempoPlanteoMin: rpsMin, tiempoRevisionMin: 0,
  };
}
function pedido(ofs: OF[]): Pedido {
  return {
    id: "AR1", codigo: "AR1", cliente: "C", situacion: "procesado",
    fechaSolicitud: "2026-07-22", fechaPlanificacion: "2026-07-22",
    fechaEntrega: "2026-07-22", prioridad: 2, ofs,
    accent: "ninguno", lineas: 0, croquis: false,
  };
}
const tablero = (ofs: OF[]): Tablero => ({ operarios: [], pedidos: [pedido(ofs)] });

/** Minutos [inicio, fin) en la misma mañana, en la OF que se diga. */
const iv = (
  desdeH: number,
  hastaH: number,
  ofIds: string[],
  rol: Intervalo["rol"] = "plantear",
): Intervalo => ({
  inicio: `2026-07-22T${String(desdeH).padStart(2, "0")}:00:00.000Z`,
  fin: `2026-07-22T${String(hastaH).padStart(2, "0")}:00:00.000Z`,
  ofIds,
  rol,
  operarioId: "a",
});

const AHORA = "2026-07-22T20:00:00.000Z";
const ACTIVO = { dobleFichaje: false };
const PRUEBAS = { dobleFichaje: true };

test("sin intervalos devuelve el tablero sin tocar", () => {
  const t = tablero([of("OF-1")]);
  expect(aplicarTiemposFichaje(t, [], AHORA)).toBe(t);
});

describe("fichaje activo: se suma, porque el tiempo entra en RPS por la web", () => {
  test("suma minutos de planteo y revisión a lo que ya traía RPS", () => {
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1", 60)]),
      [iv(8, 9, ["OF-1"]), iv(10, 11, ["OF-1"], "revisar")],
      AHORA,
      ACTIVO,
    );
    const o = out.pedidos[0].ofs[0];
    expect(o.tiempoPlanteoMin).toBe(120); // 60 de RPS + 60 fichados aquí
    expect(o.tiempoRevisionMin).toBe(60);
  });

  test("un intervalo abierto cuenta hasta 'ahora'", () => {
    const abierto: Intervalo = { ...iv(8, 9, ["OF-1"]), fin: null };
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1")]),
      [abierto],
      "2026-07-22T08:30:00.000Z",
      ACTIVO,
    );
    expect(out.pedidos[0].ofs[0].tiempoPlanteoMin).toBe(30);
  });
});

describe("doble fichaje: RPS y la web cuentan el MISMO trabajo", () => {
  test("no se suman: el total es el mayor de los dos", () => {
    // Dos horas de trabajo real, fichadas aquí y también en la herramienta
    // vieja. Sumando salían cuatro, que es lo que se veía en el panel.
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1", 120)]),
      [iv(8, 10, ["OF-1"])],
      AHORA,
      PRUEBAS,
    );
    const o = out.pedidos[0].ofs[0];
    expect(o.tiempoPlanteoMin).toBe(120);
    expect(o.tiempoRevisionMin).toBe(0);
  });

  test("las dos cifras quedan guardadas aparte para poder contrastarlas", () => {
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1", 130)]),
      [iv(8, 10, ["OF-1"]), iv(10, 11, ["OF-1"], "revisar")],
      AHORA,
      PRUEBAS,
    );
    const o = out.pedidos[0].ofs[0];
    expect({ planteo: o.planteoWebMin, revision: o.revisionWebMin }).toEqual({
      planteo: 120,
      revision: 60,
    });
  });

  test("si la web lleva más, manda la web y conserva el reparto por rol", () => {
    // 3 h aquí (2 de planteo + 1 de revisión) contra 1 h en RPS: alguien
    // trabajó y solo lo apuntó bien en la web.
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1", 60)]),
      [iv(8, 10, ["OF-1"]), iv(10, 11, ["OF-1"], "revisar")],
      AHORA,
      PRUEBAS,
    );
    const o = out.pedidos[0].ofs[0];
    expect(o.tiempoPlanteoMin).toBe(120);
    expect(o.tiempoRevisionMin).toBe(60);
  });

  test("si manda RPS, el sobrante va al planteo: en su ruta no hay revisión", () => {
    // 5 h en RPS contra 1 h de revisión aquí. RPS no distingue roles, así que
    // esa hora de repasar también está dentro de sus cinco.
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1", 300)]),
      [iv(10, 11, ["OF-1"], "revisar")],
      AHORA,
      PRUEBAS,
    );
    const o = out.pedidos[0].ofs[0];
    expect(o.tiempoPlanteoMin).toBe(240);
    expect(o.tiempoRevisionMin).toBe(60);
    expect(o.tiempoPlanteoMin + o.tiempoRevisionMin).toBe(300);
  });

  test("una OF fichada solo aquí no se queda a cero", () => {
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1")]),
      [iv(8, 10, ["OF-1"])],
      AHORA,
      PRUEBAS,
    );
    expect(out.pedidos[0].ofs[0].tiempoPlanteoMin).toBe(120);
  });
});

describe("reparto entre varias OF, sean del pedido que sean", () => {
  test("un tramo compartido se reparte a partes iguales", () => {
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1"), of("OF-2"), of("OF-3"), of("OF-4")]),
      [iv(8, 12, ["OF-1", "OF-2", "OF-3", "OF-4"])],
      AHORA,
      PRUEBAS,
    );
    expect(out.pedidos[0].ofs.map((o) => o.planteoWebMin)).toEqual([60, 60, 60, 60]);
  });

  test("al sumar OF a mitad de jornada, cada tramo se reparte por SU tamaño", () => {
    // Dos horas en una OF sola y, al añadir una segunda, otras dos horas
    // repartidas: la primera acaba con 3 h y la segunda con 1 h. Es lo que
    // hace el motor al cerrar el tramo y abrir otro con el conjunto nuevo.
    const out = aplicarTiemposFichaje(
      tablero([of("OF-1"), of("OF-2")]),
      [iv(8, 10, ["OF-1"]), iv(10, 12, ["OF-1", "OF-2"])],
      AHORA,
      PRUEBAS,
    );
    expect(out.pedidos[0].ofs.map((o) => o.planteoWebMin)).toEqual([180, 60]);
  });
});

// ─── El ritmo al que sube el tiempo mientras se ficha ────────────────────────
// Con la ficha abierta el "Tiempo" se quedaba quieto hasta la siguiente vuelta
// del tablero (30 s) y avanzaba a saltos. El servidor dice a qué ritmo sube
// cada OF y el navegador lo adelanta (ver lib/tiempo-vivo.ts).
describe("ritmoVivo", () => {
  const abierto = (ofIds: string[], rol: Intervalo["rol"] = "plantear", operarioId = "a"): Intervalo => ({
    inicio: "2026-07-22T19:00:00.000Z",
    fin: null,
    ofIds,
    rol,
    operarioId,
  });

  test("una OF sola en el reloj sube un minuto por minuto", () => {
    const [o] = aplicarTiemposFichaje(tablero([of("OF-1")]), [abierto(["OF-1"])], AHORA, ACTIVO).pedidos[0].ofs;
    expect(o.ritmoVivo).toEqual({
      plantear: 1,
      revisar: 0,
      porOperario: [{ operarioId: "a", planteoMin: 1, revisionMin: 0 }],
    });
  });

  test("repartido entre dos OF, medio minuto cada una", () => {
    const ofs = aplicarTiemposFichaje(tablero([of("OF-1"), of("OF-2")]), [abierto(["OF-1", "OF-2"])], AHORA, ACTIVO)
      .pedidos[0].ofs;
    expect(ofs.map((o) => o.ritmoVivo?.plantear)).toEqual([0.5, 0.5]);
  });

  test("dos personas a la vez suman, cada una en su rol", () => {
    const [o] = aplicarTiemposFichaje(
      tablero([of("OF-1")]),
      [abierto(["OF-1"], "plantear", "a"), abierto(["OF-1"], "revisar", "b")],
      AHORA,
      ACTIVO,
    ).pedidos[0].ofs;
    expect(o.ritmoVivo?.plantear).toBe(1);
    expect(o.ritmoVivo?.revisar).toBe(1);
    expect(o.ritmoVivo?.porOperario).toHaveLength(2);
  });

  test("con el reloj parado no hay ritmo", () => {
    const [o] = aplicarTiemposFichaje(tablero([of("OF-1")]), [iv(8, 9, ["OF-1"])], AHORA, ACTIVO).pedidos[0].ofs;
    expect(o.ritmoVivo).toBeUndefined();
  });

  test("en pruebas, si manda RPS el total no sigue a la web y no hay ritmo", () => {
    // 60 min en la web contra 500 de RPS: el total es el de RPS y no se mueve.
    const [o] = aplicarTiemposFichaje(tablero([of("OF-1", 500)]), [abierto(["OF-1"])], AHORA, PRUEBAS).pedidos[0].ofs;
    expect(o.ritmoVivo).toBeUndefined();
  });
});
