import { palabrasDe } from "./buscador";
import type { DocumentoRps, HistorialOF, HistorialPedidoDetalle } from "./historial";
import { normalizaBusqueda, type BaseHistorial, type IndiceHistorial } from "./historial-indice";
import { SECCION_POR_DEFECTO } from "./secciones";
import { esCodigoPedido } from "./types";

// ─── Nombres de centro para quien no es del taller ───────────────────────────
// RPS guarda el centro en mayúsculas, sin acentos, y a veces literalmente el
// nombre de la máquina ("PLOTER DE CORTE MASCARA ULTRA SIGN PAL GRC1325").
// Quien lee esto es comercial o administración: no distingue una máquina de
// otra, distingue EN QUÉ PASO está su pedido. Aquí se traduce el centro al
// paso de trabajo; lo que no está en la tabla sale tal cual lo escribió RPS
// (mejor un texto feo que uno inventado).
//
// MANTENIMIENTO: la tabla la actualiza quien dé de alta un centro nuevo en
// RPS (o note que uno de los de abajo cambió de nombre). Añadir uno es una
// línea más aquí; no hace falta tocar nada más.
//
// La localidad SOLO entra en el nombre cuando distingue algo de verdad.
// Arzúa, Santiago, Bergondo y el Parque Empresarial son sitios reales
// distintos (con trabajo abierto desde 2025, medido en RPS), así que si el
// mismo paso se hace en más de uno se dice dónde; si solo hay un sitio para
// ese paso, repetirlo no informa y se calla — por eso "Oficina Técnica" y
// "Diseño Gráfico" no llevan Arzúa, aunque RPS se lo ponga.
//
// "POLIGONO" se trata como el mismo sitio que "PARQUE EMPRESARIAL": no hay
// indicio de un quinto sitio real y ambos nombran la misma nave con otra
// palabra. Si resultara ser un sitio distinto de verdad, esta nota es la que
// hay que corregir y separar sus entradas.
//
// La máquina se sustituye por el paso que hace, no por la familia del
// material: "CORTE ACRILICO" y "CORTE AUTOMÁTICO ..." son los dos "Corte",
// porque a quien lee esto no le dice nada si fue a máquina o a mano, ni con
// qué material — solo en qué paso está.
const NOMBRE_DE_CENTRO: Record<string, string> = {
  "OFICINA TECNICA ARZUA": "Oficina Técnica",
  "OFICINA TECNICA": "Oficina Técnica",
  "DISEÑO GRAFICO ARZUA": "Diseño Gráfico",
  "DISEÑO GRAFICO": "Diseño Gráfico",

  "SOLDADURA ALTA FRECUENCIA PARQUE EMPRESARIAL": "Soldadura (Parque Empresarial)",
  "SOLDADURA AIRE CALIENTE PARQUE EMPRESARIAL": "Soldadura (Parque Empresarial)",
  "SOLDADURA CUÑA AIRE CALIENTE": "Soldadura",
  "MAQUINA SOLDAR AIRE CALIENTE": "Soldadura",
  // Forsstrom: máquina de soldadura de alta frecuencia, no un paso aparte.
  "FORSSTROM SIN BANCADA": "Soldadura",

  "FINALIZACION": "Finalización",

  "COSTURA PARQUE EMPRESARIAL": "Costura (Parque Empresarial)",
  "COSTURA POLIGONO": "Costura (Parque Empresarial)",

  "CORTE AUTOMÁTICO PARQUE EMPRESARIAL": "Corte (Parque Empresarial)",
  "CORTE MANUAL PARQUE EMPRESARIAL": "Corte (Parque Empresarial)",
  "CORTE MANUAL ARZUA": "Corte (Arzúa)",
  "CORTE ACRILICO": "Corte",
  // Cinta/correaje es un material bien distinto de la lona: se deja aparte.
  "CORTE DE CINTA": "Corte de cinta",

  "PLOTER DE CORTE MASCARA ULTRA SIGN PAL GRC1325": "Plotter de corte",
  "PLOTTER CORTE VINILO MUTOH SC-1400D": "Plotter de corte",

  "COLOCACION DE OLLAOS PARQUE EMPRESARIAL": "Colocación de ollaos (Parque Empresarial)",
  "COLOCACION DE OLLAOS ARZUA": "Colocación de ollaos (Arzúa)",

  "CONFECCION SANTIAGO": "Confección (Santiago)",
  "CONFECCION BERGONDO": "Confección (Bergondo)",
  "CONFECCION ACRILICO": "Confección",
  "CONFECCION RAIDO": "Confección",

  "ROTULACIONES ARZUA": "Rotulación (Arzúa)",
  "ROTULACIONES SANTIAGO": "Rotulación (Santiago)",
  "ROTULACIONES PARQUE EMPRESARIAL": "Rotulación (Parque Empresarial)",
  "ROTULACIONES BERGONDO": "Rotulación (Bergondo)",

  "IMPRESION DIGITAL": "Impresión digital",
  "PLOTTER IMPRESIÓN 162 CM HP LATEX 8002": "Impresión digital",

  "CALDERERIA": "Calderería",

  "REPARACION Y MONTAJE SANTIAGO": "Reparación y montaje (Santiago)",
  "REPARACIONES Y MONTAJES BERGONDO": "Reparaciones y montajes (Bergondo)",
  // "Nave" es un detalle del edificio, no del sitio: Parque Empresarial ya lo dice.
  "REPARACIONES NAVE PARQUE EMPRESARIAL": "Reparaciones (Parque Empresarial)",

  "MONTAJE DE TOLDOS": "Montaje",
  "MONTAJE TOLDO PLANO": "Montaje",

  "CAPOTAS": "Capotas",

  "BARNIZADO EN ROTULACIONES POLIGONO": "Barnizado (Parque Empresarial)",
  "BARNIZADO EN ROTULACIONES ARZUA": "Barnizado (Arzúa)",
};

