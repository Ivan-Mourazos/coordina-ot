import { claveBonoRps, type FilaBono } from "./bonos";

// ─── Contraste: lo que ficha CoordinaOT contra lo que ficha la herramienta vieja
//
// Mientras dure el doble fichaje, las dos herramientas escriben en la MISMA
// tabla (`sch_RPS_bonos`) y con la MISMA máquina (A-OTEC), así que la tabla no
// distingue quién puso cada fila. Lo que sí distingue es la clave del bono
// —OF, tarea, operario, día y segundo de inicio—: las filas nuestras son
// exactamente las que están en nuestra cola de salida, y todo lo demás lo puso
// el mini-olanet.
//
// De ahí salen las dos preguntas que hay que contestar antes de pasar el
// fichaje a `activo`:
//
//   1. ¿ESCRIBE BIEN? Si algún bono de la cola no aparece en la tabla, el
//      camino de escritura falla y no se puede dar el paso. Esto es un fallo
//      técnico y se arregla.
//   2. ¿SE USA? Aunque escriba perfecto, si la gente sigue apuntando la mayor
//      parte del tiempo en la herramienta vieja, pasar a activo perdería esas
//      horas. Esto no se arregla con código: se arregla fichando.
//
// La segunda es la que manda, y por eso el informe la enseña por días: lo que
// importa no es el total acumulado (arrastra los primeros días, cuando casi
// nadie fichaba aquí) sino si los ÚLTIMOS días ya cuadran.

/** Una línea de tiempo de `sch_RPS_bonos`, reducida a lo que se compara. */
export interface FilaOlanet {
  of: string;
  numope: string;
  operario: string;
  /** Día en ISO yyyy-mm-dd. */
  ini: string;
  horaini: number;
  horafin: number;
}

/** Minutos de una fila. Los bonos guardan segundos desde medianoche. */
export const minutosDeFila = (f: FilaOlanet): number => (f.horafin - f.horaini) / 60;

export interface ComparativaDia {
  dia: string;
  /** Minutos escritos por CoordinaOT ese día. */
  web: number;
  /** Minutos escritos por la herramienta vieja ese día. */
  vieja: number;
  /** Cuánto recoge la web de lo que recoge la vieja: `web / vieja`. 1 = las dos
   *  cuentan lo mismo, que es el objetivo — las dos apuntan EL MISMO trabajo.
   *
   *  OJO, que aquí me equivoqué al escribirlo y el número engañaba: puse
   *  `web / (web + vieja)`, o sea la parte del total que lleva la web. Con las
   *  dos herramientas registrando exactamente lo mismo eso da 0,5, así que un
   *  día PERFECTO se leía como un 50 % y el veredicto no habría dicho nunca que
   *  se puede pasar a activo. No es una proporción sobre el total: es una
   *  comparación entre dos cuentas del mismo rato.
   *
   *  Puede pasar de 1 (la web recoge más que la vieja, que es lo que ocurre
   *  cuando alguien ya solo ficha aquí) y no se recorta: pasarse también es un
   *  dato, y recortarlo escondería que la vieja se está quedando atrás.
   *
   *  `null` cuando no hay minutos de ninguna de las dos: dividir daría 0/0 y un
   *  "0 %" se leería como "hoy no fichó nadie en la web", que es otra cosa. Si
   *  la vieja está a cero y la web no, la respuesta es 1: ya no hay nada que
   *  recoger de la otra herramienta. */
  cobertura: number | null;
}

export interface DescuadreOF {
  of: string;
  numope: string;
  operario: string;
  dia: string;
  web: number;
  vieja: number;
}

/** Cuántos de NUESTROS bonos ha subido ya OLANET a RPS.
 *
 *  Es el único chequeo que no se puede hacer hasta estar en `activo`: en sombra
 *  no se escribe y en ensayo los bonos van con `traspasado = 2` para que el
 *  procedimiento de OLANET no los toque. En cuanto se pasa a activo van con 0 y
 *  ese procedimiento —que es de IT, no nuestro— los recoge y los imputa en RPS.
 *
 *  De todo el circuito, este es el último tramo que queda por ver funcionar de
 *  verdad, y se ve en minutos: el traspaso va muy por delante (en la tabla no
 *  queda ni una fila en 0, ni del mismo día). Si al rato de fichar `pendientes`
 *  no baja, el tiempo se está quedando a mitad de camino. */
export interface EstadoTraspaso {
  /** Bonos nuestros ya subidos a RPS (traspasado <> 0). */
  subidos: number;
  /** Bonos nuestros que OLANET aún no ha recogido (traspasado = 0). */
  pendientes: number;
}

export interface Contraste {
  dias: ComparativaDia[];
  /** Solo en `activo`; en los otros modos no hay nada que mirar. */
  traspaso?: EstadoTraspaso;
  /** Bonos que salieron de la cola pero NO están en la tabla: fallo de
   *  escritura. Vacío es la única respuesta aceptable. */
  noEscritos: string[];
  /** Combinaciones OF·tarea·operario·día donde las dos herramientas no dicen
   *  lo mismo, de mayor a menor diferencia. */
  descuadres: DescuadreOF[];
  /** Cuántas combinaciones se compararon y cuántas cuadran dentro del margen. */
  cuadran: number;
  total: number;
}

/** Margen por debajo del cual dos tiempos se dan por iguales.
 *
 *  Un cuarto de hora: nadie pulsa "empezar" en las dos herramientas en el mismo
 *  segundo, y la vieja se ficha a ratos —al acabar la mañana, al ir a comer—,
 *  así que la misma tarea sale con unos minutos de diferencia sin que nada esté
 *  mal. Lo que este informe busca son los descuadres que no se explican así:
 *  una tarea entera fichada en un sitio y no en el otro. */
