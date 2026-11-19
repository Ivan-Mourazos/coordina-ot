// src/lib/server/visita-correo-cola.ts
import type { ModoCorreo } from "./correo-cola";
import { getDb } from "./estado-db";
import { credencialesGraph } from "./graph-correo";
import { esperaTras } from "./impresion-cola";

// ─── Cola del correo de «Pedir visita» (spec 2026-11-19) ────────────────────
// Mismo patrón que correo-cola: se congela al encolar y se reintenta si
// Microsoft no responde. Tabla propia: la del planteamiento va atada a sus PDF.

export function modoVisita(): ModoCorreo {
  const v = process.env.CORREO_VISITA;
  return v === "activo" || v === "ensayo" ? v : "off";
}

const lista = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** Instalaciones no tiene dirección por defecto: sin CORREO_VISITA_PARA, en
 *  activo, no hay a quién mandar y el botón no sale. */
export function destinatariosVisita(modo: ModoCorreo): { para: string[]; cc: string[] } {
  if (modo === "activo") return { para: lista(process.env.CORREO_VISITA_PARA), cc: lista(process.env.CORREO_VISITA_CC) };
  if (modo === "ensayo") {
    const ensayo = lista(process.env.CORREO_ENSAYO_PARA);
    return { para: ensayo.length ? ensayo : ["ivan.sanchez@toldosgomez.com"], cc: [] };
  }
  return { para: [], cc: [] };
}

export function visitaDisponible(): boolean {
  const modo = modoVisita();
  return modo !== "off" && credencialesGraph() !== null && destinatariosVisita(modo).para.length > 0;
}

export function encolarVisita(
  c: { pedido: string; notaId: number | null; para: string[]; cc: string[]; responderA: string | null; asunto: string; cuerpo: string; html: string; modo: ModoCorreo; pedidoPor: string },
  ahora: Date,
): number {
  const ts = ahora.toISOString();
  const r = getDb()
    .prepare(
      `INSERT INTO visita_correo (pedido_id, nota_id, para, cc, responder_a, asunto, cuerpo, cuerpo_html, estado, modo, pedido_por, creado_at, proximo_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?)`,
    )
    .run(c.pedido, c.notaId, JSON.stringify(c.para), JSON.stringify(c.cc), c.responderA, c.asunto, c.cuerpo, c.html, c.modo, c.pedidoPor, ts, ts);
  return Number(r.lastInsertRowid);
}

export interface VisitaPendiente {
  id: number;
  pedidoId: string;
  notaId: number | null;
  para: string[];
  cc: string[];
  responderA: string | null;
  asunto: string;
  cuerpo: string;
  html: string | null;
  intentos: number;
  pedidoPor: string;
}

interface FilaDb {
  id: number; pedido_id: string; nota_id: number | null; para: string; cc: string; responder_a: string | null;
  asunto: string; cuerpo: string; cuerpo_html: string | null; intentos: number; pedido_por: string;
}

const parsear = (json: string): string[] => {
  try { const v = JSON.parse(json) as unknown; return Array.isArray(v) ? (v as string[]) : []; } catch { return []; }
};

export function visitasParaEnviar(ahora: Date): VisitaPendiente[] {
  return (getDb()
    .prepare("SELECT * FROM visita_correo WHERE estado = 'pendiente' AND proximo_at <= ? ORDER BY id LIMIT 20")
    .all(ahora.toISOString()) as FilaDb[]).map((r) => ({
    id: r.id, pedidoId: r.pedido_id, notaId: r.nota_id, para: parsear(r.para), cc: parsear(r.cc), responderA: r.responder_a,
    asunto: r.asunto, cuerpo: r.cuerpo, html: r.cuerpo_html, intentos: r.intentos, pedidoPor: r.pedido_por,
  }));
}

export function marcarVisitaEnviada(id: number, ahora: Date): void {
  getDb().prepare("UPDATE visita_correo SET estado = 'enviado', enviado_at = ?, error = NULL WHERE id = ?").run(ahora.toISOString(), id);
}

export function descartarVisita(id: number, error: string): void {
  getDb().prepare("UPDATE visita_correo SET estado = 'descartado', error = ? WHERE id = ?").run(error.slice(0, 500), id);
}

export function marcarFalloVisita(id: number, intentosAntes: number, error: string, ahora: Date): void {
  const intentos = intentosAntes + 1;
  getDb()
    .prepare("UPDATE visita_correo SET intentos = ?, error = ?, proximo_at = ? WHERE id = ?")
    .run(intentos, error.slice(0, 500), new Date(ahora.getTime() + esperaTras(intentos)).toISOString(), id);
}
