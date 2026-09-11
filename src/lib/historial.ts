// ─── Historial permanente: tipos + lógica pura (client-safe) ─────────────────
// Sin acceso a BD: solo los tipos que comparten API y UI, el constructor de
// cláusulas de filtro (parametrizadas, NUNCA interpoladas) y el mapeo de fila.
import { normaliza, palabrasDe } from "./buscador";
import { FASES, faseDePedido } from "./fases-tablero";
import type { Pedido } from "./types";

export const PAGE_SIZE = 40;

/** Incluye el formato antiguo de RPS, como AR.10N00595. */
export const CODIGO_PEDIDO_RE = /^[A-Z]{2}\.\d{2}[.N]\d{5}$/;

export interface HistorialFiltros {
  page: number;
  /** Cambia la autoría mostrada, nunca qué pedidos entran en la lista. */
  seccion?: import("./secciones").SeccionId;
  q?: string; // pedido, cliente, OF o descripción de venta/fabricación
  desde?: string; // ISO yyyy-mm-dd (inclusive)
  hasta?: string; // ISO yyyy-mm-dd (exclusivo)
  familia?: string;
  cliente?: string;
  /** Solo pedidos con tareas de la sección: fuera los «Solo Taller». */
  soloSeccion?: boolean;
  /** Pedidos en los que trabajó esta persona (id del equipo). */
  operario?: string;
  /** Su CodEmployee de RPS. Lo pone el SERVIDOR desde nuestra tabla, nunca el
   *  navegador; con `operario` puesto y sin código válido no sale nada. */
  empleado?: string;
  /** Códigos con flujo pendiente en CoordinaOT. Solo los añade el servidor. */
  pendientes?: readonly string[];
}

/** Las subfamilias de RPS por las que se puede filtrar el Historial, y que son
 *  también los chips que pinta.
 *
 *  Son códigos de `GENProductSubFamily`, los mismos con los que agrupa el
 *  tablero: filtrar aquí por "PUERTAS" y allí por "Puertas" tiene que traer lo
 *  mismo. La lista es fija y no sale de la base a propósito: hay 462
 *  subfamilias en el catálogo y solo estas aparecen en el trabajo de Oficina
 *  Técnica (12 meses a 11/08/2026, de más a menos: 1313 puertas, 700
 *  reparaciones, 662 toldos nuevos, 908 lonas nuevas, 488 confección, 163
 *  accesorios…). Una lista de 462 chips no es un filtro. */
// Ordenadas por lo que de verdad entra, no por el orden del catálogo. Los
// números son pedidos distintos de los dos últimos años (RPS, 08/2026):
//   REPARACIONES 5252 · LONASNUEVAS 3092 · TOLDO NUEVO 1829 · PUERTAS 1176
//   CONFECCION 1156 · ACCESORIOS TF 1084 · LONAS 266 · PISCINA 84 · CLONA 25
//   CAPOTA NUEVA 22 · YURTAS 15 · SERIE50 15 · PORTALES 6 · CBASTIDOR 3
// Las seis primeras son el 96 % del trabajo, así que quien busca por familia
// las encuentra sin bajar. Faltaban LONAS, SERIE50 y CBASTIDOR —que existen y
// no se podían filtrar— y el orden era el del catálogo, que no dice nada.
export const FAMILIAS_FILTRABLES: readonly string[] = [
  "REPARACIONES",
  "LONASNUEVAS",
  "TOLDO NUEVO",
  "PUERTAS",
  "CONFECCION",
  "ACCESORIOS TF",
  "LONAS",
  "PISCINA",
  "CLONA",
  "CAPOTA NUEVA",
  "YURTAS",
  "SERIE50",
  "PORTALES",
  "CBASTIDOR",
];

export interface HistorialItem {
  /** Trabajo todavía vivo en la sección seleccionada: no mostrar «Pasado». */
  estadoActual?: string;
  /** Consulta que RPS ha encontrado, incluso en OFs ausentes de esta cabecera.
   *  Permite al buscador global conservarla solo mientras siga esa consulta. */
  busqueda?: string;
  pedido: string;
  cliente: string | null;
  finalizada: string; // ISO
  fechaPedido?: string; // Fecha del pedido en RPS; ordena los resultados de búsqueda.
  nOf: number;

  /** Cuándo se pulsó "pasar a Producción" en CoordinaOT (ISO). Más fiel que
   *  `finalizada`, que es cuando OLANET registró el cambio de estado y puede
   *  ir por detrás. Ausente en los pedidos que no se pasaron desde aquí. */
  pasadoAt?: string;
  /** Nombre de quien lo pasó. Puede faltar aunque haya `pasadoAt`: los
   *  pedidos pasados antes de que se guardara el autor no lo tienen. */
  pasadoPor?: string;

  /** Quién lo planteó. En los pedidos hechos ya con la web es un dato
   *  registrado; en los anteriores se deduce del reparto de minutos de RPS
   *  (quien más tiempo le echó es quien lo planteó — ver `deducirRoles`), y si
   *  dos personas van parejas se ponen las dos. Vacío o ausente solo cuando no
   *  hay ni un minuto imputado a nadie. */
  autores?: string[];

