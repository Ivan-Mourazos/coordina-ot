// Corre UNA vez al arrancar el servidor Next (antes de aceptar peticiones).
// Precalienta la caché del tablero RPS: la vista TGM_PENDIENTE_OT tarda
// 7-15 s y así se los come el arranque de PM2, no el primer usuario.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // El cierre por inactividad va PRIMERO y sin condiciones: solo toca nuestra
  // SQLite (los intervalos de fichaje), no depende de RPS ni de OLANET. Si
  // colgara del bloque de abajo, en desarrollo con datos mock no correría
  // nunca y un fichaje olvidado seguiría sumando horas.
  const { arrancarCierrePorInactividad } = await import("./lib/server/fichaje-worker");
  arrancarCierrePorInactividad();

  if (process.env.DATASOURCE !== "rps") return;
  // Import dinámico: mssql no debe entrar en el grafo con DATASOURCE=mock.
  const { precalentarTablero } = await import("./lib/server/rps");
  // Fire-and-forget dentro: register no debe retrasar el arranque 15 s.
  precalentarTablero();

  // Sincronización con OLANET. Arranca siempre: en modo sombra las vueltas no
  // hacen nada, así que activar el fichaje es cambiar una variable de entorno
  // y reiniciar, sin tocar código. PM2 corre UNA instancia en modo fork (ver
  // ecosystem.config.cjs), así que no hay dos workers compitiendo por la cola.
  const { arrancarSincronizacion } = await import("./lib/server/olanet-worker");
  arrancarSincronizacion();

  // Vigilancia de partes re-escaneados. Va DESPUÉS del bloque de RPS y dentro
  // de él a propósito: mira ficheros del share de VENTAS, que solo existe
  // cuando la app corre contra los datos reales. Con datos mock no hay partes
  // que mirar y la lista de vigilados estaría vacía igualmente.
  const { arrancarVigilanciaDePartes } = await import("./lib/server/scan-worker");
  arrancarVigilanciaDePartes();
}
