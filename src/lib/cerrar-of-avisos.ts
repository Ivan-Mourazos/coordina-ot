// ─── Lo que hay que contar tras dar una OF por terminada en RPS ──────────────
// La ruta contesta bien, pero puede haber pasado algo que el autor tiene que
// saber: que ya estaba cerrada, o que con la trampa 2/02 solo entró una de las
// dos. Los textos son los de la spec del 15/09/2026 (sección 2).

export interface RespuestaCierreRps {
  yaEstaba?: boolean;
  /** El código de la operación de la fila, tal cual lo tiene OLANET. */
  faseFila?: string;
  /** Las gemelas de la trampa 2/02 que no se pudieron escribir. */
  gemelasSinEscribir?: string[];
}

export function avisosTrasCerrarEnRps(r: RespuestaCierreRps): string[] {
  const avisos: string[] = [];
  if (r.yaEstaba) avisos.push("Ya estaba terminada en RPS: la cerró alguien antes. Queda apartada aquí igual.");
  for (const g of r.gemelasSinEscribir ?? []) {
    avisos.push(`Se cerró la ${r.faseFila ?? ""}; la ${g} no ha podido escribirse. Vuelve a pulsar para reintentarla.`);
  }
  return avisos;
}
