import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activarCacheEnDisco, cacheConDisco, rutaCacheDisco } from "../server/cache-disco";

// Métricas pierde lo que guarda de RPS en cada actualización de la web. Con el
// respaldo en disco, la primera vez tras arrancar se enseña lo guardado
// mientras RPS contesta por detrás (16/11/2026).

const DISCO = { clave: "2026", maxEdadMs: 24 * 3_600_000 };
let carpeta: string;
const rutaDeAntes = process.env.COORDINA_DB_PATH;

/** Una consulta que contesta cuando se le dice. */
function consultaPendiente<T>() {
  let contestar!: (v: T) => void;
  let fallar!: (e: Error) => void;
  const promesa = new Promise<T>((ok, ko) => { contestar = ok; fallar = ko; });
  return { promesa, contestar, fallar };
}

/** Espera a que el fichero aparezca: se guarda por detrás. */
async function hastaQueExista(ruta: string) {
  for (let i = 0; i < 100; i++) {
    if (await stat(ruta).then(() => true, () => false)) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`no apareció ${ruta}`);
}

beforeEach(async () => {
  carpeta = await mkdtemp(path.join(os.tmpdir(), "coordina-cache-"));
  process.env.COORDINA_DB_PATH = path.join(carpeta, "coordina.db");
  globalThis.__coordinaCacheEnDisco = undefined;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  globalThis.__coordinaCacheEnDisco = undefined;
  if (rutaDeAntes === undefined) delete process.env.COORDINA_DB_PATH;
  else process.env.COORDINA_DB_PATH = rutaDeAntes;
  await rm(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 });
});

