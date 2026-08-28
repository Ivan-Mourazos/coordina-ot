import { describe, expect, it } from "vitest";
import {
  FICHAJE_VACIO, abierto, agregarPorRol, cerrarPorInactividad, fichar, pausar, minutosOF,
  parseFichaje, ofsFichables, rolFichajeDe, esFichable, motivoNoFichable,
} from "../fichaje";
import { accionAlFichar } from "../accion-pedido";
import type { OF, Pedido } from "../types";

const T0 = "2026-07-06T08:00:00.000Z";
const T1 = "2026-07-06T08:30:00.000Z";
const T2 = "2026-07-06T09:00:00.000Z";

describe("fichar", () => {
  it("abre un intervalo con las OFs dadas", () => {
    const f = fichar(FICHAJE_VACIO, ["of1", "of2"], "plantear", "op1", T0);
    expect(abierto(f)).toMatchObject({ inicio: T0, fin: null, ofIds: ["of1", "of2"], rol: "plantear" });
  });
  it("cambiar el conjunto cierra el intervalo y abre otro (historia intacta)", () => {
    let f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    f = fichar(f, ["of1", "of2"], "plantear", "op1", T1);
    expect(f.intervalos).toHaveLength(2);
    expect(f.intervalos[0]).toMatchObject({ inicio: T0, fin: T1, ofIds: ["of1"] });
    expect(abierto(f)).toMatchObject({ inicio: T1, ofIds: ["of1", "of2"] });
  });
  it("deduplica ofIds y con lista vacía solo pausa", () => {
    let f = fichar(FICHAJE_VACIO, ["of1", "of1"], "plantear", "op1", T0);
    expect(abierto(f)!.ofIds).toEqual(["of1"]);
    f = fichar(f, [], "plantear", "op1", T1);
    expect(abierto(f)).toBeNull();
    expect(f.intervalos[0].fin).toBe(T1);
  });
  it("mismo conjunto y rol: no toca nada (idempotente)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    expect(fichar(f, ["of1"], "plantear", "op1", T1)).toBe(f);
  });
  it("mismo conjunto y rol pero DISTINTO operario: cierra y reabre (no idempotente)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    const f2 = fichar(f, ["of1"], "plantear", "op2", T1);
    expect(f2).not.toBe(f);
    expect(f2.intervalos).toHaveLength(2);
    expect(f2.intervalos[0]).toMatchObject({ fin: T1, operarioId: "op1" });
    expect(abierto(f2)).toMatchObject({ ofIds: ["of1"], operarioId: "op2" });
  });
  it("mismo conjunto pero DISTINTO rol: cierra y reabre (no idempotente)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    const f2 = fichar(f, ["of1"], "revisar", "op1", T1);
    expect(f2).not.toBe(f);
    expect(f2.intervalos).toHaveLength(2);
    expect(f2.intervalos[0]).toMatchObject({ fin: T1, rol: "plantear" });
    expect(abierto(f2)).toMatchObject({ ofIds: ["of1"], rol: "revisar" });
  });
});

describe("pausar", () => {
  it("cierra el intervalo abierto", () => {
    const f = pausar(fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0), T1);
    expect(abierto(f)).toBeNull();
    expect(f.intervalos[0].fin).toBe(T1);
  });
  it("sin intervalo abierto es no-op", () => {
    expect(pausar(FICHAJE_VACIO, T1)).toBe(FICHAJE_VACIO);
  });
});

describe("minutosOF", () => {
  it("reparte cada tramo entre sus OFs", () => {
    let f = fichar(FICHAJE_VACIO, ["of1", "of2"], "plantear", "op1", T0); // 30 min entre 2
    f = fichar(f, ["of1"], "plantear", "op1", T1); // 30 min solo of1
    f = pausar(f, T2);
    expect(minutosOF(f, "of1")).toBeCloseTo(45);
    expect(minutosOF(f, "of2")).toBeCloseTo(15);
  });
  it("intervalo abierto cuenta hasta `ahora`; filtra por rol", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "revisar", "op1", T0);
    expect(minutosOF(f, "of1", { ahora: T1 })).toBeCloseTo(30);
    expect(minutosOF(f, "of1", { ahora: T1, rol: "plantear" })).toBe(0);
  });
  it("intervalo abierto SIN `ahora`: no se cuenta (0)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    expect(minutosOF(f, "of1")).toBe(0);
  });
});

describe("parseFichaje", () => {
  it("null, vacío, JSON inválido o con forma incorrecta → FICHAJE_VACIO", () => {
    expect(parseFichaje(null)).toEqual(FICHAJE_VACIO);
    expect(parseFichaje("")).toEqual(FICHAJE_VACIO);
    expect(parseFichaje("null")).toEqual(FICHAJE_VACIO);
    expect(parseFichaje("{}")).toEqual(FICHAJE_VACIO);
    expect(parseFichaje('{"intervalos":"x"}')).toEqual(FICHAJE_VACIO);
  });
  it("fichaje válido: se conserva íntegro (round-trip)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1", "of2"], "plantear", "op1", T0);
    expect(parseFichaje(JSON.stringify(f))).toEqual(f);
  });
});

