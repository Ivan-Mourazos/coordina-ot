import { afterAll, expect, test } from "vitest";
import { getPool } from "../src/lib/server/db";
import { ctesFinalizacionHistorial } from "../src/lib/server/historial-finalizacion-sql";

// ─── La consulta de cierre contra RPS real, con tablas temporales ───────────
// Se ejecuta el SQL REAL de ctesFinalizacionHistorial sustituyendo dbo.X por
// #UI_X y metiendo filas de prueba: un expect(sql).toContain(...) no puede
// fallar por un error de lógica, esto sí.
//
// Ninguna tabla de producción se toca: conexión de solo lectura y tablas
// #temporales de la sesión. Se tiran al principio de cada caso porque el pool
// reutiliza la conexión entre tests.
//
// Opt-in: VALIDAR_RPS_UI=1 node --env-file=.env.local node_modules/vitest/vitest.mjs
// run scripts/verificar-historial-centros.test.ts

const ACTIVO = process.env.VALIDAR_RPS_UI === "1";

afterAll(async () => {
  if (!ACTIVO) return;
  await (await getPool()).close();
});

const TABLAS = {
  CPRMOResourceMachine: "IDMOTask int, CodMOResourceMachine nvarchar(20), Description nvarchar(80)",
  tgm_estadosof_olanet: "orden nvarchar(20), fase nvarchar(20), idestadoof int, fecha_cambio datetime2",
  CPRManufacturingOrder: "IDManufacturingOrder int, CodManufacturingOrder nvarchar(20), CodCompany nvarchar(3), IDMOSituation nvarchar(40)",
  // La situación de la OF en RPS: FINALIZADA y DETENIDA cierran la tarea
  // aunque OLANET no se haya enterado (ver ctesFinalizacionHistorial).
  CPRManufacturingOrderSituation: "IDManufacturingOrderSituation nvarchar(40), CodSituation nvarchar(5)",
  CPRMOTask: "IDManufacturingOrder int, IDMOTask int, CodMOTask nvarchar(20), Description nvarchar(80), PercentProgress int, RealEndDate datetime2",
  FACOrderSL: "IDOrder int, CodOrder nvarchar(25), OrderDate datetime2, CodCompany nvarchar(3), IDCustomer int, IDCustomerDeliveryAddress int",
  FACOrderLineSL: "IDOrderLine int, IDOrder int, IDManufacturingOrder int, ReceptionDemandDate datetime2, PendingDelivery bit",
  FACDeliveryNoteSL: "IDDeliveryNote int, DeliveryNoteDate datetime2",
  FACDeliveryNoteLineSL: "IDDeliveryNote int, IDOrderLine int",
  // Solo la usa el camino de BÚSQUEDA, y se queda vacía: el LEFT JOIN no
  // aporta nada a lo que se comprueba aquí. Sin sustituirla, el JOIN iba
  // contra la tabla REAL y su IDCustomer (un GUID) reventaba contra el int de
  // estas tablas de prueba.
  FACCustomer: "IDCustomer int, Description nvarchar(100)",
};

interface Fila {
  pedido: string;
  pendiente_total: number;
  trabajo_abierto: number;
  fecha_entregado: Date | null;
}

/** Crea las tablas, mete `filas` y devuelve PedFin por pedido.
 *
 *  Con `pedido` se ejercita el camino de BÚSQUEDA (el que usan la búsqueda y
 *  la ficha del equipo), que arma el SQL de otra manera: tablas temporales de
 *  candidatos y, para el albarán, OUTER APPLY en vez del CTE agrupado. Los dos
 *  caminos tienen que decir lo mismo del mismo pedido. */