  /** Quién lo revisó: registrado en CoordinaOT o, en lo anterior, deducido del
   *  reparto de minutos (quien echó poco). Nunca repite a un autor. */
  revisores?: string[];

  /** Quién echó horas en lo que cuenta para esta fila (ver `minutos`), de más a
   *  menos. Es lo que enseña la lista: nombre y tiempo, sin rol. Autor y
   *  revisor se quedan para la búsqueda, pero ya no se pintan: un "autor"
   *  arriba y cuatro nombres en el desglose se leía como una contradicción. */
  personas?: RepartoRol[];

  /** Minutos imputados en RPS a lo que cuenta para esta fila: las tareas de la
   *  sección o, si el pedido no tiene ninguna, las de los otros centros.
   *  Ausente = no se sabe (no se pudo leer), que no es lo mismo que 0. */
  minutos?: number;

  /** Solo cuando el pedido NO tiene tareas de la sección consultada: de qué
   *  centros es el trabajo que se enseña (p. ej. solo Taller). Sin esto, la
   *  lista de OT decía "Autor: Luis Santos" sin avisar de que era de taller. */
  otrosCentros?: import("./historial-centros").CentroHistorialId[];

  /** Familias visuales del pedido, para los chips de la lista. Se sacan de la
   *  descripción de sus OF de OT con `familiaDeTexto`, el MISMO criterio y el
   *  mismo conjunto de OFs que usa `HistorialPedidoDetalle.familias`: si no,
   *  un pedido saldría como TOLDO por fuera y como LONA al abrirlo. */
  familias?: string[];

  /** Local o negocio de entrega (`Mahou · Casa Perucho`). Sale de la dirección
   *  de entrega del pedido de venta, igual que en el detalle y en el tablero.
   *  Falta en la mayoría: en RPS solo 1 de cada 4 pedidos lo lleva relleno
   *  (1023 de 3962 en la serie AR.26), así que ausente es lo normal, no un
   *  fallo. */
  negocio?: string | null;
}

/** Lo que UNA persona fichó en UN rol sobre una OF. */
export interface RepartoRol {
  nombre: string;
  min: number;
}

export interface HistorialOF {
  tareas?: Array<{
    codigo: string;
    descripcion: string;
    tiempoImputadoMin: number;
    personas: RepartoRol[];
  }>;
  /** El minutaje y los roles de esta entrada pertenecen solo a este centro. */
  centro?: import("./historial-centros").CentroHistorialId;
  /** Reparto de los minutos imputados en RPS, sin deducir roles. */
  personas?: RepartoRol[];
  codigo: string;
  descripcion: string;
  tiempoImputadoMin: number;
  quien: string[]; // nombres y primer apellido, nunca códigos de empleado

  /** Desglose planteo/revisión. Solo existe para lo fichado en CoordinaOT: RPS
   *  no tiene tarea de revisión, así que de sus imputaciones no se puede
   *  deducir el rol. Ausente = no se sabe (OF anterior al fichaje en
   *  CoordinaOT), que no es lo mismo que cero.
   *
   *  Lleva los minutos de CADA persona en su rol, no solo el total: con todo el
   *  trabajo pasando ya por la web, se sabe de quién es cada minuto y no hay
   *  por qué esconderlo detrás de un número de grupo. Es lo que distingue este
   *  dato de `rolDeducido`, que son nombres y nada más. */
  rol?: {
    planteoMin: number;
    revisionMin: number;
    planteo: RepartoRol[];
    revision: RepartoRol[];
  };

  /** Material que lleva la OF, cada línea marcada con si sigue apartado en el
   *  almacén o solo está apuntado (ver `MaterialOF`). Ausente = esa OF no lleva
   *  material ninguno. */
  materiales?: MaterialOF[];

  /** Notas que Producción escribe en la OF ("BELEN AB - FINALIZO OP. 10").
   *  Poco frecuentes (36 de 579 OF de OT), pero cuando están dicen algo. */
  notasProduccion?: string;

  /** Roles DEDUCIDOS del reparto de minutos de RPS, para las OF anteriores al
   *  fichaje en CoordinaOT: quien más tiempo lleva planteó y quien lleva poco
   *  revisó (ver `deducirRoles`). Va en un campo aparte de `rol` a propósito —
   *  es una suposición, no un dato registrado, y quien lo pinte debe poder
   *  decirlo. Nunca aparecen los dos a la vez. */
  rolDeducido?: {
    quienPlanteo: string[];
    quienReviso: string[];
  };
}

// ─── Material de la OF: lo apartado y lo apuntado ────────────────────────────

/** Una línea de material de la OF, marcada con de dónde sale su cantidad.
 *
 *  Son dos cosas DISTINTAS y por eso viajan separadas:
 *   · apartado — queda reserva viva en `STKStockReserve`: esta cantidad está
 *     separada en el almacén para este trabajo, ahora mismo.
 *   · apuntado — solo lo que Oficina Técnica escribió en la OF
 *     (`CPRMOMaterial`): lo que hacía falta, se haya apartado o no.
 *
 *  Quien lo pinte tiene que poder decir cuál de las dos está enseñando: "está
 *  apartado" y "hacía falta" no significan lo mismo. */