describe("cacheConDisco", () => {
  it("tras reiniciar sirve lo del disco sin esperar a RPS, y luego lo nuevo", async () => {
    activarCacheEnDisco();
    const antes = cacheConDisco<string[]>("prueba", 60_000);
    await antes("ayer", async () => ["viejo"], DISCO);
    await hastaQueExista(rutaCacheDisco("prueba"));

    // Otro arranque: memoria vacía, RPS tardando.
    const despues = cacheConDisco<string[]>("prueba", 60_000);
    const rps = consultaPendiente<string[]>();
    await expect(despues("hoy", () => rps.promesa, DISCO)).resolves.toEqual(["viejo"]);

    const actualizacion = despues("hoy", () => rps.promesa, { ...DISCO, esperarRps: true });
    rps.contestar(["nuevo"]);
    await actualizacion;
    await expect(despues("hoy", () => Promise.reject(new Error("no debería pedirse")), DISCO)).resolves.toEqual(["nuevo"]);
  });

  it("quien pide esperar a RPS no recibe lo del disco", async () => {
    activarCacheEnDisco();
    await cacheConDisco<string[]>("prueba", 60_000)("k", async () => ["viejo"], DISCO);
    await hastaQueExista(rutaCacheDisco("prueba"));

    const despues = cacheConDisco<string[]>("prueba", 60_000);
    const rps = consultaPendiente<string[]>();
    const esperando = despues("k", () => rps.promesa, { ...DISCO, esperarRps: true });
    // Los demás, mientras tanto, sí ven lo del disco.
    await expect(despues("k", () => rps.promesa, DISCO)).resolves.toEqual(["viejo"]);
    rps.contestar(["nuevo"]);
    await expect(esperando).resolves.toEqual(["nuevo"]);
  });

  it("lo guardado con otra clave o demasiado viejo no vale", async () => {
    activarCacheEnDisco();
    await cacheConDisco<string[]>("prueba", 60_000)("k", async () => ["viejo"], DISCO);
    await hastaQueExista(rutaCacheDisco("prueba"));

    const otraClave = cacheConDisco<string[]>("prueba", 60_000);
    await expect(otraClave("k", async () => ["rps"], { ...DISCO, clave: "2027" })).resolves.toEqual(["rps"]);

    const viejo = cacheConDisco<string[]>("prueba", 60_000);
    vi.useFakeTimers({ now: Date.now() + 25 * 3_600_000, toFake: ["Date"] });
    try {
      await expect(viejo("k", async () => ["rps"], DISCO)).resolves.toEqual(["rps"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin activar (tests, scripts) ni lee ni deja fichero", async () => {
    await cacheConDisco<string[]>("prueba", 60_000)("k", async () => ["rps"], DISCO);
    await new Promise((r) => setTimeout(r, 50));
    await expect(stat(rutaCacheDisco("prueba"))).rejects.toThrow();
  });

  it("si RPS falla y no hay disco, el error llega y la siguiente vez se reintenta", async () => {
    activarCacheEnDisco();
    const pedir = cacheConDisco<string[]>("prueba", 60_000);
    await expect(pedir("k", () => Promise.reject(new Error("RPS caído")), DISCO)).rejects.toThrow("RPS caído");
    await expect(pedir("k", async () => ["rps"], DISCO)).resolves.toEqual(["rps"]);
  });

  it("dos que piden lo mismo a la vez comparten la consulta", async () => {
    const pedir = cacheConDisco<string[]>("prueba", 60_000);
    const consultar = vi.fn(async () => ["rps"]);
    await Promise.all([pedir("k", consultar), pedir("k", consultar)]);
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("sirve la memoria caducada y comparte una sola renovación aunque vuelva a pasar la vigencia", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const pedir = cacheConDisco<string>("prueba", 60_000);
    await pedir("k", async () => "viejo", DISCO);
    vi.setSystemTime(Date.now() + 60_000);

    const rps = consultaPendiente<string>();
    const consultar = vi.fn(() => rps.promesa);
    await expect(pedir("k", consultar, DISCO)).resolves.toBe("viejo");
    vi.setSystemTime(Date.now() + 60_000);
    await expect(pedir("k", consultar, DISCO)).resolves.toBe("viejo");
    const esperando = pedir("k", consultar, { ...DISCO, esperarRps: true });
    const sinDisco = pedir("k", consultar);
    expect(consultar).toHaveBeenCalledTimes(1);
    rps.contestar("nuevo");
    await expect(esperando).resolves.toBe("nuevo");
    await expect(sinDisco).resolves.toBe("nuevo");
    await expect(pedir("k", consultar, DISCO)).resolves.toBe("nuevo");
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("si falla una renovación, registra el fallo, conserva lo viejo y permite reintentar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const pedir = cacheConDisco<string>("prueba", 60_000);
    await pedir("k", async () => "viejo", DISCO);
    vi.setSystemTime(Date.now() + 60_000);
    const rps = consultaPendiente<string>();
    await expect(pedir("k", () => rps.promesa, DISCO)).resolves.toBe("viejo");
    rps.fallar(new Error("RPS caído"));
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("no se pudo actualizar"), "RPS caído"));

    const siguiente = consultaPendiente<string>();
    const consultar = vi.fn(() => siguiente.promesa);
    await expect(pedir("k", consultar, DISCO)).resolves.toBe("viejo");
    const esperando = pedir("k", consultar, { ...DISCO, esperarRps: true });
    siguiente.contestar("nuevo");
    await expect(esperando).resolves.toBe("nuevo");
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("una renovación forzada consulta aun con datos vigentes y los deja disponibles durante la espera", async () => {
    const pedir = cacheConDisco<string>("prueba", 60_000);
    await pedir("k", async () => "viejo", DISCO);
    const rps = consultaPendiente<string>();
    const consultar = vi.fn(() => rps.promesa);
    const forzada = pedir("k", consultar, { ...DISCO, forzarRps: true });
    await expect(pedir("k", consultar, DISCO)).resolves.toBe("viejo");
    const segunda = pedir("k", consultar, { ...DISCO, forzarRps: true });
    const esperando = pedir("k", consultar, { ...DISCO, esperarRps: true });
    rps.contestar("nuevo");
    await expect(Promise.all([forzada, segunda, esperando])).resolves.toEqual(["nuevo", "nuevo", "nuevo"]);
    expect(consultar).toHaveBeenCalledTimes(1);
  });
});
