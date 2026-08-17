import { getPool } from "./db";
import { leerOverlay, leerPedidosPasados, type PasoAProduccion } from "./estado-db";
import { leerTodosIntervalos } from "./fichaje-db";
import { operarioDeEmpleado } from "./operarios";
import { familiaDeTexto } from "./rps";
import { partirOfId } from "../bonos";
import { agregarPorRol } from "../fichaje";
import { OPERARIOS, PEDIDOS } from "../mock";
import { estaFinalizado } from "../types";
import {
  PAGE_SIZE,
  aMaterialOF,
  archivoDeRuta,
  cabeceraADetalle,
  claseDeDocumento,
  construirFiltros,
  filaAItem,
  repartirPorTiempo,
  segmentosEnShare,
  type DocumentoRps,
  type FilaCabecera,
  type FilaPagina,
  type HistorialFiltros,
  type HistorialItem,
  type HistorialOF,
  type HistorialPedidoDetalle,
  type MaterialCrudo,
  type MaterialOF,
} from "../historial";

// ─── Historial permanente: acceso a RPS (solo lectura) ───────────────────────
// Señal de finalización: tgm_estadosof_olanet.idestadoof=3, agrupado por pedido.
// Paginación OFFSET/FETCH (validada: <1 s incluso en profundidad). En modo mock
// se sirve un historial derivado de los pedidos mock, para desarrollo sin BD.

const ES_MOCK = process.env.DATASOURCE !== "rps";

/** Rescate de lo que Oficina Técnica terminó pero nunca dijo que terminaba.
 *
 *  La señal de finalización es `tgm_estadosof_olanet.idestadoof = 3`, y a veces
 *  no llega: la fase queda con su `2` (empezada) y RPS marca la tarea al 100 %
 *  por otro camino. Esas OF se caían por una grieta — fuera del tablero, porque
 *  la vista de pendientes solo trae tareas con `PercentProgress < 100`, y fuera
 *  del Historial, porque le falta el `3`. El caso que lo destapó fue
 *  AR.26.03577, planteado por Alberto y Adrián (34 min entre los dos) y
 *  desaparecido de la web.
 *
 *  Es raro pero no anecdótico: 23 de 2896 tareas de OT terminadas en los
 *  últimos 6 meses, y 1311 OF en total desde 2020.
 *
 *  Se busca AL REVÉS de lo que parece natural. Lo natural sería recorrer las
 *  tareas de OT al 100 % y ver cuáles no tienen su `3`: son 4914 filas y tarda
 *  97 SEGUNDOS. Partiendo de los movimientos de fase —que son 3353— y
 *  preguntando por cada uno si su tarea está al 100 %, lo mismo sale en 540 ms.
 *
 *  La fecha es la del movimiento que sí quedó registrado, no la de la última
 *  imputación: RPS acepta años mal tecleados y por ahí se colaban finalizaciones
 *  en 2062 y 2201. */
const RESCATE_SIN_FIN_DE_FASE = `
        SELECT e.orden, e.fecha_cambio AS fin
        FROM dbo.tgm_estadosof_olanet e
        WHERE e.idestadoof = 2
          AND NOT EXISTS (
            SELECT 1 FROM dbo.tgm_estadosof_olanet e3
            WHERE e3.orden = e.orden AND e3.fase = e.fase AND e3.idestadoof = 3
          )
          AND EXISTS (
            SELECT 1
            FROM dbo.CPRManufacturingOrder mo
            JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
            WHERE mo.CodManufacturingOrder = e.orden AND mo.CodCompany = '001'
              AND t.CodMOTask = e.fase AND t.PercentProgress >= 100
          )`;

const NOMBRE_POR_OPERARIO = new Map(OPERARIOS.map((o) => [o.id, o.nombre]));

export async function leerHistorialPagina(
  f: HistorialFiltros,
): Promise<{ pedidos: HistorialItem[]; hasMore: boolean }> {
  if (ES_MOCK) return paginaMock(f);

  const { clausulas, params } = construirFiltros(f);
  const where = clausulas.length ? `WHERE ${clausulas.join(" AND ")}` : "";
  const off = Math.max(0, f.page) * PAGE_SIZE;

  const pool = await getPool();
  const req = pool.request();
  for (const p of params) req.input(p.nombre, p.valor);
  req.input("off", off);
  req.input("size", PAGE_SIZE + 1); // una fila extra para saber si hay más

  const r = await req.query<FilaPagina>(`
    ;WITH FinOT AS (
      SELECT orden, MAX(fin) AS fin FROM (
        -- Lo normal: la fase de OT registró su "fin" (idestadoof = 3).
        SELECT e.orden, e.fecha_cambio AS fin
        FROM dbo.tgm_estadosof_olanet e
        WHERE e.idestadoof = 3

        UNION ALL

        ${RESCATE_SIN_FIN_DE_FASE}
      ) u
      GROUP BY orden
    ),
    PedFin AS (
      SELECT o.CodOrder AS pedido, MAX(f.fin) AS finalizada,
             MAX(o.IDCustomer) AS idc,
             MAX(o.IDCustomerDeliveryAddress) AS idd,
             COUNT(DISTINCT mo.IDManufacturingOrder) AS n_of
      FROM FinOT f
      JOIN dbo.CPRManufacturingOrder mo
        ON mo.CodManufacturingOrder = f.orden AND mo.CodCompany = '001'
      JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder = mo.IDManufacturingOrder
      JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
      GROUP BY o.CodOrder
    )
    SELECT p.pedido, p.finalizada, p.n_of, cli.Description AS cliente,
           d.Description AS negocio
    FROM PedFin p
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = p.idc
    -- Negocio/local de entrega: misma tabla y mismo join que la cabecera del
    -- detalle, para que la lista y el pedido abierto digan lo mismo.
    LEFT JOIN dbo.FACCustomerDeliveryAddress d ON d.IDCustomerDeliveryAddress = p.idd
    ${where}
    ORDER BY p.finalizada DESC, p.pedido DESC
    OFFSET @off ROWS FETCH NEXT @size ROWS ONLY
  `);

  const filas = r.recordset;
  const hasMore = filas.length > PAGE_SIZE;
  const items = filas.slice(0, PAGE_SIZE).map(filaAItem).map(anadirPasadoAt);

  // Autores y familias se resuelven para la página ENTERA de una vez (ver
  // `extrasDePagina`): una query por pedido serían 40 idas y vueltas.
  const extras = await extrasDePagina(items.map((p) => p.pedido));
  const pedidos = items.map((p) => {
    const suyos = extras.get(p.pedido);
    if (!suyos) return p;
    return {
      ...p,
      ...(suyos.autores.length ? { autores: suyos.autores } : {}),
      ...(suyos.familias.length ? { familias: suyos.familias } : {}),
    };
  });
  return { pedidos, hasMore };
}

