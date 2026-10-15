import { SECCIONES, SECCION_POR_DEFECTO, recursosSql, type SeccionId } from "../secciones";

// ─── Mapa empleado RPS ↔ operario del tablero ────────────────────────────────
// RPS no tiene un departamento fiable (GENEmployee.IDDepartment = null), así
// que "quién es de qué sección" es configuración nuestra. Confirmado con
// Iván (2026-07-06). Los códigos con prefijo "S" de GENEmployee son duplicados:
// usar siempre el numérico. `codoperario` de tgm_fichajes_olanet es el mismo
// CodEmployee en entero.
//
// LA SECCIÓN VA AQUÍ, junto al código, y no en una lista aparte: son el mismo
// dato —quién es esta persona en RPS— y separarlos deja que alguien exista en
// una lista y no en la otra. De la sección salen su lista de trabajo, la
// máquina con la que se escriben sus bonos y qué fases son suyas (ver
// lib/secciones.ts).
//
// Los de Diseño Gráfico se sacaron de sus imputaciones en A-DGRA del último
// año (2026-09-01): son los únicos tres que trabajan ahí. Ojo con Manuel: en
// GENEmployee hay tres "Manuel Gómez" y el de diseño es GOMEZ CAMINO, MANUEL
// RAMON; los dos GOMEZ ALAMANCOS (58, 67) no pisan A-DGRA.
//
// Manuel es de Impresión (su sección de entrada y la máquina con la que ficha)
// pero Carrón y Smith le pasan trabajo en Diseño, así que `tambienEn` lo deja
// también en el tablero, los selectores y las métricas de Diseño. Decisión de
// Iván, 13/10/2026.

interface Empleado {
  operarioId: string;
  correo: string;
  /** Sección principal: la de entrada por defecto y de la que sale su máquina. */
  seccion: SeccionId;
  /** Otras secciones en las que SIGUE contando como de la casa (lista de
   *  trabajo, selectores de revisor y traspaso, métricas). */
  tambienEn?: readonly SeccionId[];
}

const COD_EMPLEADO_A_OPERARIO: Record<string, Empleado> = {
  // ── Oficina Técnica ──
  "10": { operarioId: "alberto", correo: "alberto@toldosgomez.com", seccion: "ot" }, // CARBON SEXTO, ALBERTO
  "120": { operarioId: "jaime", correo: "jaime@toldosgomez.com", seccion: "ot" }, // VAZQUEZ VILLARES, JAIME
  "170": { operarioId: "tamara", correo: "tamara@toldosgomez.com", seccion: "ot" }, // VILLAR FERNANDEZ, TAMARA
  "187": { operarioId: "adrian", correo: "adrian.quinteiro@toldosgomez.com", seccion: "ot" }, // QUINTEIRO VAAMONDE, ADRIAN
  "195": { operarioId: "ivan", correo: "ivan.sanchez@toldosgomez.com", seccion: "ot" }, // SANCHEZ VAZQUEZ, IVAN
  // Ángel no tiene Email en RPS: dirección facilitada por Iván (15/10/2026).
  "146": { operarioId: "angel", correo: "angel@toldosgomez.com", seccion: "ot" }, // GARCIA COSTOYA, ANGEL
  // ── Diseño Gráfico ──
  "88": { operarioId: "carron", correo: "carron@toldosgomez.com", seccion: "diseno" }, // CARRON RODRIGUEZ, JOSE LUIS
  "48": { operarioId: "smith", correo: "javier.smith@toldosgomez.com", seccion: "diseno" }, // SMITH MARTINEZ, FRANCISCO JAVIER
  // ── Impresión Digital ──
  // Manuel también diseña, pero lo suyo es imprimir (Iván, 13/10/2026): entra
  // en Impresión y sigue en Diseño porque Carrón y Smith le pasan trabajo. Su
  // tiempo en A-DGRA sigue contando para Diseño — el tiempo va por recurso, no
  // por persona.
  "22": { operarioId: "manuel", correo: "manuel@toldosgomez.com", seccion: "impresion", tambienEn: ["diseno"] }, // GOMEZ CAMINO, MANUEL RAMON
};

/** Un autor antiguo o ajeno al mapa no debe impedir el correo del pedido. */
export function correoDeOperario(operarioId: string | null | undefined): string | null {
  return Object.values(COD_EMPLEADO_A_OPERARIO).find((e) => e.operarioId === operarioId)?.correo ?? null;
}

/** Id de operario del tablero para un CodEmployee de RPS (o null si no está en
 *  ninguna sección). Admite número o texto y descarta los códigos "S…". */
export function operarioDeEmpleado(
  cod: string | number | null | undefined,
): string | null {
  if (cod === null || cod === undefined) return null;
  return COD_EMPLEADO_A_OPERARIO[String(cod).trim()]?.operarioId ?? null;
}

/** En qué sección trabaja este operario del tablero.
 *
 *  Un operario desconocido cae en la de siempre (OT) en vez de lanzar: esto se
 *  llama con el id que manda el navegador —modelo sin login—, y un id raro no
 *  puede tumbar el tablero. Lo peor que pasa es que vea la lista de OT, que es
 *  lo que veía todo el mundo hasta ahora. */
export function seccionDeOperario(operarioId: string): SeccionId {
  return SECCION_POR_OPERARIO[operarioId] ?? SECCION_POR_DEFECTO;
}

