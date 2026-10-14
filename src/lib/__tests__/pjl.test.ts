import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { hostDe, imprimirPorPuerto, trabajoPjl } from "../server/pjl";

const PDF = new TextEncoder().encode("%PDF-1.7 ejemplo");
const T = { nombre: "Planteamiento AR.26.05016", usuario: "CoordinaOT", departamento: { codigo: "66", claveCifrada: "5F9F0E45" } };
const texto = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("cabecera PJL", () => {
  it("lleva el departamento como el driver: código tal cual y clave cifrada en KMSECTIONKEY2", () => {
    const t = texto(trabajoPjl(PDF, T));
    expect(t.startsWith("\x1B%-12345X@PJL JOB\r\n")).toBe(true);
    expect(t).toContain('@PJL SET KMSECTIONNAME = "66"\r\n');
    expect(t).toContain('@PJL SET KMSECTIONKEY2 = "5F9F0E45"\r\n');
    expect(t).toContain("@PJL SET KMCOETYPE = 2\r\n");
    expect(t).toContain('@PJL SET JOBNAME = "Planteamiento AR.26.05016"');
  });

  it("1 copia, una cara, A4, y el PDF detrás de ENTER LANGUAGE", () => {
    const t = texto(trabajoPjl(PDF, T));
    expect(t).toContain("@PJL SET QTY = 1\r\n@PJL SET DUPLEX = OFF\r\n@PJL SET PAPER = A4\r\n@PJL ENTER LANGUAGE = PDF\r\n%PDF-1.7 ejemplo\x1B%-12345X@PJL EOJ");
    expect(t.endsWith("\x1B%-12345X")).toBe(true);
  });

  it("una comilla en el nombre no rompe la cabecera", () => {
    expect(texto(trabajoPjl(PDF, { ...T, nombre: 'A "B"\r\nC' }))).toContain('@PJL SET JOBNAME = "A BC"');
  });

  it("el host sale del ipp:// del .env", () => {
    expect(hostDe("ipp://192.168.4.249/ipp")).toBe("192.168.4.249");
  });
});

class SocketFalso extends EventEmitter {
  escrito: Buffer | null = null;
  setTimeout() { return this; }
  end(d: Uint8Array) { this.escrito = Buffer.from(d); queueMicrotask(() => this.emit("close", false)); return this; }
  destroy() { return this; }
}

describe("envío por el 9100", () => {
  it("conecta al 9100 del host y manda el trabajo entero", async () => {
    const s = new SocketFalso();
    let donde: [number, string] | null = null;
    const r = await imprimirPorPuerto("ipp://192.168.4.249/ipp", PDF, T, (puerto, host) => {
      donde = [puerto, host];
      queueMicrotask(() => s.emit("connect"));
      return s as unknown as Socket;
    });
    expect(donde).toEqual([9100, "192.168.4.249"]);
    expect(r).toEqual({ trabajo: null });
    expect(s.escrito?.equals(Buffer.from(trabajoPjl(PDF, T)))).toBe(true);
  });

  it("si no conecta, lo dice", async () => {
    const s = new SocketFalso();
    await expect(imprimirPorPuerto("ipp://192.168.4.249/ipp", PDF, T, () => {
      queueMicrotask(() => s.emit("error", new Error("ECONNREFUSED")));
      return s as unknown as Socket;
    })).rejects.toThrow("La impresora no responde (ECONNREFUSED)");
  });
});