/** Igual que compara RPS: mayúsculas y sin espacios de más. La trampa ya
 *  conocida en este proyecto es el mismo centro escrito de dos formas
 *  ("CONFECCION  BERGONDO" con doble espacio, "MONTAJE TOLDO PLANO " con uno
 *  de sobra); sin esto, esas dos filas se caerían de la tabla y saldrían con
 *  el texto crudo aunque estén dadas de alta. */
function normalizaCentro(centro: string): string {
  return centro.trim().replace(/\s+/g, " ").toUpperCase();
}

// ─── Lo que ve quien no tiene sesión ─────────────────────────────────────────
// Toda la casa pregunta lo mismo —"¿por dónde va este pedido?"— y hasta ahora
// lo preguntaba por teléfono. Aquí se decide qué es estar pendiente, en qué
// orden se enseña y cómo se cuenta. Sin base de datos, para poder probarlo.
//
// NO ENTRA NADA INTERNO. Ni notas, ni causas, ni marcas de revisión: eso se
// escribe entre nosotros y se escribe distinto si lo lee toda la casa.

export const PAGE_PUBLICO = 40;

export type ListaPublica = "pendientes" | "realizados";

export interface FiltrosPublicos {
  lista: ListaPublica;
  page: number;
  q?: string;
  cliente?: string;
  familia?: string;
  /** ISO yyyy-mm-dd, inclusive. Sobre la entrega en pendientes y sobre el
   *  cierre en realizados: en cada lista, la fecha que se está mirando. */
  desde?: string;
  hasta?: string;
  /** Solo en "pendientes" (ver el apartado de vencidos en `filtrarPublico`):
   *  en vez de lo que viene, trae solo lo vencido. Es como se piden las
   *  filas de dentro del apartado plegado, página a página. */
  soloVencidos?: boolean;
}

export interface PedidoPublico {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  /** ISO yyyy-mm-dd. */
  fechaPedido: string | null;
  fechaEntrega: string | null;
  fechaFinalizacion: string | null;
  nOf: number;
  pendiente: boolean;
  pendienteEntrega: boolean;
  /** Centros de trabajo con tarea sin cerrar, por su descripción. */
  centros: string[];
  /** La frase que se lee en la fila (ver `frasePublica`). */
  estado: string;
}

