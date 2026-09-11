import { agruparTiemposPorCentro, centroDeTareaHistorial, claveTareaHistorial, type FilaTiempoCentro } from "../historial-centros";
import { SECCIONES, recursosSql, seccionDe, type SeccionId } from "../secciones";
import { getPool } from "./db";
import { fotosDeVisita } from "./fotos-visita";
import { ctesFinalizacionHistorial } from "./historial-finalizacion-sql";
import { nombresHistorial } from "./nombres-historial";
import { nombreHistorial } from "../nombre-historial";
import { leerOverlay, leerPedidosPasados, type PasoAProduccion } from "./estado-db";
import { leerTodosIntervalos } from "./fichaje-db";
import { operarioDeEmpleado } from "./operarios";
import { familiaDeTexto } from "./rps";
import { partirOfId } from "../bonos";
import { agregarPorRol } from "../fichaje";
import { OPERARIOS, PEDIDOS } from "../mock";
import { esCodigoPedido, estaFinalizado } from "../types";
import {
  PAGE_SIZE,
  aMaterialOF,
  archivoDeRuta,
  cabeceraADetalle,
  claseDeDocumento,
  construirFiltros,
  coincideBusquedaHistorial,
  filaAItem,
  repartirPorTiempo,
  resumirTrabajoPedidos,
  type TrabajoPedido,
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
// Cierre de todas las tareas de la sección; sin tareas propias, de todas.
// Paginación OFFSET/FETCH después de excluir pendientes. En modo mock
// se sirve un historial derivado de los pedidos mock, para desarrollo sin BD.

const ES_MOCK = process.env.DATASOURCE !== "rps";
const textoXml = (texto: string) => texto.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

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
  // Buscar antes de agregar el histórico. El cierre se exige también al buscar.
  const codigoExacto = f.q?.trim().toUpperCase();
  const busqueda = codigoExacto && esCodigoPedido(codigoExacto) ? "o.CodOrder=@pedidoExacto" : f.q?.trim() ? clausulas[0] : undefined;
  const otrosFiltros = busqueda ? clausulas.slice(1) : clausulas;
  const off = Math.max(0, f.page) * PAGE_SIZE;

  const pool = await getPool();
  const req = pool.request();
  for (const p of params) req.input(p.nombre, p.valor);
  if (codigoExacto && esCodigoPedido(codigoExacto)) req.input("pedidoExacto", codigoExacto);
  req.input("pendientes", `<pedidos>${(f.pendientes ?? []).map((codigo) => `<p>${textoXml(codigo)}</p>`).join("")}</pedidos>`);
  req.input("off", off);
  req.input("size", PAGE_SIZE + 1); // una fila extra para saber si hay más

  // Cuándo lo pasamos NOSOTROS a Producción, para poder ordenar por eso.
  const pasados = pasadosParaOrden(req, seccionDe(f.seccion).id);
  const fechaPasado = `COALESCE(${pasados.columna}, p.finalizada)`;
  const cierre = `((p.tiene_seccion=1 AND (p.pendiente_seccion=0 OR ${pasados.columna} IS NOT NULL)) OR (p.tiene_seccion=0 AND p.pendiente_total=0))`;
  // Los filtros de fecha usan la misma fecha que la fila y la ordenación.
  // RPS puede seguir sin fecha de cierre después de pulsar Pasar aquí.
  const where = `WHERE ${[cierre, ...otrosFiltros.map((filtro) => filtro.replaceAll("p.finalizada", fechaPasado))].join(" AND ")}`;

  const r = await req.query<FilaPagina>(`
    ${ctesFinalizacionHistorial(seccionDe(f.seccion).id, busqueda)}
    ${pasados.cte}
    SELECT p.pedido, p.finalizada, p.fecha_pedido, p.n_of, cli.Description AS cliente,
           d.Description AS negocio
    FROM PedFin p
    JOIN dbo.FACOrderSL cab ON cab.CodOrder=p.pedido AND cab.CodCompany='001'
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = cab.IDCustomer
    -- Negocio/local de entrega: misma tabla y mismo join que la cabecera del
    -- detalle, para que la lista y el pedido abierto digan lo mismo.
    LEFT JOIN dbo.FACCustomerDeliveryAddress d ON d.IDCustomerDeliveryAddress = cab.IDCustomerDeliveryAddress
    ${pasados.join}
    ${where}
    -- Al buscar manda la fecha del pedido (también se muestra), no su cierre.
    -- Sin búsqueda, la lista pinta "Pasado el
    -- tal" con pasadoAt cuando lo tenemos (cuándo se pulsó Pasar a Producción
    -- aquí) y con finalizada cuando no (cuándo cerró RPS la fase de OT).
    -- Ordenando solo por finalizada, las dos no coincidían: RPS cierra fases
    -- en masa, así que un pedido que OT soltó en julio podía aparecer arriba
    -- del todo con fecha de hoy. El orden decía una cosa y la fecha de al
    -- lado otra.
    ORDER BY ${f.q?.trim() ? "p.fecha_pedido" : fechaPasado} DESC, p.pedido DESC
    OFFSET @off ROWS FETCH NEXT @size ROWS ONLY
    ;IF OBJECT_ID('tempdb..#CoordinaHistorialOrdenes') IS NOT NULL DROP TABLE #CoordinaHistorialOrdenes;
    IF OBJECT_ID('tempdb..#CoordinaHistorialPedidos') IS NOT NULL DROP TABLE #CoordinaHistorialPedidos;
    DROP TABLE #CoordinaHistorialPendientes;
    DROP TABLE #CoordinaHistorialFinalizados;
  `);

  const filas = r.recordset;
  const nombres = await nombresHistorial();
  const hasMore = filas.length > PAGE_SIZE;
  const items = filas.slice(0, PAGE_SIZE).map(filaAItem).map((item) => anadirPasadoAt(item, seccionDe(f.seccion).id, nombres));

  // Autores y familias se resuelven para la página ENTERA de una vez (ver
  // `extrasDePagina`): una query por pedido serían 40 idas y vueltas.
  const extras = await extrasDePagina(items.map((p) => p.pedido), seccionDe(f.seccion).id);
  const pedidos = items.map((p) => {
    const suyos = extras.get(p.pedido);
    if (!suyos) return p;
    return {
      ...p,
      ...(suyos.autores.length ? { autores: suyos.autores } : {}),
      ...(suyos.revisores.length ? { revisores: suyos.revisores } : {}),
      ...(suyos.familias.length ? { familias: suyos.familias } : {}),
      ...(suyos.trabajo ? { minutos: suyos.trabajo.minutos } : {}),
      ...(suyos.trabajo?.otrosCentros ? { otrosCentros: suyos.trabajo.otrosCentros } : {}),
    };
  });
  return { pedidos, hasMore };
}

