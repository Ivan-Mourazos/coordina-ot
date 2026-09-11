import type { Request } from "mssql";
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
// Aquí esa lista se construye UNA vez y se refresca por detrás, igual que el
// tablero (ver getTableroRPS en rps.ts). Se guarda solo lo que hace falta para
// filtrar, buscar y ordenar; lo de las 40 filas que se ven (personas, tiempos)
// se sigue pidiendo a RPS por página, que cuesta menos de medio segundo.
//
// MEMORIA, medida con la primera versión: 197 MB de lista y 792 MB de pico al
// refrescar con la vieja viva (sin contar Next). En producción el proceso quedó
// en 589 MB con un límite de PM2 de 1 GB. Por eso:
//  · las filas de RPS se leen de una en una (streaming) en vez de cargar las
//    427 000 de golpe;
//  · por pedido se guarda un texto y no listas de textos, y los nombres de
//    cliente y de familia, que se repiten miles de veces, se comparten;
//  · se refresca cada 30 min y no cada 10.

const VIDA_MS = 30 * 60_000;

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

/** Recorre el resultado fila a fila, sin juntarlo entero en memoria. Con
 *  varias sentencias (las tablas temporales del cierre), llegan las filas del
 *  SELECT y `done` salta al acabar el lote. */
function porFilas<T>(req: Request, consulta: string, alLlegar: (fila: T) => void): Promise<void> {
  return new Promise((ok, mal) => {
    let acabado = false;
    const fin = (e?: unknown) => {
      if (acabado) return;
      acabado = true;
      if (e) mal(e);
      else ok();
    };
    req.stream = true;
    req.on("row", (fila: T) => {
      if (acabado) return;
      try {
        alLlegar(fila);
      } catch (e) {
        fin(e);
        req.cancel();
      }
    });
    req.on("error", (e: unknown) => fin(e));
    req.on("done", () => fin());
    const p = req.query(consulta) as unknown;
    if (p instanceof Promise) p.catch(() => {});
  });
}

/** Una sola copia de cada texto repetido (clientes, familias): con 153 000
 *  pedidos, "MAHOU, S.A." o "TOLDO" salen miles de veces. */
function compartidor() {
  const vistos = new Map<string, string>();
  return (s: string): string => {
    const ya = vistos.get(s);
    if (ya !== undefined) return ya;
    vistos.set(s, s);
    return s;
  };
}

async function baseDe(seccion: SeccionId): Promise<BaseHistorial[]> {
  const pool = await getPool();
  const req = pool.request();
  // Sin pendientes: la lista vale para cualquiera. Lo que sigue vivo en
  // CoordinaOT se quita al consultar, con el tablero de ese momento.
  req.input("pendientes", "<pedidos></pedidos>");
  const base: BaseHistorial[] = [];
  await porFilas<FilaBase>(req, `${ctesFinalizacionHistorial(seccion)}
    SELECT pedido, fecha_pedido, n_of, tiene_seccion, pendiente_seccion, pendiente_total, finalizada FROM PedFin;
    DROP TABLE #CoordinaHistorialPendientes;
    DROP TABLE #CoordinaHistorialFinalizados;`, (f) => {
    const pedido = (f.pedido ?? "").trim();
    if (!pedido) return;
    base.push({
      pedido,
      fechaPedido: ms(f.fecha_pedido),
      nOf: f.n_of ?? 0,
      tieneSeccion: f.tiene_seccion === 1,
      pendienteSeccion: f.pendiente_seccion === 1,
      pendienteTotal: f.pendiente_total === 1,
      finalizada: ms(f.finalizada),
    });
  });
  return base;
}

