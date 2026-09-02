import { afterEach, beforeEach, expect, test, vi } from "vitest";

// OLANET se simula: estos tests fijan las REGLAS de la ruta, que es la que
// escribe en el sistema de la fábrica. Lo que se comprueba es que no escriba
// cuando no debe.
const maquinaDeFase = vi.fn<(id: string) => Promise<string | null>>();
const estadoDeFase = vi.fn<(id: string) => Promise<number | null>>();
const moverFase = vi.fn<(o: unknown) => Promise<void>>();
const fasesDeOFs = vi.fn<(ofs: readonly string[]) => Promise<unknown[]>>();
const buscarIdBoletin = vi.fn<(of: string, fase: string) => Promise<string | null>>();

vi.mock("@/lib/server/olanet", () => ({
  maquinaDeFase: (id: string) => maquinaDeFase(id),
  estadoDeFase: (id: string) => estadoDeFase(id),
  moverFase: (o: unknown) => moverFase(o),
  fasesDeOFs: (ofs: readonly string[]) => fasesDeOFs(ofs),
  buscarIdBoletin: (of: string, fase: string) => buscarIdBoletin(of, fase),
}));
vi.mock("@/lib/server/operarios", () => ({
  COD_RPS_POR_OPERARIO: { ivan: "195", jaime: "120", sinCodigo: undefined },
}));

let ruta: typeof import("../../app/api/fases/route");

beforeEach(async () => {
  vi.clearAllMocks();
  moverFase.mockResolvedValue(undefined);
  ruta = await import("../../app/api/fases/route");
});
afterEach(() => vi.resetModules());

const post = (body: unknown) =>
  ruta.POST(new Request("http://x/api/fases", { method: "POST", body: JSON.stringify(body) }));
const get = (q: string) => ruta.GET(new Request(`http://x/api/fases?${q}`));

// ── GET ────────────────────────────────────────────────────────────────────

test("GET sin OF devuelve lista vacía y no consulta nada", async () => {
  const res = await get("");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ fases: [] });
  expect(fasesDeOFs).not.toHaveBeenCalled();
});

test("GET rechaza códigos de OF que no son números", async () => {
  // La lista entra en la consulta: aquí se cierra la puerta.
  expect((await get("ofs=0227619,'; DROP--")).status).toBe(400);
  expect(fasesDeOFs).not.toHaveBeenCalled();
});

test("GET pasa las OF ya separadas", async () => {
  fasesDeOFs.mockResolvedValue([]);
  await get("ofs=0227619,0231543");
  expect(fasesDeOFs).toHaveBeenCalledWith(["0227619", "0231543"]);
});

test("OLANET caído es 503, no un 500 mudo", async () => {
  fasesDeOFs.mockRejectedValue(new Error("sin VPN"));
  expect((await get("ofs=0227619")).status).toBe(503);
});

// ── POST: lo que NO se puede escribir ──────────────────────────────────────

test("una fase que NO es de OT no se toca, aunque la pidan a mano", async () => {
  // La regla vive en el servidor y no solo en el botón: esto escribe en el
  // sistema de la fábrica.
  maquinaDeFase.mockResolvedValue("A-MONT");
  const res = await post({ idBoletin: "123", operarioId: "ivan" });
  expect(res.status).toBe(403);
  expect(moverFase).not.toHaveBeenCalled();
});

test("una fase ELIMINADA en OLANET no se resucita", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(4);
  expect((await post({ idBoletin: "123", operarioId: "ivan" })).status).toBe(409);
  expect(moverFase).not.toHaveBeenCalled();
});

test("un estado desconocido tampoco se toca", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(9);
  expect((await post({ idBoletin: "123", operarioId: "ivan" })).status).toBe(409);
  expect(moverFase).not.toHaveBeenCalled();
});

test("una fase que ya no existe es 404", async () => {
  maquinaDeFase.mockResolvedValue(null);
  expect((await post({ idBoletin: "123", operarioId: "ivan" })).status).toBe(404);
  expect(moverFase).not.toHaveBeenCalled();
});

test("sin código de RPS no se firma el movimiento a nombre de nadie", async () => {
  const res = await post({ idBoletin: "123", operarioId: "sinCodigo" });
  expect(res.status).toBe(400);
  expect(moverFase).not.toHaveBeenCalled();
  // Y ni siquiera se consulta OLANET: se corta antes.
  expect(maquinaDeFase).not.toHaveBeenCalled();
});

test("un idBoletin que no es un número se rechaza", async () => {
  expect((await post({ idBoletin: "1 OR 1=1", operarioId: "ivan" })).status).toBe(400);
  expect((await post({ idBoletin: 123, operarioId: "ivan" })).status).toBe(400);
  expect(moverFase).not.toHaveBeenCalled();
});

test("un cuerpo que no es objeto es 400 y no un 500", async () => {
  const res = await ruta.POST(new Request("http://x/api/fases", { method: "POST", body: "null" }));
  expect(res.status).toBe(400);
});

