import { getPool } from "./db";
import { ctesFinalizacionHistorial } from "./historial-finalizacion-sql";
import { familiaDeTexto } from "./rps";
import { COD_RPS_POR_OPERARIO } from "./operarios";
import type { SeccionId } from "../secciones";
import { normalizaBusqueda, type BaseHistorial, type IndiceHistorial, type InfoPedidoHistorial } from "../historial-indice";

// ─── El Historial en memoria ─────────────────────────────────────────────────
// Cada página del Historial recalculaba en RPS la lista entera de pedidos
// terminados —153 451 pedidos, toda la historia— antes de paginar: 3,8 s por
// petición, también en la página 2, y cada filtro sumaba lo suyo (por persona,
// 7 s; buscando, 4-5 s). Medido el 11/09/2026.
//
// Aquí esa lista se construye UNA vez y se refresca por detrás cada pocos
// minutos, igual que el tablero (ver getTableroRPS en rps.ts). Se guarda solo
// lo que hace falta para filtrar, buscar y ordenar; lo de las 40 filas que se
// ven (personas, tiempos) se sigue pidiendo a RPS por página, que cuesta menos
// de medio segundo.
//
// Coste de construirla, medido: ~3,8 s + 2,9 s (las dos secciones), 5 s de
// textos y subfamilias, 2 s de quién del equipo trabajó en qué. Unos 14 s cada
// VIDA_MS, en segundo plano.

const VIDA_MS = 10 * 60_000;

// La lista vive en `globalThis` y no en variables del módulo: el arranque
// (instrumentation.ts) y la ruta del Historial se empaquetan por separado, y
// con variables de módulo cada uno tenía SU lista. Medido: se construía dos
// veces a la vez (35 s y 32 s), con el doble de consultas a RPS y de memoria.
declare global {
  var __coordinaHistorialIndice: IndiceHistorial | undefined;
  var __coordinaHistorialEnVuelo: Promise<IndiceHistorial> | undefined;
}

interface FilaBase {
  pedido: string | null;
  fecha_pedido: Date | null;
  n_of: number | null;
  tiene_seccion: number | null;
  pendiente_seccion: number | null;
  pendiente_total: number | null;
  finalizada: Date | null;
}

interface FilaTexto {
  pedido: string | null;
  cliente: string | null;
  negocio: string | null;
  orden: string | null;
  descripcion: string | null;
  linea: string | null;
  subfamilia: string | null;
}

const ms = (d: Date | null) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : null);

async function baseDe(seccion: SeccionId): Promise<BaseHistorial[]> {
  const pool = await getPool();
  const req = pool.request();
  // Sin pendientes: la lista vale para cualquiera. Lo que sigue vivo en
  // CoordinaOT se quita al consultar, con el tablero de ese momento.
  req.input("pendientes", "<pedidos></pedidos>");
  const r = await req.query<FilaBase>(`${ctesFinalizacionHistorial(seccion)}
    SELECT pedido, fecha_pedido, n_of, tiene_seccion, pendiente_seccion, pendiente_total, finalizada FROM PedFin;
    DROP TABLE #CoordinaHistorialPendientes;
    DROP TABLE #CoordinaHistorialFinalizados;`);
  const base: BaseHistorial[] = [];
  for (const f of r.recordset) {
    const pedido = (f.pedido ?? "").trim();
    if (!pedido) continue;
    base.push({
      pedido,
      fechaPedido: ms(f.fecha_pedido),
      nOf: f.n_of ?? 0,
      tieneSeccion: f.tiene_seccion === 1,
      pendienteSeccion: f.pendiente_seccion === 1,
      pendienteTotal: f.pendiente_total === 1,
      finalizada: ms(f.finalizada),
    });
  }
  return base;
}

async function textosDe(pedidos: ReadonlySet<string>): Promise<Map<string, InfoPedidoHistorial>> {
  const pool = await getPool();
  // Lo que busca el Historial (cliente, negocio, OF, descripciones de la OF y
  // de la línea de venta) y lo que decide la familia, igual que la fila y el
  // panel de Sin asignar (familiaDeTexto con cliente y subfamilia).
  const r = await pool.request().query<FilaTexto>(`
    SELECT o.CodOrder AS pedido, cli.Description AS cliente, d.Description AS negocio,
      mo.CodManufacturingOrder AS orden, mo.Description AS descripcion, l.Description AS linea,
      sf.CodProductSubFamily AS subfamilia
    FROM dbo.FACOrderSL o
    LEFT JOIN dbo.FACCustomer cli ON cli.IDCustomer = o.IDCustomer
    LEFT JOIN dbo.FACCustomerDeliveryAddress d ON d.IDCustomerDeliveryAddress = o.IDCustomerDeliveryAddress
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    LEFT JOIN dbo.CPRManufacturingOrder mo ON mo.IDManufacturingOrder = l.IDManufacturingOrder AND mo.CodCompany = '001'
    LEFT JOIN dbo.STKArticle art ON art.IDArticle = l.IDArticle
    LEFT JOIN dbo.GENProductSubFamily sf ON sf.IDProductSubFamily = art.IDProductSubFamily
    WHERE o.CodCompany = '001'`);
  const info = new Map<string, InfoPedidoHistorial>();
  for (const f of r.recordset) {
    const pedido = (f.pedido ?? "").trim();
    if (!pedidos.has(pedido)) continue;
    let i = info.get(pedido);
    if (!i) {
      const cliente = (f.cliente ?? "").trim() || null;
      i = {
        cliente,
        negocio: (f.negocio ?? "").trim() || null,
        familias: [],
        ordenes: [],
        textos: cliente ? [normalizaBusqueda(cliente)] : [],
      };
      info.set(pedido, i);
    }
    const orden = (f.orden ?? "").trim();
    if (orden) {
      if (!i.ordenes.includes(orden)) i.ordenes.push(orden);
      const familia = familiaDeTexto(f.descripcion, null, { cliente: f.cliente, subfamilia: f.subfamilia });
      if (!i.familias.includes(familia)) i.familias.push(familia);
    }
    for (const texto of [f.descripcion, f.linea]) {
      const t = normalizaBusqueda(texto ?? "");
      if (t && !i.textos.includes(t)) i.textos.push(t);
    }
  }
  return info;
}

