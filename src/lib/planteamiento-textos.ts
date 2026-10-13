// Solo tipos del servidor: este módulo lo importan componentes de cliente y
// no puede arrastrar código de servidor (SQLite, fs) al bundle.
import type { FilaImpresion, ModoImpresion } from "./server/impresion-cola";

// ─── Lo que la pantalla dice del planteamiento ───────────────────────────────
// Funciones puras para que el diálogo de pasar y la ficha del Historial digan
// siempre lo mismo, y se puedan probar sin montar componentes.

export interface VistaPlanteamiento {
  modo: ModoImpresion;
  ficheros: { nombre: string; paginas: number; todoA4: boolean }[];
  aviso: string | null;
  impresiones: FilaImpresion[];
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
      return `Descartado: ${f.fichero ?? ""}`;
  }
}
