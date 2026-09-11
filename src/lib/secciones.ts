import type { Fase } from "./fases-tablero";

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
  /** De dónde sale su lista de trabajo pendiente.
   *
   *  `vista`  → la vista de RPS (`TGM_PENDIENTE_*`).
   *  `olanet` → las fases vivas de `scg_Fases`, completadas con lo que la
   *             vista tenga y OLANET todavía no.
   *
   *  No es un detalle de implementación, es una diferencia real entre las dos
   *  secciones. Las vistas filtran por `PercentProgress < 100`, y ese número no
   *  mide avance: cada imputación entra con 100, así que una tarea vale 0 hasta
   *  que alguien ficha el primer minuto y 100 desde ese momento (medido el
   *  2026-09-02: en A-DGRA, 1.710 tareas al 100 % todas con imputación y 52 por
   *  debajo todas sin ninguna; en OTEC igual).
   *
   *  En Oficina Técnica eso coincide con "ya está planteada y pasada a
   *  Producción", así que se nota como acierto y la vista se queda. En Diseño
   *  Gráfico no: un trabajo a medias desaparecía del tablero, y lo que un
   *  cierre masivo de RPS daba por acabado no volvía nunca. */
  fuente: "vista" | "olanet";
  /** Todavía no está lista para usarse: se anuncia, pero no enseña trabajo.
   *
   *  Una sección a medias es peor que una sección que no está. Si el tablero
   *  enseña pedidos que no son los que hay que hacer, el equipo aprende a no
   *  fiarse de la lista, y eso no se arregla luego con un despliegue. Mientras
   *  se termina, la web dice que viene y no enseña nada: ni tablero, ni lista,
   *  ni métricas, ni consultas a la BD.
   *
   *  HOY NO LA LLEVA NINGUNA. La llevó Diseño Gráfico desde el 02/09/2026
   *  hasta que su lista se comprobó contra las dos bases (ver ahí abajo), y se
   *  deja puesta para la siguiente sección que entre: ponerla es una línea, y
   *  detrás ya están el aviso en pantalla y el corte de las consultas. */
  enObras?: boolean;
  /** El trozo que llevan en el nombre sus centros en `scg_Fases`.
   *
   *  Se busca un TROZO y no el nombre entero porque en esa columna hay erratas
   *  reales (`A-OTECP`, `24A-OTEC`): buscar "OTEC" las recoge todas, y ninguna
   *  otra sección de la casa lo lleva. Lo mismo vale para "DGRA". */
  marcaEnFases: string;
  /** En qué orden se pintan las columnas del panel. Ausente = el de siempre
   *  (ver FASES en lib/fases-tablero.ts).
   *
   *  Es de PRESENTACIÓN: no cambia en qué fase está un pedido, solo cuál se
   *  enseña antes. Diseño Gráfico quiere delante lo que puede cerrar hoy y al
   *  final lo que está esperando por otro, que es justo al revés que aquí.
   *
   *  Va aquí y no como un condicional dentro del panel porque no lo ordena un
   *  sitio: lo ordenan cuatro (el panel, la tarjeta de cada compañero, su panel
   *  de consulta y el desplegable de "ver todos"). Con un `if` en uno solo, el
   *  mismo trabajo saldría en dos órdenes distintos según dónde se mire. */
  ordenFases?: readonly Fase[];
  /** Las acciones de estado se hacen sobre el PEDIDO entero, no OF por OF.
   *  Ausente = como siempre, cada OF con las suyas.
   *
   *  En Oficina Técnica un pedido se reparte entre varios y cada uno manda lo
   *  suyo cuando lo acaba, así que la OF es la unidad correcta. En Diseño
   *  Gráfico no se reparte nada: una persona hace el pedido entero y lo pasa de
   *  golpe, y si otro tiene que meter mano se lo pasa cuando termina. Mandarlo
   *  OF por OF es repetir cinco veces un gesto que debería ser uno.
   *
   *  NO afecta a fichar ni a anular, y las dos excepciones son a propósito:
   *  fichar es lo único que de verdad se hace sobre una OF suelta —arrancar el
   *  reloj en lo que estás tocando ahora—, y anular no es el paso siguiente del
   *  trabajo sino "esto no debería estar aquí". Las tareas que RPS duplica
   *  cambiando solo el cero de delante (la 2 y la 02) salieron en 37 pedidos y
   *  Diseño es la sección más afectada: con anular a nivel de pedido habría que
   *  cargarse los trabajos buenos para tirar el malo. */
  revisionPorPedido?: boolean;
  /** La barra de filtros se queda en buscador y «Solo atrasados».
   *
   *  Lo pidió Carrón el 11/09/2026: en Diseño Gráfico no reparten trabajo entre
   *  varios ni por familia —lo lleva una persona de punta a punta—, así que
   *  Familia, Prioridad, «Tu trabajo» y las fechas eran controles que nadie
   *  tocaba ocupando la fila entera. Buscar un pedido y ver lo que va tarde es
   *  todo lo que usan. */
  barraSimple?: boolean;
  /** El trabajo de la casa es trabajo del tablero, no una categoría aparte.
   *
   *  En Oficina Técnica un proyecto interno no tiene parte que plantear y vive
   *  en la Lista. En Diseño Gráfico es trabajo suyo de pleno derecho (rótulos,
   *  muestras, cosas de la propia empresa) y tiene que repartirse y pasarse
   *  como cualquier pedido: fuera del tablero, no lo veían. */
  internosComoTrabajo?: boolean;
}

export const SECCIONES: Readonly<Record<SeccionId, Seccion>> = {
  ot: {
    id: "ot",
    nombre: "Oficina Técnica",
    vista: "TGM_PENDIENTE_OT",
    fuente: "vista",
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
    // ABIERTA el 08/09/2026. Estuvo anunciada y sin enseñar trabajo desde el
    // 02/09 porque su lista no era de fiar. Comprobado contra RPS y OLANET a la
    // vez, con la fuente de fases vivas puesta: de las 48 filas que da el
    // tablero, las 48 son tareas de A-DGRA y las 48 cuelgan de una OF que
    // admite imputaciones; ninguna clave sale duplicada por la trampa del cero
    // delante (tarea 2 y tarea 02); y 11 son trabajo que la vista escondía.
    //
    // Lo que NO tapa: dos fases que OLANET da por vivas (0229965/03 y
    // 0230576/06) no existen como tarea en RPS, y sin tarea no hay pedido,
    // cliente ni fecha que enseñar, así que se caen de la lista en silencio.
    fuente: "olanet",
    recursos: ["a-dgra", "dgra-a"],
    maquina: "A-DGRA",
    marcaEnFases: "DGRA",
    // Las seis, en el orden en que las quieren ver. Se escriben TODAS y no
    // solo las dos que se mueven: una lista parcial invita a que la siguiente
    // fase que se añada se quede fuera sin que nadie lo note, y una fase fuera
    // de esta lista es una columna que desaparece del panel.
    ordenFases: [
      "devuelta",
      "sinEmpezar",
      "planteando",
      "listoParaPasar",
      "esperandoRevision",
      "parado",
    ],
    revisionPorPedido: true,
    barraSimple: true,
    internosComoTrabajo: true,
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
