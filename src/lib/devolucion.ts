// ─── Por qué vuelve una OF al autor ──────────────────────────────────────────
// Devolver ya obligaba a escribir el motivo, pero en texto libre: sirve para
// que el autor sepa qué corregir y no sirve para nada más. No se puede contar
// cuántas vuelven por medidas ni si un tipo de fallo se repite, que es lo que
// se pidió poder mirar.
//
// Así que la devolución lleva ahora dos cosas, y hacen trabajos distintos:
//
//   · las CAUSAS dicen DE QUÉ TIPO es el fallo. Se eligen de una lista y son
//     lo que se cuenta.
//   · la NOTA dice CUÁL es, con nombres y números ("la cota del primer ollao,
//     y el largo 2 cm de más"). Es lo que se arregla, y sigue siendo
//     obligatoria: una causa sola no le dice al autor dónde mirar.
//
// VARIAS CAUSAS A LA VEZ, y no una. El revisor repasa la OF entera y apunta
// todo lo que ve; obligarle a elegir "la principal" tiraría el resto del dato
// justo en las devoluciones que más cosas cuentan.
//
// LA LISTA NO ESTÁ AQUÍ. Vive en la base (tabla `causa_devolucion`) porque se
// crea sobre la marcha: cerrarla de antemano exigía adivinar hoy las que van a
// hacer falta, y una lista que nadie ha usado se cierra mal. Aquí solo está el
// formato con el que viaja.

/** Una devolución: por qué vuelve y qué hay que corregir. */
export interface Devolucion {
  /** Ids de `causa_devolucion`. Vacío = devolución sin causas, que es lo que
   *  son todas las anteriores a esto. */
  causas: number[];
  /** Siempre. Ver la cabecera. */
  nota: string;
}

/** Marca de "aquí delante van causas". Se eligió con NÚMEROS entre corchetes
 *  para que no se pueda confundir con una nota escrita a mano: el formato de
 *  `anulacion.ts` es `causa: texto`, y ahí las causas son palabras conocidas,
 *  pero aquí la lista crece y no hay conjunto contra el que comprobar. Con
 *  `dos: mira las medidas` no habría forma de saber si "dos" es una causa o el
 *  principio de una frase; con `[2] mira las medidas`, sí. */
const CAUSAS_AL_PRINCIPIO = /^\[(\d+(?:,\d+)*)\]\s*/;

/** Empaqueta la devolución para que viaje en `observacion`, el campo que ya
 *  llega hasta la base local (mismo sitio y mismo motivo que en `anulacion.ts`:
 *  los usos de ese campo son excluyentes y el estado dice cuál es). */
export function codificarDevolucion(d: Devolucion): string {
  const nota = d.nota.trim();
  if (d.causas.length === 0) return nota;
  return `[${[...d.causas].sort((a, b) => a - b).join(",")}] ${nota}`;
}

/** Lo contrario.
 *
 *  Nunca devuelve null: una devolución sin marca de causas NO es un texto
 *  corrupto, es una de las de antes de que esto existiera —o una que se hizo
 *  con "Otro"—, y su nota vale igual. Sale con `causas: []`, que es la verdad:
 *  no se sabe de qué tipo fue. */
export function leerDevolucion(observacion: string | null | undefined): Devolucion {
  const texto = (observacion ?? "").trim();
  const m = CAUSAS_AL_PRINCIPIO.exec(texto);
  if (!m) return { causas: [], nota: texto };
  return {
    causas: m[1].split(",").map(Number),
    nota: texto.slice(m[0].length),
  };
}

/** ¿Se puede devolver con esto? La nota es lo que manda al autor a hacer algo,
 *  así que sin ella no hay devolución — con causas o sin ellas. */
export function devolucionCompleta(d: Devolucion): boolean {
  return d.nota.trim().length > 0;
}

/** Cómo se compara una causa con otra para saber si ya existe.
 *
 *  Sin acentos, en minúsculas y con los espacios recogidos: "Error en Cotas",
 *  "error en cotas" y "  ERROR  EN  COTAS " son la misma, y crearlas por
 *  separado deshace justo lo que se busca —poder contarlas—. Es lo que se
 *  guarda en la columna `clave`, con índice único, así que dos personas
 *  creándola a la vez acaban en la misma fila en vez de en dos. */
export function claveDeCausa(etiqueta: string): string {
  return etiqueta
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Una etiqueta que no vale: en blanco, o tan corta que no dice nada. El tope
 *  de arriba es para que quepa en el distintivo sin partirlo: lo que necesite
 *  más letras es una nota, no una causa. */
export const CAUSA_MIN = 3;
export const CAUSA_MAX = 40;

export function etiquetaValida(etiqueta: string): boolean {
  const t = etiqueta.trim();
  return t.length >= CAUSA_MIN && t.length <= CAUSA_MAX;
}

/** Las causas ya existentes que se parecen a lo que se está escribiendo, para
 *  ofrecerlas ANTES de crear una nueva.
 *
 *  Es la única defensa real contra la lista deshilachada: si a quien escribe
 *  "falta cota" se le enseña "Error en cotas" en ese momento, la pulsa. Sin
 *  esto, en dos meses hay cuatro causas para el mismo fallo y las métricas ya
 *  no dicen nada.
 *
 *  Coincidencia por trozo de texto, en los dos sentidos: "cotas" encuentra
 *  "Error en cotas", y "error en cotas mal" también. No hace falta más
 *  finura — el objetivo es enseñar candidatas, no acertar sola. */
export function causasParecidas<T extends { etiqueta: string }>(
  escrito: string,
  causas: readonly T[],
): T[] {
  const q = claveDeCausa(escrito);
  if (q.length < CAUSA_MIN) return [];
  return causas.filter((c) => {
    const k = claveDeCausa(c.etiqueta);
    return k.includes(q) || q.includes(k);
  });
}
