// Vuelca el esquema de la BD de RPS a docs/rps-schema.json.
// Ejecutar EN LA OFICINA (necesita red con el SQL Server):
//   pnpm db:introspect            → todas las tablas (si son ≤ 300)
//   pnpm db:introspect pedido     → solo tablas cuyo nombre contenga "pedido"
// Con el volcado, mapear esquema → tipos de src/lib/types.ts (Pedido, OF).

import sql from "mssql";
import { mkdirSync, writeFileSync } from "node:fs";

const filtro = (process.argv[2] ?? "").toLowerCase();

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Falta ${name}. Ejecuta con: node --env-file=.env.local scripts/introspect-rps.mjs`);
    process.exit(1);
  }
  return v;
}

const config = {
  server: req("RPS_DB_HOST"),
  port: Number(process.env.RPS_DB_PORT ?? 1433),
  database: req("RPS_DB_DATABASE"),
  user: req("RPS_DB_USER"),
  password: req("RPS_DB_PASSWORD"),
  options: {
    encrypt: process.env.RPS_DB_ENCRYPT !== "false",
    trustServerCertificate: process.env.RPS_DB_TRUST_SERVER_CERTIFICATE !== "false",
  },
  connectionTimeout: 10_000,
  requestTimeout: 60_000,
};

const pool = await new sql.ConnectionPool(config).connect();
console.log(`Conectado a ${config.server}/${config.database}`);

// Tablas con nº de filas aproximado (rápido: sys.partitions, sin COUNT).
const tablas = (
  await pool.request().query(`
    SELECT s.name AS esquema, t.name AS tabla,
           SUM(CASE WHEN p.index_id IN (0,1) THEN p.rows ELSE 0 END) AS filas
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.partitions p ON p.object_id = t.object_id
    GROUP BY s.name, t.name
    ORDER BY s.name, t.name
  `)
).recordset;

const seleccion = filtro
  ? tablas.filter((t) => t.tabla.toLowerCase().includes(filtro))
  : tablas;

console.log(`${tablas.length} tablas en total, ${seleccion.length} seleccionadas${filtro ? ` (filtro "${filtro}")` : ""}`);

if (!filtro && tablas.length > 300) {
  console.error(
    "Demasiadas tablas para volcar columnas de todas. Pasa un filtro: pnpm db:introspect <patrón>.\nSe escribe igualmente la LISTA de tablas para elegir el patrón.",
  );
}

const volcarColumnas = filtro || tablas.length <= 300 ? seleccion : [];

// Columnas + PK/FK de las tablas seleccionadas.
const columnas = volcarColumnas.length
  ? (
      await pool.request().query(`
        SELECT c.TABLE_SCHEMA AS esquema, c.TABLE_NAME AS tabla, c.COLUMN_NAME AS columna,
               c.DATA_TYPE AS tipo, c.CHARACTER_MAXIMUM_LENGTH AS longitud,
               c.IS_NULLABLE AS nullable, c.ORDINAL_POSITION AS orden
        FROM INFORMATION_SCHEMA.COLUMNS c
        ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
      `)
    ).recordset.filter((c) =>
      volcarColumnas.some((t) => t.esquema === c.esquema && t.tabla === c.tabla),
    )
  : [];

const fks = (
  await pool.request().query(`
    SELECT fk.name AS fk,
           OBJECT_SCHEMA_NAME(fk.parent_object_id) + '.' + OBJECT_NAME(fk.parent_object_id) AS desde,
           OBJECT_SCHEMA_NAME(fk.referenced_object_id) + '.' + OBJECT_NAME(fk.referenced_object_id) AS hacia
    FROM sys.foreign_keys fk
  `)
).recordset;

mkdirSync("docs", { recursive: true });
const salida = {
  generado: new Date().toISOString(),
  servidor: config.server,
  baseDatos: config.database,
  filtro: filtro || null,
  tablas,
  columnas,
  clavesForaneas: fks,
};
writeFileSync("docs/rps-schema.json", JSON.stringify(salida, null, 2));
console.log(`Escrito docs/rps-schema.json (${columnas.length} columnas de ${volcarColumnas.length} tablas)`);

await pool.close();
