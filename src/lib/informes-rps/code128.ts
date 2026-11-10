// ─── Código de barras Code128 ────────────────────────────────────────────────
// El que usa RPS en la hoja de ruta y el vale (Stimulsoft «Code128Auto»). Un
// lector lee el TEXTO, no la manera de codificarlo: basta con que el texto sea
// el mismo («0233881», «0233881-02») para que valga para fichar.
//
// Cada símbolo son 6 anchos (barra, espacio, barra…) que suman 11 módulos; el
// de parada son 7 y suman 13. Ver el test: la tabla se comprueba sola (sumas,
// paridad de las barras y que no se repita ningún símbolo).

export const PATRONES: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
export const PARADA = "2331112";

const INICIO_B = 104;
const INICIO_C = 105;
const A_B = 100; // desde C: pasa a B
const A_C = 99; // desde B: pasa a C

const esDigito = (c: string) => c >= "0" && c <= "9";

/** Los valores de símbolo (sin la suma de control ni la parada). Usa B para
 *  texto y C (dos cifras por símbolo) en los tramos de 4 o más cifras, que es
 *  lo que hace el «Auto» y deja el código más corto. */
export function simbolos(texto: string): number[] {
  for (const c of texto) {
    const cod = c.charCodeAt(0);
    if (cod < 32 || cod > 126) throw new Error(`Code128: carácter no admitido «${c}»`);
  }
  const tramos: { cifras: boolean; texto: string }[] = [];
  let i = 0;
  while (i < texto.length) {
    let j = i;
    while (j < texto.length && esDigito(texto[j])) j++;
    const cifras = j - i;
    // Tramo de cifras que merece la pena en C: 4 o más, o el texto entero (2+).
    if (cifras >= 4 || (cifras >= 2 && cifras === texto.length)) {
      // Si es impar, la primera cifra va en B y el resto en parejas.
      if (cifras % 2 === 1) {
        const previo = tramos[tramos.length - 1];
        if (previo && !previo.cifras) previo.texto += texto[i];
        else tramos.push({ cifras: false, texto: texto[i] });
        i++;
      }
      tramos.push({ cifras: true, texto: texto.slice(i, j) });
      i = j;
    } else {
      let k = Math.max(j, i + 1);
      // Sigue en B hasta el próximo tramo largo de cifras.
      while (k < texto.length) {
        let m = k;
        while (m < texto.length && esDigito(texto[m])) m++;
        if (m - k >= 4) break;
        k = m > k ? m : k + 1;
      }
      const ultimo = tramos[tramos.length - 1];
      if (ultimo && !ultimo.cifras) ultimo.texto += texto.slice(i, k);
      else tramos.push({ cifras: false, texto: texto.slice(i, k) });
      i = k;
    }
  }
  const out: number[] = [];
  tramos.forEach((t, n) => {
    if (n === 0) out.push(t.cifras ? INICIO_C : INICIO_B);
    else out.push(t.cifras ? A_C : A_B);
    if (t.cifras) for (let p = 0; p < t.texto.length; p += 2) out.push(Number(t.texto.slice(p, p + 2)));
    else for (const c of t.texto) out.push(c.charCodeAt(0) - 32);
  });
  if (!out.length) out.push(INICIO_B);
  return out;
}

/** Anchos de barras y espacios, alternos y empezando por barra, con la suma
 *  de control y la parada. */
export function anchosCode128(texto: string): number[] {
  const s = simbolos(texto);
  const control = s.reduce((acc, v, i) => acc + v * (i === 0 ? 1 : i), 0) % 103;
  return [...s, control].flatMap((v) => [...PATRONES[v]].map(Number)).concat([...PARADA].map(Number));
}