/** Fila cruda del minutaje por pedido/orden/empleado (antes de agrupar). */
interface FilaExtra {
  pedido: string | null;
  orden: string | null;
  descripcion: string | null;
  empleado: string | null;
  minutos: number | null;
  /** Los dos que necesita `familiaDeTexto` para dar la misma familia que el
   *  tablero: el cliente (hay clientes que valen por una familia) y la
   *  subfamilia del artículo (que es la que agrupa de verdad). Sin ellos, el
   *  mismo pedido salía como "Suministro" en el Historial y como "Puertas" o
   *  "Assa Abloy" en el tablero. */
  cliente: string | null;
  subfamilia: string | null;
}

/** Lo que la lista necesita de cada pedido y no cabe en la query de página:
 *  quién lo planteó y de qué familias es.
 *
 *  AUTORES, dos fuentes por orden de preferencia:
 *   1. El autor REGISTRADO en CoordinaOT, cuando el pedido se planteó ya con la
 *      web. Es un dato, no una suposición, y manda siempre.
 *   2. Para los anteriores, el reparto de minutos de RPS: quien más tiempo le
 *      echó al pedido es quien lo planteó, y si hay empate van los dos (mismo
 *      criterio y mismo umbral que el detalle — ver `repartirPorTiempo`).
 *
 *  El minutaje se agrega por PEDIDO, no por OF como en el detalle: lo que se
 *  pide fuera es "quién hizo este pedido", y un pedido de 11 OFs lo suele
 *  plantear una persona aunque otra le metiera mano a una OF suelta.
 *
 *  FAMILIAS: `familiaDeTexto` sobre la descripción de las OF, la misma función
 *  y el mismo conjunto de OFs (las de OT) que usa el detalle. Van aquí y no en
 *  la query de página porque la página agrupa por las órdenes YA TERMINADAS y
 *  el detalle mira todas las de OT: si se sacaran de sitios distintos, un
 *  pedido podría enseñar una familia fuera y otra dentro.
 *
 *  UNA sola query para los 40 pedidos de la página, no una por pedido. Medido
 *  en vivo contra RPS (08/2026, páginas 0, 5 y 15, media de 3 pasadas):
 *  113-135 ms, frente a los ~550-640 ms que ya cuesta la query de la página. */
async function extrasDePagina(
  pedidos: string[],
): Promise<Map<string, { autores: string[]; familias: string[] }>> {
  const salida = new Map<string, { autores: string[]; familias: string[] }>();
  if (pedidos.length === 0) return salida;

  const pool = await getPool();
  const req = pool.request();
  // Un parámetro por pedido (@a0, @a1…). Lo que se interpola en el SQL son los
  // NOMBRES de parámetro que genera este bucle, nunca los códigos: esos van
  // como valores por `request.input`.
  const marcas = pedidos.map((codigo, i) => {
    req.input(`a${i}`, codigo);
    return `@a${i}`;
  });

  // Mismos joins y mismo filtro de OT que `leerHistorialPedido`, para que la
  // lista y el detalle cuenten los mismos minutos. El LEFT JOIN a las
  // imputaciones es a propósito: una OF planteada con la web puede no tener ni
  // un minuto en RPS, y aun así hay que traerla para poder casar su autor
  // registrado por número de orden.
  const r = await req.query<FilaExtra>(`
    SELECT o.CodOrder AS pedido, mo.CodManufacturingOrder AS orden,
           mo.Description AS descripcion,
           cli.Description AS cliente, sf.CodProductSubFamily AS subfamilia,
           e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRManufacturingOrder mo
      ON mo.IDManufacturingOrder = l.IDManufacturingOrder AND mo.CodCompany = '001'
    JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
    -- Cliente y subfamilia cuelgan de lo que esta consulta ya recorre (el
    -- pedido de venta y su línea), así que salen sin traer ninguna fila nueva:
    -- son LEFT JOIN a tablas de catálogo, uno a uno.
    LEFT JOIN dbo.STKArticle art ON art.IDArticle = l.IDArticle
    LEFT JOIN dbo.GENProductSubFamily sf
      ON sf.IDProductSubFamily = art.IDProductSubFamily
    LEFT JOIN dbo.CPRImputationMO i
      ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = mo.IDManufacturingOrder
      AND i.ResourceType = 1
    LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
    WHERE o.CodCompany = '001' AND o.CodOrder IN (${marcas.join(",")})
      AND EXISTS (
        SELECT 1 FROM dbo.CPRMOResourceMachine rm
        WHERE rm.IDMOTask = t.IDMOTask AND rm.CodMOResourceMachine IN ('a-otec','otec-a')
      )
    GROUP BY o.CodOrder, mo.CodManufacturingOrder, mo.Description,
             cli.Description, sf.CodProductSubFamily, e.CodEmployee
  `);

  // Por pedido: minutos de cada persona, qué órdenes lo componen (las órdenes
  // son la llave para buscar el autor registrado, que va por OF) y sus familias.
  const minutos = new Map<string, Map<string, number>>();
  const ordenes = new Map<string, Set<string>>();
  const familias = new Map<string, Set<string>>();
  for (const fila of r.recordset) {
    const pedido = (fila.pedido ?? "").trim();
    if (!pedido) continue;

    const orden = (fila.orden ?? "").trim();
    if (orden) {
      const suyas = ordenes.get(pedido) ?? new Set<string>();
      suyas.add(orden);
      ordenes.set(pedido, suyas);
    }

    // Sin artículo (la familia ancha), pero SÍ con cliente y subfamilia: son
    // los dos que deciden hoy, y sin ellos el Historial daría familias
    // distintas de las del tablero para el mismo pedido.
    const suyasFam = familias.get(pedido) ?? new Set<string>();
    suyasFam.add(
      familiaDeTexto(fila.descripcion, null, {
        cliente: fila.cliente,
        subfamilia: fila.subfamilia,
      }),
    );
    familias.set(pedido, suyasFam);

    if (!fila.empleado) continue; // OF sin imputaciones: solo aporta su orden
    const codEmpleado = fila.empleado.trim();
    const idOperario = operarioDeEmpleado(codEmpleado);
    const nombre = (idOperario && NOMBRE_POR_OPERARIO.get(idOperario)) || codEmpleado;
    if (!nombre) continue;
    const porPersona = minutos.get(pedido) ?? new Map<string, number>();
    porPersona.set(nombre, (porPersona.get(nombre) ?? 0) + (fila.minutos ?? 0));
    minutos.set(pedido, porPersona);
  }

  const registrados = autoresRegistrados();
  for (const pedido of pedidos) {
    const deLaWeb = [
      ...new Set([...(ordenes.get(pedido) ?? [])].flatMap((o) => registrados.get(o) ?? [])),
    ];
    // Registrado gana: si de un pedido se plantearon 2 OFs con la web y 3 son
    // viejas, se enseña a quien consta, no una mezcla de dato y suposición.
    const autores = deLaWeb.length
      ? deLaWeb
      : (repartirPorTiempo(minutos.get(pedido))?.autores ?? []);
    salida.set(pedido, { autores, familias: [...(familias.get(pedido) ?? [])] });
  }
  return salida;
}

