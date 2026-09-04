#!/usr/bin/env node
// ─── Generar la entrada del log de novedades ─────────────────────────────────
// Recoge las líneas `Novedad:` de los commits desde la última entrada publicada
// y escribe con ellas una entrada nueva en src/lib/novedades-datos.json.
//
// POR QUÉ ASÍ Y NO SACÁNDOLO DEL DIFF. De un cambio en el código se saca qué
// fichero se tocó, no qué significa para quien usa la web. Esto:
//
//     fix(revision): "ya revisada" deja de ser "tiene revisor nombrado"
//
// no se convierte solo en "una OF podía figurar como revisada sin que nadie la
// revisara". Esa frase la escribe quien sabe qué pasaba. Lo que sí se puede
// automatizar —y es donde está el olvido— es recogerlas, ordenarlas y meterlas
// en el fichero.
//
// LA FRASE SE ESCRIBE AL HACER EL CAMBIO, que es cuando se sabe lo que se hizo.
// Acordarse después, al desplegar, releyendo veinte commits, es lo que no se
// hace nunca.
//
// CÓMO SE ESCRIBE, al final del mensaje del commit:
//
//     Novedad: arreglado | Una OF podía figurar como revisada sin que nadie la revisara
//     Detalle: Pasaba si la mandabas a revisar y la recuperabas antes de que la miraran.
//
// `Detalle:` es opcional y acompaña a la `Novedad:` de encima. Un commit puede
// llevar varias, y un commit sin ninguna no sale en el log — hay arreglos que
// no se notan y no deben salir.
//
// Uso:  pnpm novedades          escribe la entrada
//       pnpm novedades --ver    solo enseña lo que haría

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DATOS = "src/lib/novedades-datos.json";
const TIPOS = new Set(["nuevo", "arreglado", "mejor"]);

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** Los commits a mirar: desde donde llegó la última entrada hasta HEAD.
 *
 *  Sin `hasta` —la primera vez, o una entrada escrita a mano— se mira solo el
 *  último commit en vez de la historia entera: recoger de golpe meses de
 *  commits daría una entrada gigante y falsa. Se avisa. */
function rango(entradas) {
  const ultima = entradas[0];
  if (ultima?.hasta) return `${ultima.hasta}..HEAD`;
  console.warn(
    "· La última entrada no dice hasta qué commit llega, así que solo se mira el\n" +
      "  último. Si quieres otro punto de partida, ponle `hasta` a mano.",
  );
  return "HEAD~1..HEAD";
}

/** Las novedades escritas en un mensaje de commit. */
function novedadesDe(mensaje) {
  const salida = [];
  // SIN recortar los espacios de delante: la línea tiene que empezar en la
  // primera columna, como los pies de commit de git. Si no, un ejemplo
  // sangrado dentro del propio mensaje —explicando el formato— se cuela como
  // entrada de verdad. Pasó a la primera.
  for (const linea of mensaje.split(/\r?\n/)) {
    const nov = /^Novedad:\s*(\w+)\s*\|\s*(.+)$/i.exec(linea);
    if (nov) {
      const tipo = nov[1].toLowerCase();
      if (!TIPOS.has(tipo)) {
        console.warn(`· Tipo desconocido "${tipo}", se ignora: ${nov[2]}`);
        continue;
      }
      salida.push({ tipo, titulo: nov[2].trim() });
      continue;
    }
    const det = /^Detalle:\s*(.+)$/i.exec(linea);
    // El detalle acompaña a la novedad de encima; suelto no significa nada.
    if (det && salida.length > 0) salida[salida.length - 1].detalle = det[1].trim();
  }
  return salida;
}

/** La entrada de HOY, si ya hay una.
 *
 *  Desplegar dos veces en la misma jornada es lo normal —se arregla algo por la
 *  mañana y otra cosa por la tarde—, y antes cada pasada creaba su propia
 *  entrada: `2026-09-04`, `-2`, `-3`. El equipo abría el log y veía tres
 *  "actualizaciones" seguidas del mismo día, como si hubiera pasado tres veces
 *  algo importante. Lo que hubo fue un día de trabajo.
 *
 *  Se busca por id y no por la fecha sellada porque esa la pone el servidor al
 *  estrenar la entrada, y aquí todavía no existe. */
function entradaDeHoy(entradas) {
  const hoy = new Date().toISOString().slice(0, 10);
  return { hoy, previa: entradas.find((e) => e.id === hoy) ?? null };
}

const soloVer = process.argv.includes("--ver");
const entradas = JSON.parse(readFileSync(DATOS, "utf8"));

// `%x00` separa los commits: un mensaje lleva saltos de línea y cualquier otro
// separador acabaría partiendo uno por la mitad.
const crudo = git("log", "--reverse", "--format=%B%x00", rango(entradas));
const cambios = crudo
  .split("\0")
  .flatMap((m) => novedadesDe(m));

if (cambios.length === 0) {
  console.log("No hay novedades que publicar: ningún commit trae línea `Novedad:`.");
  process.exit(0);
}

// Agrupadas por tipo y en el orden en que se leen: primero lo que se gana,
// después lo que deja de fallar, y al final lo que solo va mejor.
const ORDEN = { nuevo: 0, arreglado: 1, mejor: 2 };
cambios.sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);

const { hoy, previa } = entradaDeHoy(entradas);

// Si ya hay entrada de hoy, los cambios se AÑADEN a la suya en vez de abrir
// otra. Se ordenan todos juntos —los de esta mañana y los de ahora— para que
// el bloque se lea como una lista sola y no como dos pegadas.
const todos = [...(previa?.cambios ?? []), ...cambios].sort(
  (a, b) => ORDEN[a.tipo] - ORDEN[b.tipo],
);
const entrada = { id: hoy, hasta: git("rev-parse", "--short", "HEAD"), cambios: todos };

console.log(
  `\n${cambios.length} cambios nuevos ${previa ? `añadidos a` : `para`} la entrada ${hoy}` +
    `${previa ? ` (queda con ${todos.length})` : ""}:\n`,
);
for (const c of cambios) console.log(`  [${c.tipo}] ${c.titulo}`);

if (previa) {
  console.log(
    "\n· Se suman a la entrada de hoy, que ya tenía " +
      `${previa.cambios.length}. Si el servidor ya la había publicado, quien la\n` +
      "  hubiera leído vuelve a recibir el aviso: la campana mira cuántos cambios\n" +
      "  trae, no solo cuál es la última entrada.",
  );
}

if (soloVer) {
  console.log("\n(--ver: no se ha escrito nada)");
  process.exit(0);
}

const resto = entradas.filter((e) => e.id !== hoy);
writeFileSync(DATOS, JSON.stringify([entrada, ...resto], null, 2) + "\n");
console.log(`\nEscrito en ${DATOS}. Léelas antes de desplegar: las escribiste tú, pero
hace días.`);
