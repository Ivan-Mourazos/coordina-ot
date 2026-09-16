// Deja a alguien SIN PIN, para que elija uno nuevo la próxima vez que entre.
//
// POR QUÉ EXISTE, si la web ya lo hace. Resetear un PIN desde la web exige una
// sesión de supervisor, y para tener sesión hay que poder entrar. El día que la
// cuenta atascada sea justo la de un supervisor —o que no haya ninguno dentro—
// no queda puerta: habría que abrir SQLite a mano con gente esperando. Esto es
// esa puerta, hecha de forma que no se pueda usar mal.
//
// NO LLEVA CONTRASEÑA a propósito: quien puede ejecutarlo ya tiene consola en
// el servidor, y con ella la base entera. Pedirle algo más sería teatro.
//
// Uso:
//   pnpm pin:resetear          → enseña quién puede entrar y quién está sin PIN
//   pnpm pin:resetear tamara   → deja a Tamara sin PIN
//
// No hace falta reiniciar la web: la persona se relee de la base en cada
// petición (ver quienEs en src/lib/server/sesion.ts).

import Database from "better-sqlite3";
import path from "node:path";

const RUTA = process.env.COORDINA_DB_PATH ?? path.join(process.cwd(), "data", "coordina.db");
const quien = process.argv[2]?.trim();

const db = new Database(RUTA);

// Solo la gente que puede entrar hoy. Las bajas se desactivan en vez de
// borrarse (el histórico dice "planteó Jaime"), y resetearle el PIN a una baja
// no significa nada.
const gente = db
  .prepare("SELECT id, nombre, roles, pin_hash FROM persona WHERE activo = 1 ORDER BY id")
  .all();

/** La lista, con una marca en quien todavía no ha elegido PIN. Es lo que se
 *  enseña cuando no se sabe a quién resetear: sin ella habría que adivinar el
 *  id, y un id mal escrito aquí no avisa de nada. */
function lista() {
  console.log(`\nBase: ${RUTA}\n`);
  console.log("Quién puede entrar:\n");
  for (const p of gente) {
    const marca = p.pin_hash === null ? "  ← sin PIN todavía" : "";
    const manda = p.roles.includes("supervisor") ? " (resetea PINs)" : "";
    console.log(`  ${p.id.padEnd(10)} ${p.nombre}${manda}${marca}`);
  }
  console.log("\nPara resetear uno:  pnpm pin:resetear <id>\n");
}

if (!quien) {
  lista();
  db.close();
  process.exit(0);
}

const persona = gente.find((p) => p.id === quien);
if (!persona) {
  console.error(`\nNo hay nadie activo con el id "${quien}".`);
  lista();
  db.close();
  process.exit(1);
}

if (persona.pin_hash === null) {
  console.log(`\n${persona.nombre} YA está sin PIN: lo elegirá la próxima vez que entre.`);
  console.log("No se ha tocado nada.\n");
  db.close();
  process.exit(0);
}

// Sin PIN, no con uno por defecto: un valor conocido lo sabría todo el mundo.
db.prepare("UPDATE persona SET pin_hash = NULL WHERE id = ?").run(persona.id);
db.close();

console.log(`\nHecho: ${persona.nombre} se queda sin PIN.`);
console.log("\nLo que tiene que hacer:");
console.log("  1. Abrir la web y pulsar su cara.");
console.log("  2. Teclear el PIN nuevo DOS veces, y confirmar que es él.");
console.log("\nEl cambio ya está: no hay que reiniciar la web.");
console.log(
  "OJO: hasta que lo elija, cualquiera de la red puede ponérselo y entrar en su\n" +
    "nombre. Avísale para que lo haga ahora, no mañana.\n",
);
