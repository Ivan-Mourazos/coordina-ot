import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "../secciones";

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

interface Empleado {
  operarioId: string;
  seccion: SeccionId;
}

const COD_EMPLEADO_A_OPERARIO: Record<string, Empleado> = {
  // ── Oficina Técnica ──
  "10": { operarioId: "alberto", seccion: "ot" }, // CARBON SEXTO, ALBERTO
  "120": { operarioId: "jaime", seccion: "ot" }, // VAZQUEZ VILLARES, JAIME
  "170": { operarioId: "tamara", seccion: "ot" }, // VILLAR FERNANDEZ, TAMARA
  "187": { operarioId: "adrian", seccion: "ot" }, // QUINTEIRO VAAMONDE, ADRIAN
  "195": { operarioId: "ivan", seccion: "ot" }, // SANCHEZ VAZQUEZ, IVAN
  "146": { operarioId: "angel", seccion: "ot" }, // GARCIA COSTOYA, ANGEL
  // ── Diseño Gráfico ──
  "88": { operarioId: "carron", seccion: "diseno" }, // CARRON RODRIGUEZ, JOSE LUIS
  "22": { operarioId: "manuel", seccion: "diseno" }, // GOMEZ CAMINO, MANUEL RAMON
  "48": { operarioId: "smith", seccion: "diseno" }, // SMITH MARTINEZ, FRANCISCO JAVIER
};

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

/** operarioId → sección, derivado del mapa de arriba para que no puedan quedar
 *  descuadrados. */
const SECCION_POR_OPERARIO: Readonly<Record<string, SeccionId>> = Object.fromEntries(
  Object.values(COD_EMPLEADO_A_OPERARIO).map((e) => [e.operarioId, e.seccion]),
);

/** Los operarios de una sección. */
export function operariosDeSeccion(seccion: SeccionId): string[] {
  return Object.values(COD_EMPLEADO_A_OPERARIO)
    .filter((e) => e.seccion === seccion)
    .map((e) => e.operarioId);
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
