// Solo tipos del servidor: este módulo lo importan componentes de cliente y
// no puede arrastrar código de servidor (SQLite, fs) al bundle.
import type { FilaImpresion, ModoImpresion } from "./server/impresion-cola";
import type { FilaCorreo, ModoCorreo } from "./server/correo-cola";

// ─── Lo que la pantalla dice del planteamiento ───────────────────────────────
// Funciones puras para que el diálogo de pasar y la ficha del Historial digan
// siempre lo mismo, y se puedan probar sin montar componentes.

export interface VistaPlanteamiento {
  modo: ModoImpresion;
  /** `adjunto`: va en el correo (PVC); si no, solo se imprime y el correo
   *  avisa. Opcional: un servidor de antes no lo manda. */
  ficheros: { nombre: string; paginas: number; todoA4: boolean; adjunto?: boolean }[];
  aviso: string | null;
  impresiones: FilaImpresion[];
  /** El correo del planteamiento (spec 2026-10-14). Opcional: un servidor de
   *  antes no lo manda, y entonces la pantalla simplemente no lo cuenta. */
  correo?: { modo: ModoCorreo; envios: FilaCorreo[] };
}

const pags = (n: number) => `${n} ${n === 1 ? "pág." : "págs."}`;

export function textoAntesDePasar(d: VistaPlanteamiento): string | null {
  if (d.modo === "off") return null;
  if (d.ficheros.length === 0) {
    return `${d.aviso ?? "No encuentro el planteamiento en Planteamientos"}: se pasará sin imprimir`;
  }
  const manual = d.ficheros.find((f) => !f.todoA4);
  if (manual) return `${manual.nombre} lleva una página que no es A4: al pasar se abrirá el cuadro de imprimir`;
  const donde = d.modo === "ensayo" ? "la impresora de OT (ensayo)" : "Producción";
  return `Se imprimirá en ${donde}: ${d.ficheros.map((f) => `${f.nombre} (${pags(f.paginas)})`).join(", ")}`;
}

/** «13/10 a las 13:05», en hora de Madrid. */
function cuando(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", timeZone: "Europe/Madrid" });
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return `${dia} a las ${hora}`;
}

export function textoImpresion(f: FilaImpresion): string {
  switch (f.estado) {
    case "enviado": {
      // Se decide por el modo con el que salió, guardado en la cola: deducirlo
      // de la IP se rompería en cuanto cambiase la impresora de ensayo.
      const donde = f.modo === "ensayo" ? "la impresora de OT (ensayo)" : "Producción";
      return `Impreso en ${donde} el ${cuando(f.enviadoAt ?? f.creadoAt)} · ${f.fichero}`;
    }
    case "pendiente":
      return f.error
        ? `Pendiente de imprimir: ${f.error} (${f.intentos} ${f.intentos === 1 ? "intento" : "intentos"})`
        : "Pendiente de imprimir";
    case "manual":
      return `Impresión a mano: ${f.fichero} lleva páginas que no son A4`;
    case "sin_planteamiento":
      return "Se pasó sin planteamiento en Planteamientos";
    case "descartado":
      // Con el motivo: «descartado» a secas no dice qué hacer.
      return `No se imprimió ${f.fichero ?? ""}${f.error ? `: ${f.error}` : ""}`;
  }
}

/** La línea del correo en el diálogo de pasar. Sin planteamiento no dice nada:
 *  ya lo avisa la línea de la impresión, y sin PDF no se manda correo. */
export function textoCorreoAntesDePasar(d: VistaPlanteamiento): string | null {
  if (!d.correo || d.correo.modo === "off" || d.ficheros.length === 0) return null;
  const a = d.correo.modo === "ensayo" ? "solo a ti (prueba)" : "a Oficina Técnica y Producción";
  // La norma: los de PVC van adjuntos; de los de toldos el correo solo avisa.
  const adjuntos = d.ficheros.filter((f) => f.adjunto).map((f) => f.nombre);
  return adjuntos.length
    ? `Se mandará el correo ${a} con ${adjuntos.join(", ")} adjunto${adjuntos.length === 1 ? "" : "s"}`
    : `Se mandará el correo ${a} avisando de que está impreso`;
}

export function textoCorreo(f: FilaCorreo): string {
  switch (f.estado) {
    case "enviado":
      return `Correo enviado el ${cuando(f.enviadoAt ?? f.creadoAt)} a ${f.para.join(", ")}${f.modo === "ensayo" ? " (prueba)" : ""}`;
    case "pendiente":
      return f.error
        ? `Correo pendiente: ${f.error} (${f.intentos} ${f.intentos === 1 ? "intento" : "intentos"})`
        : "Correo pendiente";
    case "sin_planteamiento":
      return "Sin correo: no había planteamiento";
    case "descartado":
      return `Correo no enviado: ${f.error ?? "motivo desconocido"}`;
  }
}

/** ¿Este pedido ya se pasó a Producción alguna vez? Se sabe porque hay rastro de
 *  una impresión o de un correo suyos. Pasa cuando se recupera del Historial
 *  para volver a plantearlo: entonces, al pasarlo otra vez, se PREGUNTA si
 *  imprimir y mandar el correo de nuevo (Iván, 14/10/2026). La primera vez no
 *  se pregunta: la norma es hacer las dos cosas siempre. */
export function yaSePasoAntes(d: VistaPlanteamiento): boolean {
  return d.impresiones.length > 0 || (d.correo?.envios.length ?? 0) > 0;
}
