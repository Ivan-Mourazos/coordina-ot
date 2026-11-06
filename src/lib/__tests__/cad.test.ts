import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compactoPedido, configCad, crearBuscadorCad, enlaceCad, traducirRutaCad, type ConfigCad } from "../server/cad";

let raiz: string;
let config: ConfigCad;
const pedido = "AR.26.05333";
const cliente = "\\\\toldosgomez.local\\DFS_POL\\oftecnica";

beforeEach(async () => {
  raiz = await mkdtemp(path.join(tmpdir(), "coordina-cad-"));
  config = { roots: [raiz], clientRoots: [cliente], urlTemplate: "tgm-pedidos://open?kind={kind}&path={path}" };
});
afterEach(async () => {
  const absoluta = path.resolve(raiz);
  if (path.dirname(absoluta) !== path.resolve(tmpdir()) || !path.basename(absoluta).startsWith("coordina-cad-")) throw new Error("Temporal fuera de la carpeta de pruebas");
  await rm(absoluta, { recursive: true, force: true });
});

async function fichero(relativa: string) {
  const ruta = path.join(raiz, relativa);
  await mkdir(path.dirname(ruta), { recursive: true });
  await writeFile(ruta, "DWG falso");
  return ruta;
}

describe("códigos y configuración CAD", () => {
  it("compacta el código de las tres delegaciones y rechaza rutas", () => {
    expect(compactoPedido(pedido)).toBe("AR2605333");
    expect(compactoPedido("SA.25.00001")).toBe("SA2500001");
    expect(compactoPedido("BE.26.00001")).toBe("BE2600001");
    for (const invalido of ["../AR.26.05333", "AR2605333", "AR.26.05333/..", "XX.26.05333", ""]) {
      expect(() => compactoPedido(invalido)).toThrow("Pedido no válido");
    }
  });

  it("lee listas separadas por punto y coma y usa la plantilla por defecto", () => {
    expect(configCad({ CAD_DWG_ROOTS: ' /mnt/a ; "/mnt/b" ', CAD_CLIENT_ROOTS: `${cliente};Z:\\CAD` })).toEqual({
      roots: ["/mnt/a", "/mnt/b"], clientRoots: [cliente, "Z:\\CAD"], urlTemplate: config.urlTemplate,
    });
    expect(configCad({}).roots).toEqual([]);
  });

  it("rechaza listas desparejadas, raíces relativas y protocolos distintos", () => {
    expect(() => crearBuscadorCad({ ...config, clientRoots: [cliente, cliente] })).toThrow("mismo número");
    expect(() => crearBuscadorCad({ ...config, roots: ["relativa"] })).toThrow("absolutas");
    expect(() => crearBuscadorCad({ ...config, urlTemplate: "javascript:{path}" })).toThrow("tgm-pedidos");
  });
});

describe("traducción al protocolo instalado en los PC", () => {
  it("traduce Linux a UNC sin confundir raíces con el mismo prefijo", () => {
    const cfg = { ...config, roots: ["/mnt/oftecnica", "/mnt/otra"], clientRoots: [cliente, "Z:\\Otra"] };
    expect(traducirRutaCad("/mnt/oftecnica/2026/TOLDOS/AR2605333 CORTE.dwg", cfg)).toBe(`${cliente}\\2026\\TOLDOS\\AR2605333 CORTE.dwg`);
    expect(traducirRutaCad("/mnt/otra/2026/AR2605333.dwg", cfg)).toBe("Z:\\Otra\\2026\\AR2605333.dwg");
    expect(() => traducirRutaCad("/mnt/oftecnica-fuera/AR2605333.dwg", cfg)).toThrow("fuera");
    expect(() => traducirRutaCad("/mnt/oftecnica/../secreto.dwg", cfg)).toThrow("no permitida");
    expect(() => traducirRutaCad("/mnt/oftecnica/AR2605333.dwg", { ...cfg, clientRoots: [] })).toThrow("CAD_CLIENT_ROOTS");
  });

  it("traduce UNC sin distinguir mayúsculas y permite omitir su equivalente", () => {
    const cfg = { ...config, roots: ["\\\\SERVIDOR\\Oftecnica"], clientRoots: [cliente] };
    expect(traducirRutaCad("\\\\servidor\\oftecnica\\2026\\AR2605333.dwg", cfg)).toBe(`${cliente}\\2026\\AR2605333.dwg`);
    expect(traducirRutaCad("\\\\servidor\\oftecnica\\2026\\AR2605333.dwg", { ...cfg, clientRoots: [] })).toBe("\\\\SERVIDOR\\Oftecnica\\2026\\AR2605333.dwg");
  });

  it("codifica espacios, acentos y caracteres reservados como el Historial", () => {
    const url = enlaceCad(path.join(raiz, "2026", "AR2605333 CORTE á&1.dwg"), config);
    expect(url).toBe(`tgm-pedidos://open?kind=cad&path=${encodeURIComponent(`${cliente}\\2026\\AR2605333 CORTE á&1.dwg`)}`);
    expect(new URL(url).searchParams.get("path")).toContain("AR2605333 CORTE á&1.dwg");
  });
});