/** Autores registrados en CoordinaOT, indexados por ORDEN de fabricación.
 *
 *  El overlay va por OF+tarea ("orden:codTarea") y la lista va por pedido, así
 *  que se agrupa por orden: es la pieza que casa una cosa con la otra. Se lee
 *  entero de una vez — son pocas filas y vive en SQLite, igual que en
 *  `pasadosAt`, así que no compensa filtrar por ids. */
function autoresRegistrados(): Map<string, string[]> {
  const porOrden = new Map<string, string[]>();
  let overlay;
  try {
    overlay = leerOverlay();
  } catch (e) {
    // Como en `anadirDesgloseRol`: el historial vive de RPS, y si nuestra BD
    // local falla se sirve sin autor antes que devolver un error.
    console.error("[historial] no se pudo leer el overlay:", e);
    return porOrden;
  }
  for (const [ofId, cambio] of overlay.ofs) {
    if (!cambio.autorId) continue;
    const partes = partirOfId(ofId);
    if (!partes) continue;
    // Si el id no está en el catálogo se enseña tal cual: mejor un id crudo que
    // perder de vista quién fue (mismo criterio que `anadirPasadoAt`).
    const nombre = NOMBRE_POR_OPERARIO.get(cambio.autorId) ?? cambio.autorId;
    const suyos = porOrden.get(partes.of) ?? [];
    if (!suyos.includes(nombre)) suyos.push(nombre);
    porOrden.set(partes.of, suyos);
  }
  return porOrden;
}

/** Autocompletar de cliente: hasta 20 nombres distintos (histórico de OT
 *  finalizadas) que contengan `q`. Verificado en vivo: ~0.5 s (query con el
 *  join FinOT, coherente con `leerHistorialPagina`); no hizo falta simplificar
 *  a FACCustomer directo (esa variante devuelve duplicados sin GROUP BY). */
export async function leerClientesHistorial(q: string): Promise<string[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  if (ES_MOCK) {
    const t = term.toLowerCase();
    return [...new Set(PEDIDOS.map((p) => p.cliente))]
      .filter((c) => c.toLowerCase().includes(t))
      .sort()
      .slice(0, 20);
  }
  const pool = await getPool();
  const r = await pool
    .request()
    .input("q", `%${term}%`)
    .query<{ cliente: string | null }>(`
      -- Las mismas dos fuentes que la lista, para que el autocompletado no se
      -- deje fuera al cliente de un pedido rescatado.
      ;WITH FinOT AS (
        SELECT DISTINCT orden FROM (
          SELECT e.orden FROM dbo.tgm_estadosof_olanet e WHERE e.idestadoof = 3
          UNION ALL
          SELECT u.orden FROM (${RESCATE_SIN_FIN_DE_FASE}) u
        ) t
      )
      SELECT TOP 20 cli.Description AS cliente
      FROM FinOT f
      JOIN dbo.CPRManufacturingOrder mo ON mo.CodManufacturingOrder=f.orden AND mo.CodCompany='001'
      JOIN dbo.FACOrderLineSL l ON l.IDManufacturingOrder=mo.IDManufacturingOrder
      JOIN dbo.FACOrderSL o ON o.IDOrder=l.IDOrder AND o.CodCompany='001'
      JOIN dbo.FACCustomer cli ON cli.IDCustomer=o.IDCustomer
      WHERE cli.Description LIKE @q
      GROUP BY cli.Description
      ORDER BY cli.Description
    `);
  return r.recordset.map((x) => (x.cliente ?? "").trim()).filter(Boolean);
}

interface FilaDetalle {
  orden: string | null;
  descripcion: string | null;
  empleado: string | null;
  minutos: number | null;
}

/** Fila cruda del material, su reserva viva y las notas de cada OF del pedido. */
interface FilaMaterial extends MaterialCrudo {
  orden: string | null;
  notas: string | null;
}

/** Material de cada OF del pedido —lo apartado y lo apuntado— y las notas que
 *  le dejó Producción, por orden.
 *
 *  DOS fuentes, con preferencia por la reserva, que es lo que se pidió:
 *   1. `STKStockReserve` — lo que sigue APARTADO en el almacén. Es el dato
 *      bueno mientras existe, porque dice lo que se separó de verdad.
 *   2. `CPRMOMaterial` — lo que Oficina Técnica APUNTÓ en la OF al plantear.
 *      Es lo que queda cuando la reserva ya se consumió.
 *
 *  Por dónde cuelga la reserva, VERIFICADO contra RPS (08/2026) y no supuesto:
 *  `STKStockReserve.IDItem` es un id polimórfico y `ItemType` dice de qué. Con
 *  `ItemType = 5` (241 de las 256 filas de la tabla) los 241 casan con
 *  `CPRMOMaterial.IDMOMaterial`, sin una sola huérfana; de ahí se sube por
 *  `IDMOTask` a la tarea y a la OF. Las otras 15 filas son `ItemType = 2` y
 *  casan con `FACOrderLineSL.IDOrderLine`: son reservas de línea de VENTA, no
 *  de material de OF. Por eso el filtro por tipo no es decorativo.
 *
 *  Es una tabla VIVA —la reserva se borra al consumir el material—, así que en
 *  el histórico queda poco: de las 36 918 OF de OT ya finalizadas, 140
 *  conservan reserva (el 0,4 %) y 14 419 conservan material apuntado (el 39 %).
 *  Se traen las dos igualmente porque en un pedido RECIÉN cerrado la reserva sí
 *  está, y ahí es el dato que se quiere ver.
 *
 *  La reserva va como SUBCONSULTA con `SUM` y no como JOIN a propósito: un mismo
 *  material puede tener VARIAS reservas. Son 5 materiales en toda la BD, y las
 *  suyas salen de dos lotes de stock distintos (`IDStock` distinto) y suman
 *  exactamente lo apuntado en los 5 casos: 30 + 60 de una lona de 90, 5 + 200 de
 *  una de 205, 55,1 + 21,9 de una de 77… Un JOIN duplicaría esa línea de
 *  material; con `SUM` sale una fila por material, exactamente las mismas que
 *  antes de traer las reservas — verificado en vivo: 72 filas antes y 72 después
 *  en AR.26.03631, 141 y 141 en AR.26.03201.
 *
 *  Se cogen los materiales de TODAS las tareas de la OF, no solo las de OT,
 *  igual que hace la query de reservas del tablero: el criterio es "qué lleva
 *  esta OF", no "qué apuntó Oficina Técnica".
 *
 *  Las notas (`CPRManufacturingOrder.Notes`, "BELEN AB - FINALIZO OP. 10") van
 *  en la misma query porque son de la misma tabla y salen gratis. Son raras —
 *  36 de las 579 OF de la serie 023 — pero cuando están dicen algo.
 *
 *  Coste de traer las reservas, medido en vivo (08/2026, 3 pasadas alternas por
 *  pedido, en régimen): AR.26.03201 (141 materiales, 57 reservados) 21-22 ms
 *  antes y 24-26 ms después; AR.26.03631 (37 materiales) 17-20 y 19-20;
 *  AR.26.03453 17-18 y 19-21. La tabla tiene 256 filas: buscar en ella sale
 *  prácticamente gratis. */
