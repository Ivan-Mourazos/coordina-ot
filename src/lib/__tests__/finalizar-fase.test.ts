import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { finalizarFaseCon, type FasesEnOlanet } from "../server/finalizar-fase";
import { esFaseDe, esFaseDeLaWeb, SECCIONES } from "../secciones";

// ─── La función que ESCRIBE el 3 en OLANET ───────────────────────────────────
// `finalizarFaseCon` es la pieza compartida por `POST /api/fases` (arrastre) y
// `POST /api/fases/cerrar-of` (dar por terminada una OF suelta), y es la que
// decide si se escribe en el sistema de la fábrica. Hasta ahora no tenía ni un
// test: los de las dos rutas la mockean, y el de `/api/fases` llegó a repetir
// su cuerpo entero dentro del mock, así que lo que corría en producción no lo
// comprobaba nadie.
//
// Aquí se prueba LA FUNCIÓN DE VERDAD. Las cuatro consultas entran por
// parámetro (ver `FasesEnOlanet`), así que no se abre ninguna conexión: este
// fichero no importa `mssql` ni directa ni indirectamente.

const maquinaDeFase = vi.fn<FasesEnOlanet["maquinaDeFase"]>();
const buscarIdBoletin = vi.fn<FasesEnOlanet["buscarIdBoletin"]>();
const estadoDeFase = vi.fn<FasesEnOlanet["estadoDeFase"]>();
const moverFase = vi.fn<FasesEnOlanet["moverFase"]>();
const olanet: FasesEnOlanet = { maquinaDeFase, buscarIdBoletin, estadoDeFase, moverFase };

beforeEach(() => {
  vi.clearAllMocks();
  moverFase.mockResolvedValue(undefined);
  buscarIdBoletin.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

const cerrar = (extra: Partial<Parameters<typeof finalizarFaseCon>[1]> = {}) =>
  finalizarFaseCon(olanet, {
    idBoletin: "456",
    esNuestra: esFaseDeLaWeb,
    operarioRps: "195",
    cuando: new Date("2026-09-16T09:00:00.000Z"),
    ...extra,
  });

// ── Lo que NO se escribe ────────────────────────────────────────────────────

test("una fase que no es nuestra no se toca, y ni se pregunta en qué estado está", async () => {
  maquinaDeFase.mockResolvedValue("A-MONT");
  const r = await cerrar();
  expect(r).toEqual({ ok: false, status: 403, error: "Esa fase es de A-MONT, que no es trabajo de oficina" });
  expect(moverFase).not.toHaveBeenCalled();
  // El orden de las dos comprobaciones es la regla, no un detalle: de quién es
  // la fase se decide ANTES que en qué estado está. Invertirlas dejaría que un
  // estado "cerrable" del taller llegara hasta el 3.
  expect(estadoDeFase).not.toHaveBeenCalled();
});

test("cerrando una OF suelta, la fase de la OTRA sección tampoco es nuestra", async () => {
  // `esNuestra` es lo que separa los dos usos: el arrastre acepta toda la
  // oficina, cerrar una OF suelta solo su sección.
  maquinaDeFase.mockResolvedValue("A-DGRA");
  expect((await cerrar({ esNuestra: (m) => esFaseDe(m, SECCIONES.ot) })).ok).toBe(false);
  expect(moverFase).not.toHaveBeenCalled();
  // Y con la de la web entera sí pasa el filtro (y se escribe).
  estadoDeFase.mockResolvedValue(2);
  expect((await cerrar()).ok).toBe(true);
  expect(moverFase).toHaveBeenCalledTimes(1);
});

test("una fase ya finalizada contesta yaEstaba y no vuelve a escribir", async () => {
  // Dos personas con la misma ficha abierta: la segunda no puede dejar un
  // movimiento duplicado en el histórico del taller.
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(3);
  expect(await cerrar()).toEqual({ ok: true, yaEstaba: true, idBoletin: "456" });
  expect(moverFase).not.toHaveBeenCalled();
});

test("una fase ELIMINADA en OLANET no se resucita", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(4);
  expect(await cerrar()).toEqual({ ok: false, status: 409, error: "Esa fase no se puede finalizar desde aquí" });
  expect(moverFase).not.toHaveBeenCalled();
});

test("un estado desconocido tampoco se toca, y un estado que no llega tampoco", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  // El catálogo puede crecer: lo que no se entiende no se cierra.
  estadoDeFase.mockResolvedValue(9);
  expect((await cerrar()).ok).toBe(false);
  // null = la fase desapareció entre la primera consulta y esta.
  estadoDeFase.mockResolvedValue(null);
  expect((await cerrar()).ok).toBe(false);
  expect(moverFase).not.toHaveBeenCalled();
});

