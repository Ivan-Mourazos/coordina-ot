import { beforeEach, expect, test, vi } from "vitest";

// ─── Caché del tablero y OF retenidas ────────────────────────────────────────
// RPS y OLANET se simulan por completo: un pool falso que contesta vacío salvo
// a la consulta de detalle (`filasPorFase`), que devuelve una fila por cada
// orden que se le pida. Así, si una OF retenida llega al tablero es porque
// `consultarTablero` la leyó y `filasDeLaSeccion` la sumó.

const estado = {
  retenidas: [] as { ofId: string }[],
  lecturas: 0,
  /** Si está puesto, la consulta de claves espera a que se resuelva: simula
   *  la vista de 7-15 s. */
  compuerta: null as Promise<void> | null,
  /** Si está puesto, la consulta de claves falla. */
  fallar: false,
};

vi.mock("../server/estado-db", () => ({
  leerOfsRetenidas: () => {
    estado.lecturas++;
    return estado.retenidas.map((r) => ({ ...r, pedido: "AR.26.04351", motivo: "cerrada", por: "ivan", at: "" }));
  },
  // El tablero guarda de paso la máquina de cada tarea (ver `tarea_maquina`).
  // Aquí no se comprueba nada de eso —esto mide la caché—, pero sin el doble
  // el módulo real ni se carga y todas las pruebas del fichero se caen.
  guardarMaquinasDeTarea: () => {},
}));

vi.mock("../server/olanet", () => ({ fasesPendientesDe: async () => [] }));

vi.mock("../server/db", () => {
  const request = () => {
    const req = {
      input: () => req,
      query: async (sql: string) => {
        if (sql.includes("SELECT [OF], CodTarea, SitOF, PermiteImputaciones FROM")) {
          const compuerta = estado.compuerta;
          if (compuerta) await compuerta;
          if (estado.fallar) throw new Error("RPS no contesta");
          return { recordset: [] };
        }
        if (sql.includes("FROM dbo.CPRMOTask AS e")) {
          const ordenes = [...sql.matchAll(/IN \(([^)]*)\)\s*$/gm)]
            .flatMap((m) => m[1].split(","))
            .map((o) => o.trim().replace(/'/g, ""))
            .filter(Boolean);
          return {
            recordset: ordenes.map((of) => ({
              OF: of, CodTarea: "9", Tarea: "PLANTEAR", Pedido: "AR.26.04351", Cliente: "MAHOU",
              Articulo: "1 - TOLDO", Rotulacion: null, FechaSolicitada: null, Prioridad: 2,
              TiempoPrevisto: 0, FechaCompras: null, FechaPlanificada: null,
              SitOF: "LANZADA", PermiteImputaciones: true, NotasOF: null,
              DescripcionMO: "Toldo", Cantidad: 1,
              PlannedStartDate: null, PlannedEndDate: null, ManualEndDate: null,
            })),
          };
        }
        return { recordset: [] };
      },
    };
    return req;
  };
  return { getPool: async () => ({ request }) };
});

let rps: typeof import("../server/rps");

beforeEach(async () => {
  // Caché y refrescos en vuelo son estado del módulo: cada test, módulo nuevo.
  vi.resetModules();
  vi.doUnmock("../secciones");
  estado.retenidas = [];
  estado.lecturas = 0;
  estado.compuerta = null;
  estado.fallar = false;
  rps = await import("../server/rps");
});

const codigos = (t: { pedidos: { ofs: { id: string }[] }[] }) =>
  t.pedidos.flatMap((p) => p.ofs.map((o) => o.id));

function abrirCompuerta() {
  let abrir!: () => void;
  estado.compuerta = new Promise<void>((r) => { abrir = r; });
  return () => { estado.compuerta = null; abrir(); };
}

const RETENIDA = { ofId: "0232086:9" };

test("la suma está conectada: una OF retenida sale en el tablero (fuente vista)", async () => {
  estado.retenidas = [RETENIDA];
  const t = await rps.getTableroRPS("ot");
  expect(codigos(t)).toContain("0232086:9");
});

test("la suma está conectada: una OF retenida sale en el tablero (fuente OLANET)", async () => {
  estado.retenidas = [RETENIDA];
  const t = await rps.getTableroRPS("diseno");
  expect(codigos(t)).toContain("0232086:9");
});

test("invalidar durante un refresco lento: el tablero que queda lleva la OF recién retenida", async () => {
  const abrir = abrirCompuerta();
  const primera = rps.getTableroRPS("ot"); // en frío: se queda esperando a la vista
  await vi.waitFor(() => expect(estado.lecturas).toBe(1)); // ya leyó las retenidas (ninguna)

  estado.retenidas = [RETENIDA];
  rps.invalidarCacheTablero("ot");
  abrir();

  await primera;
  expect(codigos(await rps.getTableroRPS("ot"))).toContain("0232086:9");
});

test("invalidar sigue sirviendo lo último bueno mientras se refresca, y lo cambia al llegar", async () => {
  const viejo = await rps.getTableroRPS("ot");
  expect(codigos(viejo)).toEqual([]);

  const abrir = abrirCompuerta();
  estado.retenidas = [RETENIDA];
  rps.invalidarCacheTablero("ot");

  // Con la vista colgada, la petición contesta YA con lo viejo, no en frío.
  const espera = new Promise((r) => setTimeout(() => r("colgado"), 50));
  expect(await Promise.race([rps.getTableroRPS("ot"), espera])).toBe(viejo);

  abrir();
  await vi.waitFor(async () => expect(codigos(await rps.getTableroRPS("ot"))).toContain("0232086:9"));
});

test("si el refresco tras invalidar falla, se sigue sirviendo lo último bueno (no un error)", async () => {
  const viejo = await rps.getTableroRPS("ot");
  estado.fallar = true;
  const lecturasAntes = estado.lecturas;
  rps.invalidarCacheTablero("ot");
  await vi.waitFor(() => expect(estado.lecturas).toBeGreaterThan(lecturasAntes));
  await new Promise((r) => setTimeout(r, 10));
  await expect(rps.getTableroRPS("ot")).resolves.toBe(viejo);
});

test("invalidar una sección en obras no consulta nada", async () => {
  vi.resetModules();
  vi.doMock("../secciones", async (original) => {
    const real = await original<typeof import("../secciones")>();
    return { ...real, SECCIONES: { ...real.SECCIONES, diseno: { ...real.SECCIONES.diseno, enObras: true } } };
  });
  rps = await import("../server/rps");
  rps.invalidarCacheTablero("diseno");
  await new Promise((r) => setTimeout(r, 10));
  expect(estado.lecturas).toBe(0);
});
