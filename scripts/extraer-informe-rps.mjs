// ─── Copia un informe de RPS (Stimulsoft) a Coordina ─────────────────────────
// RPS no guarda los PDF de la hoja de ruta ni del vale de material: guarda la
// PLANTILLA (tabla CUSTReport, columna ReportDefinition, XML de Stimulsoft) y
// la rellena al imprimir. Este script lee esa plantilla y la deja en
// src/lib/informes-rps/<CODIGO>.json con lo que hace falta para pintarla igual:
// bandas, y en cada una sus textos, códigos de barras, imagen y líneas, en cm.
//
// Uso (solo lectura en RPS, con .env.local):
//   node --env-file=.env.local scripts/extraer-informe-rps.mjs CPRROADMAP CPRTICKETMAT
// o desde un fichero ya descargado:
//   node scripts/extraer-informe-rps.mjs --fichero ruta/al.mrt.xml CPRROADMAP
//
// Volver a ejecutarlo si alguien cambia el informe en RPS.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ─── XML mínimo ──────────────────────────────────────────────────────────────
// El XML de Stimulsoft es regular: elementos, atributos y texto. Sin CDATA.
function parsearXml(xml) {
  const raiz = { nombre: "#raiz", attrs: {}, hijos: [], texto: "" };
  const pila = [raiz];
  const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([\w.:-]+)((?:\s+[\w.:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[5] !== undefined) {
      pila[pila.length - 1].texto += m[5];
      continue;
    }
    if (!m[2]) continue;
    if (m[1]) {
      pila.pop();
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w.:-]+)="([^"]*)"/g)) attrs[a[1]] = decodificar(a[2]);
    const el = { nombre: m[2], attrs, hijos: [], texto: "" };
    pila[pila.length - 1].hijos.push(el);
    if (!m[4]) pila.push(el);
  }
  return raiz;
}