// ── POST: lo que SÍ escribe ────────────────────────────────────────────────

test("una fase de OT interrumpida se finaliza, con la fecha de hoy y a tu nombre", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(2);
  const antes = Date.now();
  const res = await post({ idBoletin: "456", operarioId: "ivan" });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, yaEstaba: false });
  expect(moverFase).toHaveBeenCalledTimes(1);
  const arg = moverFase.mock.calls[0][0] as {
    idBoletin: string; estado: number; operarioRps: string; cuando: Date;
  };
  expect(arg.idBoletin).toBe("456");
  expect(arg.estado).toBe(3); // finalizada
  expect(arg.operarioRps).toBe("195"); // el código de Iván en RPS, no su id del tablero
  // Con la fecha de HOY, decidido con Iván: retrodatarla metería en el
  // histórico un apunte que nunca ocurrió ese día.
  expect(arg.cuando.getTime()).toBeGreaterThanOrEqual(antes);
});

test("las urgencias también son de OT", async () => {
  maquinaDeFase.mockResolvedValue("U-A-OTEC");
  estadoDeFase.mockResolvedValue(0);
  expect((await post({ idBoletin: "789", operarioId: "jaime" })).status).toBe(200);
  expect(moverFase).toHaveBeenCalledTimes(1);
});

test("si alguien se te adelantó, NO se escribe otra vez", async () => {
  // Dos personas con la misma ficha abierta. La segunda no debe dejar un
  // movimiento duplicado en el histórico del taller.
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(3);
  const res = await post({ idBoletin: "456", operarioId: "ivan" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, yaEstaba: true });
  expect(moverFase).not.toHaveBeenCalled();
});

test("si OLANET falla al escribir, se dice: 503 y no un ok falso", async () => {
  maquinaDeFase.mockResolvedValue("A-OTEC");
  estadoDeFase.mockResolvedValue(2);
  moverFase.mockRejectedValue(new Error("transacción caída"));
  expect((await post({ idBoletin: "456", operarioId: "ivan" })).status).toBe(503);
});

// ── El boletín se queda viejo ──────────────────────────────────────────────
// A Alberto le pasó con AR.25.02771: la fase 5 de la OF 0217539 (U-A-OTEC)
// existía y se podía fichar —fichar y parar dejaron sus movimientos, y ese
// camino resuelve la fase por (OF, fase)—, pero finalizarla desde la ficha
// decía "Esa fase ya no existe en OLANET", que va por IdBoletin a pelo. Tuvo
// que cerrarla con la herramienta vieja.
//
// (Orden, Fase) es único en scg_Fases —comprobado sobre la BD entera: cero
// pares repetidos—, así que volver a buscar por ahí es exacto y no puede
// cerrar una fase que no sea.

test("si el boletín ya no vale, la fase se busca por (OF, fase)", async () => {
  maquinaDeFase.mockImplementation(async (id) => (id === "999" ? "U-A-OTEC" : null));
  buscarIdBoletin.mockResolvedValue("999");
  estadoDeFase.mockResolvedValue(2); // interrumpida

  const res = await post({ idBoletin: "111", operarioId: "ivan", of: "0217539", fase: "5" });

  expect(res.status).toBe(200);
  expect(buscarIdBoletin).toHaveBeenCalledWith("0217539", "5");
  // Se cierra la fase QUE SE ENCONTRÓ, no la que traía el navegador.
  expect(moverFase).toHaveBeenCalledWith(expect.objectContaining({ idBoletin: "999" }));
});

test("sin OF y fase que rebuscar, sigue diciendo que no existe", async () => {
  maquinaDeFase.mockResolvedValue(null);
  const res = await post({ idBoletin: "111", operarioId: "ivan" });
  expect(res.status).toBe(404);
  expect(buscarIdBoletin).not.toHaveBeenCalled();
  expect(moverFase).not.toHaveBeenCalled();
});

test("si tampoco está por (OF, fase), no se inventa nada", async () => {
  maquinaDeFase.mockResolvedValue(null);
  buscarIdBoletin.mockResolvedValue(null);
  const res = await post({ idBoletin: "111", operarioId: "ivan", of: "0217539", fase: "5" });
  expect(res.status).toBe(404);
  expect(moverFase).not.toHaveBeenCalled();
});

test("la fase rebuscada también tiene que ser de la oficina", async () => {
  // Rebuscar no puede ser una puerta de atrás para cerrar trabajo del taller.
  maquinaDeFase.mockImplementation(async (id) => (id === "999" ? "P-COST" : null));
  buscarIdBoletin.mockResolvedValue("999");
  const res = await post({ idBoletin: "111", operarioId: "ivan", of: "0217539", fase: "5" });
  expect(res.status).toBe(403);
  expect(moverFase).not.toHaveBeenCalled();
});
