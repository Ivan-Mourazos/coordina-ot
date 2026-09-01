// ─── Las dos secciones que usan CoordinaOT ───────────────────────────────────
// La web nació para Oficina Técnica. Diseño Gráfico hace lo mismo con otro
// trabajo, y en RPS la única diferencia es el CENTRO DE TRABAJO al que cuelga
// la tarea:
//
//   Oficina Técnica  →  A-OTEC / OTEC-A
//   Diseño Gráfico   →  A-DGRA / DGRA-A
//
// Tan igual es que `TGM_PENDIENTE_DISENHO` y `TGM_PENDIENTE_OT` son la MISMA
// vista con esa línea cambiada: mismas 15 columnas, mismo cálculo. Por eso
// añadir diseño no es una web nueva, es leer de otro sitio.
//
// TODO LO QUE DISTINGUE A UNA SECCIÓN DE OTRA VIVE AQUÍ. Antes esos literales
// estaban repartidos —`a-otec` clavado cinco veces en historial-db, "OTEC" en
// fase-pendiente, A-OTEC en bonos—, y con dos secciones eso son diez sitios que
// se desincronizan a la primera. Quien añada una tercera sección debería tener
// que tocar solo este fichero.
//
// NO ES UN PERMISO. Nadie deja de ver nada por esto: la sección dice de qué
// lista de trabajo se parte, no quién puede entrar. El modelo sin login del
// proyecto no cambia.

/** Las secciones que hay. El id se guarda en la BD y en la URL: NO se renombra. */
export type SeccionId = "ot" | "diseno";

export interface Seccion {
  id: SeccionId;
  /** Cómo se llama en pantalla. */
  nombre: string;
  /** La vista de RPS con su trabajo pendiente. Las dos son gemelas. */
  vista: string;
  /** Los códigos de `CPRMOResourceMachine` que son suyos. En minúsculas: así
   *  se comparan en las consultas, y SQL Server no distingue mayúsculas. */
  recursos: readonly string[];
  /** La máquina con la que se escriben sus bonos en OLANET. */
  maquina: string;
  /** El trozo que llevan en el nombre sus centros en `scg_Fases`.
   *
   *  Se busca un TROZO y no el nombre entero porque en esa columna hay erratas
   *  reales (`A-OTECP`, `24A-OTEC`): buscar "OTEC" las recoge todas, y ninguna
   *  otra sección de la casa lo lleva. Lo mismo vale para "DGRA". */
  marcaEnFases: string;
}

export const SECCIONES: Readonly<Record<SeccionId, Seccion>> = {
  ot: {
    id: "ot",
    nombre: "Oficina Técnica",
    vista: "TGM_PENDIENTE_OT",
    recursos: ["a-otec", "otec-a"],
    // Confirmado por IT el 2026-08-04: A-OTEC es la nuestra; A-OTECP es una
    // máquina de OT en planta, para la fábrica.
    maquina: "A-OTEC",
    marcaEnFases: "OTEC",
  },
  diseno: {
    id: "diseno",
    nombre: "Diseño Gráfico",
    vista: "TGM_PENDIENTE_DISENHO",
    recursos: ["a-dgra", "dgra-a"],
    maquina: "A-DGRA",
    marcaEnFases: "DGRA",
  },
};

/** La sección de siempre. Es la de quien no diga otra cosa: la web era solo de
 *  OT hasta que entró diseño, y todo lo guardado sin sección es suyo. */
export const SECCION_POR_DEFECTO: SeccionId = "ot";

export function esSeccionId(v: unknown): v is SeccionId {
  return v === "ot" || v === "diseno";
}

/** La sección pedida, o la de siempre si no es ninguna conocida.
 *
 *  Nunca lanza: esto llega de la URL y de la BD, y un valor raro no puede
 *  tumbar el tablero. Se cae a OT, que es lo que había antes. */
export function seccionDe(v: unknown): Seccion {
  return SECCIONES[esSeccionId(v) ? v : SECCION_POR_DEFECTO];
}

/** Los recursos de una sección listos para un `IN (…)` de SQL.
 *
 *  Se generan y no se escriben a mano en cada consulta: son literales fijos y
 *  conocidos —salen de esta tabla, nunca de fuera—, así que no hay nada que
 *  parametrizar, pero repetirlos en cinco consultas es lo que los desincroniza.
 *
 *  La comilla se dobla igualmente. No hace falta hoy y no debería hacer falta
 *  nunca; es para que quien añada una sección no tenga que acordarse. */
export function recursosSql(s: Seccion): string {
  return s.recursos.map((r) => `'${r.replace(/'/g, "''")}'`).join(",");
}

/** ¿Esta fase es de esta sección? Mira el nombre del centro, que es lo único
 *  que trae `scg_Fases`. Ver `marcaEnFases` para por qué es un trozo. */
export function esFaseDe(maquina: string, s: Seccion): boolean {
  return maquina.toUpperCase().includes(s.marcaEnFases);
}

/** ¿Es una fase que gestiona CoordinaOT? O sea, de Oficina Técnica o de Diseño
 *  Gráfico.
 *
 *  Es la regla de "esto lo puedo cerrar yo": el taller no, porque no es trabajo
 *  nuestro y cerrarlo sería escribir en el sistema de la fábrica sobre algo que
 *  no hemos hecho.
 *
 *  Antes esto era `esFaseDeOT` a secas, y con Diseño Gráfico dentro eso dejaba
 *  a Carrón sin poder cerrar sus propias operaciones: el servidor se las
 *  rechazaba con un 403. */
export function esFaseDeLaWeb(maquina: string): boolean {
  return Object.values(SECCIONES).some((s) => esFaseDe(maquina, s));
}

/** Los recursos de TODAS las secciones que usan CoordinaOT, listos para un
 *  `IN (…)` de SQL.
 *
 *  Es lo que el Historial usa para decidir qué es trabajo de oficina: un pedido
 *  se enseña entero, con las OF de OT y las de Diseño Gráfico, porque el parte
 *  es del pedido y no de un departamento.
 *
 *  LO QUE NO ENTRA ES EL TALLER, y no por capricho: los minutos que se enseñan
 *  salen de sumar las imputaciones de estas tareas, y quitando el filtro se
 *  cuelan corte, soldadura y confección. Medido sobre pedidos reales
 *  (2026-09-01): SA.26.00498 pasa de 14 minutos a 2010, y SA.26.00860 de 4 a
 *  240. Un tiempo de oficina de "5 horas" que en realidad son 14 minutos no es
 *  un dato de más, es un dato falso. */
export function recursosDeLaWebSql(): string {
  return Object.values(SECCIONES).map(recursosSql).join(",");
}