test("un boletín que ya no existe, y sin OF y fase que rebuscar, es 404", async () => {
  maquinaDeFase.mockResolvedValue(null);
  expect(await cerrar()).toEqual({ ok: false, status: 404, error: "Esa fase ya no existe en OLANET" });
  expect(buscarIdBoletin).not.toHaveBeenCalled();
  expect(moverFase).not.toHaveBeenCalled();
});

// ── El boletín se queda viejo (caso de Alberto, AR.25.02771) ────────────────
// La fase 5 de la OF 0217539 (U-A-OTEC) existía y se podía fichar, pero
// cerrarla desde la ficha decía "Esa fase ya no existe en OLANET", que va por
// IdBoletin a pelo. Tuvo que cerrarla con la herramienta vieja.

test("si el boletín ya no vale, la fase se busca por (OF, fase) y se cierra la ENCONTRADA", async () => {
  maquinaDeFase.mockImplementation(async (id) => (id === "999" ? "U-A-OTEC" : null));
  buscarIdBoletin.mockResolvedValue("999");
  estadoDeFase.mockResolvedValue(2); // interrumpida

  const r = await cerrar({ idBoletin: "111", of: "0217539", fase: "5" });

  expect(r).toEqual({ ok: true, yaEstaba: false, idBoletin: "999" });
  expect(buscarIdBoletin).toHaveBeenCalledWith("0217539", "5");
  // Se lee el estado del boletín BUENO, no del que traía el navegador.
  expect(estadoDeFase).toHaveBeenCalledWith("999");
  expect(moverFase).toHaveBeenCalledWith(expect.objectContaining({ idBoletin: "999" }));
});

test("si tampoco está por (OF, fase), no se inventa nada", async () => {
  maquinaDeFase.mockResolvedValue(null);
  buscarIdBoletin.mockResolvedValue(null);
  expect((await cerrar({ idBoletin: "111", of: "0217539", fase: "5" })).ok).toBe(false);
  expect(moverFase).not.toHaveBeenCalled();
});

test("la fase rebuscada también tiene que ser de la oficina", async () => {
  // Rebuscar no puede ser una puerta de atrás para cerrar trabajo del taller.
  maquinaDeFase.mockImplementation(async (id) => (id === "999" ? "P-COST" : null));
  buscarIdBoletin.mockResolvedValue("999");
  const r = await cerrar({ idBoletin: "111", of: "0217539", fase: "5" });
  expect(r).toEqual({ ok: false, status: 403, error: "Esa fase es de P-COST, que no es trabajo de oficina" });
  expect(moverFase).not.toHaveBeenCalled();
});

test("con el boletín bueno no se rebusca nada", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(0);
  expect((await cerrar({ of: "0217539", fase: "5" })).ok).toBe(true);
  expect(buscarIdBoletin).not.toHaveBeenCalled();
});

// ── Lo que SÍ se escribe ────────────────────────────────────────────────────

test("camino feliz: se escribe el movimiento a 3, a tu nombre y con la fecha que se pasa", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(2);
  const cuando = new Date("2026-09-16T09:00:00.000Z");

  expect(await cerrar({ cuando })).toEqual({ ok: true, yaEstaba: false, idBoletin: "456" });
  expect(moverFase).toHaveBeenCalledTimes(1);
  expect(moverFase).toHaveBeenCalledWith({
    idBoletin: "456",
    estado: 3, // finalizada
    operarioRps: "195", // el código de RPS, no el id del tablero
    cuando,
  });
});

test("los tres estados vivos se pueden finalizar: cargada, iniciada e interrumpida", async () => {
  maquinaDeFase.mockResolvedValue("U-A-OTEC"); // las urgencias también son de OT
  for (const estado of [0, 1, 2]) {
    moverFase.mockClear();
    estadoDeFase.mockResolvedValue(estado);
    expect((await cerrar()).ok).toBe(true);
    expect(moverFase).toHaveBeenCalledTimes(1);
  }
});

test("si OLANET falla al escribir, el fallo SALE: no se contesta un ok falso", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(2);
  moverFase.mockRejectedValue(new Error("transacción caída"));
  // Quien llama lo convierte en 503; lo que aquí no puede pasar es tragárselo.
  await expect(cerrar()).rejects.toThrow("transacción caída");
});

test("el modo del fichaje NO se mira aquí: el gate es de las rutas", async () => {
  // Contrato a propósito, documentado en `finalizar-fase.ts`: quien decide que
  // en sombra/ensayo no se escribe es cada ruta, ANTES de llamar. Si algún día
  // se metiera el modo aquí dentro, `POST /api/fases/cerrar-of` trataría el
  // "no se escribe por el modo" como un fallo de OLANET, y ahí no lo es.
  // (Que las rutas lo respetan se prueba en api-fases.test.ts y en
  // api-fases-cerrar-of.test.ts.)
  vi.stubEnv("FICHAJE_OLANET", "sombra");
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(2);
  expect((await cerrar()).ok).toBe(true);
  expect(moverFase).toHaveBeenCalledTimes(1);
});