describe("ofsFichables", () => {
  const base: Omit<OF, "id" | "estado"> = {
    codigo: "OF-01", descripcion: "x", familia: "TOLDO", piezas: 1,
    autorId: "op1", revisorId: null, fichandoRol: null,
    tiempoEstimadoMin: 0, tiempoPlanteoMin: 0, tiempoRevisionMin: 0,
  };
  it("excluye detenidas y anuladas, pero NO las aprobadas", () => {
    // La aprobada sigue entrando: al autor le queda trabajo real después de que
    // se la aprueben (archivos de corte, imprimir) y ese tiempo es de planteo.
    const p = {
      ofs: [
        { ...base, id: "a", estado: "pendiente" },
        { ...base, id: "b", estado: "anulada" },
        { ...base, id: "c", estado: "aprobada" },
        { ...base, id: "d", estado: "en_curso", detenida: true },
      ],
    } as unknown as Pedido;
    expect(ofsFichables(p).map((o: OF) => o.id)).toEqual(["a", "c"]);
  });
});

describe("rolFichajeDe", () => {
  const of = (estado: OF["estado"]) => ({ estado }) as OF;
  it("por_revisar y en_revision fichan como revisor", () => {
    expect(rolFichajeDe(of("por_revisar"))).toBe("revisar");
    expect(rolFichajeDe(of("en_revision"))).toBe("revisar");
  });
  it("el resto de estados fichan como autor (plantear)", () => {
    expect(rolFichajeDe(of("pendiente"))).toBe("plantear");
    expect(rolFichajeDe(of("en_curso"))).toBe("plantear");
    expect(rolFichajeDe(of("devuelta"))).toBe("plantear");
  });
});

describe("esFichable", () => {
  const of = (estado: OF["estado"], detenida?: boolean) => ({ estado, detenida }) as OF;
  it("acepta estados activos", () => {
    expect(esFichable(of("pendiente"))).toBe(true);
    expect(esFichable(of("en_curso"))).toBe(true);
    expect(esFichable(of("por_revisar"))).toBe(true);
    expect(esFichable(of("devuelta"))).toBe(true);
  });
  it("una OF APROBADA se sigue pudiendo fichar", () => {
    // Que el revisor la apruebe no cierra el trabajo del autor: quedan los
    // archivos de corte, imprimir, preparar lo que baja al taller. Ese tiempo
    // es de planteo y hasta ahora no había forma de imputarlo — el reloj se
    // cortaba justo cuando te aprobaban.
    expect(esFichable(of("aprobada"))).toBe(true);
    // Y es el reloj del PLANTEO, no el de la revisión: esa ya terminó.
    expect(rolFichajeDe(of("aprobada"))).toBe("plantear");
    // Sin motivo que enseñar, porque ya no hay nada que impida fichar.
    expect(motivoNoFichable(of("aprobada"))).toBeNull();
  });
  it("fichar en una aprobada NO la devuelve a en curso", () => {
    // El reloj no puede desaprobar lo que otro ya aprobó.
    expect(accionAlFichar(of("aprobada"))).toBeNull();
  });
  it("rechaza detenidas y anuladas", () => {
    expect(esFichable(of("en_curso", true))).toBe(false);
    expect(esFichable(of("anulada"))).toBe(false);
  });
});

