import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { leerPdf, planteamientosDe } from "../server/planteamiento-pdf";

const A4: [number, number] = [595.28, 841.89];
const A5: [number, number] = [419.53, 595.28];

async function pdf(paginas: Array<[number, number]>, adjunto?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of paginas) doc.addPage(p);
  if (adjunto) await doc.attach(Buffer.from("{}"), adjunto, { mimeType: "application/json" });
  return doc.save();
}

let raiz: string;
let entrada: string;
let archivo: string;

beforeAll(async () => {
  raiz = mkdtempSync(path.join(tmpdir(), "coordina-planteamientos-"));
  entrada = path.join(raiz, "Planteamientos");
  archivo = path.join(raiz, "ARCHIVO", "{YYYY}");
  mkdirSync(entrada, { recursive: true });
  mkdirSync(path.join(raiz, "ARCHIVO", "2026"), { recursive: true });
  writeFileSync(path.join(entrada, "AR2605016-10.pdf"), await pdf([A4]));
  writeFileSync(path.join(entrada, "AR2605016-1.pdf"), await pdf([A4], "AR2605016.toldos.json"));
  writeFileSync(path.join(entrada, "AR2605099-10.pdf"), await pdf([A4, A5]));
  // Ya procesado por RPS: solo está en el archivo, con puntos.
  writeFileSync(path.join(raiz, "ARCHIVO", "2026", "AR.26.05020-10.pdf"), await pdf([A4, A4]));
  // El mismo sufijo en los dos sitios: manda el de Planteamientos.
  writeFileSync(path.join(raiz, "ARCHIVO", "2026", "AR.26.05016-10.pdf"), await pdf([A4, A4, A4]));
});

afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe("leer un PDF", () => {
  it("cuenta páginas, mira A4 y reconoce los de toldos-testar", async () => {
    expect(await leerPdf(await pdf([A4, A4]))).toEqual({ paginas: 2, todoA4: true, deToldosTestar: false });
    expect((await leerPdf(await pdf([A4, A5]))).todoA4).toBe(false);
    expect((await leerPdf(await pdf([A4], "X.remolques.json"))).deToldosTestar).toBe(true);
  });
});

describe("los planteamientos de un pedido", () => {
  it("de Planteamientos, sin los de toldos-testar", async () => {
    const r = await planteamientosDe("AR.26.05016", { entrada, archivo });
    expect(r.aviso).toBeNull();
    expect(r.ficheros.map((f) => [f.nombre, f.origen, f.paginas])).toEqual([["AR2605016-10.pdf", "planteamientos", 1]]);
  });

  it("del archivo de RPS cuando ya se procesó", async () => {
    const r = await planteamientosDe("AR.26.05020", { entrada, archivo });
    expect(r.ficheros.map((f) => [f.nombre, f.origen, f.todoA4])).toEqual([["AR.26.05020-10.pdf", "archivo", true]]);
  });

  it("marca el que lleva páginas que no son A4", async () => {
    const r = await planteamientosDe("AR.26.05099", { entrada, archivo });
    expect(r.ficheros[0].todoA4).toBe(false);
  });

  it("sin planteamiento, lista vacía y sin aviso", async () => {
    expect(await planteamientosDe("AR.26.00001", { entrada, archivo })).toEqual({ ficheros: [], aviso: null });
  });

  it("carpeta Planteamientos que no se puede leer: lo dice", async () => {
    const r = await planteamientosDe("AR.26.05016", { entrada: path.join(raiz, "no-existe"), archivo });
    expect(r.aviso).toMatch(/Planteamientos/);
  });

  it("sin carpeta configurada: lo dice", async () => {
    const r = await planteamientosDe("AR.26.05016", { entrada: null, archivo: null });
    expect(r.aviso).toMatch(/configurada/);
  });
});