/** La sección de este operario, o null si no está en el mapa.
 *
 *  `seccionDeOperario` cae a OT con un id desconocido, que es lo correcto para
 *  decidir qué lista enseñar pero no para decidir de quién es una tarea: ahí
 *  "no lo sé" tiene que seguir siendo "no lo sé" (ver `leerOverlayPorOrdenes`). */
export function seccionConocidaDeOperario(operarioId: string | null | undefined): SeccionId | null {
  return (operarioId && SECCION_POR_OPERARIO[operarioId]) || null;
}

/** operarioId → sección, derivado del mapa de arriba para que no puedan quedar
 *  descuadrados. */
const SECCION_POR_OPERARIO: Readonly<Record<string, SeccionId>> = Object.fromEntries(
  Object.values(COD_EMPLEADO_A_OPERARIO).map((e) => [e.operarioId, e.seccion]),
);

/** Los operarios de una sección: los que la tienen como principal y los que
 *  además trabajan en ella (`tambienEn`). De aquí salen la zona de cada uno en
 *  el tablero, los selectores y las métricas, así que quien pasa trabajo entre
 *  secciones no puede desaparecer de ninguna. */
export function operariosDeSeccion(seccion: SeccionId): string[] {
  return Object.values(COD_EMPLEADO_A_OPERARIO)
    .filter((e) => e.seccion === seccion || e.tambienEn?.includes(seccion))
    .map((e) => e.operarioId);
}

/** Qué filas de un registro (movimientos, fichajes) cuentan para las métricas
 *  de una sección, como condición SQL con sus parámetros.
 *
 *  Quien está en UNA sola sección cuenta por persona, como siempre: todo lo
 *  que firma es de su sección. Quien está en varias (`tambienEn`: Manuel)
 *  cuenta por MÁQUINA: una fila suya es de esta sección si el recurso de su
 *  tarea (`tarea_maquina`) es de ella, con la misma regla que
 *  `seccionDeRecurso`. Sin eso, su impresión contaría en Diseño y su diseño en
 *  Impresión. Si la tarea no tiene recurso conocido —o es de una sección que no
 *  es suya—, va a su sección principal.
 *
 *  `recursoEn(lista)` lo pone quien llama: devuelve la condición "el recurso de
 *  la tarea de esta fila está en (lista)", porque cada tabla guarda la OF a su
 *  manera. `lista` sale de `recursosSql`: literales nuestros, nada de fuera.
 *
 *  `sinAutor` añade las filas sin operario (solo OT, ver
 *  `leerMovimientosMetricas`). */
export function condicionMetricasSeccionSql(
  seccion: SeccionId,
  columnaOperario: string,
  recursoEn: (lista: string) => string,
  sinAutor = false,
): { sql: string; args: string[] } {
  const partes: string[] = [];
  const args: string[] = [];
  const empleados = Object.values(COD_EMPLEADO_A_OPERARIO);
  const solo = empleados
    .filter((e) => e.seccion === seccion && !e.tambienEn?.length)
    .map((e) => e.operarioId);
  // Igual que antes de que hubiera personas en dos secciones: `IN ()` vacío
  // no casa con nada, que es lo correcto si la sección no tiene a nadie solo.
  partes.push(`${columnaOperario} IN (${solo.map(() => "?").join(",")})`);
  args.push(...solo);

  for (const e of empleados) {
    if (!e.tambienEn?.length) continue;
    const suyas = [e.seccion, ...e.tambienEn];
    if (!suyas.includes(seccion)) continue;
    const deEsta = recursoEn(recursosSql(SECCIONES[seccion]));
    const regla =
      e.seccion === seccion
        ? `(${deEsta} OR NOT (${recursoEn(suyas.map((s) => recursosSql(SECCIONES[s])).join(","))}))`
        : deEsta;
    partes.push(`(${columnaOperario} = ? AND ${regla})`);
    args.push(e.operarioId);
  }
  if (sinAutor) partes.push(`${columnaOperario} IS NULL`);
  return { sql: `(${partes.join(" OR ")})`, args };
}

/** El mismo mapa del revés, para ESCRIBIR fichajes: los bonos de OLANET llevan
 *  el código de RPS, no el id del tablero. Se deriva del mapa de arriba para
 *  que no puedan quedar las dos direcciones descuadradas. */
export const COD_RPS_POR_OPERARIO: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(COD_EMPLEADO_A_OPERARIO).map(([cod, e]) => [e.operarioId, cod]),
  );

/** La máquina de OLANET con la que ficha cada operario, por su id de tablero.
 *
 *  Sale de su sección, así que no puede quedar descuadrada con ella: OT ficha
 *  en A-OTEC y Diseño Gráfico en A-DGRA. Un bono con la máquina equivocada le
 *  mete las horas al departamento que no es. Ver `bonosDe`. */
export const MAQUINA_POR_OPERARIO: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(COD_EMPLEADO_A_OPERARIO).map((e) => [e.operarioId, SECCIONES[e.seccion].maquina]),
);

/** Código de empleado de RPS de un operario del tablero, o null si no lo tiene.
 *  Sin código no se puede fichar en su nombre (ver bonosDe en lib/bonos.ts). */
export function codigoRpsDe(operarioId: string): string | null {
  return COD_RPS_POR_OPERARIO[operarioId] ?? null;
}