export interface MaterialOF {
  /** "LONA ACRÍLICA MASACRIL 300 :SEDA 2596 :120 AN · 12.8" — mismo formato que
   *  las reservas del tablero, para que las dos pantallas se lean igual. */
  texto: string;
  /** Sigue habiendo reserva viva sobre este material. */
  apartado: boolean;
}

/** Una línea de material tal y como sale de RPS, antes de darle formato. */
export interface MaterialCrudo {
  /** `CPRMOMaterial.Description`. Puede venir vacía: existe de verdad (la OF
   *  0230370 lleva un material con cantidad 2,6 y descripción en blanco). */
  material: string | null;
  /** `CPRMOMaterial.Quantity`: lo apuntado en la OF. */
  cantidad: number | null;
  /** Suma de las reservas VIVAS sobre ese material, o null si no queda ninguna.
   *  null y 0 no son lo mismo: 0 sería una reserva de cero unidades. */
  reservado: number | null;
}

/** Cuánto se pueden separar la cantidad reservada y la apuntada antes de darlas
 *  por distintas. Las dos son `decimal(28,10)` en RPS y llegan como float, así
 *  que compararlas con `===` es pedir problemas; y la propia RPS redondea al
 *  reservar (material 6,725484 → reserva 6,72). */
const MISMA_CANTIDAD = 0.01;

/** Una línea de material con su cantidad, dando preferencia a la reserva.
 *
 *  Manda lo apartado cuando lo hay: es el dato duro —esto está separado en el
 *  almacén— frente a lo apuntado, que es la intención. Cuando ya no queda
 *  reserva (lo normal en un pedido viejo), se enseña lo apuntado.
 *
 *  Las dos cantidades casi siempre coinciden: medido en vivo (08/2026) sobre
 *  los 236 materiales con reserva viva de toda la BD, 230 coinciden, 5 tienen
 *  reservado de menos y 1 de más. Cuando NO coinciden se enseñan las dos
 *  ("· 1 de 6"), porque ahí está la información: se apartó menos de lo que
 *  hacía falta. */
export function aMaterialOF(fila: MaterialCrudo): MaterialOF {
  const nombre =
    (fila.material ?? "").trim().replace(/\s+/g, " ") || "(material sin nombre)";

  // Sin reserva viva: lo apuntado, tal cual. La cantidad puede faltar y entonces
  // se enseña el material a secas, sin dejar el " · " colgando.
  if (fila.reservado == null) {
    return {
      texto: `${nombre}${fila.cantidad != null ? ` · ${fila.cantidad}` : ""}`,
      apartado: false,
    };
  }

  const distinta =
    fila.cantidad != null && Math.abs(fila.reservado - fila.cantidad) >= MISMA_CANTIDAD;
  return {
    texto: `${nombre} · ${fila.reservado}${distinta ? ` de ${fila.cantidad}` : ""}`,
    apartado: true,
  };
}

/** Parte los materiales de una OF en los dos grupos que hay que distinguir.
 *
 *  El reparto es POR LÍNEA, no por OF, y no es un capricho: la reserva cuelga
 *  del material apuntado, así que lo apartado es siempre un SUBCONJUNTO de lo
 *  apuntado. Preferir la reserva "para toda la OF" solo podría esconder
 *  material, y esconde mucho — medido en vivo (08/2026) sobre las 150 OF que
 *  hoy conservan alguna reserva, lo normal es que la reserva cubra 1 de sus 5
 *  materiales (la OF 0229033 tiene 9 materiales y 1 reservado). Se enseñan
 *  todos, cada uno diciendo lo que es. */
export function repartirMateriales(materiales: MaterialOF[] | undefined): {
  apartados: MaterialOF[];
  apuntados: MaterialOF[];
} {
  const todos = materiales ?? [];
  return {
    apartados: todos.filter((m) => m.apartado),
    apuntados: todos.filter((m) => !m.apartado),
  };
}

/** Fila cruda de la query de página (antes de mapear). */
export interface FilaPagina {
  pedido: string;
  finalizada: Date | string | null;
  fecha_pedido?: Date | string | null;
  cliente: string | null;
  n_of: number;
  negocio?: string | null;
}

/** Cláusulas AND parametrizadas para el WHERE de la página. Los valores van
 *  como params mssql (request.input), nunca interpolados. */
