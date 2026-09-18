// ─── Las cuentas del visor de PDF propio ─────────────────────────────────────
// Todo lo que el visor decide sin tocar el navegador: a qué escala se pinta la
// hoja para que encaje, hacia dónde mira, qué motor prefiere cada uno y qué
// documentos se quedan abiertos. Vive aparte de los componentes para poder
// probarlo sin DOM: es donde se esconden los errores de «sale recortado».

/** Los cuatro cuartos de vuelta, en el orden en que los da el botón. */
const GIROS = [0, 90, 180, 270] as const;
export type Giro = (typeof GIROS)[number];

/** El siguiente cuarto de vuelta. Cuatro pulsaciones = vuelta entera. */
export function siguienteGiro(giro: Giro): Giro {
  return GIROS[(GIROS.indexOf(giro) + 1) % GIROS.length];
}

/** ¿Este giro intercambia el ancho y el alto de la hoja? A 90° y a 270° lo que
 *  era alto pasa a ser ancho; boca abajo mide igual que del derecho. */
export function giroIntercambia(giro: Giro): boolean {
  return giro === 90 || giro === 270;
}

/** El giro que se le pide a pdf.js: el del botón SUMADO al que ya trae la
 *  página. Hay escáneres que guardan la hoja tumbada con `/Rotate 90` en vez de
 *  girar la imagen; pasar solo el del botón deshace ese giro sin avisar y el
 *  parte sale de lado a la primera. */
export function rotacionTotal(rotacionPagina: number, giro: Giro): number {
  return (((rotacionPagina + giro) % 360) + 360) % 360;
}

/** Cómo encaja la hoja en el hueco. Son los nombres del visor del navegador
 *  (`#view=`), para que el mismo valor guardado valga en los dos motores:
 *  `Fit` es la página entera, `FitH` al ancho y `FitV` al alto. */
export type Encaje = "Fit" | "FitH" | "FitV";

export interface Medidas {
  ancho: number;
  alto: number;
}

/** La escala a la que hay que pintar la hoja para que encaje en el hueco.
 *
 *  `pagina` son sus medidas a escala 1 con el giro PROPIO de la página ya
 *  aplicado (lo que da `getViewport({ scale: 1 })`); `giro` es solo el del
 *  botón. Con hueco o página sin medir devuelve 1 y no 0 ni infinito: en el
 *  primer render el hueco aún no se ha medido, y un canvas de 0 o de infinitos
 *  píxeles es peor que uno a tamaño natural durante un instante. */
export function escalaParaEncaje(pagina: Medidas, giro: Giro, hueco: Medidas, encaje: Encaje): number {
  const ancho = giroIntercambia(giro) ? pagina.alto : pagina.ancho;
  const alto = giroIntercambia(giro) ? pagina.ancho : pagina.alto;
  if (ancho <= 0 || alto <= 0 || hueco.ancho <= 0 || hueco.alto <= 0) return 1;
  const alAncho = hueco.ancho / ancho;
  const alAlto = hueco.alto / alto;
  if (encaje === "FitH") return alAncho;
  if (encaje === "FitV") return alAlto;
  return Math.min(alAncho, alAlto);
}

/** Zoom encima del encaje: 1 es «como encaja». Un cuarto por abajo es la hoja
 *  en sello; seis por arriba basta para leer una cota a lápiz en un escaneo. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 6;

export function acotarZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** Cuánto amplía un golpe de rueda con Ctrl. Exponencial y no lineal: así
 *  acercar y alejar lo mismo deja la hoja donde estaba, y el paso se siente
 *  igual a escala 0,5 que a escala 4. `deltaY` negativo (rueda arriba) acerca. */
export function factorRueda(deltaY: number): number {
  return Math.exp(-deltaY * 0.002);
}

/** Por encima de 2 no se nota en un parte escaneado y el canvas crece al
 *  cuadrado: una pantalla 4K a su ratio de 3 pediría hojas de 8 000 px. */
export const TOPE_PIXEL_RATIO = 2;

