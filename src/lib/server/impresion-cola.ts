import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "./estado-db";
import { planteamientosDe } from "./planteamiento-pdf";
import { componerTrabajo } from "./parte-pdf";
import {
  claveTrabajo, paginasSinImpresora, seleccionDeSerie, trabajosDe,
  type AjustesImpresion, type DestinoParte, type Papel, type TrabajoPlan,
} from "../planteamiento";

// ─── Cola de impresión de planteamientos ─────────────────────────────────────
// Al pasar un pedido de OT a Producción, su planteamiento de CAD sale solo en
// la impresora de arriba (spec 2026-10-13). Se encola en vez de imprimir en la
// petición por lo mismo que los bonos de OLANET: la impresora puede estar
// apagada, y pasar el pedido no puede depender de eso.
//
// Se COPIA el PDF al encolar: RPS mueve el fichero de Planteamientos a su
// archivo en pocos minutos, y lo que se imprime es lo que había al pasar.

export type ModoImpresion = "off" | "ensayo" | "activo";

/** Apagado salvo que se pida: imprimir en Producción por error es papel y un
 *  susto arriba. `ensayo` manda a la impresora de OT. */
export function modoImpresion(): ModoImpresion {
  const v = process.env.IMPRESION_PRODUCCION;
  return v === "activo" || v === "ensayo" ? v : "off";
}

export function impresoraDestino(modo: ModoImpresion): string | null {
  if (modo === "activo") return process.env.IMPRESORA_PRODUCCION ?? "ipp://192.168.4.245/ipp";
  if (modo === "ensayo") return process.env.IMPRESORA_ENSAYO ?? "ipp://192.168.4.249/ipp";
  return null;
}

export type EstadoImpresion = "pendiente" | "enviado" | "manual" | "sin_planteamiento" | "descartado";

export interface FilaImpresion {
  id: number;
  pedidoId: string;
  fichero: string | null;
  paginas: number | null;
  estado: EstadoImpresion;
  intentos: number;
  error: string | null;
  impresora: string | null;
  /** Con qué modo se envió (null si aún no salió). Permite al Historial decir
   *  «ensayo» sin deducirlo de la IP. */
  modo: ModoImpresion | null;
  pasadoPor: string | null;
  creadoAt: string;
  enviadoAt: string | null;
  /** Del reparto por tamaño (04/11/2026). null en las filas de antes: el PDF
   *  entero, a la impresora del modo. */
  destino?: DestinoParte | null;
  papel?: Papel | null;
  /** Las páginas de esta parte, «2, 4». null = todas. */
  paginasSel?: string | null;
  /** Guarda qué páginas y con qué giro: «Reimprimir» puede repetir justo eso. */
  repetible?: boolean;
}

export function dirCopias(): string {
  return process.env.COORDINA_PLANTEAMIENTOS_COPIAS ?? path.join(process.cwd(), "data", "planteamientos");
}

/** La impresora de OT es la de color, y las Konica de color abortan lo que llega
 *  sin código de departamento (ver impresion-worker.ts). Sin él configurado no
 *  se le manda nada solo: esas partes quedan para imprimir a mano, como antes. */
export function puedeImprimirEnOt(): boolean {
  return Boolean(process.env.IMPRESORA_ENSAYO_DEPARTAMENTO?.trim() && process.env.IMPRESORA_ENSAYO_DEPARTAMENTO_CLAVE?.trim());
}

