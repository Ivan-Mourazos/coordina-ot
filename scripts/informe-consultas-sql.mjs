#!/usr/bin/env node
// Resumen de las consultas a SQL Server que apunta src/lib/server/medir-consultas.js
// (las tres webs: CoordinaOT, Planteamientos y materiales-ot). Para IT.
//
//   pnpm consultas-sql [carpeta…] [--desde AAAA-MM-DD] [--hasta AAAA-MM-DD]
//                      [--lentas MS] [--salida carpeta]
//
// Sin carpetas lee logs/consultas-sql. Para juntar las tres webs, pásalas todas:
//   pnpm consultas-sql logs/consultas-sql ../toldos-testar/.logs/consultas-sql \
//                      ../materiales-ot/.logs/consultas-sql
//
// Escribe en la carpeta de salida (por defecto informe-consultas-sql/), con ";"
// y BOM para que Excel los abra bien:
//   consultas.csv  una fila por consulta distinta: veces, tiempo total, p50, p95, máximo, errores, SQL
//   por-hora.csv   por día, hora y web: cuántas, tiempo total, p95, máximo, máximo a la vez
//   lentas.csv     cada consulta que tardó más de --lentas ms (2000 por defecto), con su hora exacta
// Las horas van en hora local del servidor que ejecuta el informe.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const opcion = (n, porDefecto) => {
  const i = args.indexOf(n);
  if (i === -1) return porDefecto;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const desde = opcion("--desde", "0000");
const hasta = opcion("--hasta", "9999");
const umbralLentas = Number(opcion("--lentas", "2000"));
const salida = path.resolve(opcion("--salida", "informe-consultas-sql"));
const carpetas = args.length ? args : ["logs/consultas-sql"];

const catalogo = new Map();
const filas = [];
for (const c of carpetas) {
  let ficheros;
  try {
    ficheros = await readdir(c);
  } catch {
    console.error(`No existe ${c}, me la salto`);
    continue;
  }
  try {
    for (const l of (await readFile(path.join(c, "catalogo.jsonl"), "utf8")).split("\n")) {
      if (l) {
        const e = JSON.parse(l);
        catalogo.set(e.q, e);
      }
    }
  } catch {
    /* sin catálogo */
  }
  for (const f of ficheros.sort()) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!m || m[1] < desde || m[1] > hasta) continue;
    for (const l of (await readFile(path.join(c, f), "utf8")).split("\n")) {
      if (!l) continue;
      try {
        filas.push(JSON.parse(l));
      } catch {
        /* línea cortada por un reinicio */
      }
    }
  }
}
if (!filas.length) {
  console.error("No hay consultas apuntadas en ese rango.");
  process.exit(1);
}

const percentil = (ord, p) => ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))];
const local = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return {
    dia: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: p(d.getHours()),
    completa: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
};
const csv = (cabecera, filasCsv) =>
  "﻿" +
  [cabecera, ...filasCsv]
    .map((f) => f.map((v) => {
      const s = String(v ?? "");
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(";"))
    .join("\r\n") +
  "\r\n";

function agrupar(clave) {
  const g = new Map();
  for (const f of filas) {
    const k = clave(f);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(f);
  }
  return g;
}

const masComun = (lista, campo) => {
  const n = new Map();
  for (const f of lista) if (f[campo]) n.set(f[campo], (n.get(f[campo]) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

// consultas.csv
const porConsulta = [...agrupar((f) => `${f.web}|${f.bd}|${f.q}`)].map(([, lista]) => {
  const ms = lista.map((f) => f.ms).sort((a, b) => a - b);
  const total = ms.reduce((a, b) => a + b, 0);
  const f0 = lista[0];
  return {
    web: f0.web,
    bd: f0.bd,
    q: f0.q,
    obj: f0.obj,
    orig: masComun(lista, "orig"),
    veces: lista.length,
    total,
    media: Math.round(total / lista.length),
    p50: percentil(ms, 50),
    p95: percentil(ms, 95),
    max: ms[ms.length - 1],
    errores: lista.filter((f) => f.err).length,
    sql: catalogo.get(f0.q)?.sql ?? "",
  };
});
porConsulta.sort((a, b) => b.total - a.total);

// por-hora.csv
const porHora = [...agrupar((f) => { const l = local(f.t); return `${l.dia}|${l.hora}|${f.web}`; })]
  .map(([k, lista]) => {
    const [dia, hora, web] = k.split("|");
    const ms = lista.map((f) => f.ms).sort((a, b) => a - b);
    return {
      dia, hora, web,
      veces: lista.length,
      total: ms.reduce((a, b) => a + b, 0),
      p95: percentil(ms, 95),
      max: ms[ms.length - 1],
      sim: Math.max(...lista.map((f) => (f.sim ?? 0) + 1)),
    };
  })
  .sort((a, b) => `${a.dia}${a.hora}${a.web}`.localeCompare(`${b.dia}${b.hora}${b.web}`));

const lentas = filas.filter((f) => f.ms >= umbralLentas).sort((a, b) => a.t.localeCompare(b.t));

await mkdir(salida, { recursive: true });
await writeFile(
  path.join(salida, "consultas.csv"),
  csv(
    ["web", "base de datos", "huella", "tabla o vista", "origen", "veces", "tiempo total (s)", "media (ms)", "p50 (ms)", "p95 (ms)", "máximo (ms)", "errores", "SQL"],
    porConsulta.map((c) => [c.web, c.bd, c.q, c.obj, c.orig, c.veces, Math.round(c.total / 1000), c.media, c.p50, c.p95, c.max, c.errores, c.sql]),
  ),
);
await writeFile(
  path.join(salida, "por-hora.csv"),
  csv(
    ["día", "hora", "web", "consultas", "tiempo total (s)", "p95 (ms)", "máximo (ms)", "máximo a la vez"],
    porHora.map((h) => [h.dia, `${h.hora}:00`, h.web, h.veces, Math.round(h.total / 1000), h.p95, h.max, h.sim]),
  ),
);
await writeFile(
  path.join(salida, "lentas.csv"),
  csv(
    ["inicio", "web", "base de datos", "huella", "tabla o vista", "ms", "filas", "a la vez", "origen", "error"],
    lentas.map((f) => [local(f.t).completa, f.web, f.bd, f.q, f.obj, f.ms, f.filas, (f.sim ?? 0) + 1, f.orig, f.err ?? ""]),
  ),
);

const primero = local(filas.reduce((a, f) => (f.t < a ? f.t : a), filas[0].t)).completa;
const ultimo = local(filas.reduce((a, f) => (f.t > a ? f.t : a), filas[0].t)).completa;
console.log(`${filas.length} consultas, ${porConsulta.length} distintas, de ${primero} a ${ultimo}`);
console.log(`${lentas.length} tardaron ${umbralLentas} ms o más\n`);
console.log("Las 15 que más tiempo suman:");
for (const c of porConsulta.slice(0, 15)) {
  console.log(
    `  ${String(Math.round(c.total / 1000)).padStart(6)} s  ${String(c.veces).padStart(6)}×  p95 ${String(c.p95).padStart(6)} ms  máx ${String(c.max).padStart(6)} ms  ${c.web} ${c.obj || c.q} (${c.orig})`,
  );
}
console.log(`\nCSV en ${salida}`);