async function leerMaterialesPedido(
  pedido: string,
): Promise<Map<string, { materiales: MaterialOF[]; notas: string }>> {
  const salida = new Map<string, { materiales: MaterialOF[]; notas: string }>();
  if (ES_MOCK) return salida;

  const pool = await getPool();
  const r = await pool
    .request()
    .input("pedido", pedido)
    .query<FilaMaterial>(`
      SELECT mo.CodManufacturingOrder AS orden, mo.Notes AS notas,
             m.Description AS material, m.Quantity AS cantidad,
             (SELECT SUM(r.Quantity) FROM dbo.STKStockReserve r
              WHERE r.IDItem = m.IDMOMaterial AND r.ItemType = 5) AS reservado
      FROM dbo.CPRManufacturingOrder mo
      LEFT JOIN dbo.CPRMOTask tm ON tm.IDManufacturingOrder = mo.IDManufacturingOrder
      LEFT JOIN dbo.CPRMOMaterial m ON m.IDMOTask = tm.IDMOTask
      WHERE mo.CodCompany = '001'
        AND EXISTS (
          SELECT 1 FROM dbo.FACOrderLineSL l
          JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
          WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido
        )
        -- Mismo filtro de OT que el resto del detalle: solo las OF que pasaron
        -- por Oficina Técnica, para no listar material de OF de taller que el
        -- Historial no enseña.
        AND EXISTS (
          SELECT 1 FROM dbo.CPRMOTask t
          JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
          WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder
            AND rm.CodMOResourceMachine IN ('a-otec','otec-a')
        )
    `);

  for (const fila of r.recordset) {
    const orden = (fila.orden ?? "").trim();
    if (!orden) continue;
    const suyo = salida.get(orden) ?? { materiales: [], notas: "" };
    if (!suyo.notas) suyo.notas = (fila.notas ?? "").trim();

    // El LEFT JOIN trae una fila por OF aunque no lleve material: entonces
    // `material` y `cantidad` vienen a null y no hay nada que apuntar.
    if (fila.material !== null || fila.cantidad !== null) {
      // El formato y la preferencia reserva/material viven en `aMaterialOF`,
      // que es lógica pura y está bajo test.
      suyo.materiales.push(aMaterialOF(fila));
    }
    salida.set(orden, suyo);
  }
  return salida;
}

export async function leerHistorialPedido(pedido: string): Promise<HistorialOF[]> {
  if (ES_MOCK) return detalleMock(pedido);

  const pool = await getPool();
  // El material —y ahora también sus reservas— va en su propia query y NO unido
  // a esta: `CPRMOMaterial` cuelga de la tarea, así que unirlo aquí
  // multiplicaría las filas y el SUM de minutos saldría inflado tantas veces
  // como materiales lleve la OF. No es teórico; probado en vivo (08/2026)
  // uniendo material+reservas a esta misma query: AR.26.03453 pasaba de 4
  // minutos por OF a 16-28, AR.26.03631 de 6 a 24-60 y AR.26.03365 de 30 a 240,
  // ocho veces más. Los minutos y el material se piden a la vez pero por
  // separado, y así el detalle no se enlentece por tenerlos separados.
  // ── Por qué la consulta se puede tener que repetir ────────────────────────
  // Se filtra por la tarea de OT (recurso a-otec/otec-a) para que los minutos
  // sean los del PLANTEO y no los de corte, soldadura o confección — ese filtro
  // es el que evita que "6 minutos" salgan como "5 horas" (ver el comentario de
  // arriba).
  //
  // Pero hay pedidos que llegan al Historial SIN ninguna tarea de OT, y no es un
  // caso raro de laboratorio: SA.26.00790 entró al tablero por una tarea de
  // taller (S-CONF, "corte y confección"), alguien de OT le dio a "Pasar a
  // Producción" y desde ese momento está en el Historial. Sus dos OF existen y
  // están enlazadas al pedido, pero ninguna tiene tarea de OT, así que el filtro
  // las tiraba todas y el detalle salía VACÍO: sin OF, sin cliente en la ficha,
  // sin nada. Un panel en blanco que parecía que la web se había roto, cuando lo
  // que pasaba es que OT no había tocado ese pedido.
  //
  // Se resuelve con una segunda consulta que SOLO se lanza cuando la primera no
  // devuelve nada, y que trae las OF SIN tiempo: si no hay tarea de OT, el
  // tiempo de OT es cero, y eso es lo que hay que decir. Sumar ahí las
  // imputaciones de las otras tareas sería peor que el panel en blanco —
  // probado: SA.26.00790 salía con 160 minutos que son de CONFECCIÓN, y el
  // panel los reparte bajo los rótulos "planteo" y "revisión". Un dato de otro
  // taller con la etiqueta de OT es mentira; un cero no.
  //
  // Así ningún pedido de los de siempre cambia ni un minuto: si tiene tarea de
  // OT, manda la primera consulta y la segunda ni se pide.
  const consultaOT = () =>
    pool
      .request()
      .input("pedido", pedido)
      .query<FilaDetalle>(`
        SELECT mo.CodManufacturingOrder AS orden, mo.Description AS descripcion,
               e.CodEmployee AS empleado, SUM(i.ExecutionTime) AS minutos
        FROM dbo.CPRManufacturingOrder mo
        JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
        LEFT JOIN dbo.CPRImputationMO i
          ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = mo.IDManufacturingOrder
          AND i.ResourceType = 1
        LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
        WHERE mo.CodCompany = '001'
          AND EXISTS (
            SELECT 1 FROM dbo.FACOrderLineSL l
            JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
            WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido
          )
          AND EXISTS (
            SELECT 1 FROM dbo.CPRMOResourceMachine rm
            WHERE rm.IDMOTask = t.IDMOTask AND rm.CodMOResourceMachine IN ('a-otec','otec-a')
          )
        GROUP BY mo.CodManufacturingOrder, mo.Description, e.CodEmployee
      `);

  /** Las OF del pedido a secas, sin tiempo ni persona: para los pedidos en los
   *  que OT no llegó a intervenir. */
  const consultaSinOT = () =>
    pool
      .request()
      .input("pedido", pedido)
      .query<FilaDetalle>(`
        SELECT DISTINCT mo.CodManufacturingOrder AS orden, mo.Description AS descripcion,
               CAST(NULL AS varchar(50)) AS empleado, CAST(0 AS int) AS minutos
        FROM dbo.CPRManufacturingOrder mo
        WHERE mo.CodCompany = '001'
          AND EXISTS (
            SELECT 1 FROM dbo.FACOrderLineSL l
            JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
            WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido
          )
      `);

  const [rOT, extrasOF] = await Promise.all([consultaOT(), leerMaterialesPedido(pedido)]);
  const r = rOT.recordset.length > 0 ? rOT : await consultaSinOT();

  // Agrupar por OF (orden): sumar minutos y juntar quién.
  const porOF = new Map<string, HistorialOF>();
  const minutosPorPersona = new Map<string, Map<string, number>>();
  for (const fila of r.recordset) {
    const codigo = (fila.orden ?? "").trim();
    if (!codigo) continue;
    const of = porOF.get(codigo) ?? {
      codigo,
      descripcion: (fila.descripcion ?? "").trim(),
      tiempoImputadoMin: 0,
      quien: [] as string[],
    };
    of.tiempoImputadoMin += fila.minutos ?? 0;
    if (fila.empleado) {
      const codEmpleado = fila.empleado.trim();
      const idOperario = operarioDeEmpleado(codEmpleado);
      const nombre = (idOperario && NOMBRE_POR_OPERARIO.get(idOperario)) || codEmpleado;
      if (nombre && !of.quien.includes(nombre)) of.quien.push(nombre);
      // El minutaje por persona se guarda aparte para poder deducir quién
      // planteó y quién revisó en los pedidos viejos (ver `deducirRoles`).
      // `quien` se queda como está: es la lista que se enseña.
      if (nombre) {
        const porPersona = minutosPorPersona.get(codigo) ?? new Map<string, number>();
        porPersona.set(nombre, (porPersona.get(nombre) ?? 0) + (fila.minutos ?? 0));
        minutosPorPersona.set(codigo, porPersona);
      }
    }
    porOF.set(codigo, of);
  }

  // Material y notas se cuelgan aquí, ya agrupado por OF: van omitidos cuando
  // no hay nada, que es lo que dice el tipo (ausente = esta OF no lleva
  // material apuntado, no "lleva cero").
  for (const [codigo, of] of porOF) {
    const suyo = extrasOF.get(codigo);
    if (!suyo) continue;
    if (suyo.materiales.length) of.materiales = suyo.materiales;
    if (suyo.notas) of.notasProduccion = suyo.notas;
  }

  return anadirDesgloseRol([...porOF.values()]).map((of) =>
    deducirRoles(of, minutosPorPersona.get(of.codigo)),
  );
}

