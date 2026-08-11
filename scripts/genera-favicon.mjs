// Genera los iconos de la pestaña a partir del logo de la casa.
//   node scripts/genera-favicon.mjs
//
// Escribe src/app/favicon.ico (16/32/48), src/app/icon.png (512) y
// src/app/apple-icon.png (180). No hace falta volver a ejecutarlo salvo que
// cambie el logo: los iconos van commiteados.
//
// De dónde sale el dibujo: public/coordina-oscuro.png, recortando SOLO la
// marca (el caballo saltando la línea), sin el texto "CoordinaOT" — a 16 px una
// palabra es una mancha. Y con los colores AL REVÉS que el logo: fondo ámbar y
// caballo oscuro. En el logo el caballo es ámbar sobre transparente, y así en
// una pestaña clara desaparecía; el cuadrado ámbar se ve igual de bien contra
// barra clara y oscura, que es lo único que tiene que hacer un favicon.
//
// Sin sharp (no está en el proyecto y no merece la pena traerlo para esto): el
// PNG se decodifica y se vuelve a escribir a mano con zlib. La escala es un
// promedio de área sobre alfa premultiplicado, que es lo que evita el reborde
// sucio al bajar a 16 px.

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

// ─── Colores ────────────────────────────────────────────────────────────────
const AMBAR = [252, 191, 58]; //   el del logo, muestreado del propio PNG
const OSCURO = [17, 20, 26]; //    casi negro, para que el caballo aguante a 16 px
// Recorte de la marca en public/coordina-oscuro.png (1672×941): ceñido al
// caballo (va de 716 a 1020) y centrado en él. Ceñido a propósito, porque el
// recorte manda en lo grande que sale el caballo y a 16 px cada píxel de margen
// se paga. Por la derecha se corta ANTES del segundo tramo de línea (el que en
// el logo pasa por detrás del "OT"): suelto y sin texto detrás parecía un
// guion perdido. El tramo de la izquierda cruza el recorte entero, así que
// sangra de borde a borde y se lee como lo que es: el caballo saltándola.
const CORTE = { x: 656, y: 108, w: 384, h: 342 };
const RADIO = 0.21; // esquinas redondeadas, en tanto por uno del lado

