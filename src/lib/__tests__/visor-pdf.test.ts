import { expect, test, vi } from "vitest";
import {
  CLAVE_ENCAJE_DOCUMENTOS,
  CLAVE_ENCAJE_PARTE,
  CLAVE_MOTOR,
  TOPE_PIXELES_LIENZO,
  ZOOM_MAX,
  ZOOM_MIN,
  acotarZoom,
  alternarEncaje,
  crearCacheDocumentos,
  escalaDeLienzo,
  escalaParaEncaje,
  factorRueda,
  giroIntercambia,
  guardarEncaje,
  guardarMotor,
  leerEncaje,
  leerMotor,
  pixelRatio,
  rotacionTotal,
  siguienteGiro,
} from "../visor-pdf";

// A4 vertical en puntos PDF, que es lo que da getViewport({ scale: 1 }).
const A4 = { ancho: 595, alto: 842 };

test("el giro da la vuelta entera en cuatro", () => {
  expect(siguienteGiro(0)).toBe(90);
  expect(siguienteGiro(90)).toBe(180);
  expect(siguienteGiro(180)).toBe(270);
  expect(siguienteGiro(270)).toBe(0);
});

test("solo el cuarto impar intercambia ancho y alto", () => {
  expect(giroIntercambia(90)).toBe(true);
  expect(giroIntercambia(270)).toBe(true);
  expect(giroIntercambia(0)).toBe(false);
  expect(giroIntercambia(180)).toBe(false);
});

test("el giro del botón se SUMA al que ya trae la página", () => {
  // Escáner que guarda la hoja tumbada con /Rotate 90: girar 270 la endereza.
  expect(rotacionTotal(90, 270)).toBe(0);
  expect(rotacionTotal(0, 90)).toBe(90);
  expect(rotacionTotal(270, 180)).toBe(90);
});

test("página entera: manda el lado que antes se sale", () => {
  // Hueco apaisado: el A4 de pie lo limita el alto.
  expect(escalaParaEncaje(A4, 0, { ancho: 1000, alto: 421 }, "Fit")).toBeCloseTo(0.5);
});

test("al ancho y al alto usan solo su eje", () => {
  const hueco = { ancho: 1190, alto: 421 };
  expect(escalaParaEncaje(A4, 0, hueco, "FitH")).toBeCloseTo(2);
  expect(escalaParaEncaje(A4, 0, hueco, "FitV")).toBeCloseTo(0.5);
});

test("girado un cuarto, el ancho de la hoja es su alto de antes", () => {
  // Tumbado, el A4 mide 842 de ancho: al ancho de un hueco de 842 es escala 1.
  expect(escalaParaEncaje(A4, 90, { ancho: 842, alto: 2000 }, "FitH")).toBeCloseTo(1);
  expect(escalaParaEncaje(A4, 270, { ancho: 842, alto: 2000 }, "FitH")).toBeCloseTo(1);
  expect(escalaParaEncaje(A4, 180, { ancho: 595, alto: 2000 }, "FitH")).toBeCloseTo(1);
});

test("sin hueco medido todavía no devuelve cero ni infinito", () => {
  expect(escalaParaEncaje(A4, 0, { ancho: 0, alto: 0 }, "Fit")).toBe(1);
  expect(escalaParaEncaje({ ancho: 0, alto: 0 }, 0, { ancho: 500, alto: 500 }, "Fit")).toBe(1);
});

test("el zoom tiene suelo y techo, y lo que no es número vuelve a 1", () => {
  expect(acotarZoom(100)).toBe(ZOOM_MAX);
  expect(acotarZoom(0.01)).toBe(ZOOM_MIN);
  expect(acotarZoom(1.5)).toBe(1.5);
  expect(acotarZoom(Number.NaN)).toBe(1);
});

test("acercar y alejar lo mismo vuelve al mismo sitio", () => {
  expect(factorRueda(-100) * factorRueda(100)).toBeCloseTo(1);
  expect(factorRueda(-100)).toBeGreaterThan(1); // rueda hacia arriba acerca
});

test("el pixel ratio no baja de 1 ni pasa de 2", () => {
  expect(pixelRatio(3)).toBe(2);
  expect(pixelRatio(1.5)).toBe(1.5);
  expect(pixelRatio(0.5)).toBe(1);
  expect(pixelRatio(Number.NaN)).toBe(1);
});

test("el motor por defecto es el propio, y la basura también cuenta como propio", () => {
  expect(leerMotor(undefined)).toBe("propio");
  expect(leerMotor({ getItem: () => null })).toBe("propio");
  expect(leerMotor({ getItem: () => "adobe" })).toBe("propio");
  expect(leerMotor({ getItem: () => "navegador" })).toBe("navegador");
});

test("un almacenamiento capado no revienta ni al leer ni al guardar", () => {
  const capado = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  expect(leerMotor(capado)).toBe("propio");
  expect(() => guardarMotor(capado, "navegador")).not.toThrow();
});

test("guardar escribe en la clave de siempre", () => {
  const setItem = vi.fn();
  guardarMotor({ setItem }, "navegador");
  expect(setItem).toHaveBeenCalledWith(CLAVE_MOTOR, "navegador");
});

