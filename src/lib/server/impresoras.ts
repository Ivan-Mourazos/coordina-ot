import {
  NOMBRES_IMPRESORA,
  avisosDe,
  tonerBajo,
  estadoImpresora,
  estadoTrabajo,
  papelLegible,
  type IdImpresora,
  type TrabajoEnImpresora,
  type VistaImpresora, avisosDeBandejas, bandejasDe } from "../impresoras";
import { impresoraDestino } from "./impresion-cola";
import { urlHttp } from "./ipp";

// ─── Preguntar a las impresoras cómo están ───────────────────────────────────
// Solo lectura: Get-Printer-Attributes y Get-Jobs de IPP. Nada de lo que hay
// aquí imprime ni cancela. Diez segundos de caché, porque el panel se refresca
// solo y puede haber varios abiertos.

const CACHE_MS = 10_000;
const ESPERA_MS = 6_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

type Valor = string | number;
export type GrupoIpp = { tag: number; atributos: Record<string, Valor[]> };

function atributo(salida: number[], tag: number, nombre: string, valor: Uint8Array) {
  const n = enc.encode(nombre);
  salida.push(tag, n.length >> 8, n.length & 255, ...n, valor.length >> 8, valor.length & 255, ...valor);
}
const entero = (v: number) => new Uint8Array([(v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]);

/** Una petición de IPP con sus atributos de operación. */
export function peticion(operacion: number, uri: string, extra: (a: (tag: number, nombre: string, valor: Uint8Array) => void) => void): Uint8Array {
  const b: number[] = [0x02, 0x00, operacion >> 8, operacion & 255, ...entero(1), 0x01];
  const a = (tag: number, nombre: string, valor: Uint8Array) => atributo(b, tag, nombre, valor);
  a(0x47, "attributes-charset", enc.encode("utf-8"));
  a(0x48, "attributes-natural-language", enc.encode("es"));
  a(0x45, "printer-uri", enc.encode(uri));
  a(0x42, "requesting-user-name", enc.encode(process.env.IMPRESORA_USUARIO ?? "Coordina"));
  extra(a);
  b.push(0x03);
  return new Uint8Array(b);
}

/** Lee una respuesta de IPP en grupos (uno por impresora o por trabajo). Los
 *  valores sin nombre son más valores del atributo anterior. */
export function leerGrupos(bytes: Uint8Array): { estado: number; grupos: GrupoIpp[] } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const grupos: GrupoIpp[] = [];
  let grupo: GrupoIpp | null = null;
  let ultimo = "";
  let i = 8;
  while (i < bytes.length) {
    const tag = bytes[i++];
    if (tag === 0x03) break;
    if (tag < 0x10) {
      grupo = { tag, atributos: {} };
      grupos.push(grupo);
      continue;
    }
    if (i + 2 > bytes.length) break;
    const ln = dv.getUint16(i); i += 2;
    const nombre = ln ? dec.decode(bytes.subarray(i, i + ln)) : ultimo; i += ln;
    if (i + 2 > bytes.length) break;
    const lv = dv.getUint16(i); i += 2;
    const crudo = bytes.subarray(i, i + lv); i += lv;
    ultimo = nombre;
    if (!grupo) continue;
    // Enteros y enums como número; textos y palabras clave como texto. El resto
    // (fechas, rangos, colecciones) no se usa aquí.
    let valor: Valor | null = null;
    if ((tag === 0x21 || tag === 0x23) && lv === 4) valor = new DataView(crudo.buffer, crudo.byteOffset, 4).getInt32(0);
    else if (tag >= 0x40 && tag <= 0x4a) valor = dec.decode(crudo);
    if (valor === null) continue;
    (grupo.atributos[nombre] ??= []).push(valor);
  }
  return { estado: dv.getUint16(2), grupos };
}

