import type { Operario, Pedido } from "./types";
import { SECCION_POR_DEFECTO, type SeccionId } from "./secciones";
import { OPERARIOS, PEDIDOS } from "./mock";

// ─── ÚNICO punto de acceso a datos ───────────────────────────────────────────
// Selector por env: DATASOURCE=mock (por defecto) | rps (SQL Server, oficina).
// La UI consume estas firmas y no sabe de dónde vienen los datos.
// El import del adaptador RPS es dinámico para que `mssql` no entre en el
// grafo cuando se trabaja con mock.

export interface Tablero {
  operarios: Operario[];
  pedidos: Pedido[];
  /** OT sigue fichando también en la herramienta vieja (`FICHAJE_OLANET` no es
   *  `activo`). Lo necesita la interfaz para explicar por qué una OF enseña dos
   *  tiempos y para sacar el cartel del periodo de pruebas; el cálculo de los
   *  minutos ya lo resuelve `aplicarTiemposFichaje`. */
  dobleFichaje?: boolean;
}

/** El tablero de una sección. Sin decir cuál, la de siempre (Oficina Técnica):
 *  así todo lo que ya llamaba a esto sigue viendo lo que veía.
 *
 *  El overlay, el fichaje y las notas NO se filtran por sección: son de la OF,
 *  y una OF solo sale en la lista de su sección. Filtrarlos otra vez aquí sería
 *  repetir el filtro que ya hizo la vista de RPS. */
export async function getTablero(seccion: SeccionId = SECCION_POR_DEFECTO): Promise<Tablero> {
  const base: Tablero =
    process.env.DATASOURCE === "rps"
      ? await (await import("./server/rps")).getTableroRPS(seccion)
      : { operarios: OPERARIOS, pedidos: PEDIDOS };

  // Overlay de CoordinaOT (SQLite): asignaciones, estados del flujo y
  // completados. Import dinámico para que better-sqlite3 no entre en el
  // bundle cliente. Si la BD falla, el tablero sale sin overlay: se pierde
  // flujo pero se sigue viendo el trabajo.
  try {
    const { leerOverlay } = await import("./server/estado-db");
    const { aplicarOverlay } = await import("./server/overlay");
    const conFlujo = aplicarOverlay(base, leerOverlay());

    const { leerTodosIntervalos } = await import("./server/fichaje-db");
    const { aplicarTiemposFichaje } = await import("./server/tiempos");
    const { modoFichaje } = await import("./server/olanet-outbox");
    const dobleFichaje = modoFichaje() !== "activo";
    const conTiempos = aplicarTiemposFichaje(
      conFlujo,
      leerTodosIntervalos(),
      new Date().toISOString(),
      { dobleFichaje },
    );

    // Partes re-escaneados. Aquí NO se toca el disco: solo se apunta qué
    // pedidos hay vivos —para que el vigilante sepa a quién mirar— y se lee lo
    // que ya dejó dicho. El `stat` va contra un share por red y esto corre en
    // cada vuelta del tablero, con 81 pedidos dentro.
    const { registrarPedidos, pedidosCambiados } = await import("./server/scan-db");
    registrarPedidos(conTiempos.pedidos.map((p) => p.codigo));
    const cambiados = pedidosCambiados();

    return {
      ...conTiempos,
      pedidos: conTiempos.pedidos.map((p) =>
        cambiados.has(p.codigo) ? { ...p, scanCambiado: true } : p,
      ),
      dobleFichaje,
    };
  } catch (e) {
    console.warn("[coordina] overlay no disponible:", (e as Error).message);
    return base;
  }
}

// Futuro (acordado con IT / RPS):
//  · Datos de pedido y líneas (OF) vienen de RPS (cliente, código, situación…).
//  · Solo entran a OT los pedidos "procesados" (escaneado + OF asignada + pasado).
//    Los "pendientes de procesar" se podrán consultar pero no son trabajo de OT.
//  · Fichaje de tiempos vía API de RPS (no simular el terminal). Siempre por OF.
//  · Sin login por ahora: la web muestra qué hay para revisar, marcado por revisor.
// export async function asignarOF(ofId: string, operarioId: string | null) { ... }
// export async function ficharOF(ofId, rol, accion) { await fetch('/api/rps/fichaje', ...) }
