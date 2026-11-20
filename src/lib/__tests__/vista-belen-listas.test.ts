import { describe, expect, test, vi } from "vitest";
import type sql from "mssql";
import { esIdLista, filasALaVista, filtrarLista, FILTRO_LISTA_INICIAL, LISTAS_BELEN, valoresFiltro, type IdLista } from "../vista-belen-listas";
import { CONSULTAS, leerListaBelen, olvidarListasBelen } from "../server/vista-belen-listas-db";
import { getPool } from "../server/db";

vi.mock("../server/db", () => ({ getPool: vi.fn() }));

// Record obliga a actualizar esta lista si se amplía la unión IdLista: no
// basta con que definición y consulta olviden por accidente la misma clave.
const IDS = {
  "bultos-subidos": true,
  "finalizadas-bultos": true,
  "desfase": true,
  "fechas-comprometidas": true,
  "varias-maquinas": true,
  "sin-descripcion": true,
  "sin-tiempos": true,
  "tareas-horas": true,
  "tiempos-sin-subir": true,
  "delimitacion": true,
  "detenidas-material": true,
  "compras-pendientes": true,
  "tp-cot": true,
  "sin-gestionar": true,
  "incidencias": true,
  "tiempos-abiertos": true,
} satisfies Record<IdLista, true>;

// «fechas-comprometidas» se prueba aparte: lee la fecha del texto y descarta lo que no lo es.
const NUEVAS = ["desfase", "varias-maquinas", "sin-descripcion"] as const;

function poolCon(filas: Record<string, unknown>[]) {
  const query = vi.fn().mockResolvedValue({ recordset: filas });
  // Con .input() encadenable: algunas consultas llevan parámetros.
  const request = () => {
    const r = { input: () => r, query };
    return r;
  };
  return { pool: { request } as unknown as sql.ConnectionPool, query };
}

describe("caché de las listas: lo último al momento y se renueva por detrás", () => {
  const fila = (clave: string) => ({ clave, of: "0000001", pedido: "AR.26.00001" });

  test("guardada y reciente, al momento; pasada, la misma y se renueva; muy vieja, se espera", async () => {
    vi.stubEnv("DATASOURCE", "rps");
    vi.mocked(getPool).mockResolvedValue({} as sql.ConnectionPool);
    const consulta = vi
      .spyOn(CONSULTAS, "varias-maquinas")
      .mockResolvedValueOnce([fila("primera")])
      .mockResolvedValueOnce([fila("segunda")])
      .mockResolvedValueOnce([fila("tercera")]);
    const t0 = new Date("2026-11-10T08:00:00Z").getTime();
    vi.useFakeTimers({ now: t0, toFake: ["Date"] });
    try {
      expect((await leerListaBelen("varias-maquinas")).filas[0].clave).toBe("primera");
      expect(consulta).toHaveBeenCalledTimes(1);

      // Al minuto: la guardada, sin preguntar a RPS.
      vi.setSystemTime(t0 + 60_000);
      expect((await leerListaBelen("varias-maquinas")).filas[0].clave).toBe("primera");
      expect(consulta).toHaveBeenCalledTimes(1);

      // A los 5 minutos: la guardada AL MOMENTO, y se renueva por detrás.
      vi.setSystemTime(t0 + 5 * 60_000);
      expect((await leerListaBelen("varias-maquinas")).filas[0].clave).toBe("primera");
      expect(consulta).toHaveBeenCalledTimes(2);
      // La renovación va por detrás: se espera a que termine.
      await new Promise((r) => setTimeout(r, 0));
      expect((await leerListaBelen("varias-maquinas")).filas[0].clave).toBe("segunda");

      // Una hora después ya no se enseña lo viejo: se espera a la nueva.
      vi.setSystemTime(t0 + 65 * 60_000);
      expect((await leerListaBelen("varias-maquinas")).filas[0].clave).toBe("tercera");
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      consulta.mockRestore();
      olvidarListasBelen();
      vi.mocked(getPool).mockReset();
    }
  });
});

