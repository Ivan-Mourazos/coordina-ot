// ─── IPP: mandar un PDF a una impresora de red ───────────────────────────────
// Las Konica de Producción (bizhub 551i) y de OT aceptan PDF directamente por
// IPP (comprobado el 13/10/2026), así que no hace falta CUPS ni controladores
// en el servidor: un Print-Job son unos pocos bytes de cabecera y el PDF
// detrás. Se escribe a mano para no añadir una dependencia por esto.
//
// «Aceptado» quiere decir que la impresora cogió el trabajo, no que el papel
// haya salido: si se queda sin papel, se resuelve allí.

export interface TrabajoIpp {
  nombre: string;
  usuario: string;
}

const enc = new TextEncoder();

function atributo(salida: number[], tag: number, nombre: string, valor: Uint8Array) {
  const n = enc.encode(nombre);
  salida.push(tag, n.length >> 8, n.length & 255, ...n, valor.length >> 8, valor.length & 255, ...valor);
}

const texto = (s: string) => enc.encode(s);
const entero = (v: number) => new Uint8Array([(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]);

export function peticionPrintJob(uri: string, pdf: Uint8Array, t: TrabajoIpp, idPeticion = 1): Uint8Array {
  const b: number[] = [0x02, 0x00, 0x00, 0x02, ...entero(idPeticion)];
  b.push(0x01); // operation-attributes
  atributo(b, 0x47, "attributes-charset", texto("utf-8"));
  atributo(b, 0x48, "attributes-natural-language", texto("es"));
  atributo(b, 0x45, "printer-uri", texto(uri));
  atributo(b, 0x42, "requesting-user-name", texto(t.usuario));
  atributo(b, 0x42, "job-name", texto(t.nombre));
  atributo(b, 0x49, "document-format", texto("application/pdf"));
  b.push(0x02); // job-attributes
  atributo(b, 0x21, "copies", entero(1));
  atributo(b, 0x44, "sides", texto("one-sided"));
  atributo(b, 0x44, "media", texto("iso_a4_210x297mm"));
  b.push(0x03);
  const salida = new Uint8Array(b.length + pdf.length);
  salida.set(b, 0);
  salida.set(pdf, b.length);
  return salida;
}

export function leerRespuesta(bytes: Uint8Array): { estado: number; ok: boolean; trabajo: number | null } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const estado = dv.getUint16(2);
  let trabajo: number | null = null;
  let i = 8;
  while (i < bytes.length) {
    const tag = bytes[i++];
    if (tag === 0x03) break;
    if (tag < 0x10) continue;
    const ln = dv.getUint16(i); i += 2;
    const nombre = new TextDecoder().decode(bytes.slice(i, i + ln)); i += ln;
    const lv = dv.getUint16(i); i += 2;
    if (nombre === "job-id" && tag === 0x21 && lv === 4) trabajo = dv.getInt32(i);
    i += lv;
  }
  // 0x0000–0x00FF son los «successful-ok*» de IPP.
  return { estado, ok: estado <= 0x00ff, trabajo };
}

export function urlHttp(uri: string): string {
  const u = new URL(uri.replace(/^ipp:/, "http:"));
  if (!u.port) u.port = "631";
  return u.toString();
}

export async function imprimirPdf(
  uri: string,
  pdf: Uint8Array,
  t: TrabajoIpp,
  f: typeof fetch = fetch,
): Promise<{ trabajo: number | null }> {
  let r: Response;
  try {
    r = await f(urlHttp(uri), {
      method: "POST",
      headers: { "Content-Type": "application/ipp" },
      body: peticionPrintJob(uri, pdf, t) as BodyInit, // TS 5.9: Uint8Array genérico no encaja en BodyInit
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new Error(`La impresora no responde (${(e as Error).message})`);
  }
  if (!r.ok) throw new Error(`La impresora contestó HTTP ${r.status}`);
  const res = leerRespuesta(new Uint8Array(await r.arrayBuffer()));
  if (!res.ok) throw new Error(`La impresora rechazó el trabajo (IPP 0x${res.estado.toString(16).padStart(4, "0")})`);
  return { trabajo: res.trabajo };
}