describe("cerrarPorInactividad", () => {
  const TOL = 5 * 60_000; // 5 minutos, la tolerancia real del producto

  it("sin intervalo abierto: no hay nada que cerrar", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    const pausado = pausar(f, T1);
    expect(cerrarPorInactividad(pausado, T1, T2, TOL)).toBeNull();
    expect(cerrarPorInactividad(FICHAJE_VACIO, null, T2, TOL)).toBeNull();
  });

  it("latido reciente: no cierra (la pestaña sigue viva)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    // Latido a T1 (08:30), ahora T2 (09:00): 30 min < 5 min de tolerancia...
    // se ajusta para que el latido esté DENTRO de la tolerancia de `ahora`.
    const latido = "2026-07-06T08:58:00.000Z"; // 2 min antes de T2
    expect(cerrarPorInactividad(f, latido, T2, TOL)).toBeNull();
  });

  it("latido antiguo: cierra con la hora del LATIDO, no con `ahora`", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0);
    const latido = "2026-07-06T08:10:00.000Z"; // último aviso a las 08:10
    const ahora = "2026-07-06T08:20:00.000Z"; // el servidor se entera 10 min después
    const cerrado = cerrarPorInactividad(f, latido, ahora, TOL);
    expect(abierto(cerrado!)).toBeNull();
    expect(cerrado!.intervalos[0]).toMatchObject({ inicio: T0, fin: latido });
    // La clave del diseño: NUNCA la hora de `ahora`.
    expect(cerrado!.intervalos[0].fin).not.toBe(ahora);
  });

  it("sin latido registrado nunca: si el intervalo lleva abierto más que la tolerancia, cierra con su propio inicio", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0); // abre a las 08:00
    const ahora = "2026-07-06T08:10:00.000Z"; // 10 min después, sin latido nunca
    const cerrado = cerrarPorInactividad(f, null, ahora, TOL);
    expect(cerrado!.intervalos[0]).toMatchObject({ inicio: T0, fin: T0 });
  });

  it("sin latido registrado pero el intervalo es reciente: no cierra todavía", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T0); // abre a las 08:00
    const ahora = "2026-07-06T08:02:00.000Z"; // 2 min después, dentro de tolerancia
    expect(cerrarPorInactividad(f, null, ahora, TOL)).toBeNull();
  });

  it("el intervalo cerrado nunca acaba antes de su propio inicio (latido corrupto/reloj desincronizado)", () => {
    const f = fichar(FICHAJE_VACIO, ["of1"], "plantear", "op1", T1); // abre a las 08:30
    const latidoAntesDelInicio = T0; // 08:00, ANTES del inicio del intervalo
    const ahora = "2026-07-06T09:00:00.000Z";
    const cerrado = cerrarPorInactividad(f, latidoAntesDelInicio, ahora, TOL);
    expect(cerrado!.intervalos[0].fin).toBe(T1); // se recorta al inicio, no queda negativo
    expect(Date.parse(cerrado!.intervalos[0].fin!)).toBeGreaterThanOrEqual(
      Date.parse(cerrado!.intervalos[0].inicio),
    );
  });
});

describe("agregarPorRol", () => {
  const iv = (inicio: string, fin: string | null, ofIds: string[], rol: "plantear" | "revisar", op = "op1") =>
    ({ inicio, fin, ofIds, rol, operarioId: op });

  it("separa planteo de revisión en la misma OF", () => {
    const m = agregarPorRol({
      intervalos: [
        iv(T0, T1, ["of1"], "plantear"),      // 30 min
        iv(T1, T2, ["of1"], "revisar", "op2"), // 30 min
      ],
    });
    expect(m.get("of1")).toMatchObject({ planteoMin: 30, revisionMin: 30 });
  });

  it("guarda cuánto puso cada persona en cada rol, sumando sus tramos", () => {
    // Antes solo guardaba la lista de quiénes, y con eso el historial podía
    // decir "lo plantearon ana y luis — 90m" pero no de quién era cada minuto.
    const m = agregarPorRol({
      intervalos: [
        iv(T0, T1, ["of1"], "plantear", "ana"),
        iv(T1, T2, ["of1"], "plantear", "ana"),
        iv(T1, T2, ["of1"], "revisar", "luis"),
      ],
    });
    // Los dos tramos de ana se suman en su nombre, no se cuentan como dos
    // personas ni se pierde el segundo.
    expect(m.get("of1")!.operarios).toEqual({ plantear: { ana: 60 }, revisar: { luis: 30 } });
    // Y el total del rol sigue cuadrando con la suma de las personas.
    expect(m.get("of1")!.planteoMin).toBe(60);
  });

  it("un tramo compartido reparte los minutos de la persona entre las OF", () => {
    // El reparto por OF ya existía para el total del rol; lo que se comprueba
    // aquí es que el de cada persona se reparte igual y no cuenta doble.
    const m = agregarPorRol({ intervalos: [iv(T0, T1, ["of1", "of2"], "plantear", "ana")] });
    expect(m.get("of1")!.operarios.plantear).toEqual({ ana: 15 });
    expect(m.get("of2")!.operarios.plantear).toEqual({ ana: 15 });
  });

  it("reparte el tramo compartido entre sus OFs, igual que minutosOF", () => {
    const intervalos = [iv(T0, T1, ["of1", "of2"], "plantear")];
    const m = agregarPorRol({ intervalos });
    expect(m.get("of1")!.planteoMin).toBe(15);
    expect(m.get("of1")!.planteoMin).toBe(minutosOF({ intervalos }, "of1"));
  });

  it("un intervalo abierto no cuenta sin `ahora`, y cuenta con él", () => {
    const intervalos = [iv(T0, null, ["of1"], "plantear")];
    expect(agregarPorRol({ intervalos }).size).toBe(0);
    expect(agregarPorRol({ intervalos }, { ahora: T1 }).get("of1")!.planteoMin).toBe(30);
  });

  it("una OF sin fichar no aparece: no se sabe su desglose, no es cero", () => {
    expect(agregarPorRol({ intervalos: [iv(T0, T1, ["of1"], "plantear")] }).has("of2")).toBe(false);
  });
});