export async function prepararImpresion(
  codigo: string,
  operarioId: string,
  ahora = new Date(),
  buscar: typeof planteamientosDe = planteamientosDe,
  /** Solo estos PDF, si se eligieron a mano al pasar (ver `EleccionPase`). */
  solo?: ReadonlySet<string>,
  /** Qué páginas a cada impresora y cuáles a mano (ver `AjustesImpresion`). */
  ajustes?: AjustesImpresion,
  /** Solo este trabajo: «Reimprimir» desde el panel de las impresoras repite
   *  justo lo que salió (mismas páginas, mismo giro, misma impresora). */
  soloTrabajo?: { fichero: string; trabajo: TrabajoPlan },
): Promise<{ encolados: number; manuales: string[]; aviso: string | null }> {
  const encontrados = await buscar(codigo);
  const { aviso } = encontrados;
  const ficheros = encontrados.ficheros.filter(
    (f) => (!solo || solo.has(f.nombre)) && (!soloTrabajo || soloTrabajo.fichero === f.nombre),
  );
  // Había planteamiento pero se quitó todo a mano: no es «sin planteamiento».
  if ((solo || soloTrabajo) && ficheros.length === 0 && encontrados.ficheros.length > 0) return { encolados: 0, manuales: [], aviso };
  const db = getDb();
  const ts = ahora.toISOString();
  const insertar = db.prepare(
    `INSERT INTO planteamiento_impresion
       (pedido_id, fichero, copia, paginas, estado, error, pasado_por, creado_at, proximo_at, destino, papel, paginas_sel, trabajo)
     VALUES (@pedido, @fichero, @copia, @paginas, @estado, @error, @por, @ts, @proximo, @destino, @papel, @sel, @trabajo)`,
  );
  const fila = (o: {
    fichero?: string | null; copia?: string | null; paginas?: number | null; estado: EstadoImpresion; error?: string | null;
    proximo?: string | null; destino?: DestinoParte | null; papel?: Papel | null; sel?: string | null; trabajo?: TrabajoPlan | null;
  }) =>
    insertar.run({
      pedido: codigo, fichero: o.fichero ?? null, copia: o.copia ?? null, paginas: o.paginas ?? null, estado: o.estado,
      error: o.error ?? null, por: operarioId, ts, proximo: o.proximo ?? null,
      destino: o.destino ?? null, papel: o.papel ?? null, sel: o.sel ?? null,
      trabajo: o.trabajo ? JSON.stringify(o.trabajo) : null,
    });
  if (ficheros.length === 0) {
    fila({ estado: "sin_planteamiento", error: aviso });
    return { encolados: 0, manuales: [], aviso };
  }
  const manuales: string[] = [];
  const aMano = (fichero: string) => {
    if (!manuales.includes(fichero)) manuales.push(fichero);
  };
  let encolados = 0;
  mkdirSync(dirCopias(), { recursive: true });
  for (const f of ficheros) {
    // Sin las medidas de cada página (ficheros de antes) se reparte como antes:
    // todo A4 a Producción de una pieza, o entero a mano.
    if (!f.tamanos?.length) {
      const base = { fichero: f.nombre, paginas: f.paginas };
      if (!f.todoA4) {
        fila({ ...base, estado: "manual", destino: "manual" });
        aMano(f.nombre);
        continue;
      }
      const copia = path.join(dirCopias(), `${randomUUID()}-${f.nombre}`);
      try {
        copyFileSync(f.ruta, copia);
      } catch (e) {
        fila({ ...base, estado: "descartado", error: `No he podido copiar el PDF: ${(e as Error).message}`.slice(0, 500) });
        continue;
      }
      fila({ ...base, copia, estado: "pendiente", proximo: ts, destino: "produccion", papel: "A4" });
      encolados += 1;
      continue;
    }
    const deSerie = !ajustes?.paginas[f.nombre];
    const sel = ajustes?.paginas[f.nombre] ?? seleccionDeSerie(f.tamanos);
    const trabajos = soloTrabajo ? [soloTrabajo.trabajo] : trabajosDe(f.tamanos, sel);
    // Las de un tamaño que no tiene ninguna impresora, a mano como siempre.
    const sueltas = soloTrabajo ? [] : paginasSinImpresora(f.tamanos, sel, deSerie);
    if (sueltas.length > 0) {
      fila({ fichero: f.nombre, paginas: sueltas.length, estado: "manual", destino: "manual", sel: sueltas.join(", ") });
      aMano(f.nombre);
    }
    for (const t of trabajos) {
      // Un trabajo con todas las páginas en su orden, sin girar ni escalar: el
      // PDF tal cual. Un planteamiento todo A4 sale idéntico a como salía.
      const entero =
        t.paginas.length === f.paginas && t.paginas.every((p, i) => p.pagina === i + 1 && !p.girar && !p.ajustar);
      const base = {
        fichero: f.nombre,
        paginas: t.paginas.length,
        destino: t.impresora,
        papel: t.papel,
        sel: entero ? null : t.paginas.map((p) => p.pagina).join(", "),
        trabajo: t,
      };
      if (
        (!soloTrabajo && ajustes?.aMano.includes(claveTrabajo(f.nombre, t.impresora))) ||
        (t.impresora === "ot" && !puedeImprimirEnOt())
      ) {
        fila({ ...base, estado: "manual" });
        aMano(f.nombre);
        continue;
      }
      // Se copia ANTES de insertar: si RPS ya movió el fichero o la red falla,
      // la fila no puede quedar «pendiente» sin copia reintentándose para
      // siempre, ni el fallo de un fichero cortar los demás. La copia lleva un
      // prefijo único en vez del id de la fila (que aún no existe).
      const copia = path.join(dirCopias(), `${randomUUID()}-${f.nombre}`);
      try {
        if (entero) copyFileSync(f.ruta, copia);
        else writeFileSync(copia, await componerTrabajo(new Uint8Array(readFileSync(f.ruta)), t.paginas, t.papel));
      } catch (e) {
        fila({ ...base, estado: "descartado", error: `No he podido copiar el PDF: ${(e as Error).message}`.slice(0, 500) });
        continue;
      }
      fila({ ...base, copia, estado: "pendiente", proximo: ts });
      encolados += 1;
    }
  }
  return { encolados, manuales, aviso };
}