/** Un documento tal y como lo guarda RPS: descripción + ruta al share. La ruta
 *  es de uso interno del servidor y NO se manda al cliente (ver `DocumentoRps`). */
export interface DocumentoRpsCrudo {
  descripcion: string;
  ruta: string;
}

/** Documentos que RPS tiene colgados de un pedido y de sus OF, en orden
 *  ESTABLE.
 *
 *  RPS no guarda ficheros en la BD: `GENEntityDocument` es una tabla de
 *  enlaces (entidad → ruta del share). Los del pedido cuelgan de `OrderSL` y
 *  los de la OF de `ManufacturingOrder`, y son cosas distintas: del pedido
 *  salen el planteamiento, el presupuesto, la rotulación y las fotos; de la OF,
 *  su PDF de taller.
 *
 *  El orden estable es un REQUISITO, no un detalle: la URL con la que se sirve
 *  cada fichero es su posición en esta lista, así que el detalle y la descarga
 *  tienen que ver exactamente lo mismo. Por eso ordena por el id del enlace y
 *  por eso la ruta de descarga llama a esta misma función en vez de repetir la
 *  query.
 *
 *  Verificado en vivo (08/2026): 3960 de los 3962 pedidos AR.26 llevan algún
 *  documento; 18 975 ya descontados los repetidos, 4,8 por pedido de media.
 *  La media engaña un poco: los adjuntos de OF son uno POR OF, así que un
 *  pedido de 12 OFs se planta en 12 documentos él solo (AR.26.03453). */
export async function leerDocumentosPedido(pedido: string): Promise<DocumentoRpsCrudo[]> {
  if (ES_MOCK) return [];

  const pool = await getPool();
  const r = await pool
    .request()
    .input("pedido", pedido)
    .query<{ descripcion: string | null; ruta: string | null }>(`
      ;WITH Docs AS (
        SELECT ed.IDEntityDocument AS id, ed.Description AS descripcion, ed.Path AS ruta
        FROM dbo.FACOrderSL o
        JOIN dbo.GENEntityDocument ed
          ON ed.EntityID = o.IDOrder AND ed.EntityType = 'OrderSL'
        WHERE o.CodCompany = '001' AND o.CodOrder = @pedido
        UNION ALL
        SELECT ed.IDEntityDocument, ed.Description, ed.Path
        FROM dbo.CPRManufacturingOrder mo
        JOIN dbo.GENEntityDocument ed
          ON ed.EntityID = mo.IDManufacturingOrder AND ed.EntityType = 'ManufacturingOrder'
        WHERE mo.CodCompany = '001' AND EXISTS (
          SELECT 1 FROM dbo.FACOrderLineSL l
          JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
          WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido)
      )
      SELECT descripcion, ruta FROM Docs ORDER BY id
    `);

  // Un mismo fichero puede estar enlazado más de una vez; se deja uno.
  const vistos = new Set<string>();
  const salida: DocumentoRpsCrudo[] = [];
  for (const fila of r.recordset) {
    const ruta = (fila.ruta ?? "").trim();
    if (!ruta || vistos.has(ruta)) continue;
    vistos.add(ruta);
    salida.push({ descripcion: (fila.descripcion ?? "").trim(), ruta });
  }
  return salida;
}