async function pedFinCon(filas: string, pedido?: string): Promise<Map<string, Fila>> {
  const pool = await getPool();
  let sql = `${ctesFinalizacionHistorial("ot", pedido ? "o.CodOrder=@pedido" : undefined)}
    SELECT pedido, pendiente_total, trabajo_abierto, fecha_entregado FROM PedFin ORDER BY pedido;`;
  let preparar = "";
  for (const [tabla, columnas] of Object.entries(TABLAS)) {
    preparar += `IF OBJECT_ID('tempdb..#UI_${tabla}') IS NOT NULL DROP TABLE #UI_${tabla};\n`;
    preparar += `CREATE TABLE #UI_${tabla} (${columnas});\n`;
    // "dbo.FACOrderSL" no casa dentro de "dbo.FACOrderLineSL" (ni NoteSL
    // dentro de NoteLineSL): el orden de las sustituciones no importa.
    sql = sql.replaceAll(`dbo.${tabla}`, `#UI_${tabla}`);
  }
  const req = pool.request();
  req.input("pendientes", "<pedidos></pedidos>");
  if (pedido) req.input("pedido", pedido);
  const r = await req.query<Fila>(preparar + filas + sql);
  return new Map(r.recordset.map((f) => [f.pedido.trim(), f]));
}

test.skipIf(!ACTIVO)(
  "pendiente_total solo cuenta tareas con fila en CPRMOResourceMachine",
  async () => {
    const pedidos = await pedFinCon(`
      -- AR.26.00001: tarea de TRABAJO (con centro) sin cerrar → pendiente.
      INSERT INTO #UI_FACOrderSL VALUES (1,'AR.26.00001','2026-09-10','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (1,1,1,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (1,'0000001','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (1,501,'5','19/8 TRABAJO DE VERDAD',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (501,'CALDERERIA','CALDERERIA');

      -- AR.26.00002: la misma tarea SIN centro (Materiales, una nota) → no
      -- pendiente: nunca cierra en OLANET.
      INSERT INTO #UI_FACOrderSL VALUES (2,'AR.26.00002','2026-09-10','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (2,2,2,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (2,'0000002','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (2,502,'5','99 · NOTA SIN CENTRO',0,NULL);
    `);
    expect(pedidos.get("AR.26.00001")?.pendiente_total).toBe(1);
    expect(pedidos.get("AR.26.00002")?.pendiente_total).toBe(0);
  },
  60_000,
);

test.skipIf(!ACTIVO)(
  "trabajo_abierto: FINALIZAR manda, por OF, y sin FINALIZAR cuenta cualquier tarea con centro",
  async () => {
    const pedidos = await pedFinCon(`
      -- AR.26.00003: FINALIZAR (por el CENTRO) cerrada y una calderería
      -- olvidada abierta → sin trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (3,'AR.26.00003','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (3,3,3,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (3,'0000003','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (3,602,'5','SOLDAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (602,'CALDERERIA','CALDERERIA');
      INSERT INTO #UI_CPRMOTask VALUES (3,603,'9','EMPAQUETAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (603,'FINALIZACION','FINALIZACION');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000003','9',3,'2026-09-12');

      -- AR.26.00004: sin FINALIZAR y un corte abierto → con trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (4,'AR.26.00004','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (4,4,4,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (4,'0000004','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (4,604,'3','CORTAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (604,'CORTE MANUAL ARZUA','CORTE MANUAL ARZUA');

      -- AR.26.00005: dos OF. Una con FINALIZAR cerrada; la otra, de Santiago,
      -- sin FINALIZAR y a medias → el pedido tiene trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (5,'AR.26.00005','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (51,5,51,'2026-09-20',1);
      INSERT INTO #UI_FACOrderLineSL VALUES (52,5,52,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (51,'0000051','001',NULL);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (52,'0000052','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (51,651,'9','FINALIZAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (651,'FINALIZACION','FINALIZACION');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000051','9',3,'2026-09-12');
      INSERT INTO #UI_CPRMOTask VALUES (52,652,'2','CONFECCIONAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (652,'CONFECCION SANTIAGO','CONFECCION SANTIAGO');

      -- AR.26.00006: FINALIZAR reconocida por el TEXTO, en otro centro, cerrada
      -- → sin trabajo aunque quede otra abierta.
      INSERT INTO #UI_FACOrderSL VALUES (6,'AR.26.00006','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (6,6,6,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (6,'0000006','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (6,661,'4','COSER',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (661,'COSTURA POLIGONO','COSTURA POLIGONO');
      INSERT INTO #UI_CPRMOTask VALUES (6,662,'8','FINALIZAR Y EMBALAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (662,'MONTAJE DE TOLDOS','MONTAJE DE TOLDOS');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000006','8',3,'2026-09-12');

      -- AR.26.00007: todo cerrado menos FINALIZAR → con trabajo.
      INSERT INTO #UI_FACOrderSL VALUES (7,'AR.26.00007','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (7,7,7,'2026-09-20',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (7,'0000007','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (7,671,'3','CORTAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (671,'CORTE ACRILICO','CORTE ACRILICO');
      INSERT INTO #UI_tgm_estadosof_olanet VALUES ('0000007','3',3,'2026-09-10');
      INSERT INTO #UI_CPRMOTask VALUES (7,672,'9','FINALIZAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (672,'FINALIZACION','FINALIZACION');
    `);
    expect(pedidos.get("AR.26.00003")?.trabajo_abierto).toBe(0);
    expect(pedidos.get("AR.26.00004")?.trabajo_abierto).toBe(1);
    expect(pedidos.get("AR.26.00005")?.trabajo_abierto).toBe(1);
    expect(pedidos.get("AR.26.00006")?.trabajo_abierto).toBe(0);
    expect(pedidos.get("AR.26.00007")?.trabajo_abierto).toBe(1);
  },
  60_000,
);

