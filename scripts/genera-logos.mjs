// Genera los logos de cada sección (Iván, 14/10/2026: la web pasa a llamarse
// «Coordina» y el logo lleva las siglas de donde estás: OT, DG, ID, OP).
//
//   node scripts/genera-logos.mjs
//
// Parte del logo original (public/coordina-claro.png, con «OT»): de ahí salen
// el caballo, la línea y «Coordina». Las siglas se DIBUJAN con la geometría de
// aquella O y aquella T —trazo de 65 px, mayúscula de 364, la redonda
// rebasando 8 px arriba y abajo— para que las cuatro versiones sean de la misma
// familia, incluida la de OT. Van DETRÁS de «Coordina», sin pisarla (Iván,
// 14/10/2026: la O original pisaba «na»), a la misma altura que tenían.

import { createRequire } from "node:module";

// sharp no es dependencia directa: viene con Next (optimiza las imágenes), así
// que se pide desde Next en vez de añadirlo al package.json por un script.
const desdeNext = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
const sharp = desdeNext("sharp");

const ORIGEN = "public/coordina-claro.png";
const AMARILLO = { r: 248, g: 192, b: 64 };
const HEX = "#F8C040";

// Medidas del original (1672×941), sacadas con sharp el 14/10/2026.
const TRAZO = 65;
const ARRIBA = 402; // altura de mayúscula
const BASE = 766; // línea base
const CY = 584; // centro de las redondas
const R = 190; // radio exterior de las redondas (rebasan: 394–774)
const X0 = 1310 + 45; // la primera sigla: tras «Coordina» (acaba en 1310) y un hueco
const HUECO = 22; // entre siglas
const LINEA = { y: 356, alto: 17, x: 1041 }; // tramo derecho de la línea
const CORTE_X = 1030; // a la derecha de esto, el amarillo del original es la «OT»
const MARGEN_DCHO = 43;

// Cada glifo: ancho y su SVG colocado en x.
const ri = R - TRAZO; // radio interior
const GLIFOS = {
  O: {
    ancho: 2 * R,
    svg: (x) =>
      `<path fill-rule="evenodd" d="M${x + R},${CY - R}a${R},${R} 0 1,0 0.01,0zM${x + R},${CY - ri}a${ri},${ri} 0 1,0 0.01,0z"/>`,
  },
  T: {
    ancho: 193,
    svg: (x) => `<rect x="${x}" y="${ARRIBA}" width="193" height="${TRAZO}"/><rect x="${x + 64}" y="${ARRIBA}" width="${TRAZO}" height="${BASE - ARRIBA}"/>`,
  },
  I: {
    ancho: TRAZO,
    svg: (x) => `<rect x="${x}" y="${ARRIBA}" width="${TRAZO}" height="${BASE - ARRIBA}"/>`,
  },
  D: {
    ancho: 340,
    svg: (x) => {
      const r = (BASE - ARRIBA) / 2; // 182
      const r2 = r - TRAZO;
      const recto = x + 340 - r;
      return `<path fill-rule="evenodd" d="M${x},${ARRIBA}H${recto}A${r},${r} 0 0,1 ${recto},${BASE}H${x}Z` +
        `M${x + TRAZO},${ARRIBA + TRAZO}H${recto}A${r2},${r2} 0 0,1 ${recto},${BASE - TRAZO}H${x + TRAZO}Z"/>`;
    },
  },
  P: {
    ancho: 280,
    svg: (x) => {
      const alto = 236; // la panza: de la mayúscula a algo más de media altura
      const r = alto / 2;
      const r2 = r - TRAZO;
      const recto = x + 280 - r;
      return `<rect x="${x}" y="${ARRIBA}" width="${TRAZO}" height="${BASE - ARRIBA}"/>` +
        `<path fill-rule="evenodd" d="M${x},${ARRIBA}H${recto}A${r},${r} 0 0,1 ${recto},${ARRIBA + alto}H${x}Z` +
        `M${x + TRAZO},${ARRIBA + TRAZO}H${recto}A${r2},${r2} 0 0,1 ${recto},${ARRIBA + alto - TRAZO}H${x + TRAZO}Z"/>`;
    },
  },
  G: {
    ancho: 2 * R,
    svg: (x) => {
      // La O abierta arriba a la derecha y con la barra en el centro, como
      // las G geométricas (Futura, Avant Garde).
      const cx = x + R;
      const rm = R - TRAZO / 2; // radio medio, para el trazo
      const a = (-45 * Math.PI) / 180;
      const ax = cx + rm * Math.cos(a);
      const ay = CY + rm * Math.sin(a);
      return `<path fill="none" stroke="${HEX}" stroke-width="${TRAZO}" d="M${ax},${ay}A${rm},${rm} 0 1,0 ${cx + rm},${CY}"/>` +
        `<rect x="${cx}" y="${CY - TRAZO / 2}" width="${R}" height="${TRAZO}"/>`;
    },
  },
};