export function pixelRatio(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr < 1) return 1;
  return Math.min(dpr, TOPE_PIXEL_RATIO);
}

/** Tope de área del lienzo, en píxeles reales. El límite de Chrome para un
 *  `<canvas>` ronda los 268 millones de píxeles; por debajo de eso, pero ya
 *  con un zoom de 6 encajado al ancho en una pantalla ancha, un plano llega
 *  a cientos de megapíxeles y se reserva DOS veces (el lienzo `fuera` donde
 *  pinta pdf.js y el `c` visible al que se copia). Pasado este tope se pinta
 *  más pequeño de lo pedido y el navegador estira el bitmap con CSS: se nota
 *  algo blando en el zoom más extremo, que es mejor que un render que falla
 *  en silencio (por encima del límite de Chrome) o que unos gigabytes de
 *  memoria para una sola hoja. */
export const TOPE_PIXELES_LIENZO = 16_000_000;

/** La escala real con la que pintar el lienzo, respetando `TOPE_PIXELES_LIENZO`.
 *
 *  `ancho`/`alto` son la hoja a escala 1 (lo que da `getViewport({ scale: 1 })`
 *  antes de aplicar rotación: el área no cambia al girar, así que no hace
 *  falta el giro para esta cuenta). Si el área a `escala` ya cabe en el tope,
 *  se devuelve tal cual; si no, la mayor escala que sí cabe. Medidas a cero,
 *  negativas o que no son número devuelven la escala pedida: es la misma
 *  defensa que el resto de este fichero, mejor pintar sin tope un instante
 *  que devolver un canvas roto. */
export function escalaDeLienzo(ancho: number, alto: number, escala: number): number {
  if (
    !Number.isFinite(ancho) ||
    !Number.isFinite(alto) ||
    !Number.isFinite(escala) ||
    ancho <= 0 ||
    alto <= 0 ||
    escala <= 0
  ) {
    return escala;
  }
  const area = ancho * escala * (alto * escala);
  if (area <= TOPE_PIXELES_LIENZO) return escala;
  return Math.sqrt(TOPE_PIXELES_LIENZO / (ancho * alto));
}

/** Con qué se pinta el PDF. `navegador` es el `<iframe>` de siempre: hay quien
 *  tiene la extensión de Adobe en Firefox y prefiere ese visor. */
export type MotorPdf = "propio" | "navegador";

/** Dónde se recuerda. En el navegador y no en el servidor, por lo mismo que el
 *  encaje del parte: es cómo se MIRA, y va con la pantalla en la que se está
 *  sentado. */
export const CLAVE_MOTOR = "coordina-visor-motor";

/** La preferencia guardada. Cualquier cosa que no sea `navegador` —nada,
 *  basura, un almacenamiento que lanza— es el motor propio. */
export function leerMotor(almacen: Pick<Storage, "getItem"> | undefined): MotorPdf {
  try {
    return almacen?.getItem(CLAVE_MOTOR) === "navegador" ? "navegador" : "propio";
  } catch {
    return "propio";
  }
}

export function guardarMotor(almacen: Pick<Storage, "setItem"> | undefined, motor: MotorPdf): void {
  try {
    almacen?.setItem(CLAVE_MOTOR, motor);
  } catch {
    // Sin almacenamiento el interruptor sigue funcionando; solo no dura.
  }
}

/** Dónde recuerda cada visor su encaje. POR SEPARADO: el parte es un A4 de
 *  pie que se lee entero, y un planteamiento apaisado se mira de otra manera;
 *  quien pone el parte al alto no quiere por eso los planos al alto.
 *
 *  La del parte es la clave que ya existía: cambiarla haría que todo el mundo
 *  perdiera, sin avisar, el encaje que ya tenía elegido. */
export const CLAVE_ENCAJE_PARTE = "coordina-parte-encaje";
export const CLAVE_ENCAJE_DOCUMENTOS = "coordina-documentos-encaje";

