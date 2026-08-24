// ─── El parte re-escaneado ───────────────────────────────────────────────────
// A veces vuelven a escanear el parte de un pedido que ya estaba en marcha,
// porque cambió algo. Hasta ahora nada lo señalaba: quien ya lo había leído
// seguía trabajando con lo que recordaba de la versión vieja.
//
// La señal es la fecha de modificación (mtime) del PDF en el share. No hace
// falta nada de RPS: el fichero cambia y eso basta.
//
// OJO CON LO QUE ESTO SABE Y LO QUE NO. El mtime cambia también si alguien
// vuelve a guardar el mismo fichero sin tocar nada. No podemos distinguir "lo
// han modificado" de "lo han vuelto a subir igual", así que los textos dicen
// "se ha vuelto a escanear" y NUNCA "el pedido ha cambiado": prometer lo
// segundo con esta señal es mentir, y a la tercera falsa alarma nadie mira el
// aviso.
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
  /** mtime que ya se dio por visto. null = todavía no hay referencia. */
  mtimeVisto: number | null;
  /** Último mtime que vio el vigilante. null = todavía no se ha mirado. */
  mtimeActual: number | null;
}

/** ¿Han vuelto a escanear el parte desde la última vez que alguien lo dio por
 *  visto?
 *
 *  Hace falta tener las DOS marcas: sin referencia previa no hay cambio que
 *  contar, solo un pedido que acabamos de empezar a vigilar. Por eso el primer
 *  vistazo a un pedido fija las dos iguales y no avisa — si no, el día que
 *  esto se despliegue saltarían de golpe los avisos de los 81 pedidos vivos. */
export function hayCambio(e: EstadoScan): boolean {
  return e.mtimeVisto !== null && e.mtimeActual !== null && e.mtimeActual > e.mtimeVisto;
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
