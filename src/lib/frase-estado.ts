import type { Pedido, Rol } from "./types";

// ─── "Quién lo lleva y por dónde va", en una frase ───────────────────────────
// La Lista tenía tres columnas para contar esto: los avatares del autor y del
// revisor por un lado, la fase por otro y los minutos por otro. Tres celdas
// separadas para una sola frase que en el taller se dice de corrido: "el de
// Mahou lo planteó Iván, 25 minutos, y lo tiene Tamara para revisar".
//
// Aquí se arma esa frase en trozos, sin JSX, para poder probarla: cada tramo es
// un rol con quién lo lleva, qué se está haciendo y cuánto se ha fichado.

export interface TramoEstado {
  rol: Rol;
  /** Nombres de quien lleva ese rol. Vacío = todavía no lo lleva nadie. */
  quien: string[];
  /** Qué pasa con ese rol, ya conjugado: "Planteando", "Planteado", "Por
   *  revisar"… Es lo que sustituye a la columna "Fase". */
  verbo: string;
  /** Minutos fichados en ese rol. 0 = no hay nada que enseñar todavía. */
  minutos: number;
  /** Alguien lo está fichando AHORA. Es lo que distingue "Planteando" de
   *  "Planteado 25m": el segundo es trabajo empezado y parado. */
  enMarcha: boolean;
}

const nombresDe = (ids: Array<string | null>, nombre: (id: string) => string): string[] => [
  ...new Set(ids.filter((id): id is string => id !== null)),
].map(nombre);

/** Los tramos de un pedido, en el orden del flujo: primero quien plantea y,
 *  cuando toque, quien revisa.
 *
 *  Mira el pedido ENTERO, no una OF: la Lista es de pedidos. Con varias OF en
 *  estados distintos manda lo que está más en marcha, igual que `faseDePedido`.
 *  Las anuladas no cuentan para nada — OT ya dijo que no las hace, y su tiempo
 *  fichado no debe inflar el del pedido. */
export function estadoDePedido(p: Pedido, nombre: (id: string) => string): TramoEstado[] {
  const ofs = p.ofs.filter((o) => o.estado !== "anulada");

  const planteoMin = ofs.reduce((n, o) => n + o.tiempoPlanteoMin, 0);
  const revisionMin = ofs.reduce((n, o) => n + o.tiempoRevisionMin, 0);
  const planteando = ofs.some((o) => o.fichandoRol === "plantear");
  const revisando = ofs.some((o) => o.fichandoRol === "revisar");

  const autores = nombresDe(ofs.map((o) => o.autorId), nombre);
  const revisores = nombresDe(ofs.map((o) => o.revisorId), nombre);

  // "Pasó de planteo" = el planteo de esa OF ya está entregado. `devuelta` NO
  // cuenta: volvió al autor y hay que rehacerla, que es justo lo que se quiere
  // ver de un vistazo.
  const entregadas = ofs.filter((o) =>
    o.estado === "por_revisar" || o.estado === "en_revision" || o.estado === "aprobada",
  ).length;
  const hayDevueltas = ofs.some((o) => o.estado === "devuelta");
  const todasEntregadas = ofs.length > 0 && entregadas === ofs.length;

  const planteo: TramoEstado = {
    rol: "plantear",
    quien: autores,
    minutos: planteoMin,
    enMarcha: planteando,
    verbo: planteando
      ? "Planteando"
      : hayDevueltas
        ? "Devuelto"
        : todasEntregadas
          ? "Planteado"
          : planteoMin > 0
            ? // Empezado y con el reloj parado. Es el caso que más se repite y
              // el que antes no se distinguía de "Planteando".
              "Planteado"
            : autores.length > 0
              ? "Sin empezar"
              : "Sin asignar",
    };

  // El tramo de revisión solo aparece cuando significa algo: hay revisor
  // nombrado, ya se ha fichado revisión, o el planteo está entregado y por
  // tanto le toca a alguien. Antes de eso, la flecha "→ —" solo ocupaba sitio.
  const tocaRevisar = revisores.length > 0 || revisionMin > 0 || entregadas > 0;
  if (!tocaRevisar) return [planteo];

  const aprobadas = ofs.filter((o) => o.estado === "aprobada").length;
  const revision: TramoEstado = {
    rol: "revisar",
    quien: revisores,
    minutos: revisionMin,
    enMarcha: revisando,
    verbo: revisando
      ? "Revisando"
      : hayDevueltas
        ? "Devuelto"
        : ofs.length > 0 && aprobadas === ofs.length
          ? "Revisado"
          : revisores.length > 0
            ? "Por revisar"
            : // Entregado y sin nadie a quien le toque: es lo que hay que
              // resolver, y decirlo con nombre propio ahorra abrir el pedido.
              "Falta revisor",
  };
  return [planteo, revision];
}