// ─── PNG ────────────────────────────────────────────────────────────────────
const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = TABLA_CRC[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** PNG → {w, h, px} con px en RGBA de 8 bits. Solo lo que hace falta para el
 *  logo: 8 bits por canal y sin entrelazar. */
function decodificaPNG(buf) {
  let p = 8;
  let cab = null;
  const idat = [];
  while (p < buf.length) {
    const largo = buf.readUInt32BE(p);
    const tipo = buf.toString("ascii", p + 4, p + 8);
    const datos = buf.subarray(p + 8, p + 8 + largo);
    if (tipo === "IHDR") {
      cab = {
        w: datos.readUInt32BE(0),
        h: datos.readUInt32BE(4),
        bits: datos[8],
        color: datos[9],
        entrelazado: datos[12],
      };
    } else if (tipo === "IDAT") idat.push(datos);
    p += 12 + largo;
  }
  if (cab.bits !== 8 || cab.entrelazado !== 0) {
    throw new Error(`PNG no soportado: ${JSON.stringify(cab)}`);
  }
  const canales = { 0: 1, 2: 3, 4: 2, 6: 4 }[cab.color];
  const crudo = inflateSync(Buffer.concat(idat));
  const { w, h } = cab;
  const paso = w * canales;
  const px = Buffer.alloc(w * h * 4);
  let anterior = Buffer.alloc(paso);
  for (let y = 0; y < h; y++) {
    const filtro = crudo[y * (paso + 1)];
    const fila = Buffer.from(crudo.subarray(y * (paso + 1) + 1, (y + 1) * (paso + 1)));
    for (let i = 0; i < paso; i++) {
      const a = i >= canales ? fila[i - canales] : 0;
      const b = anterior[i];
      const c = i >= canales ? anterior[i - canales] : 0;
      if (filtro === 1) fila[i] = (fila[i] + a) & 255;
      else if (filtro === 2) fila[i] = (fila[i] + b) & 255;
      else if (filtro === 3) fila[i] = (fila[i] + ((a + b) >> 1)) & 255;
      else if (filtro === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        fila[i] = (fila[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    for (let x = 0; x < w; x++) {
      const s = x * canales;
      const d = (y * w + x) * 4;
      const gris = canales <= 2;
      px[d] = gris ? fila[s] : fila[s];
      px[d + 1] = gris ? fila[s] : fila[s + 1];
      px[d + 2] = gris ? fila[s] : fila[s + 2];
      px[d + 3] = canales === 4 ? fila[s + 3] : canales === 2 ? fila[s + 1] : 255;
    }
    anterior = fila;
  }
  return { w, h, px };
}

function codificaPNG({ w, h, px }) {
  const crudo = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    crudo[y * (w * 4 + 1)] = 0; // sin filtro: el icono es minúsculo
    px.copy(crudo, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const trozo = (tipo, datos) => {
    const b = Buffer.alloc(8 + datos.length + 4);
    b.writeUInt32BE(datos.length, 0);
    b.write(tipo, 4, "ascii");
    datos.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + datos.length)), 8 + datos.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(crudo, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Dibujo ─────────────────────────────────────────────────────────────────
/** ¿Es este píxel parte de la marca (el trazo ámbar del logo)? Devuelve cuánto,
 *  de 0 a 1, para conservar el suavizado de los bordes. */
function tintaEn(img, x, y) {
  const d = (y * img.w + x) * 4;
  const [r, g, b, a] = [img.px[d], img.px[d + 1], img.px[d + 2], img.px[d + 3]];
  if (a === 0) return 0;
  // El logo trae el texto en blanco y la marca en ámbar: el azul es lo que los
  // separa (el ámbar casi no tiene, el blanco lo tiene a tope).
  const esAmbar = r > 180 && g > 110 && b < 150 && r - b > 90;
  return esAmbar ? a / 255 : 0;
}

/** Marca a tamaño `lado`: cuadrado ámbar con esquinas redondeadas y el caballo
 *  en oscuro. Se dibuja con submuestreo (SUB×SUB por píxel) en vez de escalar
 *  después, que a 16 px es la diferencia entre un caballo y un borrón. */
function dibuja(logo, lado) {
  const SUB = 4;
  const px = Buffer.alloc(lado * lado * 4);
  const radio = lado * RADIO;
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let dentro = 0;
      let tinta = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const fx = x + (sx + 0.5) / SUB;
          const fy = y + (sy + 0.5) / SUB;
          if (!enElRedondeado(fx, fy, lado, radio)) continue;
          dentro++;
          // La marca se escala a lo ancho y se centra en vertical: así la línea
          // que salta el caballo sangra de borde a borde.
          const escala = CORTE.w / lado;
          const ox = CORTE.x + fx * escala;
          const oy = CORTE.y + (fy - (lado - CORTE.h / escala) / 2) * escala;
          if (ox < 0 || oy < 0 || ox >= logo.w || oy >= logo.h) continue;
          tinta += tintaEn(logo, Math.floor(ox), Math.floor(oy));
        }
      }
      const total = SUB * SUB;
      const alfa = dentro / total;
      if (alfa === 0) continue;
      // El caballo va ENCIMA del ámbar, así que la mezcla es sobre el fondo, no
      // sobre transparente: fuera del redondeo no hay nada que mezclar.
      const t = dentro > 0 ? tinta / dentro : 0;
      const d = (y * lado + x) * 4;
      for (let c = 0; c < 3; c++) {
        px[d + c] = Math.round(AMBAR[c] * (1 - t) + OSCURO[c] * t);
      }
      px[d + 3] = Math.round(alfa * 255);
    }
  }
  return { w: lado, h: lado, px };
}

function enElRedondeado(x, y, lado, r) {
  const cx = Math.min(Math.max(x, r), lado - r);
  const cy = Math.min(Math.max(y, r), lado - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// ─── ICO ────────────────────────────────────────────────────────────────────
/** Un .ico puede llevar dentro PNGs tal cual (Windows Vista en adelante), que
 *  es lo que hace todo el mundo desde hace años. Nada de BMP ni máscara AND. */
function empaquetaICO(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2); // 1 = icono
  cabecera.writeUInt16LE(imagenes.length, 4);
  let desplazamiento = 6 + imagenes.length * 16;
  const entradas = imagenes.map(({ lado, png }) => {
    const e = Buffer.alloc(16);
    e[0] = lado >= 256 ? 0 : lado; // 0 significa 256
    e[1] = lado >= 256 ? 0 : lado;
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por píxel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += png.length;
    return e;
  });
  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.png)]);
}

// ─── Al lío ─────────────────────────────────────────────────────────────────
const logo = decodificaPNG(readFileSync("public/coordina-oscuro.png"));
const png = (lado) => codificaPNG(dibuja(logo, lado));

writeFileSync(
  "src/app/favicon.ico",
  empaquetaICO([16, 32, 48].map((lado) => ({ lado, png: png(lado) }))),
);
writeFileSync("src/app/icon.png", png(512));
writeFileSync("src/app/apple-icon.png", png(180));
console.log("favicon.ico (16/32/48), icon.png (512) y apple-icon.png (180) escritos");
