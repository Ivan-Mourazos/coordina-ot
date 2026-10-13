import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { anioPedido, conAnio, esA4, nombreArchivoRps, sufijoDe } from "../planteamiento";
import { cargarPdfjs } from "./pdfjs";

// ─── Dónde está el planteamiento de un pedido, y cómo es ─────────────────────
// Dos sitios, en este orden: la carpeta Planteamientos, donde OT lo deja desde
// CAD, y el archivo de RPS, adonde va cuando RPS lo procesa (en pocos minutos).
// Un mismo sufijo en los dos es el mismo documento, y manda el de Planteamientos
// por ser el último que se guardó.
//
// Cuentan TODOS, también los de la web de toldos (toldos-testar): esa web solo
// guarda el PDF en la carpeta, no lo imprime ni lo manda (Iván, 13/10/2026).

export interface InfoPdf {
  paginas: number;
  todoA4: boolean;
}

export async function leerPdf(bytes: Uint8Array): Promise<InfoPdf> {
  const { pdfjs, pdfjsDir } = await cargarPdfjs();
  // Copia: pdfjs se queda con el buffer que recibe y lo deja inservible.
  const tarea = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${pdfjsDir}/standard_fonts/`,
  });
  try {
    const doc = await tarea.promise;
    let todoA4 = true;
    for (let n = 1; n <= doc.numPages; n++) {
      const [x0, y0, x1, y1] = (await doc.getPage(n)).view;
      if (!esA4(x1 - x0, y1 - y0)) todoA4 = false;
    }
    return { paginas: doc.numPages, todoA4 };
  } finally {
    await tarea.destroy();
  }
}

export interface CarpetasPlanteamiento {
  entrada: string | null;
  archivo: string | null;
}

/** Igual que el PDF del pedido (pdf-pedido.ts): ruta Linux en el servidor y
 *  UNC en un PC de desarrollo. La entrada no tiene valor por defecto en Windows
 *  porque no se sabe su ruta de red; sin ella, la búsqueda lo dice. */
export function carpetasPlanteamiento(): CarpetasPlanteamiento {
  return process.platform === "win32"
    ? {
        entrada: process.env.PLANTEAMIENTOS_DIR_WIN ?? null,
        archivo: process.env.PLANTEAMIENTOS_ARCHIVO_DIR_WIN ?? "\\\\192.168.0.128\\RPS\\VENTAS\\PLANTEAMIENTOS\\{YYYY}",
      }
    : {
        entrada: process.env.PLANTEAMIENTOS_DIR ?? "/mnt/escaner/Planteamientos",
        archivo: process.env.PLANTEAMIENTOS_ARCHIVO_DIR ?? "/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}",
      };
}

export interface FicheroPlanteamiento {
  nombre: string;
  ruta: string;
  origen: "planteamientos" | "archivo";
  paginas: number;
  todoA4: boolean;
}

export interface Planteamientos {
  ficheros: FicheroPlanteamiento[];
  /** Por qué la lista puede no ser fiable (carpeta sin montar o sin
   *  configurar). null = se miró bien. Nunca lanza: esto se llama al pasar un
   *  pedido, y un disco que falla no puede impedirlo. */
  aviso: string | null;
}

async function listar(dir: string): Promise<string[] | null> {
  try {
    return await readdir(dir);
  } catch {
    return null;
  }
}

export async function planteamientosDe(
  codigo: string,
  carpetas: CarpetasPlanteamiento = carpetasPlanteamiento(),
): Promise<Planteamientos> {
  const anio = anioPedido(codigo);
  if (anio === null) return { ficheros: [], aviso: null };
  if (!carpetas.entrada) return { ficheros: [], aviso: "La carpeta Planteamientos no está configurada" };

  const entrada = conAnio(carpetas.entrada, anio);
  const enEntrada = await listar(entrada);
  // El archivo del año puede no existir todavía (enero): eso no es un fallo.
  const dirArchivo = carpetas.archivo ? conAnio(carpetas.archivo, anio) : null;
  const enArchivo = dirArchivo ? ((await listar(dirArchivo)) ?? []) : [];

  const porSufijo = new Map<string, { nombre: string; ruta: string; origen: FicheroPlanteamiento["origen"] }>();
  for (const nombre of enArchivo) {
    const s = sufijoDe(nombre, codigo);
    if (s && nombre === nombreArchivoRps(codigo, s)) porSufijo.set(s, { nombre, ruta: path.join(dirArchivo!, nombre), origen: "archivo" });
  }
  for (const nombre of enEntrada ?? []) {
    const s = sufijoDe(nombre, codigo);
    if (s) porSufijo.set(s, { nombre, ruta: path.join(entrada, nombre), origen: "planteamientos" });
  }

  const ficheros: FicheroPlanteamiento[] = [];
  for (const [, f] of [...porSufijo].sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))) {
    try {
      const info = await leerPdf(new Uint8Array(await readFile(f.ruta)));
      ficheros.push({ ...f, paginas: info.paginas, todoA4: info.todoA4 });
    } catch (e) {
      // Un PDF roto no se imprime ni tumba la lista: se anota y se sigue.
      console.warn(`[planteamiento] no se pudo leer ${f.ruta}:`, (e as Error).message);
    }
  }
  return {
    ficheros,
    aviso: enEntrada === null ? "No puedo leer la carpeta Planteamientos" : null,
  };
}