export function construirFiltros(f: HistorialFiltros): {
  clausulas: string[];
  params: Array<{ nombre: string; valor: string }>;
} {
  const clausulas: string[] = [];
  const params: Array<{ nombre: string; valor: string }> = [];

  const q = f.q?.trim();
  if (q) {
    const palabras = palabrasDe(q);
    if (palabras.length === 0) {
      clausulas.push("1 = 0");
    } else {
      params.push({ nombre: "qCodigo", valor: `%${palabras.join("")}%` });
      palabras.forEach((palabra, i) => params.push({ nombre: `qPalabra${i}`, valor: `%${palabra}%` }));
      const texto = (columna: string) => palabras.map((_, i) => `${columna} COLLATE Latin1_General_CI_AI LIKE @qPalabra${i}`).join(" AND ");
      // Busca también líneas antiguas sin OF. El conjunto se calcula una vez,
      // sin repetir la búsqueda de descripciones por cada pedido del histórico.
      clausulas.push(`(REPLACE(p.pedido, '.', '') LIKE @qCodigo
        OR (${texto("cli.Description")})
        OR p.pedido IN (
          SELECT ob.CodOrder FROM dbo.FACOrderSL ob
          JOIN dbo.FACOrderLineSL lb ON lb.IDOrder = ob.IDOrder
          LEFT JOIN dbo.CPRManufacturingOrder mb ON mb.IDManufacturingOrder = lb.IDManufacturingOrder AND mb.CodCompany = '001'
          WHERE ob.CodCompany = '001'
            AND (mb.CodManufacturingOrder LIKE @qCodigo OR (${texto("mb.Description")}) OR (${texto("lb.Description")}))
        ))`);
    }
  }
  if (f.desde?.trim()) {
    clausulas.push("p.finalizada >= @desde");
    params.push({ nombre: "desde", valor: f.desde.trim() });
  }
  if (f.hasta?.trim()) {
    clausulas.push("p.finalizada < @hasta");
    params.push({ nombre: "hasta", valor: f.hasta.trim() });
  }

  // El filtro de familia iba por PALABRAS de la descripción de la MO, que era
  // adivinar: "REPARACION TOLDO" caía en las dos listas y bastaba una
  // descripción escrita de otra manera para dejar un pedido fuera. Ahora
  // pregunta por lo que RPS tiene clasificado —la subfamilia del artículo—, que
  // es además lo que agrupa en el tablero: la misma palabra significa lo mismo
  // en las dos pantallas.
  const familia = f.familia?.trim();
  if (familia && FAMILIAS_FILTRABLES.includes(familia)) {
    clausulas.push(
      `EXISTS (SELECT 1 FROM dbo.FACOrderSL o2 ` +
        `JOIN dbo.FACOrderLineSL l2 ON l2.IDOrder = o2.IDOrder ` +
        `JOIN dbo.STKArticle art2 ON art2.IDArticle = l2.IDArticle ` +
        `JOIN dbo.GENProductSubFamily sf2 ON sf2.IDProductSubFamily = art2.IDProductSubFamily ` +
        `WHERE o2.CodOrder = p.pedido AND o2.CodCompany = '001' ` +
        `AND sf2.CodProductSubFamily = @familia)`,
    );
    params.push({ nombre: "familia", valor: familia });
  }

  const cliente = f.cliente?.trim();
  if (cliente) {
    clausulas.push("cli.Description = @cliente");
    params.push({ nombre: "cliente", valor: cliente });
  }

  // Fuera los pedidos sin nada de la sección («Solo Taller»). La columna ya la
  // calcula la consulta de cierre (ver historial-finalizacion-sql).
  if (f.soloSeccion) clausulas.push("p.tiene_seccion = 1");

  // Los pedidos en los que ESTA persona imputó tiempo en RPS. El conjunto se
  // calcula una vez (IN), como en la búsqueda, no una subconsulta por pedido.
  if (f.operario?.trim()) {
    const empleado = f.empleado?.trim() ?? "";
    if (!/^\d+$/.test(empleado)) {
      // Alguien que no es del equipo: ningún pedido, no todos.
      clausulas.push("1 = 0");
    } else {
      clausulas.push(
        `p.pedido IN (SELECT o3.CodOrder FROM dbo.FACOrderSL o3 ` +
          `JOIN dbo.FACOrderLineSL l3 ON l3.IDOrder = o3.IDOrder ` +
          `JOIN dbo.CPRImputationMO i3 ON i3.IDManufacturingOrder = l3.IDManufacturingOrder AND i3.ResourceType = 1 ` +
          `JOIN dbo.GENEmployee e3 ON e3.IDEmployee = i3.IDEmployeeMachineTool ` +
          `WHERE o3.CodCompany = '001' AND e3.CodEmployee = @empleado)`,
      );
      params.push({ nombre: "empleado", valor: empleado });
    }
  }

  return { clausulas, params };
}

export function estadoActualHistorial(pedido: Pick<Pedido, "situacion" | "ofs"> | undefined): string | undefined {
  if (!pedido || pedido.situacion === "completado") return undefined;
  return FASES.find((fase) => fase.id === faseDePedido(pedido))?.label;
}

