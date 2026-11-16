import type { RolAcceso } from "../personas";
import type { SeccionId } from "../secciones";
import { tambienEnDeOperario } from "./operarios";

// ─── Quién lee una nota ──────────────────────────────────────────────────────
// Lo que hace falta saber de alguien para decidir qué notas ve y de cuáles le
// avisa la campana: su id y los destinos a los que pertenece, con la misma
// clave que guardan nota_audiencia y nota_mencion ("persona:ivan",
// "seccion:ot"). Lo resuelve el servidor a partir de la sesión: el navegador
// nunca dice a qué secciones pertenece.
//
// Las secciones del tablero salen de `persona.seccion` y de `tambienEn`
// (operarios.ts), nunca de listas de nombres. Producción y Dirección salen de
// los roles.

export interface Lector {
  id: string;
  destinos: string[];
}

export function lectorDe(p: { id: string; roles: readonly RolAcceso[]; seccion: SeccionId | null }): Lector {
  const destinos = [`persona:${p.id}`];
  const anadir = (d: string) => {
    if (!destinos.includes(d)) destinos.push(d);
  };
  if (p.seccion) anadir(`seccion:${p.seccion}`);
  for (const s of tambienEnDeOperario(p.id)) anadir(`seccion:${s}`);
  if (p.roles.includes("produccion")) anadir("seccion:produccion");
  if (p.roles.includes("direccion")) anadir("seccion:direccion");
  return { id: p.id, destinos };
}
