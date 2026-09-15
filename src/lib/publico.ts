import type { DocumentoRps, HistorialOF, HistorialPedidoDetalle } from "./historial";
import type { SituacionPedido } from "./consulta";
import type { DondeOF } from "./consulta-donde";

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

/** RPS escribe a gritos ("PLANTEAR Y PREPARAR ARCHIVOS MAQ. DE CORTE"), y eso
 *  es lo más difícil de leer que hay. Sin diccionario que traducir —a
 *  diferencia del centro, aquí no hay una tabla de "nombres bonitos"—, lo que
 *  se puede hacer sin inventar nada es bajar el grito: todo en minúscula
 *  salvo la letra inicial. Mismo criterio que ya usaba `enFrase` para el
 *  texto crudo de un centro sin entrada en la tabla; aquí se comparte para
 *  que las descripciones de OF y de tarea se vean igual de tratadas. */
export function capitalizaFrase(texto: string): string {
  const limpio = texto.trim().toLowerCase();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/** "PLOTER DE CORTE MASCARA ULTRA SIGN PAL GRC1325" → "Plotter de corte": el
 *  paso de trabajo de la tabla de arriba. Sin entrada en la tabla, se cae al
 *  texto de RPS con solo la mayúscula inicial arreglada (RPS los guarda a
 *  gritos, y en una fila de lista eso no se lee) — mejor un texto feo que
 *  cuadra con RPS que uno bonito que no significa nada. */
export function nombreDeCentro(centro: string): string {
  const bonito = NOMBRE_DE_CENTRO[normalizaCentro(centro)];
  return bonito ?? capitalizaFrase(centro);
}

/** Partículas que van en minúscula dentro de un nombre ("Hijos de Rivera").
 *  En gallego y castellano son las mismas salvo `da`/`do`, que aquí salen a
 *  diario. */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "da", "do", "das", "dos"]);

/** RPS guarda clientes y localidades EN MAYÚSCULAS ("IGLESIAS CAGIDE, LUIS",
 *  "SANTIAGO DE COMPOSTELA"), y en una lista larga eso grita más que el propio
 *  código del pedido. Aquí se baja el volumen sin perder lo que sí va en
 *  mayúscula:
 *
 *  · Las siglas con puntos se dejan como están: "S.L.", "S.C.G.", "S.A.U.".
 *  · Las siglas cortas sin vocal tampoco se tocan ("SL", "CB", "UTE").
 *  · Las partículas van en minúscula, menos si abren el nombre.
 *
 *  No es una lista de excepciones que haya que mantener: son reglas de forma,
 *  y lo que no las cumple cae en "Primera letra mayúscula, resto minúsculas". */
export function nombreBonito(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (!limpio) return limpio;
  return limpio
    .split(" ")
    .map((palabra, i) => {
      const sinPuntuacion = palabra.replace(/[.,]/g, "");
      // Siglas: con puntos entre letras, o cortas y sin vocales.
      if (/^(?:[A-ZÑ]\.){2,}$/.test(palabra)) return palabra;
      if (sinPuntuacion.length <= 3 && /^[A-ZÑ]+$/.test(sinPuntuacion) && !/[AEIOU]/.test(sinPuntuacion)) {
        return palabra;
      }
      const minuscula = palabra.toLowerCase();
      if (i > 0 && PARTICULAS.has(minuscula.replace(/[.,]/g, ""))) return minuscula;
      return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    })
    .join(" ");
}

const PREFIJO_DOCUMENTO_INTERNO = "/api/historial/";
const PREFIJO_DOCUMENTO_PUBLICO = "/api/publico/pedidos/";

/** La URL de descarga apunta a `/api/historial/...`, que pide sesión: aquí se
 *  reescribe a su gemela pública para que el invitado pueda abrir lo que ve
 *  en la ficha. `null` (nada que abrir) se queda como está: inventar una URL
 *  que va a dar 404 sería peor que no ponerla. */
function documentoPublico(doc: DocumentoRps): DocumentoRps {
  if (!doc.url?.startsWith(PREFIJO_DOCUMENTO_INTERNO)) return doc;
  return { ...doc, url: PREFIJO_DOCUMENTO_PUBLICO + doc.url.slice(PREFIJO_DOCUMENTO_INTERNO.length) };
}

// ─── El detalle, segunda versión: la ficha del equipo ───────────────────────
// Corrección de Iván al rehacer la consulta: el invitado ve la MISMA ficha que
// el equipo —por centro, quién trabajó y cuánto, y dentro de cada OF sus
// tareas con nombres y tiempos—, porque un comercial necesita saber a quién
// llamar. Lo que sigue sin salir nunca: notas (del pedido, de producción, de
// devolución), causas de rechazo, marcas de revisión, comentario de venta,
// prioridad y estado interno.
//
// Campo a campo y a propósito: cada línea es un «sí» explícito, y lo que no
// está escrito no sale aunque el Historial añada un campo mañana.

export interface PedidoConsultaDetalle {
  codigo: string;
  cliente: string | null;
  negocio: string | null;
  ciudadEntrega: string | null;
  fechaSolicitud: string | null;
  piezas: number;
  familias: string[];
  /** null si la lista en memoria todavía no está hecha. */
  situacion: SituacionPedido | null;
  /** ISO yyyy-mm-dd del último albarán, solo si ya salió. */
  fechaEntregado: string | null;
  donde: DondeOF[];
  ofs: HistorialOF[];
  documentos: DocumentoRps[];
}

function ofConsulta(of: HistorialOF): HistorialOF {
  const salida: HistorialOF = {
    codigo: of.codigo,
    descripcion: of.descripcion,
    tiempoImputadoMin: of.tiempoImputadoMin,
    quien: of.quien,
  };
  if (of.centro !== undefined) salida.centro = of.centro;
  if (of.personas) salida.personas = of.personas;
  if (of.tareas) {
    salida.tareas = of.tareas.map((t) => ({
      codigo: t.codigo,
      descripcion: t.descripcion,
      tiempoImputadoMin: t.tiempoImputadoMin,
      personas: t.personas,
    }));
  }
  // Quién consta como autor y revisor, y el reparto planteo/revisión: es quién
  // LLEVA el pedido, no a quién se lo devolvieron ni por qué.
  if (of.autorRegistrado !== undefined) salida.autorRegistrado = of.autorRegistrado;
  if (of.revisorRegistrado !== undefined) salida.revisorRegistrado = of.revisorRegistrado;
  if (of.rol) salida.rol = of.rol;
  if (of.rolDeducido) salida.rolDeducido = of.rolDeducido;
  if (of.materiales) salida.materiales = of.materiales;
  // notasProduccion NO: es una nota, y las notas no salen de casa.
  return salida;
}

export function detalleConsulta(
  detalle: HistorialPedidoDetalle,
  extra: { situacion: SituacionPedido | null; fechaEntregado: string | null; donde: DondeOF[] },
): PedidoConsultaDetalle {
  return {
    codigo: detalle.codigo,
    cliente: detalle.cliente,
    negocio: detalle.negocio,
    ciudadEntrega: detalle.ciudadEntrega,
    fechaSolicitud: detalle.fechaSolicitud,
    piezas: detalle.piezas,
    familias: detalle.familias,
    situacion: extra.situacion,
    fechaEntregado: extra.fechaEntregado,
    donde: extra.donde,
    ofs: detalle.ofs.map(ofConsulta),
    documentos: detalle.documentos.map(documentoPublico),
  };
}