/** Equivalente del filtro de búsqueda para el origen simulado. */
export function coincideBusquedaHistorial(
  consulta: string,
  pedido: string,
  cliente: string,
  ofs: readonly { codigo: string; descripcion: string }[],
): boolean {
  const palabras = palabrasDe(consulta);
  if (!palabras.length) return false;
  const codigo = palabras.join("");
  const texto = (valor: string) => {
    const normalizado = palabrasDe(valor).join(" ");
    return palabras.every((palabra) => normalizado.includes(palabra));
  };
  return normaliza(pedido).includes(codigo) || texto(cliente)
    || ofs.some((of) => normaliza(of.codigo).includes(codigo) || texto(of.descripcion));
}

/** Cuánto del tiempo total tiene que llevar alguien para contar como autor.
 *  Por debajo de esto se le da por revisor: una revisión es un repaso, no
 *  rehacer el trabajo.
 *
 *  Es TAMBIÉN el umbral de empate del "si dudas, pon los dos": con 100 y 40
 *  minutos el segundo se lleva el 28,5 % del total y entra como autor; con 100
 *  y 20 se lleva el 16,6 % y se queda en revisor. El mismo número decide en la
 *  lista y en el detalle a propósito — que el Historial diga "Alberto y Tamara"
 *  por fuera y solo "Alberto" al abrir el pedido sería un fallo evidente. */
export const PARTE_AUTOR = 0.25;

/** Reparto deducido de un minutaje: quién planteó y quién revisó. */
export interface RepartoDeducido {
  autores: string[];
  revisores: string[];
}

/** Ordena a la gente por minutos y decide quiénes son autores y quiénes
 *  revisores. Es el criterio ÚNICO de deducción del Historial: lo usan tanto
 *  `deducirRoles` (por OF, para el detalle) como la lista (por pedido). Si se
 *  toca aquí, cambian los dos a la vez, que es justo lo que se quiere.
 *
 *  Devuelve null cuando no hay nada que interpretar: sin gente, o con gente
 *  pero sin un solo minuto entre todos. Null significa "no se sabe", que no es
 *  lo mismo que "no lo planteó nadie". */
export function repartirPorTiempo(
  minutosPorPersona: Map<string, number> | undefined,
): RepartoDeducido | null {
  if (!minutosPorPersona || minutosPorPersona.size === 0) return null;

  const gente = [...minutosPorPersona.entries()].sort((a, b) => b[1] - a[1]);
  // Una sola persona: lo planteó ella, no hay revisor que deducir. Se resuelve
  // antes de mirar el total porque aquí el reparto da igual: aunque tenga 0
  // minutos imputados, es la única que tocó la OF.
  if (gente.length === 1) return { autores: [gente[0][0]], revisores: [] };

  const total = gente.reduce((n, [, min]) => n + min, 0);
  // Varias personas y ni un minuto entre todas: no hay reparto que interpretar.
  if (total <= 0) return null;

  // El primero es autor siempre (aunque el reparto sea parejo: alguien lo
  // planteó). Del resto, autor quien pase del umbral y revisor quien no.
  const autores = [gente[0][0]];
  const revisores: string[] = [];
  for (const [nombre, min] of gente.slice(1)) {
    if (min / total >= PARTE_AUTOR) autores.push(nombre);
    else revisores.push(nombre);
  }
  return { autores, revisores };
}

/** Una fila del minutaje de la página, ya con su centro resuelto. */
export interface FilaTrabajoPedido {
  pedido: string;
  orden: string;
  /** Tarea y empleado: con pedido y orden, la clave de UN minutaje. */
  tarea: string;
  empleado: string;
  /** Nombre y primer apellido ya resuelto; vacío si no se sabe quién es. */
  nombre: string;
  centro: import("./historial-centros").CentroHistorialId;
  minutos: number;
}

/** De más minutos a menos; a igualdad, por nombre. Es el orden de todas las
 *  listas de personas del Historial (fila, ficha, tareas), para que la misma
 *  gente salga siempre en el mismo orden. */
export const porMinutos = (a: RepartoRol, b: RepartoRol): number =>
  b.min - a.min || a.nombre.localeCompare(b.nombre, "es");

/** Quién trabajó en esta OF y cuánto, de más a menos, sin rol.
 *
 *  Manda lo imputado en RPS. Si la OF no tiene ni un minuto en RPS pero sí se
 *  fichó en CoordinaOT (el reloj de la web), se enseña ese reloj: si no, quien
 *  la planteó con la web desaparecía de la ficha. Las dos fuentes NO se suman:
 *  hablan del mismo trabajo. Quien echó cero no sale. */
export function personasDeOF(of: Pick<HistorialOF, "personas" | "rol">): RepartoRol[] {
  const rps = (of.personas ?? []).filter((p) => p.min > 0);
  if (rps.length > 0) return [...rps].sort(porMinutos);
  const reloj = new Map<string, number>();
  for (const p of [...(of.rol?.planteo ?? []), ...(of.rol?.revision ?? [])]) {
    reloj.set(p.nombre, (reloj.get(p.nombre) ?? 0) + p.min);
  }
  return [...reloj]
    .map(([nombre, min]) => ({ nombre, min }))
    .filter((p) => p.min > 0)
    .sort(porMinutos);
}