describe("búsqueda de DWG con disco temporal", () => {
  it("busca recursivamente el año, por prefijo sin mayúsculas, y ordena números", async () => {
    await fichero("2026/AR2605333.dwg");
    await fichero("2026/TOLDOS/ar2605333-10.DWG");
    await fichero("2026/TOLDOS/AR2605333-1.dwg");
    await fichero("2026/TOLDOS/CORTES/AR2605333 CORTE.dwg");
    await fichero("2025/AR2605333-otro.dwg");
    await fichero("AR2605333-raiz.dwg");
    await fichero("2026/AR2605334.dwg");
    const dwg = await crearBuscadorCad(config).listar(pedido);
    expect(dwg).toHaveLength(4);
    expect(dwg.find((d) => d.nombre.endsWith("CORTE.dwg"))?.subcarpeta).toBe("2026/TOLDOS/CORTES");
    expect(dwg.findIndex((d) => d.nombre.endsWith("-1.dwg"))).toBeLessThan(dwg.findIndex((d) => d.nombre.endsWith("-10.DWG")));
    expect(dwg.every((d) => /^[a-f0-9]{64}$/.test(d.id) && !Number.isNaN(Date.parse(d.modificado)))).toBe(true);
  });

  it("ignora ficheros temporales, ocultos, bloqueos y copias", async () => {
    for (const nombre of ["~AR2605333.dwg", ".AR2605333.dwg", "AR2605333.bak", "AR2605333.dwl", "AR2605333.dwg.bak", "AR2605333.pdf"]) await fichero(`2026/${nombre}`);
    await fichero("2026/.oculta/AR2605333.dwg");
    await fichero("2026/~temporal/AR2605333.dwg");
    await fichero("2026/AR2605333.dwg");
    expect((await crearBuscadorCad(config).listar(pedido)).map((d) => d.nombre)).toEqual(["AR2605333.dwg"]);
  });

  it("recurre a la raíz solo sin resultados en el año y sin bajar otros niveles", async () => {
    await fichero("2026/AR2600000.dwg");
    await fichero("AR2605333 CORTE.dwg");
    await fichero("OTRA/AR2605333.dwg");
    await fichero("2025/AR2605333.dwg");
    expect(await crearBuscadorCad(config).listar(pedido)).toMatchObject([{ nombre: "AR2605333 CORTE.dwg", subcarpeta: "Raíz de Oficina Técnica" }]);
    expect(await crearBuscadorCad(config).listar("AR.24.00001")).toEqual([]);
  });

  it("busca en todas las raíces del año antes del respaldo y traduce por posición", async () => {
    const segunda = path.join(raiz, "segunda");
    await fichero("AR2605333.dwg");
    await fichero("segunda/2026/AR2605333-1.dwg");
    const dwg = await crearBuscadorCad({ ...config, roots: [raiz, segunda], clientRoots: [cliente, "Z:\\Otra"] }).listar(pedido);
    expect(dwg).toHaveLength(1);
    expect(new URL(dwg[0].url).searchParams.get("path")).toBe("Z:\\Otra\\2026\\AR2605333-1.dwg");
  });

  it("comparte el índice entre pedidos y peticiones hasta que pasan cinco minutos", async () => {
    let reloj = 0;
    await fichero("2026/AR2605333.dwg");
    const buscador = crearBuscadorCad(config, () => reloj);
    const [a, b] = await Promise.all([buscador.listar(pedido), buscador.listar(pedido)]);
    expect(a).toEqual(b);
    await fichero("2026/AR2605334.dwg");
    expect(await buscador.listar("AR.26.05334")).toEqual([]);
    reloj = 5 * 60 * 1000 + 1;
    expect(await buscador.listar("AR.26.05334")).toHaveLength(1);
  });

  it("solo elige IDs del listado de ese pedido y comprueba ficheros borrados", async () => {
    const ruta = await fichero("2026/AR2605333.dwg");
    await fichero("2026/AR2605334.dwg");
    const buscador = crearBuscadorCad(config);
    const [dwg] = await buscador.listar(pedido);
    expect(await buscador.elegir(pedido, dwg.id)).toEqual(dwg);
    expect(await buscador.elegir(pedido, "../../secreto.dwg")).toBeNull();
    expect(await buscador.elegir("AR.26.05334", dwg.id)).toBeNull();
    await rm(ruta);
    expect(await buscador.elegir(pedido, dwg.id)).toBeNull();
    await expect(buscador.listar("../etc")).rejects.toThrow("Pedido no válido");
  });

  it("no sigue junctions a carpetas de fuera de la raíz", async () => {
    const permitida = path.join(raiz, "permitida");
    const fuera = path.join(raiz, "fuera");
    await fichero("permitida/2026/AR2605333.dwg");
    await fichero("fuera/AR2605333 CORTE.dwg");
    await symlink(fuera, path.join(permitida, "2026", "enlace"), process.platform === "win32" ? "junction" : "dir");
    const buscador = crearBuscadorCad({ ...config, roots: [permitida] });
    expect((await buscador.listar(pedido)).map((d) => d.nombre)).toEqual(["AR2605333.dwg"]);
  });
});