/** Un pedido sigue vivo mientras le quede una tarea abierta O algo por
 *  entregar. Lo segundo no es un extra: terminar en fábrica no es entregar, y
 *  el almacén es la etapa por la que más llaman. */
export function estaPendiente(b: BaseHistorial): boolean {
  return b.pendienteTotal || b.pendienteEntrega;
}

/** "PLOTER DE CORTE MASCARA ULTRA SIGN PAL GRC1325" → "Plotter de corte": el
 *  paso de trabajo de la tabla de arriba. Sin entrada en la tabla, se cae al
 *  texto de RPS con solo la mayúscula inicial arreglada (RPS los guarda a
 *  gritos, y en una fila de lista eso no se lee) — mejor un texto feo que
 *  cuadra con RPS que uno bonito que no significa nada. */
function enFrase(centro: string): string {
  const bonito = NOMBRE_DE_CENTRO[normalizaCentro(centro)];
  if (bonito) return bonito;
  const limpio = centro.trim().toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** Por dónde va el pedido, con la entrega de último tramo.
 *
 *  Se quitan los repetidos DESPUÉS de traducir, no antes: varios centros de
 *  RPS caen a propósito en el mismo nombre —«SOLDADURA ALTA FRECUENCIA PARQUE
 *  EMPRESARIAL» y «SOLDADURA AIRE CALIENTE PARQUE EMPRESARIAL» son los dos
 *  «Soldadura (Parque Empresarial)»— y sin esto la fila decía «Pendiente de:
 *  Soldadura (Parque Empresarial), Soldadura (Parque Empresarial)», que
 *  parece un fallo de la web aunque el dato sea correcto. */
export function frasePublica(centros: readonly string[], pendienteEntrega: boolean): string {
  const nombres = [...new Set(centros.map(enFrase))];
  if (nombres.length > 0) return `Pendiente de: ${nombres.join(", ")}`;
  return pendienteEntrega ? "Fabricado, pendiente de entregar" : "Entregado";
}

/** yyyy-mm-dd → medianoche LOCAL, como compara SQL Server una fecha sin hora.
 *  `dias` desplaza el día (se usa para llegar a la medianoche del día
 *  SIGUIENTE); se lo pasamos al constructor de Date en vez de sumar ms a
 *  mano para que el cambio de hora (DST) lo resuelva el propio Date. */
function medianoche(iso: string | undefined, dias = 0): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso?.trim() ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias).getTime() : null;
}

/** Lo que entrega antes, primero. Sin fecha, al final: un pedido sin entrega
 *  puesta no es urgente, es un pedido del que no se sabe. El desempate usa
 *  localeCompare (como el gemelo de historial-indice.ts) y no `<`: con `<` el
 *  resultado es 1 en los dos sentidos cuando los códigos son iguales, lo que
 *  rompe la simetría que un comparador tiene que cumplir. */
const porEntrega = (a: BaseHistorial, b: BaseHistorial): number =>
  (a.fechaEntrega ?? Infinity) - (b.fechaEntrega ?? Infinity) || a.pedido.localeCompare(b.pedido, "es");

const porCierre = (a: BaseHistorial, b: BaseHistorial): number =>
  (b.finalizada ?? -Infinity) - (a.finalizada ?? -Infinity) || a.pedido.localeCompare(b.pedido, "es");