describe("«Actualizar» a mano recalcula aunque lo guardado sea reciente", () => {
  test("forzar pregunta a RPS otra vez", async () => {
    vi.stubEnv("DATASOURCE", "rps");
    vi.mocked(getPool).mockResolvedValue({} as sql.ConnectionPool);
    const fila = (clave: string) => ({ clave, of: "0000001", pedido: "AR.26.00001" });
    const consulta = vi.spyOn(CONSULTAS, "desfase").mockResolvedValueOnce([fila("a")]).mockResolvedValueOnce([fila("b")]);
    try {
      expect((await leerListaBelen("desfase")).filas[0].clave).toBe("a");
      expect((await leerListaBelen("desfase")).filas[0].clave).toBe("a");
      expect((await leerListaBelen("desfase", { forzar: true })).filas[0].clave).toBe("b");
      expect(consulta).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
      consulta.mockRestore();
      olvidarListasBelen();
      vi.mocked(getPool).mockReset();
    }
  });
});

describe("registro de listas de Belén", () => {
  test("cada IdLista tiene definición y consulta, sin ids repetidos", () => {
    const ids = Object.keys(IDS).sort();
    expect(LISTAS_BELEN.map((l) => l.id).sort()).toEqual(ids);
    expect(Object.keys(CONSULTAS).sort()).toEqual(ids);
    expect(new Set(LISTAS_BELEN.map((l) => l.id)).size).toBe(LISTAS_BELEN.length);
  });

  test.each(LISTAS_BELEN)("$id: columnas únicas y navegación al pedido", (lista) => {
    const claves = lista.columnas.map((c) => c.clave);
    expect(new Set(claves).size).toBe(claves.length);
    // «Pedidos sin gestionar» son justo los que aún no tienen OF.
    if (lista.id !== "sin-gestionar") expect(claves).toContain("of");
    expect(claves).toContain("pedido");
    if (lista.filtro) expect(claves).toContain(lista.filtro.clave);
    expect(lista.label.trim()).not.toBe("");
    expect(lista.explica.trim()).not.toBe("");
  });

  test("solo admite los ids publicados", () => {
    for (const id of Object.keys(IDS)) expect(esIdLista(id)).toBe(true);
    for (const id of ["", "DESFASE", "desfase ", null, undefined, {}, 2]) {
      expect(esIdLista(id)).toBe(false);
    }
  });

  test.each(Object.keys(IDS) as IdLista[])("%s acepta una lista vacía", async (id) => {
    const { pool } = poolCon([]);
    await expect(CONSULTAS[id](pool)).resolves.toEqual([]);
  });

  test("en mock no intenta conectar con RPS", async () => {
    vi.stubEnv("DATASOURCE", "mock");
    try {
      for (const id of Object.keys(IDS) as IdLista[]) {
        await expect(leerListaBelen(id)).resolves.toMatchObject({ filas: [] });
      }
      expect(getPool).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("valores de las comprobaciones", () => {
  test.each(NUEVAS)("%s recorta textos sin perder ceros ni signos", async (id) => {
    const original = {
      clave: " id-1 ", of: " 0233680 ", pedido: " AR.26.05381 ",
      cliente: " Cliente ", formaEntrega: "   ", referencia: null,
      cantidadOF: 1, cantidadSubida: 2, diferencia: -1, prioridad: 0,
      bultosSubidos: " SI ", maquinas: " A-CFAC, A-CONF ",
    };
    const { pool } = poolCon([original]);
    await expect(CONSULTAS[id](pool)).resolves.toEqual([{
      ...original, clave: "id-1", of: "0233680", pedido: "AR.26.05381",
      cliente: "Cliente", formaEntrega: null, bultosSubidos: "SI", maquinas: "A-CFAC, A-CONF",
    }]);
    expect(original.clave).toBe(" id-1 ");
    expect(original.cliente).toBe(" Cliente ");
  });

  test("las fechas SQL salen ISO y los marcadores de 1900 quedan vacíos", async () => {
    const { pool } = poolCon([{
      clave: "id", of: "0233680", pedido: "AR.26.05381",
      fechaFabricacion: new Date("1900-01-01T00:00:00.000Z"),
      fechaExigida: new Date("2026-11-13T00:00:00.000Z"),
    }]);
    const [fila] = await CONSULTAS["desfase"](pool);
    expect(fila.fechaFabricacion).toBeNull();
    expect(fila.fechaExigida).toBe("2026-11-13");
  });
});

describe("fechas comprometidas: la última apuntada, leída como en la ficha", () => {
  test("texto americano a ISO, sin las que no son fecha, de la más antigua a la más lejana", async () => {
    const { pool } = poolCon([
      { clave: "b", of: "2", pedido: "AR.2", textoComprometida: " 11/13/2026 " },
      { clave: "c", of: "3", pedido: "AR.3", textoComprometida: "BELEN" },
      { clave: "a", of: "1", pedido: "AR.1", textoComprometida: "11/6/26" },
    ]);
    const filas = await CONSULTAS["fechas-comprometidas"](pool);
    expect(filas.map((f) => [f.of, f.fechaComprometida])).toEqual([["1", "2026-11-06"], ["2", "2026-11-13"]]);
    expect(filas[0]).not.toHaveProperty("textoComprometida");
  });
});

describe("filtros y orden de las listas", () => {
  const def = LISTAS_BELEN.find((l) => l.id === "fechas-comprometidas")!;
  const filas = [
    { clave: "1", of: "0001", pedido: "AR.1", cliente: "Álvarez", prioridad: 3, fechaComprometida: "2026-11-13" },
    { clave: "2", of: "0002", pedido: "AR.2", cliente: "Pérez", prioridad: 1, fechaComprometida: "2026-11-06" },
    { clave: "3", of: "0003", pedido: "AR.3", cliente: "Lago", prioridad: null, fechaComprometida: "2026-11-20" },
  ];
  test("busca sin tildes en cualquier columna", () => {
    expect(filtrarLista(filas, def, { ...FILTRO_LISTA_INICIAL, texto: "alvarez" }).map((f) => f.clave)).toEqual(["1"]);
  });
  test("filtra por la columna de fecha, un día o un rango", () => {
    expect(filtrarLista(filas, def, { ...FILTRO_LISTA_INICIAL, desde: "2026-11-06", hasta: "2026-11-13" }).map((f) => f.clave)).toEqual(["1", "2"]);
    expect(filtrarLista(filas, def, { ...FILTRO_LISTA_INICIAL, desde: "2026-11-20", hasta: "2026-11-20" }).map((f) => f.clave)).toEqual(["3"]);
  });
  test("ordena números como números, en los dos sentidos, y lo vacío al final", () => {
    const asc = { ...FILTRO_LISTA_INICIAL, orden: { clave: "prioridad", descendente: false } };
    expect(filtrarLista(filas, def, asc).map((f) => f.clave)).toEqual(["2", "1", "3"]);
    expect(filtrarLista(filas, def, { ...asc, orden: { clave: "prioridad", descendente: true } }).map((f) => f.clave)).toEqual(["1", "2", "3"]);
  });
  test("sin orden elegido, el de RPS", () => {
    expect(filtrarLista(filas, def, FILTRO_LISTA_INICIAL).map((f) => f.clave)).toEqual(["1", "2", "3"]);
  });
});

describe("el desplegable de la lista (delimitación: «Problema»)", () => {
  const def = LISTAS_BELEN.find((l) => l.id === "delimitacion")!;
  const filas = [
    { clave: "1", of: "0001", pedido: "AR.1", problema: "Sin tiempo" },
    { clave: "2", of: "0002", pedido: "AR.2", problema: "8 h o más" },
    { clave: "3", of: "0003", pedido: "AR.3", problema: "Sin tiempo" },
  ];
  test("ofrece los valores que hay y se queda con el elegido", () => {
    expect(valoresFiltro(filas, def)).toEqual(["8 h o más", "Sin tiempo"]);
    expect(filtrarLista(filas, def, { ...FILTRO_LISTA_INICIAL, valor: "Sin tiempo" }).map((f) => f.clave)).toEqual(["1", "3"]);
    expect(filtrarLista(filas, def, FILTRO_LISTA_INICIAL)).toHaveLength(3);
  });
});

describe("«Ver delegaciones»: SA y BE escondidas hasta marcar la casilla", () => {
  const def = LISTAS_BELEN.find((l) => l.id === "sin-tiempos")!;
  const filas = [
    { clave: "1", of: "0001", pedido: "AR.26.00001" },
    { clave: "2", of: "0002", pedido: "SA.26.00002" },
    { clave: "3", of: "0003", pedido: "BE.26.00003" },
  ];
  test("apagada, solo Arzúa; encendida, todas", () => {
    expect(def.delegaciones).toBe(true);
    expect(filtrarLista(filas, def, FILTRO_LISTA_INICIAL).map((f) => f.clave)).toEqual(["1"]);
    expect(filtrarLista(filas, def, { ...FILTRO_LISTA_INICIAL, delegaciones: true }).map((f) => f.clave)).toEqual(["1", "2", "3"]);
  });
  test("las listas sin la casilla no esconden nada", () => {
    const desfase = LISTAS_BELEN.find((l) => l.id === "desfase")!;
    expect(filtrarLista(filas, desfase, FILTRO_LISTA_INICIAL)).toHaveLength(3);
  });
  test("el contador cuenta lo que se ve al abrirla, no las delegaciones", () => {
    expect(filasALaVista(filas, def)).toHaveLength(1);
    expect(filasALaVista(filas, LISTAS_BELEN.find((l) => l.id === "desfase")!)).toHaveLength(3);
  });
});

describe("tiempos abiertos en OLANET", () => {
  const fila = (extra: Record<string, unknown>) => ({
    clave: "g-1", orden: "0233511", fase: "02", tiempo: 600, maquina: "S-MONT", codoperario: 94,
    dia: "2026-11-16", hora: "07:00", nocturno: 0, of: "0233511", pedido: "SA.26.00123",
    tarea: "MONTAR ", codEmpleado: "94", persona: "PEREZ, ANA", ...extra,
  });

  /** Primero la foto de OLANET; luego los cerrados de RPS (vacío salvo que se diga). */
  const dosConsultas = (ahora: Record<string, unknown>[], cerrados: Record<string, unknown>[] = []) => {
    const { pool, query } = poolCon([]);
    query.mockResolvedValueOnce({ recordset: ahora }).mockResolvedValueOnce({ recordset: cerrados });
    return pool;
  };

  test("más de 9 h 20: dónde por la máquina, lo que lleva y el porqué", async () => {
    const pool = dosConsultas([fila({})]);
    const [f] = await CONSULTAS["tiempos-abiertos"](pool);
    expect(f).toMatchObject({
      of: "0233511", pedido: "SA.26.00123", delegacion: "Santiago", dia: "2026-11-16",
      horario: "07:00 → sigue", tiempo: "10:00", maquina: "S-MONT", tarea: "02 MONTAR · S-MONT", motivo: "Más de 9 h 20", estado: "Abierto",
    });
  });

  test("abierto a las 23:30, Bergondo y Arzúa, y la indirecta sin OF que abrir", async () => {
    const pool = dosConsultas([
      fila({ clave: "a", tiempo: 45, nocturno: 1, maquina: "B-CONF" }),
      fila({ clave: "b", tiempo: 900, nocturno: 1, maquina: "P-REPA" }),
      fila({ clave: "c", orden: "1", of: "0000001", pedido: null, fase: "8", tarea: null, maquina: "A-TARE" }),
    ]);
    const [a, b, c] = await CONSULTAS["tiempos-abiertos"](pool);
    expect(a).toMatchObject({ delegacion: "Bergondo", tiempo: "00:45", motivo: "Pasadas las 23:30" });
    expect(b).toMatchObject({ delegacion: "Arzúa", tiempo: "15:00", motivo: "Más de 9 h 20 · Pasadas las 23:30" });
    expect(c).toMatchObject({ of: null, pedido: null, delegacion: "Arzúa", tarea: "Indirecta 8 · A-TARE" });
  });

  test("los cerrados de RPS van detrás, con el tiempo entero aunque pasaran la medianoche", async () => {
    const cerrado = {
      clave: "X1", dia: "2026-11-12", inicio: "11:55", hasta: "07:05", diaFin: "2026-11-13", segundos: 19 * 3600 + 10 * 60,
      nocturno: 1, maquina: "A-MONT", of: "0233424", pedido: "AR.26.05272", codTarea: "01", tarea: "DESMONTAR TOLDO",
      codEmpleado: "90", persona: "CASTRO, OSCAR",
    };
    const filas = await CONSULTAS["tiempos-abiertos"](dosConsultas([fila({})], [
      cerrado,
      { ...cerrado, clave: "X2", inicio: "22:00", hasta: "23:45", diaFin: "2026-11-12", segundos: 6300, of: "0000001", codTarea: "8", tarea: null },
    ]));
    expect(filas.map((f) => f.estado)).toEqual(["Abierto", "Cerrado", "Cerrado"]);
    expect(filas[1]).toMatchObject({
      clave: "rps-X1", delegacion: "Arzúa", dia: "2026-11-12", horario: "11:55 → 07:05 (13/11)",
      tiempo: "19:10", of: "0233424", tarea: "01 DESMONTAR TOLDO · A-MONT", motivo: "Más de 9 h 20 · Pasadas las 23:30",
    });
    expect(filas[2]).toMatchObject({ horario: "22:00 → 23:45", tiempo: "01:45", of: null, tarea: "Indirecta 8 · A-MONT", motivo: "Pasadas las 23:30" });
  });
});
