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

function config(): sql.config {
  return {
    server: req("RPS_DB_HOST"),
    port: Number(process.env.RPS_DB_PORT ?? 1433),
    database: req("RPS_DB_DATABASE"),
    user: req("RPS_DB_USER"),
    password: req("RPS_DB_PASSWORD"),
    options: {
      encrypt: process.env.RPS_DB_ENCRYPT !== "false",
      trustServerCertificate:
        process.env.RPS_DB_TRUST_SERVER_CERTIFICATE !== "false",
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 10_000,
    requestTimeout: 15_000,
  };
}

let pool: Promise<sql.ConnectionPool> | null = null;

/** Pool compartido (lazy). Si la conexión falla se resetea para reintentar. */
export function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = new sql.ConnectionPool(config())
      .connect()
      .catch((e) => {
        pool = null;
        throw e;
      });
  }
  return pool;
}