// Medido contra RPS el 14/09/2026 con la web levantada: la lista de
// pendientes SIN BUSCAR abría con pedidos de 2021 cuya entrega seguía
// figurando en 2001. No es un fallo del código — RPS nunca cerró esos
// pedidos, y los cierres de OLANET no empiezan hasta 2020 — pero enseñarlos
// de entrada enterraba lo que de verdad está en marcha bajo chatarra de hace
// un lustro. Pendientes por año de pedido: 2026 → 777, 2025 → 2.260,
// 2024 → 2.450, 2023 → 2.545, 2022 → 2.504, 2021 → 3.459, 2020 → 4.600,
// 2019 → 9.622, 2018 → 10.346, anteriores a 2023 → 110.576 (!). Por eso la
// lista sin buscar solo llega hasta 2025 (3.037 pedidos: lo que sigue en
// marcha o se acaba de quedar atrás). El corte se levanta con búsqueda (q)
// o con un cliente concreto: quien escribe un código, un cliente o una
// descripción sabe lo que busca, y decirle "no existe" porque es de 2019
// sería mentirle. La familia NO levanta el corte: mirar por encima una
// categoría entera no es buscar algo concreto, y el corte la hace legible.
//
// Decidido que esto NO aplica a "realizados": esa lista ya sale ordenada por
// cierre más reciente (porCierre) y la chatarra antigua queda sola al fondo,
// sin necesidad de un corte que además le escondería a alguien un pedido
// viejo que sí sabe buscar.
const CORTE_PENDIENTES_SIN_BUSQUEDA = Date.UTC(2025, 0, 1);

export function filtrarPublico(
  indice: IndiceHistorial,
  f: FiltrosPublicos,
  /** ISO yyyy-mm-dd de "hoy", para partir vencido/por-venir (ver el bloque de
   *  abajo). Sin este dato no hay forma honesta de decidir qué es vencido
   *  —sería fiarse de la hora del proceso que ejecuta el filtro—, así que sin
   *  él los pendientes salen SIN separar, tal como salían antes de este
   *  cambio: ningún test viejo de esta función habla de vencidos, y no tiene
   *  por qué empezar a pasar una fecha que no le importa. El servidor SIEMPRE
   *  lo manda (`leerPaginaPublica`, con `hoyISO()`). */
  hoy?: string,
): { filas: BaseHistorial[]; hasMore: boolean; vencidos?: number } {
  const pendientes = f.lista === "pendientes";
  const q = f.q?.trim() ?? "";
  const palabras = palabrasDe(q);
  const codigo = palabras.join("");
  const exacto = esCodigoPedido(q.toUpperCase()) ? q.toUpperCase() : null;
  const cliente = f.cliente?.trim() ? normalizaBusqueda(f.cliente.trim()) : null;
  const familia = f.familia?.trim() || null;
  const desde = medianoche(f.desde);
  // "hasta" es inclusive (ver FiltrosPublicos): un pedido cerrado a mitad de
  // tarde de ESE día tiene que salir. Comparar con la medianoche del propio
  // día lo dejaba fuera en cuanto llevaba hora real (como `finalizada`), así
  // que el límite es la medianoche del día SIGUIENTE, con `<` estricto.
  const hasta = medianoche(f.hasta, 1);

  const elegidas: BaseHistorial[] = [];
  // Las dos secciones del índice llevan los MISMOS pedidos de la casa (lo que
  // cambia entre ellas es de qué tareas se mira el cierre), así que aquí se
  // recorre una sola: contarlas las dos duplicaría cada pedido.
  for (const b of indice.base[SECCION_POR_DEFECTO]) {
    if (estaPendiente(b) !== pendientes) continue;
    // Corte de pendientes sin buscar — ver CORTE_PENDIENTES_SIN_BUSQUEDA.
    // fechaPedido null no pasa el corte: no hay forma de saber si es de 2025.
    if (pendientes && !q && !cliente && (b.fechaPedido === null || b.fechaPedido < CORTE_PENDIENTES_SIN_BUSQUEDA)) continue;

    const fecha = pendientes ? b.fechaEntrega : b.finalizada;
    if (desde !== null && (fecha === null || fecha < desde)) continue;
    if (hasta !== null && (fecha === null || fecha >= hasta)) continue;

    const info = indice.info.get(b.pedido);
    // A propósito distinto del gemelo filtrarIndice (historial-indice.ts), que
    // compara con `!==`: ahí el equipo elige el cliente de un desplegable, aquí
    // el invitado escribe de memoria un trozo del nombre, así que hace falta
    // coincidencia parcial.
    if (cliente && !normalizaBusqueda(info?.cliente ?? "").includes(cliente)) continue;
    if (familia && !(info?.familias ?? []).includes(familia)) continue;

    if (q) {
      if (exacto) {
        if (b.pedido !== exacto) continue;
      } else if (palabras.length === 0) {
        continue;
      } else if (
        !b.pedido.replaceAll(".", "").includes(codigo) &&
        !(info?.ordenes ?? "").includes(codigo) &&
        !palabras.every((p) => (info?.textos ?? "").includes(p))
      ) {
        continue;
      }
    }
    elegidas.push(b);
  }

  // ─── El apartado de vencidos (Cambio 1, task-7c) ───────────────────────────
  // Con la lista sin más, un pedido de enero encabeza la página aunque lo que
  // importa esta semana esté cien filas más abajo: ordenar por entrega es
  // correcto, pero enseñar la chatarra de hace meses de entrada hace parecer
  // la lista desactualizada. Se separa aquí, en el servidor, y no en la
  // pantalla, por dos motivos: (1) es DONDE se pagina — la pantalla nunca ve
  // más de 40 filas a la vez, así que un total de verdad ("347 vencidos") solo
  // se puede contar mirando TODO lo filtrado, que es justo lo que tiene
  // delante este bucle y la pantalla no; (2) es donde ya vive el otro corte
  // temporal de esta misma lista (CORTE_PENDIENTES_SIN_BUSQUEDA, arriba), así
  // que las dos reglas quedan juntas y no una en cada sitio.
  //
  // Solo aplica a "pendientes" (la de realizados no lo pidió, y no tiene
  // "vencido": ya sale ordenada por cierre más reciente). Sin "hoy" tampoco
  // se separa nada: ver el comentario del parámetro.
  let universo = elegidas;
  let vencidos: number | undefined;
  if (pendientes && hoy) {
    const hoyMs = medianoche(hoy);
    const esVencido = (b: BaseHistorial): boolean =>
      b.fechaEntrega !== null && hoyMs !== null && b.fechaEntrega < hoyMs;
    if (f.soloVencidos) {
      universo = elegidas.filter(esVencido);
    } else {
      vencidos = elegidas.reduce((n, b) => n + (esVencido(b) ? 1 : 0), 0);
      universo = elegidas.filter((b) => !esVencido(b));
    }
  }

  universo.sort(pendientes ? porEntrega : porCierre);
  const off = Math.max(0, f.page) * PAGE_PUBLICO;
  const trozo = universo.slice(off, off + PAGE_PUBLICO + 1);
  return {
    filas: trozo.slice(0, PAGE_PUBLICO),
    hasMore: trozo.length > PAGE_PUBLICO,
    ...(vencidos !== undefined ? { vencidos } : {}),
  };
}