function decodificar(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

const hijo = (el, nombre) => el.hijos.find((h) => h.nombre === nombre);
const valor = (el, nombre) => {
  const h = hijo(el, nombre);
  return h ? decodificar(h.texto).trim() : undefined;
};
const numeros = (s) => (s ? s.split(",").map(Number) : undefined);

// ─── Colores y estilos de Stimulsoft ─────────────────────────────────────────
/** «Black», «[255:0:0]», «[0:255:255:255]» (alfa primero) → CSS. */
function color(s) {
  if (!s) return undefined;
  if (s === "Transparent") return "transparent";
  const m = s.match(/^\[(\d+):(\d+):(\d+)(?::(\d+))?\]$/);
  if (!m) return s.toLowerCase();
  if (m[4] !== undefined) {
    const [a, r, g, b] = [m[1], m[2], m[3], m[4]].map(Number);
    return a === 0 ? "transparent" : a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  }
  return `rgb(${m[1]},${m[2]},${m[3]})`;
}

/** «Arial,10,Bold» / «Arial,8,Bold,Pixel» → familia, tamaño en pt, estilo. */
function fuente(s) {
  if (!s) return undefined;
  const [familia, tamano, ...resto] = s.split(",");
  const estilos = resto.join(",");
  return {
    familia,
    tamano: Number(tamano),
    negrita: /Bold/.test(estilos) || undefined,
    cursiva: /Italic/.test(estilos) || undefined,
    subrayado: /Underline/.test(estilos) || undefined,
    pixel: /Pixel/.test(estilos) || undefined,
  };
}

/** «Top, Right, Bottom;Black;2;Solid;False;4;Black» → lados, color, grosor. */
function borde(s) {
  if (!s) return undefined;
  const [lados, col, grosor, estilo] = s.split(";");
  if (!lados || lados === "None") return undefined;
  const lista = lados === "All" ? ["arriba", "derecha", "abajo", "izquierda"] : lados.split(",").map((l) => l.trim()).map((l) => ({ Top: "arriba", Right: "derecha", Bottom: "abajo", Left: "izquierda" })[l]).filter(Boolean);
  return { lados: lista, color: color(col), grosor: Number(grosor) || 1, estilo: (estilo || "Solid").toLowerCase() };
}

/** Condición de una pieza: «campo,EqualTo,valor,,Tipo,tinta,fondo,fuente,…». */
function condiciones(el) {
  const c = hijo(el, "Conditions");
  if (!c) return undefined;
  const lista = c.hijos
    .filter((v) => v.nombre === "value")
    .map((v) => {
      const p = decodificar(v.texto).split(",");
      return {
        campo: p[0].replace(/^Result\./, ""),
        operador: p[1],
        valor: decodificar(p[2].replace(/_x([0-9A-F]{4})_/gi, (_, h) => `&#x${h};`)),
        tinta: color(p[5]),
        fondo: color(p[6]),
        // «Enabled» de la condición: False = si se cumple, la pieza (o la
        // fila entera, si es de una banda) no se imprime.
        ocultar: p[8] === "False" || undefined,
      };
    });
  return lista.length ? lista : undefined;
}

// ─── Piezas ──────────────────────────────────────────────────────────────────
function pieza(el) {
  const tipo = el.attrs.type ?? "";
  const r = numeros(valor(el, "ClientRectangle"));
  const comun = { nombre: el.nombre, x: r?.[0] ?? 0, y: r?.[1] ?? 0, ancho: r?.[2] ?? 0, alto: r?.[3] ?? 0 };
  if (tipo === "Text") {
    return {
      ...comun,
      tipo: "texto",
      texto: valor(el, "Text") ?? "",
      fuente: fuente(valor(el, "Font")),
      horizontal: valor(el, "HorAlignment")?.toLowerCase(),
      vertical: valor(el, "VertAlignment")?.toLowerCase(),
      borde: borde(valor(el, "Border")),
      fondo: color(valor(el, "Brush")),
      tinta: color(valor(el, "TextBrush")),
      ajustar: /WordWrap=True/i.test(valor(el, "TextOptions") ?? "") || undefined,
      crecer: valor(el, "CanGrow") === "True" || undefined,
      margenes: numeros(valor(el, "Margins")),
      formato: hijo(el, "TextFormat")?.attrs.type?.replace(/^.*\./, ""),
      formatoFecha: hijo(el, "TextFormat") ? valor(hijo(el, "TextFormat"), "StringFormat") : undefined,
      condiciones: condiciones(el),
    };
  }
  if (/StiBarCode$/.test(tipo)) {
    return {
      ...comun,
      tipo: "barras",
      codigo: valor(el, "Code") ?? "",
      simbologia: (hijo(el, "BarCodeType")?.attrs.type ?? "").replace(/^.*\./, ""),
      fuente: fuente(valor(el, "Font")),
      verTexto: valor(el, "ShowLabelText") !== "False",
    };
  }
  if (tipo === "Image") {
    const datos = valor(el, "ImageBytes");
    return { ...comun, tipo: "imagen", datos, estirar: valor(el, "Stretch") === "True" || undefined };
  }
  if (tipo === "HorizontalLinePrimitive") {
    return { ...comun, tipo: "lineaH", color: color(valor(el, "Color")), grosor: Number(valor(el, "Size") ?? 1) };
  }
  if (/StartPointPrimitive$|EndPointPrimitive$/.test(tipo)) {
    return { ...comun, tipo: /Start/.test(tipo) ? "inicio" : "fin", referencia: valor(el, "ReferenceToGuid") };
  }
  if (tipo === "VerticalLinePrimitive" || tipo === "RectanglePrimitive") {
    return {
      ...comun,
      tipo: tipo === "RectanglePrimitive" ? "rectangulo" : "lineaV",
      guid: valor(el, "Guid"),
      color: color(valor(el, "Color")),
      grosor: Number(valor(el, "Size") ?? 1),
    };
  }
  return { ...comun, tipo: "desconocido", original: tipo };
}

function componentes(el) {
  const c = hijo(el, "Components");
  return c ? c.hijos.map(pieza) : [];
}

const BANDAS = {
  GroupHeaderBand: "cabeceraGrupo",
  DataBand: "datos",
  GroupFooterBand: "pieGrupo",
  ReportSummaryBand: "resumen",
  ReportTitleBand: "titulo",
  PageHeaderBand: "cabeceraPagina",
  PageFooterBand: "piePagina",
  HeaderBand: "cabeceraDatos",
  FooterBand: "pieDatos",
};

function convertir(codigo, xml) {
  const raiz = parsearXml(xml);
  const informe = hijo(raiz, "StiSerializer");
  const paginas = hijo(informe, "Pages");
  const pagina = paginas.hijos[0];
  const bandas = [];
  const sueltas = [];
  for (const el of hijo(pagina, "Components").hijos) {
    const tipo = BANDAS[el.attrs.type];
    if (!tipo) {
      sueltas.push(pieza(el));
      continue;
    }
    const r = numeros(valor(el, "ClientRectangle"));
    const orden = hijo(el, "Sort")?.hijos.map((v) => v.texto.trim());
    bandas.push({
      tipo,
      nombre: el.nombre,
      alto: r?.[3] ?? 0,
      agruparPor: valor(el, "Condition"),
      ordenarPor: orden?.length === 2 ? { campo: orden[1], descendente: orden[0] === "DESC" } : undefined,
      nuevaPaginaDespues: valor(el, "NewPageAfter") === "True" || undefined,
      imprimirAbajo: valor(el, "PrintAtBottom") === "True" || undefined,
      condiciones: condiciones(el),
      piezas: componentes(el),
    });
  }
  return {
    codigo,
    nombre: valor(informe, "ReportAlias") ?? valor(informe, "ReportName"),
    copiado: new Date().toISOString().slice(0, 10),
    unidad: valor(informe, "ReportUnit"),
    pagina: {
      ancho: Number(valor(pagina, "PageWidth")),
      alto: Number(valor(pagina, "PageHeight")),
      margenes: numeros(valor(pagina, "Margins")),
    },
    bandas,
    sueltas,
  };
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
async function leerDeRps(codigos) {
  const sql = require("mssql");
  const e = (n) => process.env["RPS_DB_" + n];
  const pool = await sql.connect({
    server: e("HOST"),
    port: Number(e("PORT") || 1433),
    database: e("DATABASE"),
    user: e("USER"),
    password: e("PASSWORD"),
    options: { encrypt: e("ENCRYPT") !== "false", trustServerCertificate: true },
  });
  const salida = {};
  for (const c of codigos) {
    const r = await pool.request().input("c", sql.VarChar(60), c).query("SELECT ReportDefinition FROM dbo.CUSTReport WHERE CodCustomReport = @c");
    if (!r.recordset[0]?.ReportDefinition) throw new Error(`No está el informe ${c} en CUSTReport`);
    salida[c] = r.recordset[0].ReportDefinition;
  }
  await pool.close();
  return salida;
}

const args = process.argv.slice(2);
const destino = path.join(process.cwd(), "src", "lib", "informes-rps");
fs.mkdirSync(destino, { recursive: true });
let fuentes;
if (args[0] === "--fichero") {
  fuentes = { [args[2]]: fs.readFileSync(args[1], "utf8") };
} else {
  fuentes = await leerDeRps(args);
}
for (const [codigo, xml] of Object.entries(fuentes)) {
  const json = convertir(codigo, xml);
  const fichero = path.join(destino, `${codigo}.json`);
  fs.writeFileSync(fichero, JSON.stringify(json, null, 1) + "\n");
  const piezas = json.bandas.reduce((s, b) => s + b.piezas.length, 0) + json.sueltas.length;
  const raras = [...json.bandas.flatMap((b) => b.piezas), ...json.sueltas].filter((p) => p.tipo === "desconocido");
  console.log(`${codigo}: ${json.bandas.length} bandas, ${piezas} piezas → ${path.relative(process.cwd(), fichero)}`);
  if (raras.length) console.log("  sin traducir:", raras.map((p) => `${p.nombre} (${p.original})`).join(", "));
}
