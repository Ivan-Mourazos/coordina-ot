// Copia de seguridad de la base de CoordinaOT.
//
// POR QUÉ NO ES UN `cp` DE LA BASE VIVA. Va en modo WAL: lo escrito
// últimamente vive en `coordina.db-wal` hasta que SQLite lo integra, y en el
// servidor ese fichero llegó a ser MÁS GRANDE que la propia base (2,5 MB de
// .db y 4,0 MB de -wal el 04/09/2026). Un `cp coordina.db` se deja fuera esa
// mitad y da una copia que parece buena hasta el día que hace falta.
// `.backup()` es la copia en caliente de SQLite: se lleva el WAL y sale
// consistente aunque la app esté escribiendo.
//
// POR QUÉ SE COPIA PRIMERO EN LOCAL Y LUEGO AL SHARE. SQLite no se lleva bien
// con CIFS: escribiendo el backup directamente en /mnt/oftecnica, el fichero
// se crea pero volver a abrirlo para comprobarlo falla con SQLITE_CANTOPEN —el
// locking de red no da lo que SQLite pide—. Así que la copia y su comprobación
// se hacen en disco local, donde SQLite manda, y al share va un fichero ya
// terminado: eso ya es una copia de fichero normal y corriente.
//
// POR QUÉ NO USA `sqlite3`. El servidor no lo tiene instalado y no hace falta:
// better-sqlite3 ya es dependencia de la app.
//
// Uso:
//   node scripts/backup-db.mjs                    → solo local (data/backups)
//   node scripts/backup-db.mjs /mnt/oftecnica/coordina-backups   → y al share
//
// Guarda `coordina-AAAA-MM-DD.db` y borra las de más de DIAS_QUE_SE_GUARDAN,
// en los dos sitios.

import Database from "better-sqlite3";
import { copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const DIAS_QUE_SE_GUARDAN = 30;

const origen = process.env.COORDINA_DB_PATH ?? path.join(process.cwd(), "data", "coordina.db");
const carpetaLocal = path.join(process.cwd(), "data", "backups");
const carpetaFuera = process.argv[2] ?? null;

const dia = new Date().toISOString().slice(0, 10);
const nombre = `coordina-${dia}.db`;

mkdirSync(carpetaLocal, { recursive: true });
const ficheroLocal = path.join(carpetaLocal, nombre);

// 1. La copia, en local.
const db = new Database(origen, { readonly: true });
try {
  await db.backup(ficheroLocal);
} finally {
  db.close();
}

// 2. Se comprueba que ABRE y que trae datos. Una copia corrupta que nadie mira
//    hasta el día del incendio no es una copia.
const copia = new Database(ficheroLocal, { readonly: true });
const tablas = copia.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get();
const acciones = copia.prepare("SELECT COUNT(*) AS n FROM acciones_log").get();
copia.close();

// Abrirla deja un `-wal` y un `-shm` al lado. No hacen falta —lo que valen ya
// está dentro del .db— y sin borrarlos se acumulan tres ficheros por día, aquí
// y en el share. Se van con un `rm` porque son de la COPIA, no de la base viva.
for (const sufijo of ["-wal", "-shm"]) {
  try {
    unlinkSync(`${ficheroLocal}${sufijo}`);
  } catch {
    // No estaban: SQLite no siempre los deja. Mejor así.
  }
}

const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(1);
console.log(`Local:  ${ficheroLocal} (${mb(ficheroLocal)} MB, ${tablas.n} tablas, ${acciones.n} acciones)`);

// 3. Y fuera de la máquina, que es lo que salva de que se muera el disco.
if (carpetaFuera) {
  mkdirSync(carpetaFuera, { recursive: true });
  const ficheroFuera = path.join(carpetaFuera, nombre);
  copyFileSync(ficheroLocal, ficheroFuera);
  console.log(`Fuera:  ${ficheroFuera} (${mb(ficheroFuera)} MB)`);
}

/** Fuera las viejas. Solo toca las que llevan nuestro nombre, no vaya a
 *  llevarse por delante otra cosa que haya en la carpeta. */
function rotar(carpeta) {
  const limite = Date.now() - DIAS_QUE_SE_GUARDAN * 86_400_000;
  let n = 0;
  for (const f of readdirSync(carpeta)) {
    if (!/^coordina-\d{4}-\d{2}-\d{2}\.db$/.test(f)) continue;
    const suyo = path.join(carpeta, f);
    if (statSync(suyo).mtimeMs < limite) {
      unlinkSync(suyo);
      n++;
    }
  }
  if (n > 0) console.log(`Borradas ${n} copias de más de ${DIAS_QUE_SE_GUARDAN} días en ${carpeta}.`);
}

rotar(carpetaLocal);
if (carpetaFuera) rotar(carpetaFuera);
