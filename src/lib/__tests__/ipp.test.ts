import { describe, expect, it, vi } from "vitest";
import { imprimirPdf, leerRespuesta, peticionPrintJob, urlHttp } from "../server/ipp";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
const T = { nombre: "Planteamiento AR.26.05016", usuario: "CoordinaOT" };

/** Lee los nombres y valores de atributos de una petición, para no comparar
 *  bytes a ciegas. */
function atributos(b: Uint8Array): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  let i = 8;
  let ultimo = "";
  while (i < b.length) {
    const tag = b[i++];
    if (tag === 0x03) break;
    if (tag < 0x10) continue; // delimitador de grupo
    const ln = (b[i] << 8) | b[i + 1]; i += 2;
    const nombre = new TextDecoder().decode(b.slice(i, i + ln)); i += ln;
    const lv = (b[i] << 8) | b[i + 1]; i += 2;
    const v = b.slice(i, i + lv); i += lv;
    if (nombre) ultimo = nombre;
    out[ultimo] = tag === 0x21 ? new DataView(v.buffer, v.byteOffset).getInt32(0) : new TextDecoder().decode(v);
  }
  return out;
}

describe("Print-Job", () => {
  it("cabecera IPP 2.0, operación Print-Job y el PDF al final", () => {
    const b = peticionPrintJob("ipp://192.168.4.245/ipp", PDF, T, 7);
    expect([...b.slice(0, 4)]).toEqual([0x02, 0x00, 0x00, 0x02]);
    expect(new DataView(b.buffer).getInt32(4)).toBe(7);
    expect([...b.slice(-4)]).toEqual([...PDF]);
  });

  it("lleva lo que pide la spec: PDF, 1 copia, una cara, A4", () => {
    const a = atributos(peticionPrintJob("ipp://192.168.4.245/ipp", PDF, T));
    expect(a).toMatchObject({
      "attributes-charset": "utf-8",
      "printer-uri": "ipp://192.168.4.245/ipp",
      "requesting-user-name": "CoordinaOT",
      "job-name": "Planteamiento AR.26.05016",
      "document-format": "application/pdf",
      copies: 1,
      sides: "one-sided",
      media: "iso_a4_210x297mm",
    });
  });
});

describe("respuesta", () => {
  const resp = (estado: number, trabajo?: number) => {
    const partes = [0x02, 0x00, estado >> 8, estado & 255, 0, 0, 0, 1, 0x02];
    if (trabajo !== undefined) {
      const n = new TextEncoder().encode("job-id");
      partes.push(0x21, 0, n.length, ...n, 0, 4, (trabajo >> 24) & 255, (trabajo >> 16) & 255, (trabajo >> 8) & 255, trabajo & 255);
    }
    partes.push(0x03);
    return new Uint8Array(partes);
  };

  it("aceptado, con número de trabajo", () => {
    expect(leerRespuesta(resp(0x0000, 1234))).toEqual({ estado: 0, ok: true, trabajo: 1234 });
  });

  it("rechazado", () => {
    expect(leerRespuesta(resp(0x0406)).ok).toBe(false);
  });

  it("imprimirPdf manda POST application/ipp al puerto 631 y lanza si la impresora rechaza", async () => {
    const f = vi.fn(async () => new Response(resp(0x0000, 9)));
    expect(await imprimirPdf("ipp://192.168.4.245/ipp", PDF, T, f as unknown as typeof fetch)).toEqual({ trabajo: 9 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://192.168.4.245:631/ipp");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/ipp");

    const mal = vi.fn(async () => new Response(resp(0x0400)));
    await expect(imprimirPdf("ipp://192.168.4.245/ipp", PDF, T, mal as unknown as typeof fetch)).rejects.toThrow(/rechazó/);
  });

  it("ipp:// pasa a http:// con el puerto 631 si no lo trae", () => {
    expect(urlHttp("ipp://192.168.4.245/ipp")).toBe("http://192.168.4.245:631/ipp");
    expect(urlHttp("ipp://impresora:8631/ipp/print")).toBe("http://impresora:8631/ipp/print");
  });
});