test("la clave del parte es la de siempre: nadie pierde el encaje que ya tenía", () => {
  expect(CLAVE_ENCAJE_PARTE).toBe("coordina-parte-encaje");
  expect(CLAVE_ENCAJE_DOCUMENTOS).not.toBe(CLAVE_ENCAJE_PARTE);
});

test("el encaje guardado se lee; lo que no lo es, es la página entera", () => {
  expect(leerEncaje({ getItem: () => "FitH" }, CLAVE_ENCAJE_PARTE)).toBe("FitH");
  expect(leerEncaje({ getItem: () => "FitV" }, CLAVE_ENCAJE_PARTE)).toBe("FitV");
  expect(leerEncaje({ getItem: () => "basura" }, CLAVE_ENCAJE_PARTE)).toBe("Fit");
  expect(leerEncaje({ getItem: () => null }, CLAVE_ENCAJE_PARTE)).toBe("Fit");
  expect(leerEncaje(undefined, CLAVE_ENCAJE_PARTE)).toBe("Fit");
  expect(
    leerEncaje(
      {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
      CLAVE_ENCAJE_PARTE,
    ),
  ).toBe("Fit");
});

test("cada visor guarda su encaje en su clave", () => {
  const setItem = vi.fn();
  guardarEncaje({ setItem }, CLAVE_ENCAJE_DOCUMENTOS, "FitV");
  expect(setItem).toHaveBeenCalledWith(CLAVE_ENCAJE_DOCUMENTOS, "FitV");
  expect(() =>
    guardarEncaje(
      {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      CLAVE_ENCAJE_PARTE,
      "FitH",
    ),
  ).not.toThrow();
});

test("pulsar el encaje puesto vuelve a la página entera; otro, cambia a ese", () => {
  expect(alternarEncaje("Fit", "FitH")).toBe("FitH");
  expect(alternarEncaje("FitH", "FitH")).toBe("Fit");
  expect(alternarEncaje("FitH", "FitV")).toBe("FitV");
  expect(alternarEncaje("FitV", "FitV")).toBe("Fit");
});

const docFalso = () => ({ destroy: vi.fn() });

test("la caché devuelve el mismo documento sin volver a abrirlo", async () => {
  const abrir = vi.fn(async () => docFalso());
  const cache = crearCacheDocumentos(abrir, 5);
  const a = await cache.obtener("/a.pdf");
  const b = await cache.obtener("/a.pdf");
  expect(a).toBe(b);
  expect(abrir).toHaveBeenCalledTimes(1);
});

test("pasado el tope, suelta el más antiguo, no el último que se miró", async () => {
  const cache = crearCacheDocumentos(async () => docFalso(), 2);
  const a = await cache.obtener("/a.pdf");
  await cache.obtener("/b.pdf");
  await cache.obtener("/a.pdf"); // a vuelve a ser el más reciente
  await cache.obtener("/c.pdf"); // sale b, no a
  await Promise.resolve();
  expect(cache.tamano).toBe(2);
  expect(a.destroy).not.toHaveBeenCalled();
});

test("el destruido es el que salió", async () => {
  const docs: Record<string, ReturnType<typeof docFalso>> = {};
  const cache = crearCacheDocumentos(async (url) => (docs[url] = docFalso()), 1);
  await cache.obtener("/a.pdf");
  await cache.obtener("/b.pdf");
  await Promise.resolve();
  expect(docs["/a.pdf"].destroy).toHaveBeenCalledTimes(1);
  expect(docs["/b.pdf"].destroy).not.toHaveBeenCalled();
});

test("por debajo del tope, el lienzo se pinta a la escala pedida", () => {
  // A4 a escala 2: unos 2,3 Mpx, muy por debajo del tope.
  expect(escalaDeLienzo(A4.ancho, A4.alto, 2)).toBe(2);
});

test("por encima del tope, el área del lienzo se recorta cerca del tope", () => {
  // A4 a escala 10: 595*10 x 842*10 = casi 50 Mpx, por encima del tope.
  const escala = escalaDeLienzo(A4.ancho, A4.alto, 10);
  expect(escala).toBeLessThan(10);
  const area = A4.ancho * escala * (A4.alto * escala);
  expect(area).toBeLessThanOrEqual(TOPE_PIXELES_LIENZO);
  expect(area).toBeGreaterThanOrEqual(TOPE_PIXELES_LIENZO * 0.99);
});

test("medidas a cero o sin número no rompen la cuenta: devuelven la escala pedida", () => {
  expect(escalaDeLienzo(0, 0, 3)).toBe(3);
  expect(escalaDeLienzo(Number.NaN, A4.alto, 3)).toBe(3);
  expect(escalaDeLienzo(A4.ancho, Number.NaN, 3)).toBe(3);
  expect(escalaDeLienzo(-1, A4.alto, 3)).toBe(3);
});

test("un fallo no se queda en la caché: el siguiente intento vuelve a abrir", async () => {
  let intentos = 0;
  const cache = crearCacheDocumentos(async () => {
    intentos++;
    if (intentos === 1) throw new Error("404");
    return docFalso();
  }, 5);
  await expect(cache.obtener("/a.pdf")).rejects.toThrow("404");
  await expect(cache.obtener("/a.pdf")).resolves.toBeDefined();
  expect(intentos).toBe(2);
});