/** Los documentos del pedido tal y como los ve el CLIENTE: sin la ruta del
 *  share y con la URL que los sirve.
 *
 *  El índice de la URL es la posición en `leerDocumentosPedido`, que es quien
 *  garantiza el orden estable. Se asigna ANTES de mirar si el documento se
 *  puede servir, para que el número siga cuadrando con la lista del servidor
 *  aunque alguno se quede sin enlace.
 *
 *  Sin URL van los que no son un fichero del archivo (`gdoc://`, discos ajenos):
 *  se quedan en la lista con su descripción, pero no como enlace, para no
 *  enseñar algo que va a dar 404 siempre. */
function aDocumentosDelCliente(
  pedido: string,
  crudos: DocumentoRpsCrudo[],
): DocumentoRps[] {
  return crudos.map((d, i) => ({
    descripcion: d.descripcion,
    archivo: archivoDeRuta(d.ruta),
    clase: claseDeDocumento(d.ruta),
    url: segmentosEnShare(d.ruta)
      ? `/api/historial/${encodeURIComponent(pedido)}/documento/${i}`
      : null,
  }));
}

/** El documento nº `indice` del pedido, con su ruta al share, o null si ese
 *  pedido no tiene tantos.
 *
 *  Existe para que la ruta que sirve el fichero resuelva el índice EN EL
 *  SERVIDOR contra la lista real del pedido. El cliente manda un número y nada
 *  más: nunca una ruta, ni un nombre de fichero, ni un trozo de ninguno de los
 *  dos. Así no hay parámetro suyo que pueda acabar dentro de una ruta de disco,
 *  que es de donde salen los path traversal. */
export async function documentoDePedido(
  pedido: string,
  indice: number,
): Promise<DocumentoRpsCrudo | null> {
  if (!Number.isInteger(indice) || indice < 0) return null;
  const docs = await leerDocumentosPedido(pedido);
  return docs[indice] ?? null;
}

/** Lo que el pedido de venta dice del trabajo: el comentario de cada línea y
 *  las instrucciones de montaje/envío.
 *
 *  Son dos campos distintos y los dos hacían falta, porque el que ya se
 *  enseñaba (`FACOrderSL.Comment`, el "comentario del pedido") resulta ser el
 *  que menos se rellena: 473 de los 3962 pedidos AR.26, un 12 %. Medido en vivo
 *  (08/2026):
 *    · `FACOrderLineSL.Comment` — 7578 de 7585 líneas, el 99,9 %. Es la
 *      descripción real del trabajo vendido ("CAMBIO DE TELA A TOLDO, 342,5 CM
 *      DE FRENTE X 175 DE SALIDA, ACRÍLICO TINTADO EN MASA, STILO FRAGOLA").
 *    · `FACOrderSL.CommentSend` — 1977 de 3962 pedidos, la mitad justa. Es el
 *      montaje: "FECHA SOLICITADA 07/09 / PERSONAL 2 / TIEMPO 1 HORA".
 *
 *  Las líneas van deduplicadas: un pedido de 13 líneas suele repetir el mismo
 *  texto en todas (AR.26.03453 repite "ROBA007621" 13 veces). Deduplicando, las
 *  7578 líneas de la serie se quedan en 7158 textos distintos. */
async function leerComentariosPedido(
  pedido: string,
): Promise<{ lineas: string[]; envio: string | null }> {
  if (ES_MOCK) return { lineas: [], envio: null };

  const pool = await getPool();
  const r = await pool
    .request()
    .input("pedido", pedido)
    .query<{ linea: string | null; envio: string | null }>(`
      SELECT l.Comment AS linea, o.CommentSend AS envio
      FROM dbo.FACOrderSL o
      JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
      WHERE o.CodCompany = '001' AND o.CodOrder = @pedido
      ORDER BY l.NumLine
    `);

  const vistas = new Set<string>();
  const lineas: string[] = [];
  let envio = "";
  for (const fila of r.recordset) {
    if (!envio) envio = (fila.envio ?? "").trim();
    const texto = (fila.linea ?? "").trim();
    if (!texto || vistas.has(texto)) continue;
    vistas.add(texto);
    lineas.push(texto);
  }
  return { lineas, envio: envio || null };
}

/** Deduce quién planteó y quién revisó en los pedidos ANTIGUOS, los cerrados
 *  antes de que CoordinaOT registrara los roles.
 *
 *  RPS solo guarda "esta persona imputó estos minutos a esta OF", sin decir a
 *  qué rol. Pero el reparto lo canta: plantear es el grueso del trabajo y
 *  revisar es un repaso, así que quien más tiempo lleva es el autor y quien
 *  lleva poco es el revisor. El criterio vive en `repartirPorTiempo`, que es
 *  el mismo que usa la lista del historial para su columna de autores.
 *
 *  Es una DEDUCCIÓN, no un dato: puede fallar si dos personas se repartieron
 *  el planteo a partes iguales, o si una revisión se complicó más que el
 *  planteo. Solo se aplica cuando no hay nada mejor — en cuanto el pedido pasa
 *  por CoordinaOT, `anadirDesgloseRol` ya trae los roles de verdad y esta
 *  función no toca nada. */
export function deducirRoles(
  of: HistorialOF,
  minutosPorPersona: Map<string, number> | undefined,
): HistorialOF {
  // Roles reales (fichados en CoordinaOT): mandan siempre.
  if (of.rol) return of;

  const reparto = repartirPorTiempo(minutosPorPersona);
  if (!reparto) return of;
  return {
    ...of,
    rolDeducido: { quienPlanteo: reparto.autores, quienReviso: reparto.revisores },
  };
}

/** Sella el item con la hora a la que se pulsó "pasar a Producción" en
 *  CoordinaOT, si fue desde aquí. Se lee una vez por página; son pocas filas y
 *  vive en SQLite, así que no compensa filtrar por ids. */
function anadirPasadoAt(item: HistorialItem): HistorialItem {
  const paso = pasadosAt().get(item.pedido);
  if (!paso) return item;
  const nombre = paso.operarioId ? NOMBRE_POR_OPERARIO.get(paso.operarioId) : undefined;
  return {
    ...item,
    pasadoAt: paso.at,
    // Si el id no está en el catálogo se enseña tal cual: mejor un id crudo
    // que perder la información de quién fue.
    ...(paso.operarioId ? { pasadoPor: nombre ?? paso.operarioId } : {}),
  };
}

/** Cache muy corta: una misma página llama a esto una vez por pedido. */
let cachePasados: { at: number; mapa: Map<string, PasoAProduccion> } | null = null;
function pasadosAt(): Map<string, PasoAProduccion> {
  if (cachePasados && Date.now() - cachePasados.at < 5_000) return cachePasados.mapa;
  try {
    const mapa = leerPedidosPasados();
    cachePasados = { at: Date.now(), mapa };
    return mapa;
  } catch (e) {
    console.error("[historial] no se pudo leer pedido_overlay:", e);
    return new Map();
  }
}

