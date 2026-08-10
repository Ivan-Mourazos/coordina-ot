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
  // Instancia con nombre (SQLExpress y compañía). Dos formas de llegar, y hay
  // que elegir UNA:
  //
  //  · Por PUERTO fijo (lo que usa OLANET: 54325). Es lo preferible: va directo
  //    y no depende de ningún servicio más.
  //  · Por NOMBRE de instancia, que obliga a preguntarle al SQL Server Browser
  //    por UDP 1434 para que diga en qué puerto escucha. Si ese servicio está
  //    parado o el 1434 cerrado, no conecta.
  //
  // Lo que NO funciona es meter `host\instancia` en `_DB_HOST`: el driver toma
  // la cadena entera como nombre de máquina y no resuelve nada. Es el error
  // natural al ver una instancia con nombre, así que aquí se separa explícito.
  const instancia = v("INSTANCE")?.trim();
  return {
    server: req(`${prefijo}_DB_HOST`),
    // Puerto e instancia son excluyentes: con los dos puestos, tedious falla.
    ...(instancia ? {} : { port: Number(v("PORT") ?? 1433) }),
    database: req(`${prefijo}_DB_DATABASE`),
    user: req(`${prefijo}_DB_USER`),
    password: req(`${prefijo}_DB_PASSWORD`),
    options: {
      encrypt: v("ENCRYPT") !== "false",
      trustServerCertificate: v("TRUST_SERVER_CERTIFICATE") !== "false",
      ...(instancia ? { instanceName: instancia } : {}),
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
