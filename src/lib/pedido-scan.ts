// ─── El parte re-escaneado ───────────────────────────────────────────────────
// A veces vuelven a escanear el parte de un pedido que ya estaba en marcha,
// porque cambió algo. Hasta ahora nada lo señalaba: quien ya lo había leído
// seguía trabajando con lo que recordaba de la versión vieja.
//
// La señal es el CONTENIDO del PDF: su huella (sha1). El mtime del fichero
// solo sirve para saber si hace falta volver a calcularla, no para decidir si
// ha cambiado algo.
//
// POR QUÉ NO VALE EL MTIME, que era lo que se miraba antes. El share tiene un
// proceso que re-copia los partes cada media hora, y copiar rehace el mtime
// aunque el fichero sea idéntico. Comprobado sobre AR.26.03891 el 1/9/2026:
// nueve avisos en una mañana, y el PDF de las 12:30 con el mismo MD5 que el de
// las 12:00. Nueve notas en el hilo y la campana encendida toda la mañana por
// un parte que nadie había tocado. A la tercera falsa alarma nadie mira el
// aviso, y entonces el que importa pasa desapercibido — que es exactamente lo
// que pasó con la OF nueva de AR.26.03914.
//
// OJO CON LO QUE ESTO SABE Y LO QUE NO. Dos escaneos del mismo papel dan
// ficheros distintos (el ruido del escáner basta), así que un re-escaneo que no
// cambie nada sigue avisando. Por eso los textos dicen "se ha vuelto a
// escanear" y NUNCA "el pedido ha cambiado": lo segundo no lo sabemos.
//
// Client-safe: no toca la BD ni el disco. Lo comparten el vigilante del
// servidor y los componentes.

/** Quién firma las notas que escribe la propia web.
 *
 *  No es ningún operario, y eso lo hace ya el componente del hilo: como nadie
 *  tiene este id, `mia` es falso para todo el mundo y nadie puede editar ni
 *  borrar estas notas. Son el registro permanente que se pidió. */
export const OPERARIO_SISTEMA = "sistema";

/** Lo que se sabe del PDF de un pedido. */
export interface EstadoScan {
  pedido: string;
  /** Huella que ya se dio por vista. null = todavía no hay referencia. */
  huellaVista: string | null;
  /** Huella del contenido que vio el vigilante. null = todavía no se ha mirado
   *  (o no se pudo leer el fichero). */
  huellaActual: string | null;
}

/** ¿Han vuelto a escanear el parte desde la última vez que alguien lo dio por
 *  visto?
 *
 *  Hace falta tener las DOS marcas: sin referencia previa no hay cambio que
 *  contar, solo un pedido que acabamos de empezar a vigilar. Por eso el primer
 *  vistazo a un pedido fija las dos iguales y no avisa — si no, el día que
 *  esto se despliegue saltarían de golpe los avisos de los 81 pedidos vivos.
 *
 *  Distintas, no "más nueva": una huella no se ordena. Restaurar una copia de
 *  seguridad del share deja el parte VIEJO en el sitio, y eso también hay que
 *  contarlo — el que trabaje con él tiene que saber que no es el que leyó. */
export function hayCambio(e: EstadoScan): boolean {
  return e.huellaVista !== null && e.huellaActual !== null && e.huellaActual !== e.huellaVista;
}

/** El texto de la nota permanente que queda en el hilo del pedido.
 *
 *  Lleva la fecha Y la hora: en un pedido que se re-escanea dos veces el mismo
 *  día, sin hora las dos notas se leen igual y no se sabe cuál es cuál. */
export function textoNotaReescaneo(mtimeMs: number): string {
  const d = new Date(mtimeMs);
  const dia = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `Se ha vuelto a escanear el parte (${dia} a las ${hora}). Compruébalo antes de seguir: puede traer cambios.`;
}