/** Lo mismo para varias OF juntas (un centro de la ficha): suma por persona.
 *  Cada OF aporta según `personasDeOF`; sumar entre OF distintas es sumar
 *  trabajos distintos, no las dos fuentes del mismo. */
export function personasDeOFs(ofs: readonly Pick<HistorialOF, "personas" | "rol">[]): RepartoRol[] {
  const suma = new Map<string, number>();
  for (const of of ofs) {
    for (const p of personasDeOF(of)) suma.set(p.nombre, (suma.get(p.nombre) ?? 0) + p.min);
  }
  return [...suma].map(([nombre, min]) => ({ nombre, min })).sort(porMinutos);
}

export interface TrabajoPedido {
  minutos: number;
  /** Quién echó esos minutos, con los suyos, de más a menos. */
  personas: RepartoRol[];
  /** Ver `HistorialItem.otrosCentros`. */
  otrosCentros?: import("./historial-centros").CentroHistorialId[];
}

const ORDEN_CENTROS = ["ot", "diseno", "taller"] as const;

/** Cuánto trabajo enseña cada fila del Historial y de qué centro es.
 *
 *  La regla es la de la autoría de la misma lista: si el pedido tiene tareas de
 *  la sección, solo cuentan esas (las de Taller no se suman a OT); si no tiene
 *  ninguna, se enseña el de los otros centros y se dice cuáles. */