async function textosDe(pedidos: ReadonlySet<string>): Promise<Map<string, InfoPedidoHistorial>> {
  const pool = await getPool();
  const comparte = compartidor();
  // Mientras llegan, por pedido: conjuntos para no repetir. Al acabar se
  // pliegan a un texto por pedido (ver InfoPedidoHistorial).
  const obra = new Map<string, { cliente: string | null; negocio: string | null; familias: Set<string>; ordenes: Set<string>; textos: Set<string> }>();
  // Lo que busca el Historial (cliente, OF, descripciones de la OF y de la
  // línea de venta) y lo que decide la familia, igual que la fila y el panel
  // de Sin asignar (familiaDeTexto con cliente y subfamilia).
  await porFilas<FilaTexto>(pool.request(), `
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
    WHERE o.CodCompany = '001'`, (f) => {
    const pedido = (f.pedido ?? "").trim();
    if (!pedidos.has(pedido)) return;
    let i = obra.get(pedido);
    if (!i) {
      const cliente = (f.cliente ?? "").trim();
      const negocio = (f.negocio ?? "").trim();
      i = {
        cliente: cliente ? comparte(cliente) : null,
        negocio: negocio ? comparte(negocio) : null,
        familias: new Set(),
        ordenes: new Set(),
        textos: new Set(cliente ? [comparte(normalizaBusqueda(cliente))] : []),
      };
      obra.set(pedido, i);
    }
    const orden = (f.orden ?? "").trim();
    if (orden) {
      i.ordenes.add(orden);
      i.familias.add(comparte(familiaDeTexto(f.descripcion, null, { cliente: f.cliente, subfamilia: f.subfamilia })));
    }
    for (const texto of [f.descripcion, f.linea]) {
      const t = normalizaBusqueda(texto ?? "").trim();
      if (t) i.textos.add(t);
    }
  });
  const info = new Map<string, InfoPedidoHistorial>();
  for (const [pedido, i] of obra) {
    info.set(pedido, {
      cliente: i.cliente,
      negocio: i.negocio,
      familias: [...i.familias],
      ordenes: [...i.ordenes].join(" "),
      textos: [...i.textos].join("\n"),
    });
  }
  return info;
}

async function personasDe(): Promise<Map<string, Set<string>>> {
  const pool = await getPool();
  const req = pool.request();
  const comparte = compartidor();
  // Solo el equipo (los que se pueden elegir en el filtro): 58 000 relaciones
  // en vez de las 861 000 filas del minutaje completo.
  const codigos = Object.values(COD_RPS_POR_OPERARIO);
  const marcas = codigos.map((c, i) => {
    req.input(`e${i}`, c);
    return `@e${i}`;
  });
  const personas = new Map<string, Set<string>>();
  await porFilas<{ pedido: string | null; empleado: string | null }>(req, `
    SELECT DISTINCT o.CodOrder AS pedido, e.CodEmployee AS empleado
    FROM dbo.FACOrderSL o
    JOIN dbo.FACOrderLineSL l ON l.IDOrder = o.IDOrder
    JOIN dbo.CPRImputationMO i ON i.IDManufacturingOrder = l.IDManufacturingOrder AND i.ResourceType = 1
    JOIN dbo.GENEmployee e ON e.IDEmployee = i.IDEmployeeMachineTool
    WHERE o.CodCompany = '001' AND e.CodEmployee IN (${marcas.join(",")})`, (f) => {
    const pedido = (f.pedido ?? "").trim();
    const empleado = (f.empleado ?? "").trim();
    if (!pedido || !empleado) return;
    const s = personas.get(pedido) ?? new Set<string>();
    s.add(comparte(empleado));
    personas.set(pedido, s);
  });
  return personas;
}

/** Construye la lista entera (sin guardarla). Exportada para poder medir lo
 *  que cuesta en tiempo y memoria sin levantar el servidor. */
export async function construirIndice(): Promise<IndiceHistorial> {
  return construir();
}

async function construir(): Promise<IndiceHistorial> {
  const t0 = Date.now();
  const base = { ot: await baseDe("ot"), diseno: await baseDe("diseno") };
  const pedidos = new Set([...base.ot, ...base.diseno].map((b) => b.pedido));
  const info = await textosDe(pedidos);
  const personas = await personasDe();
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
