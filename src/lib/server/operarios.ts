// ─── Mapa empleado RPS ↔ operario del tablero ────────────────────────────────
// RPS no tiene un departamento fiable (GENEmployee.IDDepartment = null), así
// que "quién es de Oficina Técnica" es configuración nuestra. Confirmado con
// Iván (2026-07-06). Los códigos con prefijo "S" de GENEmployee son duplicados:
// usar siempre el numérico. `codoperario` de tgm_fichajes_olanet es el mismo
// CodEmployee en entero.

const COD_EMPLEADO_A_OPERARIO: Record<string, string> = {
  "10": "alberto", // CARBON SEXTO, ALBERTO
  "120": "jaime", // VAZQUEZ VILLARES, JAIME
  "170": "tamara", // VILLAR FERNANDEZ, TAMARA
  "187": "adrian", // QUINTEIRO VAAMONDE, ADRIAN
  "195": "ivan", // SANCHEZ VAZQUEZ, IVAN
  "146": "angel", // GARCIA COSTOYA, ANGEL
};

/** Id de operario del tablero para un CodEmployee de RPS (o null si no es
 *  de Oficina Técnica). Admite número o texto y descarta los códigos "S…". */
export function operarioDeEmpleado(
  cod: string | number | null | undefined,
): string | null {
  if (cod === null || cod === undefined) return null;
  return COD_EMPLEADO_A_OPERARIO[String(cod).trim()] ?? null;
}
