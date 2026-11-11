import type { DocumentoRps } from "./historial";

// ─── Documentos del pedido en la pantalla de Belén ───────────────────────────
// Client-safe. Lo que RPS cuelga del pedido, ordenado para buscar rápido:
//   · Destacados: la última versión del planteamiento, el pedido escaneado y
//     el último presupuesto, que es lo que se viene a mirar.
//   · Por clase, con la versión más alta primero.
//   · Las fotos del SAT, juntas por orden de mantenimiento (OM…).
// Y un nombre legible para cada uno, sin repetir la clase ni el pedido:
// «Versión 2», «Foto 3 · OM0252579», «PT26002352 · versión 4».

export interface DocBelen extends DocumentoRps {
  url: string;
  /** La clase en la que se enseña («Fotos» junta las fotos sueltas y las del SAT). */
  grupo: string;
  /** Nombre corto y legible para la tarjeta. */
  nombre: string;
  /** Número de versión, si lo trae. */
  version: number | null;
  /** Orden de mantenimiento de una foto del SAT («OM0252579»). */
  orden: string | null;
}

/** Orden de las clases: lo de taller primero, lo administrativo después. */
export const ORDEN_GRUPOS = [
  "Planteamiento",
  "Pedido escaneado",
  "Presupuesto",
  "Fotos",
  "Diseño",
  "Rotulación",
  "Presupuesto escaneado",
  "Remates",
  "Etiquetas",
  "Hoja de almacén",
  "Adjunto de la OF",
  "Mantenimiento (SAT)",
] as const;

const FOTO = /\.(?:jpe?g|png|gif|webp|bmp|heic|tiff?)$/i;

export function versionDe(descripcion: string): number | null {
  const m = /versi[oó]n?\s*(\d+)/i.exec(descripcion);
  return m ? Number(m[1]) : null;
}

/** El nombre de la tarjeta: lo que distingue a ESTE documento de sus hermanos. */
export function nombreDocumento(d: Pick<DocumentoRps, "descripcion" | "archivo" | "clase">): string {
  const desc = (d.descripcion || "").trim();
  const foto = /^Foto\s+(\d+)\s+orden mantenimiento\s+(OM\d+)/i.exec(desc);
  if (foto) return `Foto ${foto[1]} · ${foto[2].toUpperCase()}`;
  const oferta = /oferta\s+([A-Z]{1,3}\d+)(?:-\d+)?\s*,?\s*versi[oó]n\s*(\d+)/i.exec(desc);
  if (oferta) return `${oferta[1]} · versión ${oferta[2]}`;
  if (/versi[oó]n\s*-\s*$/i.test(desc)) return "Sin número de versión";
  const v = versionDe(desc);
  if (v !== null && /planteamiento|diseño|rotulaci/i.test(desc)) return `Versión ${v}`;
  if (/^PDF adjunto pedido\b/i.test(desc)) return "Pedido escaneado";
  const limpio = desc
    .replace(/\bdel pedido\s+[A-Z]{2}\.\d{2}\.\d{5}\b/i, "")
    .replace(/^PDF adjunto\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "");
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : d.archivo;
}

export interface DocumentosOrdenados {
  /** Por clase, en ORDEN_GRUPOS (las desconocidas al final), versión alta primero. */
  grupos: Array<{ grupo: string; documentos: DocBelen[] }>;
  /** Lo que se viene a buscar, si existe. */
  destacados: Array<{ titulo: string; doc: DocBelen; nota?: string }>;
  /** Los que RPS tiene apuntados sin fichero que abrir. */
  sinFichero: number;
}

export function ordenarDocumentos(documentos: readonly DocumentoRps[]): DocumentosOrdenados {
  const porGrupo = new Map<string, DocBelen[]>();
  let sinFichero = 0;
  documentos.forEach((d) => {
    if (typeof d.url !== "string" || !d.url) {
      sinFichero++;
      return;
    }
    const esFoto = /^Fotos?\b/i.test(d.clase) || /^Foto del trabajo$/i.test(d.clase) || (d.clase === "Mantenimiento (SAT)" && FOTO.test(d.archivo));
    const grupo = esFoto ? "Fotos" : d.clase;
    const orden = /\b(OM\d+)\b/i.exec(d.descripcion || "")?.[1]?.toUpperCase() ?? null;
    const doc: DocBelen = { ...d, url: d.url, grupo, nombre: nombreDocumento(d), version: versionDe(d.descripcion || ""), orden };
    porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), doc]);
  });
  // Dentro de cada grupo: versión más alta primero; las fotos, por orden de
  // mantenimiento y número de foto; lo demás, como llegó.
  const numFoto = (d: DocBelen) => Number(/Foto\s+(\d+)/i.exec(d.descripcion || "")?.[1] ?? 0);
  for (const [grupo, docs] of porGrupo) {
    const pos = new Map(docs.map((d, i) => [d, i]));
    docs.sort((a, b) => {
      if (grupo === "Fotos") return (a.orden ?? "").localeCompare(b.orden ?? "") || numFoto(a) - numFoto(b) || pos.get(a)! - pos.get(b)!;
      if (a.version !== null && b.version !== null) return b.version - a.version;
      if (a.version !== null) return -1;
      if (b.version !== null) return 1;
      return pos.get(a)! - pos.get(b)!;
    });
  }
  const indice = (g: string) => {
    const i = (ORDEN_GRUPOS as readonly string[]).indexOf(g);
    return i < 0 ? ORDEN_GRUPOS.length : i;
  };
  const grupos = [...porGrupo.entries()]
    .sort((a, b) => indice(a[0]) - indice(b[0]) || a[0].localeCompare(b[0]))
    .map(([grupo, docs]) => ({ grupo, documentos: docs }));

  const primero = (g: string) => porGrupo.get(g)?.[0];
  const destacados: DocumentosOrdenados["destacados"] = [];
  const plant = primero("Planteamiento");
  if (plant) destacados.push({ titulo: "Planteamiento", doc: plant, nota: (porGrupo.get("Planteamiento")?.length ?? 0) > 1 ? "La más reciente" : undefined });
  const pedido = primero("Pedido escaneado");
  if (pedido) destacados.push({ titulo: "Pedido escaneado", doc: pedido });
  const presu = primero("Presupuesto");
  if (presu) destacados.push({ titulo: "Presupuesto", doc: presu, nota: (porGrupo.get("Presupuesto")?.length ?? 0) > 1 ? "El más reciente" : undefined });
  return { grupos, destacados, sinFichero };
}
