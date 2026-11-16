import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import { guardarInstantanea, leerInstantanea } from "../server/historial-instantanea";

// La lista del Historial tarda minutos en construirse contra RPS y vivía solo
// en memoria: cada reinicio (cada actualización de la web) la perdía, y el
// Historial, el buscador y la consulta pública quedaban sin ella hasta que se
// rehacía. Ahora se guarda en disco al terminar cada construcción y se
// recupera al arrancar. Lo que se recupera tiene que ser LO MISMO que se
// guardó, y un fichero a medias, viejo o de otras secciones no vale.

const SECCIONES = ["ot", "diseno", "impresion"] as const;
const HORA = 3_600_000;

const fila = (pedido: string, extra: Partial<BaseHistorial> = {}): BaseHistorial => ({
  pedido,
  fechaPedido: Date.UTC(2026, 9, 1),
  nOf: 2,
  fechaEntrega: Date.UTC(2026, 9, 20),
  pendienteEntrega: false,
  trabajoAbierto: false,
  fechaEntregado: null,
  tieneSeccion: true,
  pendienteSeccion: false,
  pendienteTotal: true,
  finalizada: Date.UTC(2026, 9, 15, 10, 30),
  ...extra,
});

function lista(at: number): IndiceHistorial {
  return {
    at,
    base: {
      ot: [fila("AR.26.00001"), fila("SA.26.00002", { fechaPedido: null, finalizada: null, pendienteEntrega: true, trabajoAbierto: true })],
      diseno: [fila("AR.26.00001", { tieneSeccion: false, pendienteSeccion: true })],
      impresion: [],
    },
    info: new Map([
      ["AR.26.00001", { cliente: "MAHOU, S.A.", negocio: "BAR «O PEÑASCO»", ciudadEntrega: "Arzúa", familias: ["Toldo", "Rotulación"], ordenes: "0233185 0233186", textos: "MAHOU, S.A.\nTOLDO DE FACHADA Ñ\nLONA 3×2" }],
      ["SA.26.00002", { cliente: null, negocio: null, ciudadEntrega: null, familias: [], ordenes: "", textos: "" }],
    ]),
    personas: new Map([["AR.26.00001", new Set(["146", "88"])]]),
  };
}

let carpeta: string;
let ruta: string;
beforeEach(() => {
  carpeta = mkdtempSync(path.join(os.tmpdir(), "coordina-instantanea-"));
  ruta = path.join(carpeta, "cache", "historial-lista.ndjson.gz");
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

describe("la lista del Historial guardada en disco", () => {
  it("se recupera igual que se guardó", async () => {
    const at = Date.now() - 10 * 60_000;
    const original = lista(at);
    await guardarInstantanea(original, ruta);
    const recuperada = await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA });
    expect(recuperada).toEqual(original);
    expect(recuperada?.at).toBe(at);
  });

  it("crea la carpeta y no deja el temporal detrás", async () => {
    await guardarInstantanea(lista(Date.now()), ruta);
    expect(readdirSync(path.dirname(ruta))).toEqual([path.basename(ruta)]);
  });

  it("guardar encima sustituye la anterior", async () => {
    await guardarInstantanea(lista(Date.now() - HORA), ruta);
    const nueva = lista(Date.now());
    nueva.base.ot = [fila("AR.26.09999")];
    await guardarInstantanea(nueva, ruta);
    const recuperada = await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA });
    expect(recuperada?.base.ot.map((b) => b.pedido)).toEqual(["AR.26.09999"]);
  });

  it("sin fichero no hay lista (primer arranque)", async () => {
    expect(await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA })).toBeNull();
  });

  it("una demasiado vieja no vale: el servidor estuvo parado y diría lo de entonces", async () => {
    await guardarInstantanea(lista(Date.now() - 7 * HORA), ruta);
    expect(await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA })).toBeNull();
  });

  it("una con fecha del futuro tampoco (reloj cambiado)", async () => {
    await guardarInstantanea(lista(Date.now() + HORA), ruta);
    expect(await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA })).toBeNull();
  });

  it("si se guardó con otras secciones, no vale (sección nueva tras actualizar)", async () => {
    const vieja = lista(Date.now());
    delete (vieja.base as Partial<IndiceHistorial["base"]>).impresion;
    await guardarInstantanea(vieja, ruta);
    expect(await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA })).toBeNull();
  });

  it("un fichero cortado a medias no vale", async () => {
    await guardarInstantanea(lista(Date.now()), ruta);
    // El mismo contenido sin la última línea, que es la que da fe de que
    // se escribió entero.
    const cabecera = JSON.stringify({ v: 1, at: Date.now(), secciones: SECCIONES });
    const unaFila = JSON.stringify(["b", "ot", "AR.26.00001", null, 1, null, 0, 0, null, 1, 0, 0, null]);
    writeFileSync(ruta, gzipSync(`${cabecera}\n${unaFila}\n`));
    expect(await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA })).toBeNull();
  });

  it("un fichero que no es lo que esperamos no vale, y no revienta", async () => {
    await guardarInstantanea(lista(Date.now()), ruta);
    writeFileSync(ruta, "esto no es un gzip");
    expect(await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA })).toBeNull();
    writeFileSync(ruta, gzipSync("ni esto json\n"));
    expect(await leerInstantanea(ruta, { secciones: SECCIONES, maxEdadMs: 6 * HORA })).toBeNull();
  });
});