/** Los filtros tal como llegan de la URL. NUNCA lanza: esto viene de fuera y
 *  un valor raro no puede tumbar la página de nadie. */
export function normalizarFiltrosPublicos(sp: URLSearchParams): FiltrosPublicos {
  const page = Number(sp.get("page"));
  const texto = (k: string): string | undefined => sp.get(k)?.trim() || undefined;
  return {
    lista: sp.get("lista") === "realizados" ? "realizados" : "pendientes",
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    q: texto("q"),
    cliente: texto("cliente"),
    familia: texto("familia"),
    desde: texto("desde"),
    hasta: texto("hasta"),
    soloVencidos: sp.get("vencidos") === "1",
  };
}

// ─── El detalle de un pedido, para quien no tiene sesión ─────────────────────
// `HistorialPedidoDetalle` (historial.ts) es el mismo objeto que ve el equipo:
// cabecera, OF con su reparto de roles, notas de Producción… Aquí se recorta a
// lo que puede leer toda la casa, campo a campo y a propósito: cada línea de
// abajo es un "sí" explícito, y lo que no está escrito no sale, aunque el
// Historial le añada un campo mañana.

/** Una OF tal y como la ve el invitado: identidad, tareas, tiempos y personas.
 *  Fuera quedan `autorRegistrado`/`revisorRegistrado` y `rol` —el reparto
 *  planteo/revisión es la marca de revisión interna, justo lo que este plan
 *  prohíbe—, `materiales` (no lo pidió nadie) y `notasProduccion` (una nota,
 *  como las que ya están prohibidas para el pedido). */
