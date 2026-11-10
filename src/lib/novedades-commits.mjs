const TIPOS = new Set(["nuevo", "arreglado", "mejor"]);
const APARTADOS = new Set(["ot", "diseno", "impresion", "produccion"]);

/** Solo pies en primera columna. Sin apartado, la novedad es para todos. */
export function novedadesDe(mensaje, avisar = console.warn) {
  const salida = [];
  let ultima = null;
  for (const linea of mensaje.split(/\r?\n/)) {
    const nov = /^Novedad(?:\[([^\]]+)\])?:\s*(\w+)\s*\|\s*(.+)$/i.exec(linea);
    if (nov) {
      ultima = null;
      const apartado = nov[1]?.trim().toLowerCase();
      const tipo = nov[2].toLowerCase();
      if (!TIPOS.has(tipo) || (apartado && !APARTADOS.has(apartado))) {
        avisar(`· Tipo o apartado desconocido, se ignora: ${linea}`);
        continue;
      }
      ultima = { tipo, titulo: nov[3].trim(), ...(apartado ? { apartado } : {}) };
      salida.push(ultima);
      continue;
    }
    if (/^Novedad(?:\[|:)/i.test(linea)) ultima = null;
    const det = /^Detalle:\s*(.+)$/i.exec(linea);
    if (det && ultima) ultima.detalle = det[1].trim();
  }
  return salida;
}
