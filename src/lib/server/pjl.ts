import { connect } from "node:net";

// ─── PJL por el puerto 9100: imprimir con código de departamento ───────────
// Las Konica de la casa llevan el control de copias por departamento («Account
// Track»): cada trabajo trae un código y su clave, y lo que llega sin ellos se
// ABORTA sin imprimir. Por IPP no hay forma de mandarlos (la impresora solo
// admite ahí el nombre de usuario), así que se hace como el driver de Windows:
// cabecera PJL y el PDF detrás, por el puerto 9100.
//
// Cómo lo manda el driver se sacó imprimiendo a archivo con el de OT
// (14/10/2026): `KMSECTIONNAME` es el código tal cual y `KMSECTIONKEY2` la
// clave CIFRADA por el driver (con `KMCOETYPE = 2`), no el PIN en claro. Ese
// cifrado sale igual en cada trabajo, así que se copia del driver y se guarda
// así en el .env. Con el PIN en claro la impresora no lo acepta (probado).

export interface Departamento {
  codigo: string;
  /** La clave como la escribe el driver en `KMSECTIONKEY2` (hex), no el PIN. */
  claveCifrada: string;
}

export interface TrabajoPjl {
  nombre: string;
  usuario: string;
  departamento: Departamento;
}

const UEL = "\x1B%-12345X";

/** PJL no admite comillas dentro de un valor entre comillas. */
const limpio = (s: string) => s.replace(/["\r\n]/g, "");

export function trabajoPjl(pdf: Uint8Array, t: TrabajoPjl): Uint8Array {
  const cabecera = [
    `${UEL}@PJL JOB`,
    `@PJL SET USERNAME = "${limpio(t.usuario)}"`,
    "@PJL SET KMCOETYPE = 2",
    "@PJL SET STRINGCODESET = UTF8",
    `@PJL SET JOBNAME = "${limpio(t.nombre)}"`,
    `@PJL SET KMSECTIONNAME = "${limpio(t.departamento.codigo)}"`,
    `@PJL SET KMSECTIONKEY2 = "${limpio(t.departamento.claveCifrada)}"`,
    // Lo decidido para el planteamiento: 1 copia, una cara, A4.
    "@PJL SET QTY = 1",
    "@PJL SET DUPLEX = OFF",
    "@PJL SET PAPER = A4",
    "@PJL ENTER LANGUAGE = PDF",
    "",
  ].join("\r\n");
  return Buffer.concat([Buffer.from(cabecera, "utf8"), pdf, Buffer.from(`${UEL}@PJL EOJ\r\n${UEL}`)]);
}

/** El host de la impresora a partir de su `ipp://…`, que es como está en el .env. */
export function hostDe(uri: string): string {
  return new URL(uri.replace(/^ipp:/, "http:")).hostname;
}

type Conectar = (puerto: number, host: string) => import("node:net").Socket;

/** Manda el trabajo por el 9100. Por este camino la impresora no da número de
 *  trabajo ni deja preguntar cómo acabó: `trabajo` es siempre null. */
export async function imprimirPorPuerto(
  uri: string,
  pdf: Uint8Array,
  t: TrabajoPjl,
  conectar: Conectar = (puerto, host) => connect(puerto, host),
): Promise<{ trabajo: null }> {
  const datos = trabajoPjl(pdf, t);
  await new Promise<void>((ok, ko) => {
    const s = conectar(9100, hostDe(uri));
    s.setTimeout(30_000, () => s.destroy(new Error("tiempo agotado")));
    s.once("connect", () => s.end(datos));
    s.once("close", (conError) => { if (!conError) ok(); });
    s.once("error", (e) => ko(new Error(`La impresora no responde (${e.message})`)));
  });
  return { trabajo: null };
}
