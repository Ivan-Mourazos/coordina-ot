import path from "node:path";

// ─── Dónde vive el PDF escaneado de un pedido ────────────────────────────────
// Vivía dentro de /api/pedidos/[archivo]/route.ts, que era su único usuario.
// Ahora lo necesita también el vigilante de re-escaneos (scan-worker), y dos
// copias de esta ruta se habrían separado a la primera reorganización del
// share: el que sirve el fichero miraría en un sitio y el que vigila en otro,
// y el aviso mentiría sin que nada fallara a la vista.

/** Subcarpeta del año donde vive el PDF de cada delegación.
 *
 *  Los pedidos de Arteixo (AR) cuelgan del año a secas y los de las otras dos
 *  de una carpeta con el nombre del sitio: `2026/SANTIAGO/SA.26.00844.pdf`.
 *
 *  Comprobado contra `GENEntityDocument`, que es el índice de RPS: las 1245
 *  SA.26 y las 818 BE.26 apuntan todas a estas dos carpetas. */
const DELEGACION: Record<string, string> = {
  AR: "",
  SA: "SANTIAGO",
  BE: "BERGONDO",
};

// El share de PDFs se llega distinto según dónde corra la app:
//   · Windows (desarrollo): ruta UNC \\192.168.0.128\RPS\VENTAS\PEDIDOS (por VPN).
//   · Linux (deploy): punto de montaje CIFS, p.ej. /mnt/rps-pedidos.
// Se elige por plataforma para que el MISMO .env.local valga en ambas máquinas
// (una ruta /mnt/... no resuelve en Windows y una UNC no resuelve en Linux).
export const RAIZ_PDF =
  process.platform === "win32"
    ? (process.env.RPS_PEDIDOS_PDF_DIR_WIN ?? "\\\\192.168.0.128\\RPS\\VENTAS\\PEDIDOS")
    : (process.env.RPS_PEDIDOS_PDF_DIR ?? "/mnt/rps-pedidos");

/** Código de pedido de venta: el grupo 1 es el prefijo y el 2 el año. */
const CODIGO_RE = /^(AR|SA|BE)\.(\d{2})\.\d{5}$/i;

/** Ruta del PDF escaneado de un pedido, o null si el código no es de un pedido
 *  de venta (trabajo interno, OF sueltas: esos no tienen parte que escanear).
 *
 *  Devolver null y no lanzar es a propósito: los dos llamadores tienen que
 *  distinguir "no le toca tener PDF" de "debería tenerlo y no está", y con una
 *  excepción los dos casos se responderían igual. */
export function rutaPdfPedido(codigo: string): string | null {
  const m = CODIGO_RE.exec(codigo.trim());
  if (!m) return null;
  const anho = 2000 + Number(m[2]);
  return path.join(RAIZ_PDF, String(anho), DELEGACION[m[1].toUpperCase()], `${codigo}.pdf`);
}