async function preguntar(uri: string, cuerpo: Uint8Array): Promise<ReturnType<typeof leerGrupos>> {
  const r = await fetch(urlHttp(uri), {
    method: "POST",
    headers: { "Content-Type": "application/ipp" },
    body: cuerpo as BodyInit,
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return leerGrupos(new Uint8Array(await r.arrayBuffer()));
}

const texto1 = (g: GrupoIpp, n: string) => (g.atributos[n]?.[0] as string | undefined) ?? null;
const numero1 = (g: GrupoIpp, n: string) => {
  const v = g.atributos[n]?.[0];
  return typeof v === "number" ? v : null;
};

export function trabajosDe(grupos: readonly GrupoIpp[]): TrabajoEnImpresora[] {
  return grupos
    .filter((g) => g.tag === 0x02)
    .flatMap((g) => {
      const id = numero1(g, "job-id");
      const estado = estadoTrabajo(numero1(g, "job-state"));
      if (id === null || !estado) return [];
      const segundos = numero1(g, "time-at-creation");
      return [{
        id,
        nombre: texto1(g, "job-name") ?? `Trabajo ${id}`,
        usuario: texto1(g, "job-originating-user-name"),
        estado,
        // time-at-creation cuenta desde que arrancó la impresora en algunas
        // Konica: solo se fía si parece una fecha de verdad (después de 2020).
        creado: segundos !== null && segundos > 1_577_836_800 ? new Date(segundos * 1000).toISOString() : null,
      }];
    });
}

const CAMPOS_TRABAJO = ["job-id", "job-name", "job-state", "job-originating-user-name", "time-at-creation"];

async function leerImpresora(id: IdImpresora, uri: string): Promise<VistaImpresora> {
  const base: VistaImpresora = {
    id, nombre: NOMBRES_IMPRESORA[id], modelo: null, estado: "sin_respuesta", avisos: [], tonerBajo: [], papeles: [], pendientes: [], recientes: [],
  };
  try {
    const atr = await preguntar(uri, peticion(0x0b, uri, (a) => {
      ["printer-state", "printer-state-reasons", "printer-make-and-model", "media-ready", "media-col-ready", "printer-alert-description", "marker-names", "marker-levels", "marker-types"].forEach((n, i) =>
        a(0x44, i ? "" : "requested-attributes", enc.encode(n)),
      );
    }));
    const p = atr.grupos.find((g) => g.tag === 0x04);
    if (!p) return base;
    const trabajos = async (cuales: string, limite: number) =>
      trabajosDe((await preguntar(uri, peticion(0x0a, uri, (a) => {
        a(0x44, "which-jobs", enc.encode(cuales));
        a(0x21, "limit", entero(limite));
        CAMPOS_TRABAJO.forEach((n, i) => a(0x44, i ? "" : "requested-attributes", enc.encode(n)));
      }))).grupos);
    const [pendientes, recientes] = await Promise.all([
      trabajos("not-completed", 30).catch(() => []),
      trabajos("completed", 30).catch(() => []),
    ]);
    return {
      ...base,
      modelo: texto1(p, "printer-make-and-model"),
      estado: estadoImpresora(numero1(p, "printer-state")),
      // Con los avisos de la Konica por bandeja, el «Sin papel» genérico sobra:
      // dice cuál está vacía y qué papel lleva (ver `avisosDeBandejas`).
      avisos: (() => {
        const porBandeja = avisosDeBandejas(
          (p.atributos["printer-alert-description"] ?? []).map(String),
          bandejasDe(p.atributos["media-col-ready"] ?? []),
        );
        const generales = avisosDe((p.atributos["printer-state-reasons"] ?? []).map(String));
        return porBandeja.length ? [...porBandeja, ...generales.filter((a) => a !== "Sin papel" && a !== "Queda poco papel")] : generales;
      })(),
      tonerBajo: tonerBajo(
        (p.atributos["marker-names"] ?? []).map(String),
        (p.atributos["marker-levels"] ?? []).map(Number),
        (p.atributos["marker-types"] ?? []).map(String),
      ),
      papeles: [...new Set((p.atributos["media-ready"] ?? []).map((m) => papelLegible(String(m))))],
      pendientes,
      recientes: recientes.sort((a, b) => b.id - a.id),
    };
  } catch (e) {
    console.warn(`[impresoras] ${id} no responde:`, (e as Error).message);
    return base;
  }
}

/** Las dos impresoras de la casa: la de Producción y la de OT (la del ensayo). */
export function impresorasDeLaCasa(): { id: IdImpresora; uri: string }[] {
  return [
    { id: "produccion", uri: impresoraDestino("activo")! },
    { id: "ot", uri: impresoraDestino("ensayo")! },
  ];
}

let guardado: { hasta: number; datos: Promise<VistaImpresora[]> } | null = null;

/** `fresco`: «Actualizar» en el panel; pregunta otra vez aunque haga menos de
 *  diez segundos de la última vez. */
export function leerImpresoras(fresco = false): Promise<VistaImpresora[]> {
  if (!fresco && guardado && guardado.hasta > Date.now()) return guardado.datos;
  const datos = Promise.all(impresorasDeLaCasa().map((i) => leerImpresora(i.id, i.uri)));
  guardado = { hasta: Date.now() + CACHE_MS, datos };
  return datos;
}
