// ─── Notas de un pedido: el contrato y sus reglas ────────────────────────────
// Client-safe: no toca la BD ni importa nada de servidor. Lo comparten la ruta
// de la API y el componente del hilo, para que la validación sea la misma en
// los dos lados y no se puedan separar.
//
// La nota cuelga del CÓDIGO del pedido ("AR.26.03914"), no de su id interno:
// en el tablero el id sale del agrupado de RPS y en el Historial es "hist:…",
// así que una nota colgada del id se perdería justo al pasar a Producción, que
// es cuando más se quiere leer. Ver el spec del 2026-08-23.

export interface NotaPedido {
  id: number;
  /** Código del pedido. También vale el sintético de las OF sueltas. */
  pedido: string;
  operarioId: string;
  texto: string;
  /** ISO. */
  creadoAt: string;
  /** ISO, o null si nunca se editó. */
  editadoAt: string | null;
}

/** Tope de una nota. Es un recado, no un informe: con dos mil caracteres caben
 *  unas treinta líneas, de sobra para lo que se apunta en un post-it. El tope
 *  existe para que un pegado accidental no reviente la ficha. */
export const NOTA_MAX = 2000;

export type TextoValido =
  | { ok: true; texto: string }
  | { ok: false; motivo: "vacio" | "largo" };

/** Deja el texto como se va a guardar, o dice por qué no vale.
 *
 *  Devuelve el motivo y no solo `null` para que la ruta pueda decir qué pasa:
 *  "no has escrito nada" y "te has pasado de largo" se arreglan de formas
 *  distintas, y un 400 mudo obliga a adivinar cuál de las dos es.
 *
 *  Los saltos de Windows se normalizan a `\n`: el texto entra desde un
 *  `<textarea>` y se vuelve a pintar con `whitespace-pre-line`, así que
 *  guardar `\r\n` mete un carácter invisible que no aporta nada. */
export function validarTexto(crudo: unknown): TextoValido {
  if (typeof crudo !== "string") return { ok: false, motivo: "vacio" };
  const texto = crudo.replace(/\r\n/g, "\n").trim();
  if (texto.length === 0) return { ok: false, motivo: "vacio" };
  // El tope se mide sobre el texto YA recortado: si no, unos espacios de más
  // al pegar rechazarían una nota que cabe de sobra.
  if (texto.length > NOTA_MAX) return { ok: false, motivo: "largo" };
  return { ok: true, texto };
}

/** Cuándo se escribió, en corto: "hoy 11:04", "ayer 9:30", "18/8 12:16".
 *
 *  Con la hora siempre, que en un hilo de recados del mismo día es lo único
 *  que ordena. Y con el año solo cuando no es el de hoy: en los normales gasta
 *  sitio para decir lo que ya se sabe. */
export function fmtCuandoNota(iso: string, ahora: string): string {
  const d = new Date(iso);
  const hoy = new Date(ahora);
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return `hoy ${hora}`;
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return `ayer ${hora}`;
  const dia = `${d.getDate()}/${d.getMonth() + 1}`;
  return d.getFullYear() === hoy.getFullYear()
    ? `${dia} ${hora}`
    : `${dia}/${d.getFullYear()} ${hora}`;
}