export function resumirTrabajoPedidos(
  filas: readonly FilaTrabajoPedido[],
  seccion: import("./secciones").SeccionId,
): Map<string, TrabajoPedido> {
  const conSeccion = new Set(filas.filter((f) => f.centro === seccion).map((f) => f.pedido));
  const suma = new Map<string, { minutos: number; centros: Set<string>; personas: Map<string, number> }>();
  // La consulta de la lista cuelga las OF de las LÍNEAS de venta: una OF en dos
  // líneas trae dos veces el mismo minutaje (tarea y persona). Se cuenta una
  // vez; si no, la lista podría sumar el doble que la ficha, que no lo repite.
  const vistas = new Set<string>();
  for (const f of filas) {
    if (!f.pedido) continue;
    if (conSeccion.has(f.pedido) && f.centro !== seccion) continue;
    const clave = `${f.pedido}|${f.orden}|${f.tarea}|${f.empleado}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const s = suma.get(f.pedido) ?? { minutos: 0, centros: new Set<string>(), personas: new Map<string, number>() };
    s.minutos += f.minutos;
    s.centros.add(f.centro);
    if (f.nombre) s.personas.set(f.nombre, (s.personas.get(f.nombre) ?? 0) + f.minutos);
    suma.set(f.pedido, s);
  }
  return new Map(
    [...suma].map(([pedido, s]) => {
      // Solo quien echó algo: una fila de imputación a cero no es trabajo.
      const personas = [...s.personas]
        .filter(([, min]) => min > 0)
        .map(([nombre, min]) => ({ nombre, min }))
        .sort(porMinutos);
      return [
        pedido,
        conSeccion.has(pedido)
          ? { minutos: s.minutos, personas }
          : { minutos: s.minutos, personas, otrosCentros: ORDEN_CENTROS.filter((c) => s.centros.has(c)) },
      ];
    }),
  );
}

export function filaAItem(fila: FilaPagina): HistorialItem {
  const finalizada =
    fila.finalizada instanceof Date
      ? fila.finalizada.toISOString()
      : (fila.finalizada ?? "");
  // Negocio vacío se omite en vez de viajar como "": la lista lo pinta como
  // "cliente · negocio" y un negocio en blanco dejaría el separador colgando.
  const negocio = (fila.negocio ?? "").trim();
  return {
    pedido: (fila.pedido ?? "").trim(),
    cliente: fila.cliente,
    finalizada,
    ...(fila.fecha_pedido ? { fechaPedido: fila.fecha_pedido instanceof Date ? fila.fecha_pedido.toISOString() : fila.fecha_pedido } : {}),
    nOf: fila.n_of ?? 0,
    ...(negocio ? { negocio } : {}),
  };
}

/** Un fichero de RPS colgado del pedido o de una de sus OF.
 *
 *  RPS no guarda el fichero en la BD: guarda un enlace (`GENEntityDocument`)
 *  con la ruta al share (`file://\\192.168.0.128\RPS\VENTAS\…`). Aquí no viaja
 *  la ruta, solo una URL nuestra que la resuelve en el servidor — ver la ruta
 *  `/api/historial/[pedido]/documento/[indice]`. */
export interface DocumentoRps {
  /** Cómo lo describe RPS ("Planteamiento del pedido AR.26.02932, version 1"). */
  descripcion: string;
  /** Nombre del fichero, para cuando la descripción no distingue versiones. */
  archivo: string;
  /** De qué es, deducido de la carpeta (ver `claseDeDocumento`). */
  clase: string;
  /** URL para abrirlo, o null si no hay nada que abrir.
   *
   *  Null cuando lo que RPS tiene apuntado no es un fichero del archivo: los
   *  `gdoc://{uuid}`, que viven dentro del gestor documental de RPS y no se
   *  pueden servir, y los enlaces a discos ajenos (ver `segmentosEnShare`). No
   *  se tiran de la lista porque su descripción sigue diciendo qué había ahí;
   *  simplemente no son un enlace. Son 344 de los 18 975 documentos de la serie
   *  AR.26, un 1,8 %.
   *
   *  Con URL, la descarga aún puede dar 404: el enlace de RPS se guarda para
   *  siempre y el fichero puede haberse movido del share. */
  url: string | null;
}

/** Carpeta del share de RPS → qué es el documento. RPS no tiene un campo con
 *  el tipo: lo que hay es la carpeta donde lo dejó, y resulta ser fiable.
 *  Verificado sobre los 15 556 documentos de los pedidos AR.26. El orden
 *  importa: las subcarpetas van antes que su padre. */
const CLASE_POR_CARPETA: Array<[RegExp, string]> = [
  [/\\PLANTEAMIENTOS\\/i, "Planteamiento"],
  [/\\PRESUPUESTOS\\.*\\DIGITALIZADOS\\/i, "Presupuesto escaneado"],
  [/\\PRESUPUESTOS\\.*\\DISE/i, "Diseño"],
  [/\\PRESUPUESTOS\\/i, "Presupuesto"],
  [/\\PEDIDOS\\.*\\REMATES\\/i, "Remates"],
  [/\\PEDIDOS\\/i, "Pedido escaneado"],
  [/\\ROTULACIONES\\/i, "Rotulación"],
  [/\\FOTOS TRABAJOS\\/i, "Foto del trabajo"],
  [/\\ETIQUETAS_BOLSAS\\/i, "Etiquetas"],
  [/\\HOJAS_ALMACEN\\/i, "Hoja de almacén"],
  [/\\OF\\OF\\/i, "Adjunto de la OF"],
  [/\\SAT\\/i, "Mantenimiento (SAT)"],
];

export function claseDeDocumento(ruta: string): string {
  for (const [re, clase] of CLASE_POR_CARPETA) if (re.test(ruta)) return clase;
  return "Documento";
}

/** Nombre de fichero de una ruta de RPS (siempre con separador de Windows). */
export function archivoDeRuta(ruta: string): string {
  const limpia = ruta.replace(/\/+$/, "");
  const i = Math.max(limpia.lastIndexOf("\\"), limpia.lastIndexOf("/"));
  return i >= 0 ? limpia.slice(i + 1) : limpia;
}

/** Cómo empieza una ruta que SÍ está dentro del share de documentos de RPS.
 *  `GENEntityDocument.Path` guarda una URL `file://` seguida de la ruta UNC. */
const PREFIJO_SHARE_RPS = "file://\\\\192.168.0.128\\RPS\\";

/** Trocea la ruta de RPS en los segmentos que cuelgan del share, o null si esa
 *  ruta no se puede servir.
 *
 *  Esta función es la ÚNICA defensa entre lo que RPS tiene apuntado y lo que la
 *  web abre del disco, y hace falta porque el campo `Path` es texto libre que
 *  lleva 20 años recogiendo de todo. Medido sobre los 607 190 enlaces de pedido
 *  y de OF de la BD (08/2026):
 *    · 451 910 cuelgan del share de RPS — los únicos que se sirven.
 *    ·   1 941 son `gdoc://{uuid}`: viven dentro del gestor documental de RPS,
 *              no son ficheros y no hay nada que abrir.
 *    · 153 339 son `file://` a OTRO sitio: otros servidores
 *              (`\\192.168.0.114\…`, `\\Megabeast\…`) y, lo peligroso, rutas
 *              LOCALES tipo `file://C:\Users\{quien fuera}\Desktop\…`. Esas
 *              resolverían contra el disco DEL SERVIDOR WEB, así que servirlas
 *              sería dejar leer ficheros nuestros a quien abra un pedido.
 *  Todo lo que no empiece por el share se rechaza, y punto.
 *
 *  Devuelve segmentos sueltos y no una cadena a propósito: en Linux la barra
 *  invertida es un carácter válido en un nombre de fichero, así que un
 *  `path.join(raíz, "OF\\OF\\x.pdf")` NO baja dos carpetas, crea un fichero con
 *  barras en el nombre. Con segmentos, quien llame hace `path.join(raíz, ...s)`
 *  y sale bien en las dos plataformas. Cada segmento se valida además contra
 *  `.`/`..` y separadores, que es lo que convierte el path traversal en
 *  imposible en vez de en improbable. */
export function segmentosEnShare(ruta: string): string[] | null {
  const limpia = (ruta ?? "").trim();
  if (!limpia.toLowerCase().startsWith(PREFIJO_SHARE_RPS.toLowerCase())) return null;

  const segmentos = limpia
    .slice(PREFIJO_SHARE_RPS.length)
    .split(/[\\/]+/)
    .filter(Boolean);
  if (segmentos.length === 0) return null;
  // Ni "..", ni ".", ni un segmento que se cuele con separador o dos puntos de
  // unidad ("C:"). Con esto, `path.join` no puede salir de la raíz.
  for (const s of segmentos) {
    if (s === "." || s === ".." || /[\\/:]/.test(s)) return null;
  }
  return segmentos;
}

/** Extensión → Content-Type, y si se puede enseñar en el navegador.
 *
 *  Solo entran los formatos que el navegador pinta sin descargar nada. Los 4376
 *  `.msg` de Outlook, los `.doc`, los `.dwg`… no están porque no hay nada que
 *  enseñar, y sobre todo NO están los 32 `.htm`/`.html`: servir HTML ajeno
 *  desde nuestro propio origen es un XSS almacenado de manual. Todo lo que no
 *  esté en esta tabla se manda como descarga opaca. */
const TIPO_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/** Cómo servir un fichero del share: tipo MIME y si va incrustado o de bajada.
 *
 *  Reparto real de los enlaces de pedido/OF (08/2026): 476 553 `.pdf` y 122 339
 *  imágenes se ven en el navegador; el resto (`.msg`, `.doc`, `.xls`, `.dwg`,
 *  `.cdr`…) suma menos del 1,2 % y se baja. */
export function comoServir(archivo: string): { tipo: string; incrustable: boolean } {
  const ext = (archivo.split(".").pop() ?? "").toLowerCase();
  const tipo = TIPO_POR_EXTENSION[ext];
  return tipo
    ? { tipo, incrustable: true }
    : { tipo: "application/octet-stream", incrustable: false };
}

/** ¿Es una imagen que el navegador pinta? Lo decide la MISMA tabla que usa el
  *  servidor para servirla, no una lista aparte: si las dos se separaran, la
  *  ficha enseñaría una miniatura de algo que luego baja como fichero.
  *
  *  Se usa para sacar galería en la ficha del pedido: de un PDF no hay nada que
  *  enseñar en pequeño, pero de una rotulación o una foto del trabajo sí, y
  *  esas son 122 000 de los enlaces de RPS. */
export function esImagen(archivo: string): boolean {
  const ext = (archivo.split(".").pop() ?? "").toLowerCase();
  return (TIPO_POR_EXTENSION[ext] ?? "").startsWith("image/");
}

export interface HistorialPedidoDetalle {
  estadoActual?: string;
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  prioridad: 1 | 2 | 3;
  fechaSolicitud: string | null; // ISO yyyy-mm-dd
  fechaFinalizacion: string | null; // ISO
  piezas: number;
  familias: string[];
  comentarioVenta: string | null;
  scanUrl: string; // /api/pedidos/{codigo}.pdf (puede dar 404)
  /** Una entrada por OF y centro: el código puede repetirse entre centros. */
  ofs: HistorialOF[];

  /** Todo lo que RPS tiene colgado del pedido y de sus OF: planteamiento,
   *  presupuesto, fotos de la instalación y de las visitas, rotulación… Casi
   *  todos los pedidos llevan algo (3960 de 3962 en la serie AR.26).
   *
   *  AQUÍ ESTABAN TAMBIÉN `comentariosLinea` (lo vendido, línea a línea) y
   *  `comentarioEnvio` (el "FECHA SOLICITADA / PERSONAL / TIEMPO"). Se han ido
   *  con los dos bloques que los pintaban: decían lo mismo que el parte
   *  escaneado que se ve al lado a tamaño completo, y traerlos costaba una
   *  consulta más a RPS en cada apertura de ficha. */
  documentos: DocumentoRps[];
}

/** Fila cruda de la cabecera del pedido (antes de mapear). */
export interface FilaCabecera {
  pedido: string;
  cliente: string | null;
  negocio: string | null;
  ciudad: string | null;
  comentario: string | null;
  solicitada: Date | string | null;
  prioridad: number | null;
  piezas: number | null;
}

/** Fecha de venta a yyyy-mm-dd; centinela RPS (<2000) o inválida → null. */
function fechaSolicitudISO(v: Date | string | null): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lo que RPS sabe del pedido además de la cabecera y las OF. Opcional para
 *  que el mock y los tests puedan armar un detalle sin tener que inventárselo. */
export interface ExtrasDetalle {
  documentos?: DocumentoRps[];
}

export function cabeceraADetalle(
  fila: FilaCabecera,
  ofs: HistorialOF[],
  finalizada: string | null,
  familias: string[],
  extras: ExtrasDetalle = {},
): HistorialPedidoDetalle {
  const codigo = (fila.pedido ?? "").trim();
  const prioridad = fila.prioridad === 1 || fila.prioridad === 2 || fila.prioridad === 3 ? fila.prioridad : 1;
  return {
    codigo,
    cliente: fila.cliente,
    negocio: fila.negocio,
    ciudadEntrega: fila.ciudad,
    prioridad,
    fechaSolicitud: fechaSolicitudISO(fila.solicitada),
    fechaFinalizacion: finalizada,
    piezas: fila.piezas ?? 0,
    familias,
    comentarioVenta: fila.comentario,
    scanUrl: `/api/pedidos/${codigo}.pdf`,
    ofs,
    documentos: extras.documentos ?? [],
  };
}