/** El trabajo guardado de una fila, para «Reimprimir» exactamente eso. */
export function trabajoDeFila(id: number): { pedido: string; fichero: string; trabajo: TrabajoPlan } | null {
  const r = getDb()
    .prepare("SELECT pedido_id, fichero, trabajo FROM planteamiento_impresion WHERE id = ?")
    .get(id) as { pedido_id: string; fichero: string | null; trabajo: string | null } | undefined;
  if (!r?.fichero || !r.trabajo) return null;
  try {
    const t = JSON.parse(r.trabajo) as TrabajoPlan;
    if ((t.impresora !== "produccion" && t.impresora !== "ot") || !Array.isArray(t.paginas)) return null;
    return { pedido: r.pedido_id, fichero: r.fichero, trabajo: t };
  } catch {
    return null;
  }
}

interface FilaDb {
  id: number; pedido_id: string; fichero: string | null; copia: string | null; paginas: number | null;
  estado: EstadoImpresion; intentos: number; error: string | null; impresora: string | null;
  modo: ModoImpresion | null; pasado_por: string | null; creado_at: string; enviado_at: string | null;
  destino?: DestinoParte | null; papel?: Papel | null; paginas_sel?: string | null; trabajo?: string | null;
}

const aFila = (r: FilaDb): FilaImpresion => ({
  id: r.id, pedidoId: r.pedido_id, fichero: r.fichero, paginas: r.paginas, estado: r.estado,
  intentos: r.intentos, error: r.error, impresora: r.impresora, modo: r.modo, pasadoPor: r.pasado_por,
  creadoAt: r.creado_at, enviadoAt: r.enviado_at,
  destino: r.destino ?? null, papel: r.papel ?? null, paginasSel: r.paginas_sel ?? null,
  repetible: Boolean(r.trabajo),
});

export function leerImpresionesDe(pedidoId: string): FilaImpresion[] {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_impresion WHERE pedido_id = ? ORDER BY id DESC LIMIT 20")
    .all(pedidoId) as FilaDb[]).map(aFila);
}

/** Lo último que mandó la web, de todos los pedidos, para el panel de las
 *  impresoras. Con el número de trabajo, para cruzarlo con lo que dice ella. */
export function leerImpresionesRecientes(limite = 40): Array<FilaImpresion & { trabajo: number | null }> {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_impresion WHERE estado <> 'sin_planteamiento' ORDER BY id DESC LIMIT ?")
    .all(limite) as Array<FilaDb & { trabajo_ipp: number | null }>).map((r) => ({ ...aFila(r), trabajo: r.trabajo_ipp }));
}

export function pendientesParaEnviar(ahora: Date): Array<FilaImpresion & { copia: string | null }> {
  return (getDb()
    .prepare("SELECT * FROM planteamiento_impresion WHERE estado = 'pendiente' AND proximo_at <= ? ORDER BY id LIMIT 20")
    .all(ahora.toISOString()) as FilaDb[]).map((r) => ({ ...aFila(r), copia: r.copia }));
}

export function marcarImpreso(
  id: number, trabajo: number | null, impresora: string, modo: ModoImpresion, ahora: Date, copia: string | null,
): void {
  getDb()
    .prepare("UPDATE planteamiento_impresion SET estado = 'enviado', trabajo_ipp = ?, impresora = ?, modo = ?, enviado_at = ?, error = NULL, copia = NULL WHERE id = ?")
    .run(trabajo, impresora, modo, ahora.toISOString(), id);
  // Ya se envió: borrar la copia es limpieza. Si falla no debe pasar por
  // marcarFallo, que reintentaría una fila que ya salió por la impresora.
  if (copia) {
    try { rmSync(copia, { force: true }); }
    catch (e) { console.warn(`[impresion] no pude borrar la copia ${copia}:`, (e as Error).message); }
  }
}

/** Fallo permanente (la copia no existe): reintentar no lo arregla. */
export function descartar(id: number, error: string): void {
  getDb()
    .prepare("UPDATE planteamiento_impresion SET estado = 'descartado', error = ?, copia = NULL WHERE id = ?")
    .run(error.slice(0, 500), id);
}

/** 30 s, 1 min, 2, 4, 8… hasta 10 minutos. Una impresora apagada no se
 *  arregla insistiendo cada medio minuto toda la noche. */
export function esperaTras(intentos: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, intentos - 1), 10 * 60_000);
}

export function marcarFallo(id: number, intentosAntes: number, error: string, ahora: Date): void {
  const intentos = intentosAntes + 1;
  getDb()
    .prepare("UPDATE planteamiento_impresion SET intentos = ?, error = ?, proximo_at = ? WHERE id = ?")
    .run(intentos, error.slice(0, 500), new Date(ahora.getTime() + esperaTras(intentos)).toISOString(), id);
}