/** Fila cruda del minutaje por pedido/orden/empleado (antes de agrupar). */
interface FilaExtra {
  tarea: string | null;
  descripcionTarea: string | null;
  centro: "ot" | "diseno" | "taller";
  nombreEmpleado: string | null;
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

/** Autoría de las tareas de la sección seleccionada; sin tareas propias,
 *  de los demás centros. Prefiere el autor registrado en CoordinaOT y recurre
 *  al reparto de RPS para el histórico. Una sola consulta por página. */
interface ExtrasPedido {
  autores: string[];
  revisores: string[];
  familias: string[];
  trabajo?: TrabajoPedido;
}

async function extrasDePagina(
  pedidos: string[],
  seccion: SeccionId,
): Promise<Map<string, ExtrasPedido>> {
  const salida = new Map<string, ExtrasPedido>();
  if (pedidos.length === 0) return salida;
  const nombres = await nombresHistorial();

  const pool = await getPool();
  const req = pool.request();
  // Un parámetro por pedido (@a0, @a1…). Lo que se interpola en el SQL son los
  // NOMBRES de parámetro que genera este bucle, nunca los códigos: esos van
  // como valores por `request.input`.
  const marcas = pedidos.map((codigo, i) => {
    req.input(`a${i}`, codigo);
    return `@a${i}`;
  });

  // Autoría de la sección seleccionada, sin filtrar la lista de pedidos.
  // El LEFT JOIN a las
  // imputaciones es a propósito: una OF planteada con la web puede no tener ni
  // un minuto en RPS, y aun así hay que traerla para poder casar su autor
  // registrado por OF y tarea.
  const r = await req.query<FilaExtra>(`
    SELECT o.CodOrder AS pedido, mo.CodManufacturingOrder AS orden,
           mo.Description AS descripcion, t.CodMOTask AS tarea, t.Description AS descripcionTarea,
           cli.Description AS cliente, sf.CodProductSubFamily AS subfamilia,
           e.CodEmployee AS empleado, e.Description AS nombreEmpleado, SUM(i.ExecutionTime) AS minutos,
           CASE WHEN EXISTS (SELECT 1 FROM dbo.CPRMOResourceMachine rm WHERE rm.IDMOTask=t.IDMOTask AND rm.CodMOResourceMachine IN (${recursosSql(SECCIONES.ot)})) THEN 'ot'
                WHEN EXISTS (SELECT 1 FROM dbo.CPRMOResourceMachine rm WHERE rm.IDMOTask=t.IDMOTask AND rm.CodMOResourceMachine IN (${recursosSql(SECCIONES.diseno)})) THEN 'diseno'
                ELSE 'taller' END AS centro
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
    GROUP BY o.CodOrder, mo.CodManufacturingOrder, mo.Description, t.IDMOTask, t.CodMOTask, t.Description,
             cli.Description, sf.CodProductSubFamily, e.CodEmployee, e.Description
  `);

  // Por pedido: minutos de cada persona, qué órdenes lo componen (las órdenes
  // son la llave para buscar el autor registrado, que va por OF) y sus familias.
  const minutos = new Map<string, Map<string, number>>();
  const minutosVistos = new Set<string>();
  const ordenes = new Map<string, Set<string>>();
  const familias = new Map<string, Set<string>>();
  const filasExtras = r.recordset.map((fila) => ({ ...fila, centro: centroDeTareaHistorial(fila.centro, fila.descripcionTarea) }));
  const conSeccion = new Set(filasExtras.filter((fila) => fila.centro === seccion).map((fila) => fila.pedido?.trim()));
  // Tiempo y centro de cada fila, con la misma regla que la autoría de abajo.
  const trabajo = resumirTrabajoPedidos(
    filasExtras.map((fila) => ({
      pedido: (fila.pedido ?? "").trim(),
      orden: (fila.orden ?? "").trim(),
      tarea: (fila.tarea ?? "").trim(),
      empleado: (fila.empleado ?? "").trim(),
      centro: fila.centro,
      minutos: fila.minutos ?? 0,
    })),
    seccion,
  );
  for (const fila of filasExtras) {
    const pedido = (fila.pedido ?? "").trim();
    if (!pedido) continue;
    if (conSeccion.has(pedido) && fila.centro !== seccion) continue;

    const orden = (fila.orden ?? "").trim();
    if (orden) {
      const suyas = ordenes.get(pedido) ?? new Set<string>();
      if (fila.tarea) suyas.add(claveTareaHistorial(orden, fila.tarea));
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
    // El mismo minutaje llega una vez por LÍNEA de venta de la OF (ver
    // `resumirTrabajoPedidos`): se cuenta una sola vez, o el reparto que
    // decide el autor pesaría doble las OF con dos líneas.
    const claveMinuto = `${pedido}|${orden}|${(fila.tarea ?? "").trim()}|${fila.empleado.trim()}`;
    if (minutosVistos.has(claveMinuto)) continue;
    minutosVistos.add(claveMinuto);
    const codEmpleado = fila.empleado.trim();
    const idOperario = operarioDeEmpleado(codEmpleado);
    const nombre = nombres.get(codEmpleado) || (idOperario && nombres.get(idOperario)) || nombreHistorial(fila.nombreEmpleado);
    if (!nombre) continue;
    const porPersona = minutos.get(pedido) ?? new Map<string, number>();
    porPersona.set(nombre, (porPersona.get(nombre) ?? 0) + (fila.minutos ?? 0));
    minutos.set(pedido, porPersona);
  }

  const registrados = rolesRegistrados(nombres);
  for (const pedido of pedidos) {
    const suyas = [...(ordenes.get(pedido) ?? [])];
    const deLaWeb = [...new Set(suyas.flatMap((o) => registrados.autores.get(o) ?? []))];
    // Registrado gana: si de un pedido se plantearon 2 OFs con la web y 3 son
    // viejas, se enseña a quien consta, no una mezcla de dato y suposición.
    // Con los revisores, lo mismo: si hay autor registrado, el revisor es el
    // registrado (o ninguno), no uno deducido de las horas.
    const deducido = deLaWeb.length ? null : repartirPorTiempo(minutos.get(pedido));
    const autores = deLaWeb.length ? deLaWeb : (deducido?.autores ?? []);
    // Sin tareas de la sección, lo que se enseña es trabajo de otro centro
    // (casi siempre Taller), y ahí no hay revisión: deducir un "revisó" de las
    // horas de taller era inventarse un rol que no existe.
    const deOtroCentro = Boolean(trabajo.get(pedido)?.otrosCentros);
    const revisores = deOtroCentro
      ? []
      : (
          deLaWeb.length
            ? [...new Set(suyas.flatMap((o) => registrados.revisores.get(o) ?? []))]
            : (deducido?.revisores ?? [])
        ).filter((n) => !autores.includes(n));
    salida.set(pedido, {
      autores,
      revisores,
      familias: [...(familias.get(pedido) ?? [])],
      trabajo: trabajo.get(pedido),
    });
  }
  return salida;
}

/** Autores y revisores registrados en CoordinaOT, indexados por OF y tarea.
 *
 *  El overlay va por OF+tarea ("orden:codTarea") y la lista va por pedido, así
 *  que se conservan ambas claves para no mezclar autores entre secciones. Se lee
 *  entero de una vez — son pocas filas y vive en SQLite, igual que en
 *  `pasadosAt`, así que no compensa filtrar por ids.
 *
 *  El revisor solo cuenta si la OF pasó de verdad por revisión (`revisada`):
 *  nombrarlo al mandarla a revisar no es haberla revisado. */
function rolesRegistrados(nombres: ReadonlyMap<string, string>): {
  autores: Map<string, string[]>;
  revisores: Map<string, string[]>;
} {
  const autores = new Map<string, string[]>();
  const revisores = new Map<string, string[]>();
  let overlay;
  try {
    const ot = leerOverlay("ot");
    const diseno = leerOverlay("diseno");
    overlay = { ofs: new Map([...ot.ofs, ...diseno.ofs]) };
  } catch (e) {
    // Como en `anadirDesgloseRol`: el historial vive de RPS, y si nuestra BD
    // local falla se sirve sin autor antes que devolver un error.
    console.error("[historial] no se pudo leer el overlay:", e);
    return { autores, revisores };
  }
  const anota = (mapa: Map<string, string[]>, clave: string, id: string | null | undefined) => {
    const nombre = id ? nombres.get(id) : undefined;
    if (!nombre) return; // Si no lo conocemos, se resolverá por la imputación de RPS.
    const suyos = mapa.get(clave) ?? [];
    if (!suyos.includes(nombre)) suyos.push(nombre);
    mapa.set(clave, suyos);
  };
  for (const [ofId, cambio] of overlay.ofs) {
    const partes = partirOfId(ofId);
    if (!partes) continue;
    const clave = claveTareaHistorial(partes.of, partes.numope);
    anota(autores, clave, cambio.autorId);
    if (cambio.revisada) anota(revisores, clave, cambio.revisorId);
  }
  return { autores, revisores };
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
  const nombres = await nombresHistorial();

  const pool = await getPool();
  // Clasificar la TAREA antes de sumar. EXISTS no multiplica las imputaciones
  // cuando RPS tiene varios recursos de máquina asignados a una misma tarea.
  // Materiales y líneas de venta tampoco se unen al minutaje por ese motivo.
  const [r, extrasOF] = await Promise.all([
    pool.request().input("pedido", pedido).query<FilaTiempoCentro>(`
      WITH Tareas AS (
        SELECT mo.IDManufacturingOrder, mo.CodManufacturingOrder AS orden,
               mo.Description AS descripcion, t.IDMOTask, t.CodMOTask AS tarea,
               t.Description AS descripcionTarea,
               CASE
                 WHEN EXISTS (SELECT 1 FROM dbo.CPRMOResourceMachine rm
                   WHERE rm.IDMOTask = t.IDMOTask
                     AND rm.CodMOResourceMachine IN (${recursosSql(SECCIONES.ot)})) THEN 'ot'
                 WHEN EXISTS (SELECT 1 FROM dbo.CPRMOResourceMachine rm
                   WHERE rm.IDMOTask = t.IDMOTask
                     AND rm.CodMOResourceMachine IN (${recursosSql(SECCIONES.diseno)})) THEN 'diseno'
                 ELSE 'taller'
               END AS centro
        FROM dbo.CPRManufacturingOrder mo
        LEFT JOIN dbo.CPRMOTask t ON t.IDManufacturingOrder = mo.IDManufacturingOrder
        WHERE mo.CodCompany = '001' AND EXISTS (
          SELECT 1 FROM dbo.FACOrderLineSL l
          JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
          WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido
        )
      )
      SELECT t.orden, t.descripcion, t.centro, t.tarea, t.descripcionTarea,
             e.CodEmployee AS empleado, e.Description AS nombreEmpleado, SUM(i.ExecutionTime) AS minutos
      FROM Tareas t
      LEFT JOIN dbo.CPRImputationMO i
        ON i.IDMOTask = t.IDMOTask AND i.IDManufacturingOrder = t.IDManufacturingOrder
        AND i.ResourceType = 1
      LEFT JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
      GROUP BY t.orden, t.descripcion, t.centro, t.tarea, t.descripcionTarea, e.CodEmployee, e.Description
    `),
    leerMaterialesPedido(pedido),
  ]);

  const filas = r.recordset.map((fila) => ({
    ...fila, centro: centroDeTareaHistorial(fila.centro, fila.descripcionTarea ?? null),
  }));
  const nombresRps = new Map(filas.filter((f) => f.empleado?.trim() && f.nombreEmpleado?.trim())
    .map((f) => [f.empleado!.trim(), f.nombreEmpleado!.trim()]));
  const ofs = agruparTiemposPorCentro(filas, (codigo) => {
    const id = operarioDeEmpleado(codigo);
    return nombres.get(codigo) || (id && nombres.get(id)) || nombreHistorial(nombresRps.get(codigo));
  });
  // Los roles locales se sumaban por OF entera: con dos secciones en una OF,
  // eso atribuiría también el fichaje de Diseño al bloque de OT (y viceversa).
  // Limitar por tarea, no por la sección habitual de quien fichó.
  for (const centro of ["ot", "diseno"] as const) {
    const tareas = new Set(filas
      .filter((f) => f.centro === centro && f.orden && f.tarea)
      .map((f) => claveTareaHistorial(f.orden!, f.tarea!)));
    const conRoles = anadirDesgloseRol(ofs.filter((of) => of.centro === centro), tareas, nombres);
    for (const of of conRoles) {
      const index = ofs.findIndex((o) => o.centro === centro && o.codigo === of.codigo);
      ofs[index] = deducirRoles(of, new Map(of.personas?.map((p) => [p.nombre, p.min])));
    }
  }
  for (const of of ofs) {
    const extras = extrasOF.get(of.codigo);
    if (extras?.materiales.length) of.materiales = extras.materiales;
    if (extras?.notas) of.notasProduccion = extras.notas;
  }
  return ofs;
}

/** Un documento tal y como lo guarda RPS: descripción + ruta al share. La ruta
 *  es de uso interno del servidor y NO se manda al cliente (ver `DocumentoRps`). */
export interface DocumentoRpsCrudo {
  descripcion: string;
  ruta: string;
  /** Qué es, cuando no se puede deducir de la carpeta. Las fotos de una
   *  instalación y las de un mantenimiento están en la MISMA carpeta del share
   *  (SAT\RECIBIDOS\OM); lo que las distingue es el tipo de la asistencia que
   *  las trajo, y eso solo lo sabe quien hace la consulta. */
  clase?: string;
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
    .query<{ descripcion: string | null; ruta: string | null; clase: string | null }>(`
      ;WITH Docs AS (
        SELECT 1 AS fuente, CAST(ed.IDEntityDocument AS varchar(50)) AS id,
               ed.Description AS descripcion, ed.Path AS ruta, NULL AS clase
        FROM dbo.FACOrderSL o
        JOIN dbo.GENEntityDocument ed
          ON ed.EntityID = o.IDOrder AND ed.EntityType = 'OrderSL'
        WHERE o.CodCompany = '001' AND o.CodOrder = @pedido
        UNION ALL
        SELECT 1, CAST(ed.IDEntityDocument AS varchar(50)), ed.Description, ed.Path, NULL
        FROM dbo.CPRManufacturingOrder mo
        JOIN dbo.GENEntityDocument ed
          ON ed.EntityID = mo.IDManufacturingOrder AND ed.EntityType = 'ManufacturingOrder'
        WHERE mo.CodCompany = '001' AND EXISTS (
          SELECT 1 FROM dbo.FACOrderLineSL l
          JOIN dbo.FACOrderSL o ON o.IDOrder = l.IDOrder AND o.CodCompany = '001'
          WHERE l.IDManufacturingOrder = mo.IDManufacturingOrder AND o.CodOrder = @pedido)

        -- Las fotos de las órdenes de mantenimiento del pedido. La tabla de
        -- enlaces solo trae las de ALGUNAS: AR.26.03914 enseñaba las seis de
        -- una orden y se dejaba fuera siete de otras dos del mismo pedido.
        UNION ALL
        SELECT 2, '', ISNULL(fo.DescripcionFoto, ''), fo.Foto, NULL
        FROM dbo.TGM_FOTOS_OLANET fo
        WHERE fo.CodCompany = '001' AND fo.Pedido = @pedido

      )
      -- Por fuente y luego por id: primero lo que RPS tiene enlazado (que es lo
      -- que ya se venía viendo, en su orden de siempre) y detrás las fotos.
      SELECT descripcion, ruta, clase FROM Docs ORDER BY fuente, id
    `);

  // Se deduplica por NOMBRE DE FICHERO y no por ruta: la misma foto llega por
  // dos caminos con la ruta escrita distinta —una tabla la guarda como
  // file://\\192.168.0.128\RPS\SAT\… y la otra como http://192.168.0.128/SAT/…—
  // y comparando rutas saldría dos veces. De AR.26 son 3168 fotos repetidas.
  const vistos = new Set<string>();
  const salida: DocumentoRpsCrudo[] = [];
  const anadir = (fila: { descripcion: string | null; ruta: string | null; clase?: string | null }) => {
    const ruta = rutaDeShare((fila.ruta ?? "").trim());
    if (!ruta) return;
    const clave = archivoDeRuta(ruta).toLowerCase();
    if (vistos.has(clave)) return;
    vistos.add(clave);
    salida.push({
      descripcion: (fila.descripcion ?? "").trim(),
      ruta,
      ...(fila.clase ? { clase: fila.clase } : {}),
    });
  };

  for (const fila of r.recordset) anadir(fila);
  // Y al final las de la app de instaladores, que van por su cuenta (ver
  // `fotosDeVisita`). Detrás de lo demás a propósito: son el remate del trabajo,
  // no lo que se viene a buscar al abrir un pedido.
  for (const foto of await fotosDeVisita(pedido)) anadir(foto);
  return salida;
}

/** La ruta del share correspondiente a lo que guarde RPS.
 *
 *  La app de monitorización apunta a la MISMA carpeta por HTTP
 *  (`http://192.168.0.128/SAT/RECIBIDOS/OM/x.jpg`) que el resto de RPS por el
 *  share (`file://\\192.168.0.128\RPS\SAT\RECIBIDOS\OM\x.jpg`): el servidor web
 *  de esa máquina publica el share. Se traduce a la forma de share para que la
 *  foto la sirva la MISMA ruta con las mismas comprobaciones que todo lo demás
 *  —`segmentosEnShare` y su lista de lo que se puede leer— en vez de abrir un
 *  proxy HTTP nuevo, que sería otra puerta que vigilar.
 *
 *  Lo que no sea de esa máquina se deja como viene: ya se rechaza más adelante. */
function rutaDeShare(ruta: string): string {
  const m = /^https?:\/\/192\.168\.0\.128\/(.+)$/i.exec(ruta);
  if (!m) return ruta;
  return `file://\\\\192.168.0.128\\RPS\\${decodeURI(m[1]).replace(/\//g, "\\")}`;
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
export function aDocumentosDelCliente(
  pedido: string,
  crudos: DocumentoRpsCrudo[],
): DocumentoRps[] {
  return crudos.map((d, i) => ({
    descripcion: d.descripcion,
    archivo: archivoDeRuta(d.ruta),
    // La que traiga la consulta manda sobre la carpeta: las fotos de una
    // instalación y las de un mantenimiento viven en la misma y solo se
    // distinguen por el aviso que las trajo.
    clase: d.clase ?? claseDeDocumento(d.ruta),
    url: segmentosEnShare(d.ruta)
      ? `/api/historial/${encodeURIComponent(pedido)}/documento/${i}`
      : null,
  }));
}

/** Los documentos de un pedido listos para el cliente, sin pasar por el
 *  detalle entero del Historial.
 *
 *  Lo usa la ficha del pedido VIVO: las fotos, la rotulación y el
 *  planteamiento hacen falta MIENTRAS se trabaja el pedido, no solo cuando ya
 *  está cerrado. Antes había que esperar a que llegara al Historial para
 *  verlos, que es justo cuando ya no sirven para trabajar.
 *
 *  Es la MISMA lista y el MISMO orden que el Historial —llama a las mismas dos
 *  funciones—, y eso es un requisito y no una comodidad: la URL de cada
 *  documento es su POSICIÓN en esta lista, así que dos listas distintas
 *  servirían ficheros cruzados. */
export async function documentosDePedido(pedido: string): Promise<DocumentoRps[]> {
  return aDocumentosDelCliente(pedido, await leerDocumentosPedido(pedido));
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
function anadirPasadoAt(item: HistorialItem, seccion: SeccionId, nombres: ReadonlyMap<string, string> = NOMBRE_POR_OPERARIO): HistorialItem {
  const paso = pasadosAt(seccion).get(item.pedido);
  if (!paso) return item;
  const nombre = paso.operarioId ? nombres.get(paso.operarioId) : undefined;
  return {
    ...item,
    pasadoAt: paso.at,
    ...(paso.operarioId ? { pasadoPor: nombre ?? "Nombre no disponible" } : {}),
  };
}

/** Lleva las fechas de paso de SQLite a SQL Server en un solo parámetro XML.
 *  Conserva también los pasos antiguos, sin el límite de 2100 parámetros. */
function pasadosParaOrden(req: {
  input: (nombre: string, valor: unknown) => unknown;
}, seccion: SeccionId): { cte: string; join: string; columna: string } {
  const pasados = [...pasadosAt(seccion).entries()];

  if (pasados.length === 0) {
    return { cte: "", join: "", columna: "CAST(NULL AS datetime2)" };
  }

  req.input("pasadosXml", `<pasos>${pasados.map(([pedido, paso]) => `<p pedido="${textoXml(pedido)}" at="${textoXml(paso.at)}"/>`).join("")}</pasos>`);

  return {
    cte: `, Pasados AS (SELECT p.n.value('@pedido','nvarchar(25)') AS pedido,
      CONVERT(datetime2,p.n.value('@at','varchar(40)'),127) AS at
      FROM (SELECT CAST(@pasadosXml AS xml) lista) x CROSS APPLY x.lista.nodes('/pasos/p') p(n))`,
    join: "LEFT JOIN Pasados ps ON ps.pedido = p.pedido",
    columna: "ps.at",
  };
}

/** Cache muy corta: una misma página llama a esto una vez por pedido. */
const cachePasados = new Map<SeccionId, { at: number; mapa: Map<string, PasoAProduccion> }>();
function pasadosAt(seccion: SeccionId): Map<string, PasoAProduccion> {
  const cache = cachePasados.get(seccion);
  if (cache && Date.now() - cache.at < 5_000) return cache.mapa;
  try {
    const mapa = leerPedidosPasados(seccion);
    cachePasados.set(seccion, { at: Date.now(), mapa });
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
function anadirDesgloseRol(ofs: HistorialOF[], tareas: ReadonlySet<string>, nombres: ReadonlyMap<string, string>): HistorialOF[] {
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

  // Una OF de RPS puede tener varias of-tarea, así que aquí se suman: los
  // minutos del rol y los de cada persona dentro de ese rol.
  const porOrden = new Map<
    string,
    {
      planteoMin: number;
      revisionMin: number;
      plantear: Map<string, number>;
      revisar: Map<string, number>;
    }
  >();
  for (const [ofId, t] of porOfId) {
    const partes = partirOfId(ofId);
    if (!partes || !tareas.has(claveTareaHistorial(partes.of, partes.numope))) continue;
    const acc = porOrden.get(partes.of) ?? {
      planteoMin: 0,
      revisionMin: 0,
      plantear: new Map<string, number>(),
      revisar: new Map<string, number>(),
    };
    acc.planteoMin += t.planteoMin;
    acc.revisionMin += t.revisionMin;
    for (const rol of ["plantear", "revisar"] as const) {
      for (const [id, min] of Object.entries(t.operarios[rol]))
        acc[rol].set(id, (acc[rol].get(id) ?? 0) + min);
    }
    porOrden.set(partes.of, acc);
  }

  const nombre = (id: string) => nombres.get(id) ?? "Nombre no disponible";
  // De más tiempo a menos: en un rol repartido, lo primero que se busca es
  // quién lleva el peso.
  const reparto = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([id, min]) => ({ nombre: nombre(id), min }))
      .sort((a, b) => b.min - a.min);
  return ofs.map((of) => {
    const t = porOrden.get(of.codigo);
    if (!t) return of;
    return {
      ...of,
      rol: {
        planteoMin: t.planteoMin,
        revisionMin: t.revisionMin,
        planteo: reparto(t.plantear),
        revision: reparto(t.revisar),
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
  seccion: SeccionId = "ot",
): Promise<HistorialPedidoDetalle> {
  const ofs = await leerHistorialPedido(pedido); // ya respeta mock/rps
  if (ES_MOCK) return detalleCabeceraMock(pedido, ofs);

  const pool = await getPool();

  // AQUÍ SE PEDÍAN TAMBIÉN los comentarios de línea y el de montaje, en
  // paralelo con los documentos. Se han ido con los dos bloques que los
  // pintaban ("Lo vendido" y "Montaje y envío"): decían lo mismo que el parte
  // escaneado que se está viendo al lado, así que eran una consulta más a RPS
  // en cada apertura de ficha para repetir lo que ya estaba en pantalla.
  const documentos = await leerDocumentosPedido(pedido);

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
    `)
  ).recordset[0] ?? { prioridad: null, piezas: null };

  const fin = (
    await pool.request().input("pedido", pedido).input("pendientes", "<pedidos/>")
      .query<{ finalizada: Date | null }>(`
      ${ctesFinalizacionHistorial(seccion, "o.CodOrder=@pedido")}
      SELECT finalizada FROM PedFin;
      DROP TABLE #CoordinaHistorialOrdenes;
      DROP TABLE #CoordinaHistorialPedidos;
      DROP TABLE #CoordinaHistorialPendientes;
      DROP TABLE #CoordinaHistorialFinalizados;
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
  const pendientes = new Set(f.pendientes ?? []);
  todos = todos.filter((p) => !pendientes.has(p.pedido));
  const q = f.q?.trim();
  if (q)
    todos = todos.filter(
      (p) => coincideBusquedaHistorial(q, p.pedido, p.cliente ?? "", PEDIDOS.find((original) => original.codigo === p.pedido)?.ofs ?? []),
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
    pedidos: pagina.slice(0, PAGE_SIZE).map((item) => anadirPasadoAt(item, seccionDe(f.seccion).id)),
    hasMore: pagina.length > PAGE_SIZE,
  };
}

function detalleMock(pedido: string): HistorialOF[] {
  const p = PEDIDOS.find((x) => x.codigo === pedido);
  if (!p) return [];
  const reparto = (id: string | null, min: number) =>
    id ? [{ nombre: NOMBRE_POR_OPERARIO.get(id) ?? id, min }] : [];
  return p.ofs.map((of) => ({
    codigo: of.codigo,
    centro: "ot",
    personas: [...new Set([of.autorId, of.revisorId])].filter((id): id is string => Boolean(id)).map((id) => ({
      nombre: NOMBRE_POR_OPERARIO.get(id) ?? id,
      min: (of.autorId === id ? of.tiempoPlanteoMin : 0) + (of.revisorId === id ? of.tiempoRevisionMin : 0),
    })),
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
      planteo: reparto(of.autorId, of.tiempoPlanteoMin),
      revision: reparto(of.revisorId, of.tiempoRevisionMin),
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
