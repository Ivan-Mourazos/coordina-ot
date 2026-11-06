import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextResponse } from "next/server";

const { sesion, listar, elegir, configuracion } = vi.hoisted(() => ({
  sesion: vi.fn(), listar: vi.fn(), elegir: vi.fn(), configuracion: vi.fn(),
}));
vi.mock("../server/sesion", () => ({ soloConSesion: sesion }));
vi.mock("../server/cad", () => ({ configCad: configuracion, buscadorCad: () => ({ listar, elegir }) }));
import { GET } from "../../app/api/cad/route";

const get = (query: string) => GET(new Request(`http://local/api/cad?${query}`));
beforeEach(() => {
  vi.clearAllMocks();
  sesion.mockReturnValue(null);
  configuracion.mockReturnValue({ roots: ["/carpeta/falsa"] });
  listar.mockResolvedValue([]);
  elegir.mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

test("exige sesión antes de consultar configuración o disco", async () => {
  sesion.mockReturnValue(NextResponse.json({ error: "Inicia sesión" }, { status: 401 }));
  expect((await get("pedido=AR.26.05333")).status).toBe(401);
  expect(configuracion).not.toHaveBeenCalled();
  expect(listar).not.toHaveBeenCalled();
});

test("rechaza códigos inválidos sin consultar el disco", async () => {
  expect((await get("pedido=..%2Fetc")).status).toBe(400);
  expect((await get("")).status).toBe(400);
  expect(listar).not.toHaveBeenCalled();
});

test("sin raíces indica que no debe pintarse el botón", async () => {
  configuracion.mockReturnValue({ roots: [] });
  expect(await (await get("pedido=AR.26.05333")).json()).toEqual({ configurado: false, ficheros: [] });
  expect(listar).not.toHaveBeenCalled();
});

test("lista los DWG sin caché HTTP ni rutas aportadas por el navegador", async () => {
  listar.mockResolvedValue([{ id: "un-id", nombre: "AR2605333.dwg", subcarpeta: "2026", modificado: "2026-11-06", url: "tgm-pedidos://open?kind=cad&path=falsa" }]);
  const res = await get("pedido=AR.26.05333&path=..%2Fsecreto");
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  expect(await res.json()).toMatchObject({ configurado: true, ficheros: [{ nombre: "AR2605333.dwg" }] });
  expect(listar).toHaveBeenCalledWith("AR.26.05333");
});

test("un ID fuera del listado devuelve 404; el autorizado devuelve su enlace", async () => {
  expect((await get("pedido=AR.26.05333&id=..%2Fsecreto.dwg")).status).toBe(404);
  expect(elegir).toHaveBeenCalledWith("AR.26.05333", "../secreto.dwg");
  elegir.mockResolvedValue({ id: "valido", url: "tgm-pedidos://open?kind=cad&path=falsa" });
  expect(await (await get("pedido=AR.26.05333&id=valido")).json()).toMatchObject({ fichero: { id: "valido" } });
});

test("un error del share devuelve 503 sin filtrar rutas del servidor", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  listar.mockRejectedValue(new Error("EACCES /ruta/privada"));
  const res = await get("pedido=AR.26.05333");
  expect(res.status).toBe(503);
  expect(JSON.stringify(await res.json())).not.toContain("/ruta/privada");
});
