// Corre UNA vez al arrancar el servidor Next (antes de aceptar peticiones).
// Precalienta la caché del tablero RPS: la vista TGM_PENDIENTE_OT tarda
// 7-15 s y así se los come el arranque de PM2, no el primer usuario.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DATASOURCE !== "rps") return;
  // Import dinámico: mssql no debe entrar en el grafo con DATASOURCE=mock.
  const { precalentarTablero } = await import("./lib/server/rps");
  // Fire-and-forget dentro: register no debe retrasar el arranque 15 s.
  precalentarTablero();
}
