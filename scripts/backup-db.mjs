// Copia de seguridad de la base de CoordinaOT.
//
// POR QUÉ NO ES UN `cp`. La base va en modo WAL: lo escrito últimamente vive
// en `coordina.db-wal` hasta que SQLite lo integra, y en el servidor ese
// fichero llegó a ser MÁS GRANDE que la propia base (2,5 MB de .db y 4,0 MB de
// -wal el 04/09/2026). Un `cp coordina.db` se deja fuera esa mitad y da una
// copia que parece buena hasta el día que hace falta. `.backup()` es la API de
// copia en caliente de SQLite: se lleva el WAL y sale consistente aunque la app
// esté escribiendo.
//
// POR QUÉ NO USA `sqlite3`. El servidor no lo tiene instalado y no hace falta:
// better-sqlite3 ya es dependencia de la app.
//
// Uso:
//   node scripts/backup-db.mjs                    → data/backups/
//   node scripts/backup-db.mjs /mnt/oftecnica/coordina-backups
//
// Guarda `coordina-AAAA-MM-DD.db` y borra las de más de DIAS_QUE_SE_GUARDAN.

import Database from "better-sqlite3";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const DIAS_QUE_SE_GUARDAN = 30;

const origen = process.env.COORDINA_DB_PATH ?? path.join(process.cwd(), "data", "coordina.db");
const destino = process.argv[2] ?? path.join(process.cwd(), "data", "backups");

mkdirSync(destino, { recursive: true });

const dia = new Date().toISOString().slice(0, 10);
const fichero = path.join(destino, `coordina-${dia}.db`);

const db = new Database(origen, { readonly: true });
try {
  await db.backup(fichero);
} finally {
  db.close();
}

// Se comprueba que la copia ABRE y tiene datos. Una copia corrupta que nadie
// mira hasta el día del incendio no es una copia.
const copia = new Database(fichero, { readonly: true });
const tablas = copia.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get();
const acciones = copia.prepare("SELECT COUNT(*) AS n FROM acciones_log").get();
copia.close();

const tamano = (statSync(fichero).size / 1024 / 1024).toFixed(1);
console.log(`Copia hecha: ${fichero} (${tamano} MB, ${tablas.n} tablas, ${acciones.n} acciones)`);

// Rotación: fuera las viejas. Solo toca las que llevan nuestro nombre, no vaya
// a llevarse por delante otra cosa que haya en la carpeta.
const limite = Date.now() - DIAS_QUE_SE_GUARDAN * 86_400_000;
let borradas = 0;
for (const f of readdirSync(destino)) {
  if (!/^coordina-\d{4}-\d{2}-\d{2}\.db$/.test(f)) continue;
  const suyo = path.join(destino, f);
  if (statSync(suyo).mtimeMs < limite) {
    unlinkSync(suyo);
    borradas++;
  }
}
if (borradas > 0) console.log(`Borradas ${borradas} copias de más de ${DIAS_QUE_SE_GUARDAN} días.`);