/** El encaje guardado en `clave`, o la página entera si no hay uno válido. */
export function leerEncaje(almacen: Pick<Storage, "getItem"> | undefined, clave: string): Encaje {
  try {
    const v = almacen?.getItem(clave);
    return v === "FitH" || v === "FitV" ? v : "Fit";
  } catch {
    return "Fit";
  }
}

export function guardarEncaje(
  almacen: Pick<Storage, "setItem"> | undefined,
  clave: string,
  encaje: Encaje,
): void {
  try {
    almacen?.setItem(clave, encaje);
  } catch {
    // Sin almacenamiento el botón sigue funcionando; solo no dura.
  }
}

/** Dos botones para tres encajes: pulsar el que ya está puesto vuelve a la
 *  página entera, que es como empieza todo. */
export function alternarEncaje(actual: Encaje, pulsado: "FitH" | "FitV"): Encaje {
  return actual === pulsado ? "Fit" : pulsado;
}

/** Documentos ya abiertos, el más reciente al final.
 *
 *  Con las flechas del visor de documentos se va y se vuelve; tener los
 *  últimos a mano hace que volver sea instantáneo. Con tope, porque cada
 *  documento abierto ocupa memoria en el worker, y el que sale se destruye.
 *
 *  FIJAR. El parte escaneado y el visor de documentos están montados a la vez
 *  en el mismo cajón. Pasando cinco planteamientos con las flechas (el que se
 *  ve y dos vecinos precargados a cada paso) el parte sería el más antiguo y
 *  se destruiría con la hoja aún a la vista: el siguiente giro o zoom fallaría
 *  en silencio y quedaría en blanco. Quien lo está enseñando lo fija, y lo
 *  fijado no sale; si todo lo que sobra está fijado, la caché pasa del tope un
 *  rato y recorta en cuanto alguien lo suelta.
 *
 *  Un fallo (404, PDF roto) NO se queda: el siguiente intento vuelve a pedirlo,
 *  que el parte de hoy puede escanearse dentro de cinco minutos. */
export function crearCacheDocumentos<D extends { destroy(): unknown }>(
  abrir: (url: string) => Promise<D>,
  tope: number,
) {
  const vivos = new Map<string, Promise<D>>();
  // Aparte de `vivos`: se fija antes de pedirlo, cuando aún no está abierto.
  const fijados = new Map<string, number>();

  function recortar() {
    // Del más antiguo al más nuevo, saltando lo fijado. Borrar de un Map
    // mientras se recorre es seguro: lo borrado simplemente no sale.
    for (const [url, viejo] of vivos) {
      if (vivos.size <= tope) break;
      if (fijados.has(url)) continue;
      vivos.delete(url);
      viejo.then(
        // Con el worker ya caído el destroy puede rechazar: no es asunto de nadie.
        (d) => Promise.resolve(d.destroy()).catch(() => {}),
        () => {},
      );
    }
  }

  return {
    obtener(url: string): Promise<D> {
      const ya = vivos.get(url);
      if (ya) {
        // Borrar y volver a poner lo manda al final: es el más reciente.
        vivos.delete(url);
        vivos.set(url, ya);
        return ya;
      }
      const nuevo = Promise.resolve().then(() => abrir(url));
      vivos.set(url, nuevo);
      nuevo.catch(() => {
        if (vivos.get(url) === nuevo) vivos.delete(url);
      });
      recortar();
      return nuevo;
    },
    /** Lo protege de salir mientras se ve. Devuelve con qué soltarlo; soltar
     *  dos veces cuenta como una, para que un cleanup repetido no suelte el
     *  de otro visor que enseña lo mismo. */
    fijar(url: string): () => void {
      fijados.set(url, (fijados.get(url) ?? 0) + 1);
      let suelto = false;
      return () => {
        if (suelto) return;
        suelto = true;
        const quedan = (fijados.get(url) ?? 1) - 1;
        if (quedan > 0) {
          fijados.set(url, quedan);
          return;
        }
        fijados.delete(url);
        recortar();
      };
    },
    get tamano() {
      return vivos.size;
    },
  };
}