// "" = sin siglas («solo»): para entrar y para lo que no es de una sección.
export const SIGLAS = ["", "OT", "DG", "ID", "OP"];
const FIN_TEXTO = 1310; // donde acaba «Coordina»: ahí acaba la línea sin siglas

const { data: orig, info } = await sharp(ORIGEN).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W0 = info.width;
const H = info.height;

/** Capa del original: el texto (por lo oscuro) o el amarillo de la izquierda. */
function capa(ancho, quePixel) {
  const out = Buffer.alloc(ancho * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < Math.min(W0, ancho); x++) {
      const i = (y * W0 + x) * 4;
      const a = orig[i + 3] / 255;
      const g = orig[i + 1];
      const res = quePixel(x, y, a, g);
      if (!res) continue;
      const o = (y * ancho + x) * 4;
      out[o] = res.r; out[o + 1] = res.g; out[o + 2] = res.b; out[o + 3] = Math.round(res.alfa * 255);
    }
  }
  return out;
}

const clamp = (v) => Math.max(0, Math.min(1, v));

for (const siglas of SIGLAS) {
  const [a, b] = siglas.split("").map((c) => GLIFOS[c]);
  const xb = a ? X0 + a.ancho + HUECO : 0;
  const derecha = a ? xb + b.ancho : FIN_TEXTO;
  const nombre = siglas ? siglas.toLowerCase() : "solo";
  // Sin siglas se recorta: si no, quedaría el hueco de las letras a la derecha.
  const ancho = siglas ? Math.max(W0, derecha + MARGEN_DCHO) : derecha + MARGEN_DCHO;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${H}"><g fill="${HEX}">` +
    `<rect x="${LINEA.x}" y="${LINEA.y}" width="${derecha - LINEA.x}" height="${LINEA.alto}"/>` +
    (a ? a.svg(X0) + b.svg(xb) : "") + `</g></svg>`;

  // El amarillo del original solo a la izquierda del corte: caballo y línea.
  // Su alfa sale de cuánto verde tiene (el texto negro no tiene).
  const amarillo = capa(ancho, (x, _y, al, g) =>
    x < CORTE_X && g > 100 ? { ...AMARILLO, alfa: al * clamp(g / AMARILLO.g) } : null);

  for (const tema of ["claro", "oscuro"]) {
    const color = tema === "claro" ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    // El texto es lo que no es amarillo: sobre el amarillo de la O original
    // quedan mezclas negro-amarillo, y cuánto le falta de verde dice cuánto
    // texto hay. Así sale entera la «na» que pisaba la O.
    const texto = capa(ancho, (_x, _y, al, g) => {
      const alfa = al * clamp(1 - g / AMARILLO.g);
      return alfa > 0.02 ? { ...color, alfa } : null;
    });
    const fondo = sharp({ create: { width: ancho, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
    await fondo
      .composite([
        { input: amarillo, raw: { width: ancho, height: H, channels: 4 } },
        { input: Buffer.from(svg) },
        { input: texto, raw: { width: ancho, height: H, channels: 4 } },
      ])
      .png()
      .toFile(`public/coordina-${nombre}-${tema}.png`);
    console.log(`public/coordina-${nombre}-${tema}.png  ${ancho}×${H}`);
  }
}