async function personasDe(): Promise<Map<string, Set<string>>> {
  const pool = await getPool();
  const req = pool.request();
  // Solo el equipo (los que se pueden elegir en el filtro): 58 000 relaciones
  // en vez de las 861 000 filas del minutaje completo.
  const codigos = Object.values(COD_RPS_POR_OPERARIO);
  const marcas = codigos.map((c, i) => {
    req.input(`e${i}`, c);
    return `@e${i}`;
  });
  const r = await req.query<{ pedido: string | null; empleado: string | null }>(`
    SELECT DISTINCT o.CodOrder AS pedido, e.CodEmployee AS empleado
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRImputationMO i ON i.IDManufacturingOrder = l.IDManufacturingOrder AND i.ResourceType = 1
    JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
    WHERE o.CodCompany = '001' AND e.CodEmployee IN (${marcas.join(",")})`);
  const personas = new Map<string, Set<string>>();
  for (const f of r.recordset) {
    const pedido = (f.pedido ?? "").trim();
    const empleado = (f.empleado ?? "").trim();
    if (!pedido || !empleado) continue;
    const s = personas.get(pedido) ?? new Set<string>();
    s.add(empleado);
    personas.set(pedido, s);
  }
  return personas;
}

async function construir(): Promise<IndiceHistorial> {
  const t0 = Date.now();
  const base = { ot: await baseDe("ot"), diseno: await baseDe("diseno") };
  const pedidos = new Set([...base.ot, ...base.diseno].map((b) => b.pedido));
  const [info, personas] = [await textosDe(pedidos), await personasDe()];
  console.info(`[historial] lista en memoria lista en ${Date.now() - t0} ms: ${pedidos.size} pedidos`);
  return { at: Date.now(), base, info, personas };
}

function refrescar(): Promise<IndiceHistorial> {
  const yendo = globalThis.__coordinaHistorialEnVuelo;
  if (yendo) return yendo;
  const nueva = construir()
    .then((lista) => (globalThis.__coordinaHistorialIndice = lista))
    .finally(() => {
      globalThis.__coordinaHistorialEnVuelo = undefined;
    });
  globalThis.__coordinaHistorialEnVuelo = nueva;
  return nueva;
}

/** La lista si ya está hecha, aunque esté a punto de caducar. No construye
 *  nada: así quien la consulta sin pasar por la ruta (los tests de la
 *  consulta SQL) sigue por el camino de siempre. */
export function indiceSiListo(): IndiceHistorial | null {
  return globalThis.__coordinaHistorialIndice ?? null;
}

/** La lista, construyéndola si hace falta. Si ya existe se sirve al momento y,
 *  si ha caducado, se refresca por detrás. Si no existe se espera como mucho
 *  `esperaMaxMs`; pasado ese tiempo, o si falla, devuelve null y el Historial
 *  sigue con la consulta de siempre. */
export async function asegurarIndice(esperaMaxMs = 25_000): Promise<IndiceHistorial | null> {
  const indice = globalThis.__coordinaHistorialIndice;
  if (indice) {
    if (Date.now() - indice.at >= VIDA_MS) refrescar().catch((e) => console.warn("[historial] refresco de la lista falló:", (e as Error).message));
    return indice;
  }
  const construyendo = refrescar();
  construyendo.catch(() => {});
  try {
    return await Promise.race([
      construyendo,
      new Promise<null>((ok) => setTimeout(() => ok(null), esperaMaxMs)),
    ]);
  } catch (e) {
    console.warn("[historial] no se pudo construir la lista:", (e as Error).message);
    return null;
  }
}

declare global {
  // Sobrevive a recargas de módulo (HMR en dev) para no apilar temporizadores.
  var __coordinaHistorialPrecalentado: ReturnType<typeof setInterval> | undefined;
}

/** Al arrancar el servidor: la primera construcción ya, y un refresco periódico
 *  para que la lista esté caliente aunque nadie mire el Historial. */
export function precalentarHistorial(): void {
  if (globalThis.__coordinaHistorialPrecalentado) return;
  refrescar().catch((e) => console.warn("[historial] no se pudo precalentar la lista:", (e as Error).message));
  const t = setInterval(() => {
    refrescar().catch((e) => console.warn("[historial] refresco de la lista falló:", (e as Error).message));
  }, VIDA_MS);
  t.unref?.();
  globalThis.__coordinaHistorialPrecalentado = t;
}
