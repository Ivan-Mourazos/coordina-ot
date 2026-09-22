// Devuelve a la cola lo que se descartó porque OLANET NO RESPONDÍA.
//
// Hasta el 22/09, cada vuelta del minuto sin conexión gastaba un intento y a
// los cinco el evento se tiraba. El 21/09 OLANET estuvo casi tres horas caído y
// se perdieron bonos de varios técnicos: no llegaron a RPS y la web los siguió
// sumando por su cuenta (de ahí los 21 min de más en 0232233).
//
// Qué se recupera, y por qué solo eso:
//   · BONOS: un "Failed to connect" asegura que no se escribieron, así que
//     reenviarlos no duplica tiempo en RPS.
//   · FINALIZACIONES (estado 3): el worker se salta el 3 si la fase ya está
//     finalizada, así que repetirlo es inocuo y, si faltaba, necesario.
//   · Los movimientos de empezar/pausar (1 y 2) NO: son de hace horas, y
//     escribirlos ahora devolvería a "en curso" o "pausada" una fase que ya ha
//     avanzado. Se listan para que se vea que existen.
//
//   node scripts/recuperar-caida-olanet.mjs --ver   → solo enseña
//   node scripts/recuperar-caida-olanet.mjs         → los devuelve a la cola

import Database from "better-sqlite3";
import path from "node:path";

const soloVer = process.argv.includes("--ver");
const ruta = process.env.COORDINA_DB_PATH ?? path.join(process.cwd(), "data", "coordina.db");
const db = new Database(ruta, { readonly: soloVer });

const filas = db
  .prepare(
    `SELECT id, tipo, operario_id, creado_at, error, datos
       FROM olanet_pendiente
      WHERE enviado_at IS NOT NULL
        AND error LIKE 'DESCARTADO:%intentos fallidos%'
        AND (error LIKE '%Failed to connect%' OR error LIKE '%ESOCKET%'
             OR error LIKE '%Connection lost%' OR error LIKE '%ECONNRESET%')
      ORDER BY id`,
  )
  .all();

const recuperar = [];
const saltar = [];
for (const f of filas) {
  const d = JSON.parse(f.datos);
  const cuenta =
    f.tipo === "bono"
      ? `bono  ${d.of}/${d.numope} op ${d.operario} ${d.ini} ${Math.round((d.horafin - d.horaini) / 60)} min`
      : `fase  ${d.of}/${d.numope} ${f.operario_id} → estado ${d.estado}`;
  if (f.tipo === "bono" || d.estado === 3) recuperar.push({ id: f.id, cuenta });
  else saltar.push({ id: f.id, cuenta });
}

console.log(`Se devuelven a la cola (${recuperar.length}):`);
for (const r of recuperar) console.log(`  ${r.id}  ${r.cuenta}`);
console.log(`\nSe dejan como están, movimientos viejos (${saltar.length}):`);
for (const r of saltar) console.log(`  ${r.id}  ${r.cuenta}`);

if (soloVer) {
  console.log("\n--ver: no se ha tocado nada.");
} else if (recuperar.length > 0) {
  const upd = db.prepare(
    "UPDATE olanet_pendiente SET enviado_at = NULL, error = NULL, intentos = 0 WHERE id = ?",
  );
  db.transaction(() => {
    for (const r of recuperar) upd.run(r.id);
  })();
  console.log(`\nHecho: ${recuperar.length} de vuelta en la cola. Salen en la próxima vuelta del minuto.`);
}
db.close();
