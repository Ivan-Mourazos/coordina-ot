// src/lib/server/pedir-visita.ts
import { asuntoVisita, cuerpoVisita, cuerpoVisitaHtml, notaVisita, type DatosVisita } from "../correo-visita";
import { agruparDias, type EntradaVisita } from "../visita";
import { crearNota } from "./notas-db";
import { correoDeOperario } from "./operarios";
import { leerPersona } from "./personas-db";
import { destinatariosVisita, encolarVisita, modoVisita } from "./visita-correo-cola";
import { usarNombreVisita } from "./visitas-db";

// ─── Pedir visita: nota + correo (spec 2026-11-19) ──────────────────────────
// La nota es lo que antes se escribía a mano en el hilo; el correo sale por
// la cola. La fecha de la visita de verdad la pone RPS: aquí no se guarda.

export const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

const nombreDePersona = (id: string) => leerPersona(id)?.nombre ?? null;

export function pedirVisita(
  e: EntradaVisita,
  pide: { id: string; nombre: string },
  ahora = new Date(),
  nombreDe: (id: string) => string | null = nombreDePersona,
): { notaId: number; correoId: number } {
  const nombres = new Map<string, string>();
  for (const id of e.atienden) {
    const n = nombreDe(id);
    if (!n) throw new Error(`Quien atiende no existe: ${id}`);
    nombres.set(id, primerNombre(n));
  }
  const datos: DatosVisita = {
    pedido: e.pedido, cliente: e.cliente, solicitada: e.solicitada, prioridad: e.prioridad, ofs: e.ofs,
    viene: e.viene, cuando: e.cuando, motivo: e.motivo,
    atienden: e.atienden.map((id) => nombres.get(id)!),
    noEstamos: agruparDias(e.noEstamos, (id) => nombres.get(id) ?? id),
    pide: primerNombre(pide.nombre),
  };
  const ts = ahora.toISOString();
  const nota = crearNota(e.pedido, pide.id, notaVisita(datos), ts, { para: [], enConsultaPublica: false });
  const modo = modoVisita();
  const { para, cc } = destinatariosVisita(modo);
  const correoId = encolarVisita(
    {
      pedido: e.pedido, notaId: nota.id, para, cc, responderA: correoDeOperario(pide.id),
      asunto: asuntoVisita(datos), cuerpo: cuerpoVisita(datos), html: cuerpoVisitaHtml(datos), modo, pedidoPor: pide.id,
    },
    ahora,
  );
  usarNombreVisita(e.viene, ahora);
  return { notaId: nota.id, correoId };
}