export const MARGEN_MIN = 15;

/** Cobertura mínima para dar por bueno un día: la web tiene que recoger al
 *  menos esto de lo que recoge la vieja. No es el 100 % porque nadie pulsa
 *  "empezar" en las dos herramientas en el mismo segundo y siempre habrá unos
 *  minutos de diferencia por el desfase. */
export const COBERTURA_OBJETIVO = 0.95;

const claveOF = (f: { of: string; numope: string; operario: string; ini: string }) =>
  [f.of, f.numope, f.operario, f.ini].join("|");

function sumarPor<T>(filas: readonly T[], clave: (f: T) => string, valor: (f: T) => number) {
  const m = new Map<string, number>();
  for (const f of filas) m.set(clave(f), (m.get(clave(f)) ?? 0) + valor(f));
  return m;
}

/** Compara lo que CoordinaOT dice haber escrito con lo que hay en la tabla.
 *
 *  `nuestros` son los bonos de la cola de salida (la intención) y `enTabla`
 *  todas las filas de A-OTEC de esos mismos días (el resultado, de las dos
 *  herramientas mezcladas). */
export function contrastar(
  nuestros: readonly FilaBono[],
  enTabla: readonly FilaOlanet[],
): Contraste {
  const clavesNuestras = new Set(nuestros.map(claveBonoRps));
  const clavesEnTabla = new Set(enTabla.map(claveBonoRps));

  const web = enTabla.filter((f) => clavesNuestras.has(claveBonoRps(f)));
  const vieja = enTabla.filter((f) => !clavesNuestras.has(claveBonoRps(f)));

  const diasWeb = sumarPor(web, (f) => f.ini, minutosDeFila);
  const diasVieja = sumarPor(vieja, (f) => f.ini, minutosDeFila);
  const dias = [...new Set([...diasWeb.keys(), ...diasVieja.keys()])].sort().map((dia) => {
    const w = diasWeb.get(dia) ?? 0;
    const v = diasVieja.get(dia) ?? 0;
    return { dia, web: w, vieja: v, cobertura: v > 0 ? w / v : w > 0 ? 1 : null };
  });

  const ofWeb = sumarPor(web, claveOF, minutosDeFila);
  const ofVieja = sumarPor(vieja, claveOF, minutosDeFila);
  const claves = [...new Set([...ofWeb.keys(), ...ofVieja.keys()])];
  const descuadres: DescuadreOF[] = [];
  let cuadran = 0;
  for (const k of claves) {
    const w = ofWeb.get(k) ?? 0;
    const v = ofVieja.get(k) ?? 0;
    if (Math.abs(w - v) <= MARGEN_MIN) {
      cuadran++;
      continue;
    }
    const [of, numope, operario, dia] = k.split("|");
    descuadres.push({ of, numope, operario, dia, web: w, vieja: v });
  }
  descuadres.sort((a, b) => Math.abs(b.web - b.vieja) - Math.abs(a.web - a.vieja));

  return {
    dias,
    noEscritos: nuestros
      .filter((b) => !clavesEnTabla.has(claveBonoRps(b)))
      .map((b) => claveBonoRps(b)),
    descuadres,
    cuadran,
    total: claves.length,
  };
}

/** El veredicto en una frase, que es lo que se lee.
 *
 *  Dos condiciones y por este orden, porque no son igual de graves: un fallo de
 *  escritura es un error del que no se sale fichando más, así que manda sobre
 *  cualquier cifra de cobertura. */
export function veredicto(
  c: Contraste,
  diasSeguidos = 3,
): { listo: boolean; motivo: string } {
  if (c.noEscritos.length > 0) {
    return {
      listo: false,
      motivo: `${c.noEscritos.length} bono${c.noEscritos.length === 1 ? "" : "s"} de la cola no llegaron a OLANET: hay que arreglar la escritura antes de pasar a activo.`,
    };
  }
  // Se miran los ÚLTIMOS días con fichaje, no todos. Los primeros de la prueba
  // no valen para decidir y no por poca costumbre: hasta el 12/08 el latido
  // cortaba fichajes vivos (arreglado en 11e8f56 y 7f6fd4e), así que la web
  // perdía ratos que sí se habían trabajado. Medir contra aquello sería medir
  // un fallo ya corregido. Y "día con fichaje" son los días que se trabajó: los
  // festivos y fines de semana no salen aquí, así que tres días seguidos son
  // tres días de trabajo, no tres del calendario.
  const conDatos = c.dias.filter((d) => d.cobertura !== null);
  const ultimos = conDatos.slice(-diasSeguidos);
  if (ultimos.length < diasSeguidos) {
    return {
      listo: false,
      motivo: `Solo hay ${ultimos.length} día${ultimos.length === 1 ? "" : "s"} con fichaje: hacen falta ${diasSeguidos} seguidos por encima del ${Math.round(COBERTURA_OBJETIVO * 100)} % para decidir.`,
    };
  }
  const flojos = ultimos.filter((d) => (d.cobertura ?? 0) < COBERTURA_OBJETIVO);
  if (flojos.length > 0) {
    const peor = flojos.reduce((a, b) => ((a.cobertura ?? 0) <= (b.cobertura ?? 0) ? a : b));
    return {
      listo: false,
      motivo: `La web todavía no recoge todo el tiempo: el ${peor.dia} se quedó en el ${Math.round((peor.cobertura ?? 0) * 100)} %. Pasar a activo ahora perdería las horas que se siguen apuntando solo en la herramienta vieja.`,
    };
  }
  return {
    listo: true,
    motivo: `Los últimos ${diasSeguidos} días cuadran por encima del ${Math.round(COBERTURA_OBJETIVO * 100)} % y todos los bonos llegaron a OLANET: se puede pasar a activo.`,
  };
}