/** Añade a cada OF el desglose planteo/revisión de lo fichado en CoordinaOT.
 *
 *  RPS agrupa por ORDEN de fabricación y no sabe nada de roles; nuestros
 *  intervalos van por OF+tarea ("orden:codTarea"), así que se suman las tareas
 *  de la misma orden. Las OFs sin intervalos se quedan sin `rol`: no se sabe
 *  el desglose, que no es lo mismo que decir que la revisión fue cero. */
function anadirDesgloseRol(ofs: HistorialOF[]): HistorialOF[] {
  if (ofs.length === 0) return ofs;

  let porOfId;
  try {
    porOfId = agregarPorRol({ intervalos: leerTodosIntervalos() });
  } catch (e) {
    // El historial es de solo lectura y vive de RPS: si nuestra BD local falla,
    // se sirve sin desglose antes que devolver un error.
    console.error("[historial] no se pudo leer el fichaje local:", e);
    return ofs;
  }
  if (porOfId.size === 0) return ofs;

  const porOrden = new Map<string, { planteoMin: number; revisionMin: number; plantear: string[]; revisar: string[] }>();
  for (const [ofId, t] of porOfId) {
    const partes = partirOfId(ofId);
    if (!partes) continue;
    const acc = porOrden.get(partes.of) ?? {
      planteoMin: 0,
      revisionMin: 0,
      plantear: [] as string[],
      revisar: [] as string[],
    };
    acc.planteoMin += t.planteoMin;
    acc.revisionMin += t.revisionMin;
    for (const rol of ["plantear", "revisar"] as const) {
      for (const id of t.operarios[rol]) if (!acc[rol].includes(id)) acc[rol].push(id);
    }
    porOrden.set(partes.of, acc);
  }

  const nombre = (id: string) => NOMBRE_POR_OPERARIO.get(id) ?? id;
  return ofs.map((of) => {
    const t = porOrden.get(of.codigo);
    if (!t) return of;
    return {
      ...of,
      rol: {
        planteoMin: t.planteoMin,
        revisionMin: t.revisionMin,
        quienPlanteo: t.plantear.map(nombre),
        quienReviso: t.revisar.map(nombre),
      },
    };
  });
}

/** Detalle completo del pedido: cabecera (cliente, negocio, ciudad, prioridad,
 *  piezas, fecha solicitada/finalización, familias) + OFs con tiempo imputado.
 *  La cabecera sale de 3 queries pequeñas y rápidas contra tablas indexadas
 *  (verificadas en vivo: <200 ms cada una), separadas de `leerHistorialPedido`
 *  para no acoplar cabecera y detalle de OFs. */
export async function leerHistorialPedidoDetalle(
  pedido: string,
): Promise<HistorialPedidoDetalle> {
  const ofs = await leerHistorialPedido(pedido); // ya respeta mock/rps
  if (ES_MOCK) return detalleCabeceraMock(pedido, ofs);

  const pool = await getPool();

  // Documentos y comentarios no dependen de la cabecera ni entre sí, así que
  // van a la vez: son dos idas y vueltas más a RPS y en serie se notarían.
  // Medido en vivo (08/2026, AR.26.03453): documentos 199 ms, comentarios
  // 74 ms — en paralelo, los ~270 ms se quedan en los ~200 del más lento.
  const [documentos, comentarios] = await Promise.all([
    leerDocumentosPedido(pedido),
    leerComentariosPedido(pedido),
  ]);

  const cab = (
    await pool.request().input("pedido", pedido).query<FilaCabecera>(`
      SELECT TOP 1 o.CodOrder AS pedido, cli.Description AS cliente,
             d.Description AS negocio, o.CityDelivery AS ciudad, o.Comment AS comentario,
             (SELECT MIN(l2.ReceptionDemandDate) FROM dbo.FACOrderLineSL l2
                WHERE l2.IDOrder = o.IDOrder AND l2.ReceptionDemandDate > '2000-01-01') AS solicitada,
             NULL AS prioridad, NULL AS piezas
      FROM dbo.FACOrderSL o
      LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
      LEFT JOIN dbo.FACCustomerDeliveryAddress d ON d.IDCustomerDeliveryAddress = o.IDCustomerDeliveryAddress
      WHERE o.CodOrder = @pedido AND o.CodCompany = '001'
    `)
  ).recordset[0] ?? null;

  const pp = (
    await pool
      .request()
      .input("pedido", pedido)
      .query<{ prioridad: number | null; piezas: number | null }>(`
      SELECT MAX(mo.Priority) AS prioridad, SUM(mo.Quantity) AS piezas
      FROM dbo.CPRManufacturingOrder mo
      WHERE mo.CodCompany = '001'
        AND EXISTS (SELECT 1 FROM dbo.FACOrderLineSL l JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany='001'
                    WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido)
        AND EXISTS (SELECT 1 FROM dbo.CPRMOTask t JOIN dbo.CPRMOResourceMachine rm ON rm.IDMOTask = t.IDMOTask
                    WHERE t.IDManufacturingOrder = mo.IDManufacturingOrder AND rm.CodMOResourceMachine IN ('a-otec','otec-a'))
    `)
  ).recordset[0] ?? { prioridad: null, piezas: null };

  const fin = (
    await pool.request().input("pedido", pedido).query<{ finalizada: Date | null }>(`
      -- Las mismas dos fuentes que la lista (ver RESCATE_SIN_FIN_DE_FASE): si
      -- no, un pedido rescatado salía en el Historial y al abrirlo decía que no
      -- tenía fecha de finalización.
      ;WITH FinOT AS (
        SELECT e.orden, e.fecha_cambio AS fin
        FROM dbo.tgm_estadosof_olanet e
        WHERE e.idestadoof = 3

        UNION ALL

        ${RESCATE_SIN_FIN_DE_FASE}
      )
      SELECT MAX(f.fin) AS finalizada
      FROM FinOT f
      JOIN dbo.CPRManufacturingOrder mo ON mo.CodManufacturingOrder = f.orden AND mo.CodCompany='001'
      WHERE EXISTS (
        SELECT 1 FROM dbo.FACOrderLineSL l JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany='001'
        WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido)
    `)
  ).recordset[0]?.finalizada ?? null;

  const fila: FilaCabecera = cab ?? {
    pedido,
    cliente: null,
    negocio: null,
    ciudad: null,
    comentario: null,
    solicitada: null,
    prioridad: null,
    piezas: null,
  };
  fila.prioridad = pp.prioridad;
  fila.piezas = pp.piezas;

  const familias = [...new Set(ofs.map((of) => familiaDeTexto(of.descripcion, null)))];
  const finalizada = fin ? fin.toISOString() : null;
  return cabeceraADetalle(fila, ofs, finalizada, familias, {
    documentos: aDocumentosDelCliente(pedido, documentos),
    comentariosLinea: comentarios.lineas,
    comentarioEnvio: comentarios.envio,
  });
}