test.skipIf(!ACTIVO)(
  "fecha_entregado es el ÚLTIMO albarán de las líneas, y null sin albarán",
  async () => {
    const pedidos = await pedFinCon(`
      -- AR.26.00008: dos líneas en dos albaranes → cuenta el del 14.
      INSERT INTO #UI_FACOrderSL VALUES (8,'AR.26.00008','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (81,8,81,'2026-09-11',0);
      INSERT INTO #UI_FACOrderLineSL VALUES (82,8,82,'2026-09-11',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (81,'0000081','001',NULL);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (82,'0000082','001',NULL);
      INSERT INTO #UI_FACDeliveryNoteSL VALUES (901,'2026-09-09');
      INSERT INTO #UI_FACDeliveryNoteSL VALUES (902,'2026-09-14');
      INSERT INTO #UI_FACDeliveryNoteLineSL VALUES (901,81);
      INSERT INTO #UI_FACDeliveryNoteLineSL VALUES (902,82);

      -- AR.26.00009: entregado sin albarán enlazado → null, nunca otra fecha.
      INSERT INTO #UI_FACOrderSL VALUES (9,'AR.26.00009','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (9,9,9,'2026-09-11',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (9,'0000009','001',NULL);
    `);
    expect(pedidos.get("AR.26.00008")?.fecha_entregado?.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(pedidos.get("AR.26.00009")?.fecha_entregado).toBeNull();
  },
  60_000,
);

test.skipIf(!ACTIVO)(
  "buscando un pedido suelto sale lo MISMO que en la lista entera",
  async () => {
    // La lista entera agrupa todos los albaranes de la casa (CTE Albaranes) y
    // la búsqueda mira solo los de las líneas del pedido (OUTER APPLY). Son
    // dos consultas distintas para el mismo dato: si se separaran, la ficha
    // del equipo diría una fecha de salida y la lista del invitado otra.
    const filas = `
      INSERT INTO #UI_FACOrderSL VALUES (10,'AR.26.00010','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (101,10,101,'2026-09-11',0);
      INSERT INTO #UI_FACOrderLineSL VALUES (102,10,102,'2026-09-11',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (101,'0000101','001',NULL);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (102,'0000102','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (101,1011,'3','CORTAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (1011,'CORTE ACRILICO','CORTE ACRILICO');
      INSERT INTO #UI_FACDeliveryNoteSL VALUES (911,'2026-09-09');
      INSERT INTO #UI_FACDeliveryNoteSL VALUES (912,'2026-09-14');
      INSERT INTO #UI_FACDeliveryNoteLineSL VALUES (911,101);
      INSERT INTO #UI_FACDeliveryNoteLineSL VALUES (912,102);

      -- Un segundo pedido, para que la búsqueda tenga de verdad algo que dejar
      -- fuera y no coincida por ser el único.
      INSERT INTO #UI_FACOrderSL VALUES (11,'AR.26.00011','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (111,11,111,'2026-09-11',1);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (111,'0000111','001',NULL);
      INSERT INTO #UI_CPRMOTask VALUES (111,1111,'3','CORTAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (1111,'CORTE ACRILICO','CORTE ACRILICO');
    `;
    const lista = await pedFinCon(filas);
    const buscando = await pedFinCon(filas, "AR.26.00010");

    expect([...buscando.keys()]).toEqual(["AR.26.00010"]);
    expect(buscando.get("AR.26.00010")?.fecha_entregado?.toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(buscando.get("AR.26.00010")).toEqual(lista.get("AR.26.00010"));
  },
  60_000,
);

test.skipIf(!ACTIVO)(
  "lo que Producción cierra a mano en RPS deja de estar pendiente, aunque OLANET no se entere",
  async () => {
    // RPS no sincroniza con OLANET: cuando alguien deja una fase sin finalizar
    // y Producción la remata a mano, o la OF se anula porque al final no se
    // hace, tgm_estadosof_olanet se queda como estaba. Mirando solo OLANET,
    // esas tareas quedaban pendientes para siempre.
    const pedidos = await pedFinCon(`
      INSERT INTO #UI_CPRManufacturingOrderSituation VALUES ('001-36','6');
      INSERT INTO #UI_CPRManufacturingOrderSituation VALUES ('001-37','7');
      INSERT INTO #UI_CPRManufacturingOrderSituation VALUES ('001-33','3');

      -- AR.26.00020: la fase sigue abierta en OLANET, pero RPS le puso fecha
      -- real de fin. Terminada.
      INSERT INTO #UI_FACOrderSL VALUES (20,'AR.26.00020','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (20,20,20,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (20,'0000020','001','001-33');
      INSERT INTO #UI_CPRMOTask VALUES (20,2001,'5','CONFECCIONAR',100,'2026-09-12');
      INSERT INTO #UI_CPRMOResourceMachine VALUES (2001,'CONFECCION SANTIAGO','CONFECCION SANTIAGO');

      -- AR.26.00021: sin fecha en la tarea, pero la OF entera está FINALIZADA.
      INSERT INTO #UI_FACOrderSL VALUES (21,'AR.26.00021','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (21,21,21,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (21,'0000021','001','001-36');
      INSERT INTO #UI_CPRMOTask VALUES (21,2101,'5','CONFECCIONAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (2101,'CONFECCION SANTIAGO','CONFECCION SANTIAGO');

      -- AR.26.00022: DETENIDA. No se llegó a hacer, y no queda nadie esperándola.
      INSERT INTO #UI_FACOrderSL VALUES (22,'AR.26.00022','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (22,22,22,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (22,'0000022','001','001-37');
      INSERT INTO #UI_CPRMOTask VALUES (22,2201,'5','CONFECCIONAR',0,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (2201,'CONFECCION SANTIAGO','CONFECCION SANTIAGO');

      -- AR.26.00023: al 100 % y nada más. El primer fichaje ya pone el
      -- porcentaje (20.804 tareas de 2026 lo tienen sin haber cerrado), así
      -- que esta SIGUE pendiente.
      INSERT INTO #UI_FACOrderSL VALUES (23,'AR.26.00023','2026-09-01','001',1,NULL);
      INSERT INTO #UI_FACOrderLineSL VALUES (23,23,23,'2026-09-20',0);
      INSERT INTO #UI_CPRManufacturingOrder VALUES (23,'0000023','001','001-33');
      INSERT INTO #UI_CPRMOTask VALUES (23,2301,'5','CONFECCIONAR',100,NULL);
      INSERT INTO #UI_CPRMOResourceMachine VALUES (2301,'CONFECCION SANTIAGO','CONFECCION SANTIAGO');
    `);

    expect(pedidos.get("AR.26.00020")?.pendiente_total).toBe(0);
    expect(pedidos.get("AR.26.00021")?.pendiente_total).toBe(0);
    expect(pedidos.get("AR.26.00022")?.pendiente_total).toBe(0);
    expect(pedidos.get("AR.26.00023")?.pendiente_total).toBe(1);
  },
  60_000,
);
