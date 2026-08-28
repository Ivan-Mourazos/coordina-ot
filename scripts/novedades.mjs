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
  for (const linea of mensaje.split(/\r?\n/)) {
    const nov = /^Novedad:\s*(\w+)\s*\|\s*(.+)$/i.exec(linea.trim());
    if (nov) {
      const tipo = nov[1].toLowerCase();
      if (!TIPOS.has(tipo)) {
        console.warn(`· Tipo desconocido "${tipo}", se ignora: ${nov[2]}`);
        continue;
      }
      salida.push({ tipo, titulo: nov[2].trim() });
      continue;
    }
    const det = /^Detalle:\s*(.+)$/i.exec(linea.trim());
    // El detalle acompaña a la novedad de encima; suelto no significa nada.
    if (det && salida.length > 0) salida[salida.length - 1].detalle = det[1].trim();
  }
  return salida;
}

/** Un id que no choque con los que ya hay. El día basta salvo que se despliegue
 *  dos veces la misma jornada, que pasa. */
function idLibre(entradas) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (!entradas.some((e) => e.id === hoy)) return hoy;
  for (let n = 2; ; n++) {
    const id = `${hoy}-${n}`;
    if (!entradas.some((e) => e.id === id)) return id;
  }
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

const entrada = { id: idLibre(entradas), hasta: git("rev-parse", "--short", "HEAD"), cambios };

console.log(`\n${entrada.cambios.length} cambios para la entrada ${entrada.id}:\n`);
for (const c of entrada.cambios) console.log(`  [${c.tipo}] ${c.titulo}`);

if (soloVer) {
  console.log("\n(--ver: no se ha escrito nada)");
  process.exit(0);
}

writeFileSync(DATOS, JSON.stringify([entrada, ...entradas], null, 2) + "\n");
console.log(`\nEscrito en ${DATOS}. Léelas antes de desplegar: las escribiste tú, pero
hace días.`);
