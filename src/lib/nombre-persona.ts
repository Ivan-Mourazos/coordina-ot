// ─── Nombres de personas tal como se dicen ───────────────────────────────────
// RPS guarda los nombres como una lista de archivo: apellidos primero, todo en
// mayúsculas y sin tildes en la parte del nombre de pila —"CASTRO MOURIÑO, JUAN
// JOSE"—. Así no se lee ni se dice: en la oficina eso es "Juan José Castro
// Mouriño". Enseñarlo crudo, además, mete un bloque de mayúsculas en medio de
// una lista que va en minúscula y se lleva la mirada.
//
// Tres cosas hay que arreglar, y en este orden:
//   1. Dar la vuelta a la coma.
//   2. Pasar a mayúscula inicial, respetando las partículas ("de", "da", "los")
//      que en castellano y en gallego van en minúscula dentro del nombre.
//   3. Devolver las tildes. Esto no se puede deducir: "GARCIA" es "García" pero
//      "PLA" no lleva nada, y "JOSE" es "José" mientras que "NOE" es "Noé". Va
//      con diccionario, que es lo único honesto — lo que no esté en él se queda
//      sin tilde antes que inventarle una.
//
// El diccionario cubre los apellidos y nombres más frecuentes de Galicia y de
// España, que es de donde es toda la plantilla. Añadir uno es añadir una línea.

/** Partículas que van en minúscula dentro de un nombre, salvo al principio. */
const PARTICULAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "da", "do", "das", "dos", "i"]);

/** Palabras con tilde que RPS guarda sin ella. Clave sin tildes y en
 *  minúscula; valor tal como se escribe. */
const CON_TILDE: Record<string, string> = {
  // Apellidos patronímicos, que son los que más se repiten
  garcia: "García", martinez: "Martínez", fernandez: "Fernández",
  gonzalez: "González", rodriguez: "Rodríguez", lopez: "López",
  perez: "Pérez", sanchez: "Sánchez", gomez: "Gómez", diaz: "Díaz",
  vazquez: "Vázquez", jimenez: "Jiménez", ramirez: "Ramírez",
  dominguez: "Domínguez", gutierrez: "Gutiérrez", alvarez: "Álvarez",
  hernandez: "Hernández", suarez: "Suárez", benitez: "Benítez",
  nunez: "Núñez", "núñez": "Núñez", nuñez: "Núñez", velazquez: "Velázquez",
  marquez: "Márquez", vasquez: "Vásquez", ordonez: "Ordóñez",
  yanez: "Yáñez", yañez: "Yáñez", ibanez: "Ibáñez", ibañez: "Ibáñez",
  bautista: "Bautista", calvino: "Calviño", pineiro: "Piñeiro",
  pardinas: "Pardiñas", sanmartin: "Sanmartín", seijas: "Seijas",
  otero: "Otero", varela: "Varela", ferreiro: "Ferreiro",
  cacharron: "Cacharrón", vilarino: "Vilariño", castineira: "Castiñeira",
  mourino: "Mouriño", valino: "Valiño",
  // Nombres de pila
  jose: "José", jesus: "Jesús", angel: "Ángel", angeles: "Ángeles",
  ramon: "Ramón", andres: "Andrés", adrian: "Adrián", ivan: "Iván",
  oscar: "Óscar", joaquin: "Joaquín", martin: "Martín", ruben: "Rubén",
  german: "Germán", hector: "Héctor", victor: "Víctor", nicolas: "Nicolás",
  tomas: "Tomás", matias: "Matías", cesar: "César", damian: "Damián",
  fabian: "Fabián", julian: "Julián", sebastian: "Sebastián",
  cristobal: "Cristóbal", maximo: "Máximo", moises: "Moisés",
  simon: "Simón", anibal: "Aníbal", aaron: "Aarón", eloy: "Eloy",
  felix: "Félix", raul: "Raúl", benjamin: "Benjamín", agustin: "Agustín",
  maria: "María", lucia: "Lucía", sofia: "Sofía", rocio: "Rocío",
  belen: "Belén", ines: "Inés", monica: "Mónica", veronica: "Verónica",
  concepcion: "Concepción", asuncion: "Asunción", encarnacion: "Encarnación",
  purificacion: "Purificación", inmaculada: "Inmaculada", covadonga: "Covadonga",
  begona: "Begoña", begoña: "Begoña", nuria: "Nuria", raquel: "Raquel",
};

/** Una palabra suelta, ya en minúscula, puesta como se escribe. */
function palabra(p: string, primera: boolean): string {
  if (p.length === 0) return p;
  if (!primera && PARTICULAS.has(p)) return p;
  const conTilde = CON_TILDE[p];
  if (conTilde) return conTilde;
  // Los compuestos con guion llevan mayúscula en las dos mitades
  // ("Vila-Real"), así que se resuelve cada una por su cuenta.
  if (p.includes("-")) return p.split("-").map((t) => palabra(t, true)).join("-");
  return p[0].toLocaleUpperCase("es") + p.slice(1);
}

/** "CASTRO MOURIÑO, JUAN JOSE" → "Juan José Castro Mouriño".
 *
 *  Sin coma se devuelve tal cual (ya puesto): no hay nada que dar la vuelta, y
 *  adivinar dónde acaban los apellidos sería inventar. Vacío devuelve vacío;
 *  quien lo pinte decidirá qué poner en su lugar. */
export function nombrePersona(crudo: string): string {
  const limpio = (crudo ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  const coma = limpio.indexOf(",");
  const ordenado =
    coma < 0
      ? limpio
      : [limpio.slice(coma + 1).trim(), limpio.slice(0, coma).trim()].filter(Boolean).join(" ");
  return ordenado
    .toLocaleLowerCase("es")
    .split(" ")
    .map((p, i) => palabra(p, i === 0))
    .join(" ");
}

/** Iniciales para el avatar: la primera del nombre y la del primer apellido.
 *
 *  Se calculan sobre el nombre YA ordenado, así que "Juan José Castro Mouriño"
 *  da "JC" y no "JJ": las dos jotas del nombre de pila no distinguen a nadie. */
export function inicialesDe(nombre: string): string {
  const partes = nombre.split(" ").filter((p) => p && !PARTICULAS.has(p.toLocaleLowerCase("es")));
  if (partes.length === 0) return "?";
  const primera = partes[0][0];
  // El apellido es la primera palabra que no forme parte del nombre compuesto.
  // Sin forma de saber dónde acaba el nombre, se toma la penúltima si hay tres
  // o más ("Juan José | Castro | Mouriño" → C) y la última si hay dos.
  const segunda = partes.length >= 3 ? partes[partes.length - 2][0] : partes[partes.length - 1]?.[0];
  return `${primera}${partes.length > 1 ? segunda : ""}`.toLocaleUpperCase("es");
}
