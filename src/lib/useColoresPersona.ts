"use client";

import { useSyncExternalStore } from "react";
import type { PersonaPublica } from "./personas";

// ─── Los colores que cada uno eligió, en el navegador ───────────────────────
// Una sola lectura de /api/personas por pestaña (la misma lista pública de la
// pantalla de entrar), compartida por todos los que pintan caras. Al cambiar
// el tuyo se actualiza aquí al momento, sin esperar a recargar.

export interface ColoresPersona {
  /** id de cuenta → color elegido. Solo los que han elegido. */
  porId: Readonly<Record<string, string>>;
  /** nombre (y nombre completo) en minúsculas → color elegido, para las
   *  pantallas que solo tienen el nombre (Producción). */
  porNombre: ReadonlyMap<string, string>;
}

const VACIO: ColoresPersona = { porId: {}, porNombre: new Map() };
let actual: ColoresPersona = VACIO;
let pedido = false;
const oyentes = new Set<() => void>();

const clave = (nombre: string) => nombre.trim().toLocaleLowerCase("es");

function publicar(personas: ReadonlyArray<Pick<PersonaPublica, "id" | "nombre" | "nombreCompleto" | "color">>) {
  const porId: Record<string, string> = {};
  const porNombre = new Map<string, string>();
  for (const p of personas) {
    if (!p.color) continue;
    porId[p.id] = p.color;
    porNombre.set(clave(p.nombreCompleto), p.color);
    // Dos personas con el mismo nombre de pila (hay dos Belén): el nombre
    // corto no dice cuál es, así que no se le pone color a ninguna.
    const corto = clave(p.nombre);
    if (personas.filter((o) => clave(o.nombre) === corto).length === 1) porNombre.set(corto, p.color);
  }
  actual = { porId, porNombre };
  for (const o of oyentes) o();
}

let ultimas: PersonaPublica[] = [];

function cargar() {
  if (pedido) return;
  pedido = true;
  fetch("/api/personas", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { personas?: PersonaPublica[] } | null) => {
      if (j?.personas) {
        ultimas = j.personas;
        publicar(ultimas);
      }
    })
    .catch(() => {
      // Sin colores elegidos: cada cara sale con el de siempre.
    });
}

function suscribir(o: () => void) {
  oyentes.add(o);
  cargar();
  return () => oyentes.delete(o);
}

export function useColoresPersona(): ColoresPersona {
  return useSyncExternalStore(suscribir, () => actual, () => VACIO);
}

/** El color elegido para este nombre, si lo hay (para quien no tiene id a mano). */
export function colorElegidoDeNombre(c: ColoresPersona, nombre: string): string | undefined {
  return c.porNombre.get(clave(nombre));
}

/** Guarda TU color (null = volver al de siempre). Devuelve si se guardó. */
export async function cambiarMiColor(miId: string, color: string | null): Promise<boolean> {
  try {
    const r = await fetch("/api/personas/color", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: miId, color }),
    });
    if (!r.ok) return false;
  } catch {
    return false;
  }
  ultimas = ultimas.map((p) => (p.id === miId ? { ...p, color } : p));
  if (!ultimas.some((p) => p.id === miId)) {
    // La lista aún no había llegado: se vuelve a pedir entera.
    pedido = false;
    cargar();
  } else publicar(ultimas);
  return true;
}