// ── Fallback mock (desarrollo sin BD) ──
// `estaFinalizado` y no el predicado a mano que había aquí copiado: era el
// mismo de antes de que existieran las OF anuladas, así que un pedido con una
// anulada y el resto aprobadas no llegaba nunca al Historial. Por lo mismo, las
// anuladas tampoco cuentan en `nOf`: no son trabajo hecho por OT.
function pedidosFinalizadosMock(): HistorialItem[] {
  return PEDIDOS.filter(estaFinalizado)
    .map((p) => {
      // Quien lo pasó: el revisor que lo aprobó. En RPS ese dato sale del
      // registro real; aquí se deriva para que la columna "pasado por" tenga
      // algo que enseñar en simulación en vez de quedar siempre vacía.
      const revisor = p.ofs.find((o) => o.revisorId)?.revisorId ?? null;
      const nombre = OPERARIOS.find((o) => o.id === revisor)?.nombre;
      // Autores: los registrados en las OFs. En RPS los pedidos viejos se
      // deducen del minutaje (ver `autoresDePagina`), pero en mock no hay
      // imputaciones que repartir, así que manda el dato de la OF. Las anuladas
      // no cuentan, por lo mismo que no cuentan en `nOf`.
      const autores = [
        ...new Set(
          p.ofs
            .filter((o) => o.estado !== "anulada")
            .map((o) => o.autorId)
            .filter((id): id is string => Boolean(id))
            .map((id) => OPERARIOS.find((x) => x.id === id)?.nombre ?? id),
        ),
      ];
      // Familias por el mismo camino que en RPS (`familiaDeTexto` sobre la
      // descripción de la OF), para que la lista mock enseñe los mismos chips.
      const familias = [
        ...new Set(
          p.ofs
            .filter((o) => o.estado !== "anulada")
            .map((o) => familiaDeTexto(o.descripcion, null)),
        ),
      ];
      return {
        pedido: p.codigo,
        cliente: p.cliente,
        finalizada: `${p.fechaPlanificacion}T00:00:00.000Z`,
        nOf: p.ofs.filter((o) => o.estado !== "anulada").length,
        ...(nombre ? { pasadoPor: nombre } : {}),
        ...(autores.length ? { autores } : {}),
        ...(familias.length ? { familias } : {}),
        ...(p.negocio ? { negocio: p.negocio } : {}),
      };
    })
    .sort((a, b) => b.finalizada.localeCompare(a.finalizada) || b.pedido.localeCompare(a.pedido));
}

function paginaMock(f: HistorialFiltros): { pedidos: HistorialItem[]; hasMore: boolean } {
  let todos = pedidosFinalizadosMock();
  const q = f.q?.trim().toLowerCase();
  if (q)
    todos = todos.filter(
      (p) => p.pedido.toLowerCase().includes(q) || (p.cliente ?? "").toLowerCase().includes(q),
    );
  if (f.desde?.trim()) todos = todos.filter((p) => p.finalizada >= f.desde!.trim());
  if (f.hasta?.trim()) todos = todos.filter((p) => p.finalizada < f.hasta!.trim());
  if (f.cliente?.trim()) todos = todos.filter((p) => p.cliente === f.cliente!.trim());
  // El mock no tiene subfamilias de RPS (es data inventada), así que aquí se
  // filtra por la familia que ya lleva cada OF. Contra la base de verdad el
  // filtro pregunta por `CodProductSubFamily`, ver `clausulasDe`.
  const fam = f.familia?.trim();
  if (fam) {
    // `endsWith("/…")` por las familias compuestas ("CAMION/LONASNUEVAS"): el
    // chip filtra por la subfamilia, así que trae las lonas nuevas de todas las
    // familias. Igual que contra la base, que pregunta por
    // `CodProductSubFamily` sin mirar de qué cuelga.
    const coincide = (familia: string) => familia === fam || familia.endsWith(`/${fam}`);
    const pedidosFam = new Set(
      PEDIDOS.filter((p) => p.ofs.some((of) => coincide(of.familia))).map((p) => p.codigo),
    );
    todos = todos.filter((p) => pedidosFam.has(p.pedido));
  }
  const off = Math.max(0, f.page) * PAGE_SIZE;
  const pagina = todos.slice(off, off + PAGE_SIZE + 1);
  return {
    pedidos: pagina.slice(0, PAGE_SIZE).map(anadirPasadoAt),
    hasMore: pagina.length > PAGE_SIZE,
  };
}

function detalleMock(pedido: string): HistorialOF[] {
  const p = PEDIDOS.find((x) => x.codigo === pedido);
  if (!p) return [];
  const nombre = (id: string | null) => (id ? [NOMBRE_POR_OPERARIO.get(id) ?? id] : []);
  return p.ofs.map((of) => ({
    codigo: of.codigo,
    descripcion: of.descripcion,
    tiempoImputadoMin: of.tiempoPlanteoMin + of.tiempoRevisionMin,
    quien: [],
    // Material del mock: lo único que la OF simulada tiene es `reservasDetalle`,
    // que en el tablero YA son reservas, así que van marcadas como apartadas.
    // No se inventa material apuntado: en mock no existe ese dato y enseñarlo
    // como si existiera sería mentir en desarrollo. Las OF sin reservas se
    // quedan sin materiales, igual que en RPS.
    ...(of.reservasDetalle?.length
      ? { materiales: of.reservasDetalle.map((texto) => ({ texto, apartado: true })) }
      : {}),
    rol: {
      planteoMin: of.tiempoPlanteoMin,
      revisionMin: of.tiempoRevisionMin,
      quienPlanteo: nombre(of.autorId),
      quienReviso: nombre(of.revisorId),
    },
  }));
}

function detalleCabeceraMock(pedido: string, ofs: HistorialOF[]): HistorialPedidoDetalle {
  const p = PEDIDOS.find((x) => x.codigo === pedido);
  const familias = [...new Set(ofs.map((of) => familiaDeTexto(of.descripcion, null)))];
  return cabeceraADetalle(
    {
      pedido,
      cliente: p?.cliente ?? null,
      negocio: p?.negocio ?? null,
      ciudad: p?.ciudadEntrega ?? null,
      comentario: p?.comentarioVenta ?? null,
      solicitada: p ? p.fechaSolicitud : null,
      prioridad: p?.prioridad ?? null,
      piezas: p ? p.ofs.reduce((n, o) => n + o.piezas, 0) : null,
    },
    ofs,
    p ? `${p.fechaPlanificacion}T00:00:00.000Z` : null,
    familias,
  );
}
