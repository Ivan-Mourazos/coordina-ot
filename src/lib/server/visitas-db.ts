// src/lib/server/visitas-db.ts
import type { Ausencias, Rango } from "../visita";
import { sumarDias } from "../visita";
import { getDb } from "./estado-db";

// ─── Ausencias de OT y nombres de quien viene (spec 2026-11-19) ─────────────
// La nota de una ausencia es de su dueño: solo sale en leerMisAusencias.
// Fuera de ahí, una ausencia es «no está en OT» y nada más.

const DIAS_GUARDA_PASADO = 90;

const parsearDias = (json: string): number[] => {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((d): d is number => Number.isInteger(d)) : [];
  } catch {
    return [];
  }
};

export function leerMisAusencias(operarioId: string): { dias: number[]; rangos: Rango[] } {
  const fija = getDb().prepare("SELECT dias FROM ausencia_fija WHERE operario_id = ?").get(operarioId) as { dias: string } | undefined;
  const rangos = getDb()
    .prepare("SELECT desde, hasta, nota FROM ausencia_rango WHERE operario_id = ? ORDER BY desde, id")
    .all(operarioId) as Array<{ desde: string; hasta: string; nota: string | null }>;
  return { dias: fija ? parsearDias(fija.dias) : [], rangos };
}

export function guardarMisAusencias(operarioId: string, a: { dias: number[]; rangos: Rango[] }, hoy: string): void {
  const corte = sumarDias(hoy, -DIAS_GUARDA_PASADO);
  const db = getDb();
  db.transaction(() => {
    db.prepare("INSERT INTO ausencia_fija (operario_id, dias) VALUES (?, ?) ON CONFLICT(operario_id) DO UPDATE SET dias = excluded.dias")
      .run(operarioId, JSON.stringify(a.dias));
    db.prepare("DELETE FROM ausencia_rango WHERE operario_id = ?").run(operarioId);
    const ins = db.prepare("INSERT INTO ausencia_rango (operario_id, desde, hasta, nota) VALUES (?, ?, ?, ?)");
    for (const r of a.rangos) if (r.hasta >= corte) ins.run(operarioId, r.desde, r.hasta, r.nota ?? null);
  })();
}

export function ausenciasDe(ids: string[]): Ausencias[] {
  return ids.map((id) => {
    const { dias, rangos } = leerMisAusencias(id);
    return { operarioId: id, dias, rangos: rangos.map(({ desde, hasta }) => ({ desde, hasta })) };
  });
}

export function nombresVisita(limite = 50): string[] {
  return (getDb().prepare("SELECT nombre FROM visita_nombre ORDER BY usado_at DESC LIMIT ?").all(limite) as Array<{ nombre: string }>)
    .map((r) => r.nombre);
}

/** Guarda el nombre tal como se escribió la última vez. */
export function usarNombreVisita(nombre: string, ahora: Date): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM visita_nombre WHERE nombre = ?").run(nombre);
    db.prepare("INSERT INTO visita_nombre (nombre, usado_at) VALUES (?, ?)").run(nombre, ahora.toISOString());
  })();
}
