import { nombrePersona } from "./nombre-persona";

/** RPS guarda «APELLIDO1 APELLIDO2, NOMBRES». Conservamos los nombres y
 *  el primer apellido, incluidas partículas como «de la». */
export function nombreHistorial(nombreRps: string | null | undefined): string {
  const texto = nombreRps?.trim().replace(/\s+/g, " ");
  if (!texto || /^\d+$/.test(texto)) return "Nombre no disponible";
  const [apellidos, nombres] = texto.split(",").map((s) => s.trim());
  const apellido = apellidos.match(/^(?:(?:de|del|la|las|los|da|do|das|dos)\s+)*\S+/i)?.[0] ?? "";
  const nombre = nombres ? `${nombres} ${apellido}` : texto;
  return nombrePersona(nombre);
}
