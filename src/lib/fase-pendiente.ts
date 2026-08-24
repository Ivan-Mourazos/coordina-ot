// ─── Fases de OT que se quedaron sin finalizar ───────────────────────────────
// Pasabas el pedido a Producción y la fase de OT se quedaba en pausa: nadie la
// cerraba y tenían que avisar desde el taller. Antes no había forma de
// arreglarlo desde aquí y había que abrir la herramienta vieja.
//
// De aquí en adelante no debería pasar —"Pasar a Producción" ya mueve la fase a
// finalizada—, así que esto es para el arrastre: medido el 24/08/2026, 125
// fases de OT sin cerrar, desde 2020 hasta hoy, y casi todas de urgencias
// (U-A-OTEC).
//
// Client-safe: no toca ninguna BD. Lo comparten la ruta y el componente.

/** Los estados de `scg_Fases.IdEstadoOF`, del catálogo `scm_EstadosOF` de
 *  OLANET. NO estaban documentados en nuestro código y el 4 despistaba: con
 *  220.046 fases de A-OTEC parecía un desastre de trabajo a medias, y resultó
 *  ser limpieza del propio OLANET. */
export const ESTADO_OF = {
  /** Cargada de gestión, sin entrar nunca en máquina. */
  cargada: 0,
  iniciada: 1,
  interrumpida: 2,
  finalizada: 3,
  /** Eliminada del sistema por OLANET. Ni se toca. */
  eliminada: 4,
} as const;

export interface FaseDeOF {
  /** Código de la OF en RPS ("0227619"). */
  of: string;
  /** Código de la fase dentro de la OF ("02", "5"). */
  fase: string;
  descripcion: string;
  /** Centro de trabajo declarado en la ruta ("A-OTEC", "U-A-OTEC"). */
  maquina: string;
  estado: number;
}

export type SituacionFase = "finalizada" | "sin_finalizar" | "eliminada" | "desconocida";

/** En qué situación está la fase, con los nombres que se enseñan.
 *
 *  `desconocida` no es paranoia: el catálogo puede crecer, y llamar
 *  "sin finalizar" a un estado que no conocemos ofrecería un botón que escribe
 *  en RPS sobre algo que no entendemos. */
export function situacionDe(estado: number): SituacionFase {
  if (estado === ESTADO_OF.finalizada) return "finalizada";
  if (estado === ESTADO_OF.eliminada) return "eliminada";
  if (
    estado === ESTADO_OF.cargada ||
    estado === ESTADO_OF.iniciada ||
    estado === ESTADO_OF.interrumpida
  )
    return "sin_finalizar";
  return "desconocida";
}

/** ¿Es una fase de Oficina Técnica?
 *
 *  Vale para A-OTEC, OTEC-A, U-A-OTEC (urgencias), S-OTEC y B-OTEC. El filtro
 *  es por el nombre del centro porque es lo único que trae `scg_Fases`, y en
 *  esa columna hay erratas reales (`A-OTECP`, `24A-OTEC`): buscar el trozo
 *  "OTEC" las recoge todas, y ninguna otra sección de la casa lo lleva. */
export function esFaseDeOT(maquina: string): boolean {
  return maquina.toUpperCase().includes("OTEC");
}

/** Las que se pueden cerrar desde aquí: de OT y sin finalizar.
 *
 *  Las `eliminada` se quedan fuera A PROPÓSITO aunque tampoco estén
 *  finalizadas: OLANET ya las retiró y escribirles un movimiento nuevo sería
 *  resucitar algo que el propio sistema dio por muerto. */
/*  Genérica sobre `T`: quien llama trae la fase CON su `idBoletin` —lo que
 *  hace falta para cerrarla— y si aquí se devolviera `FaseDeOF` a secas, ese
 *  campo se perdería por el camino y habría que volver a buscarlo por (OF,
 *  fase), que es justo la carrera que se quiere evitar. */
export function finalizables<T extends FaseDeOF>(fases: readonly T[]): T[] {
  return fases.filter((f) => esFaseDeOT(f.maquina) && situacionDe(f.estado) === "sin_finalizar");
}

/** Cómo se cuenta en pantalla. Se separa `eliminadas` porque hay que DECIRLO
 *  —si no, una fase que no está finalizada y no ofrece botón parece un fallo—
 *  pero sin ofrecer nada que pulsar. */
export function resumen(fases: readonly Pick<FaseDeOF, "maquina" | "estado">[]): {
  deOT: number;
  finalizadas: number;
  sinFinalizar: number;
  eliminadas: number;
} {
  const ot = fases.filter((f) => esFaseDeOT(f.maquina));
  const cuenta = (s: SituacionFase) => ot.filter((f) => situacionDe(f.estado) === s).length;
  return {
    deOT: ot.length,
    finalizadas: cuenta("finalizada"),
    sinFinalizar: cuenta("sin_finalizar"),
    eliminadas: cuenta("eliminada"),
  };
}

/** El nombre de la situación, para leerlo sin saber números. */
export const NOMBRE_SITUACION: Record<SituacionFase, string> = {
  finalizada: "Finalizada",
  sin_finalizar: "Sin finalizar",
  eliminada: "Eliminada en OLANET",
  desconocida: "Estado desconocido",
};