export type OfPublica = Pick<
  HistorialOF,
  "codigo" | "descripcion" | "tiempoImputadoMin" | "quien" | "tareas" | "personas" | "centro"
>;

function ofPublica(of: HistorialOF): OfPublica {
  return {
    codigo: of.codigo,
    descripcion: of.descripcion,
    tiempoImputadoMin: of.tiempoImputadoMin,
    quien: of.quien,
    tareas: of.tareas,
    personas: of.personas,
    centro: of.centro,
  };
}

const PREFIJO_DOCUMENTO_INTERNO = "/api/historial/";
const PREFIJO_DOCUMENTO_PUBLICO = "/api/publico/pedidos/";

/** La URL de descarga apunta a `/api/historial/...`, que en la Task 5 pasa a
 *  pedir sesión: aquí se reescribe a su gemela pública para que el invitado
 *  pueda abrir lo que ve en la lista. `null` (nada que abrir) se queda como
 *  está: inventar una URL que va a dar 404 sería peor que no ponerla. */
function documentoPublico(doc: DocumentoRps): DocumentoRps {
  if (!doc.url?.startsWith(PREFIJO_DOCUMENTO_INTERNO)) return doc;
  return { ...doc, url: PREFIJO_DOCUMENTO_PUBLICO + doc.url.slice(PREFIJO_DOCUMENTO_INTERNO.length) };
}

const PREFIJO_SCAN_INTERNO = "/api/pedidos/";
const SUFIJO_SCAN_INTERNO = ".pdf";

/** `scanUrl` (armada en `cabeceraADetalle`, historial.ts) apunta a
 *  `/api/pedidos/{codigo}.pdf`, que en la Task 5 pasa a exigir sesión. El PDF
 *  del pedido SÍ está aprobado para el invitado —junto con los datos de
 *  cliente—, así que aquí se reescribe a su gemela pública
 *  (`/api/publico/pedidos/[pedido]/pdf`), igual que `documentoPublico` hace
 *  con cada documento. Si algún día `scanUrl` no tiene esta forma exacta, se
 *  deja tal cual: mejor un enlace que no se toca que uno que apunta a donde no
 *  toca. */
function scanUrlPublica(scanUrl: string): string {
  if (!scanUrl.startsWith(PREFIJO_SCAN_INTERNO) || !scanUrl.endsWith(SUFIJO_SCAN_INTERNO)) return scanUrl;
  const codigo = scanUrl.slice(PREFIJO_SCAN_INTERNO.length, -SUFIJO_SCAN_INTERNO.length);
  return `${PREFIJO_DOCUMENTO_PUBLICO}${codigo}/pdf`;
}

/** Lo que sale de casa del detalle de un pedido: cabecera básica, sus OF ya
 *  recortadas (`ofPublica`) y los documentos con su URL pública. Fuera de aquí
 *  se quedan `estadoActual`, `prioridad` y `comentarioVenta` —ninguno está
 *  autorizado, y lo dice el hecho de que esta función no los toca ni una vez. */
export interface PedidoPublicoDetalle {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  fechaSolicitud: string | null;
  fechaFinalizacion: string | null;
  piezas: number;
  familias: string[];
  scanUrl: string;
  ofs: OfPublica[];
  documentos: DocumentoRps[];
}

export function detallePublico(detalle: HistorialPedidoDetalle): PedidoPublicoDetalle {
  return {
    codigo: detalle.codigo,
    cliente: detalle.cliente,
    negocio: detalle.negocio,
    ciudadEntrega: detalle.ciudadEntrega,
    fechaSolicitud: detalle.fechaSolicitud,
    fechaFinalizacion: detalle.fechaFinalizacion,
    piezas: detalle.piezas,
    familias: detalle.familias,
    scanUrl: scanUrlPublica(detalle.scanUrl),
    ofs: detalle.ofs.map(ofPublica),
    documentos: detalle.documentos.map(documentoPublico),
  };
}
