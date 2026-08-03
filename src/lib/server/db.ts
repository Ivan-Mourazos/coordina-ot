import sql from "mssql";

// ─── Pool de conexión a SQL Server (RPS) ─────────────────────────────────────
// SOLO servidor (API routes / Server Components). Nunca importar desde código
// cliente. Credenciales en .env.local (plantilla en .env.example).

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Falta ${name} en .env.local (copia .env.example y rellena las credenciales de RPS)`,
    );
  }
  return v;
}

/** Config a partir de un prefijo de variables de entorno ({PREFIJO}_DB_HOST…).
 *  Hay dos servidores distintos en juego: RPS (lectura de la vista de OT) y
 *  OLANET (escritura del fichaje). Mismo código, credenciales separadas: el
 *  usuario de lectura no debe poder escribir. */
function config(prefijo: string): sql.config {
  const v = (nombre: string) => process.env[`${prefijo}_DB_${nombre}`];
  return {
    server: req(`${prefijo}_DB_HOST`),
    port: Number(v("PORT") ?? 1433),
    database: req(`${prefijo}_DB_DATABASE`),
    user: req(`${prefijo}_DB_USER`),
    password: req(`${prefijo}_DB_PASSWORD`),
    options: {
      encrypt: v("ENCRYPT") !== "false",
      trustServerCertificate: v("TRUST_SERVER_CERTIFICATE") !== "false",
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 10_000,
    // La vista TGM_PENDIENTE_OT tarda 7-15 s según la hora del día.
    requestTimeout: Number(v("REQUEST_TIMEOUT") ?? 60_000),
  };
}

const pools = new Map<string, Promise<sql.ConnectionPool>>();

function poolDe(prefijo: string): Promise<sql.ConnectionPool> {
  const existente = pools.get(prefijo);
  if (existente) return existente;
  const nuevo = new sql.ConnectionPool(config(prefijo))
    .connect()
    .catch((e) => {
      pools.delete(prefijo); // se resetea para poder reintentar
      throw e;
    });
  pools.set(prefijo, nuevo);
  return nuevo;
}

/** Pool de RPS (lectura). */
export function getPool(): Promise<sql.ConnectionPool> {
  return poolDe("RPS");
}

/** Pool de OLANET (escritura del fichaje). Credenciales aparte: ver
 *  .env.example. Solo se abre si el fichaje está en modo "activo". */
export function getPoolOlanet(): Promise<sql.ConnectionPool> {
  return poolDe("OLANET");
}
