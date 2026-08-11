import type { Pedido, Rol } from "./types";
import { ofsQueCuentan, pedidoListoParaPasar } from "./fases-tablero";

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
  /** El tramo NO habla de trabajo hecho ni en marcha, sino de que falta algo:
   *  nadie asignado, o entregado y sin revisor. Se pinta apagado en vez de con
   *  el color del rol — verlo del mismo verde que "Planteado" hacía que un
   *  pedido que no ha tocado nadie pareciera terminado. */
  pendienteDeAlguien: boolean;
}

export interface EstadoPedido {
  /** Los tramos del flujo: quién plantea y, cuando toca, quién revisa. */
  tramos: TramoEstado[];
  /** Ya no le queda trabajo a OT: todas sus OF vivas están aprobadas y solo
   *  falta pasarlo a Producción.
   *
   *  Va aparte de los tramos porque no es de nadie: "Revisado" dice que Tamara
   *  terminó lo suyo, no que el PEDIDO esté listo — en uno de cuatro OF, la
   *  primera puede estar revisada y las otras tres sin empezar. Esto mira el
   *  pedido entero, con el mismo criterio que el botón de pasarlo. */
  listoParaPasar: boolean;
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
export function estadoDePedido(p: Pedido, nombre: (id: string) => string): EstadoPedido {
  // Las mismas OF con las que se decide la fase del pedido (`ofsQueCuentan`):
  // fuera anuladas, de taller y detenidas por Producción. Si no, un pedido con
  // el planteo aprobado seguía diciendo "Planteando" por una OF que ni es
  // nuestra ni podemos tocar.
  const ofs = ofsQueCuentan(p);

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
    pendienteDeAlguien: autores.length === 0,
    verbo: planteando
      ? "Planteando"
      : hayDevueltas
        ? // Devuelta = la pelota vuelve al AUTOR. Los dos tramos decían
          // "Devuelto", la misma palabra dos veces, y ninguna decía a quién le
          // toca mover ficha: aquí es el autor quien tiene trabajo, y el
          // revisor ya hizo el suyo.
          "A corregir"
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
  const listoParaPasar = pedidoListoParaPasar(p);
  if (!tocaRevisar) return { tramos: [planteo], listoParaPasar };

  const aprobadas = ofs.filter((o) => o.estado === "aprobada").length;
  const revision: TramoEstado = {
    rol: "revisar",
    quien: revisores,
    minutos: revisionMin,
    enMarcha: revisando,
    pendienteDeAlguien: revisores.length === 0,
    verbo: revisando
      ? "Revisando"
      : hayDevueltas
        ? // Lo que hizo el revisor, en pasado: su parte está hecha. El trabajo
          // pendiente está en la línea de arriba ("A corregir").
          "Devolvió"
        : ofs.length > 0 && aprobadas === ofs.length
          ? "Revisado"
          : revisores.length > 0
            ? "Por revisar"
            : // Entregado y sin nadie a quien le toque: es lo que hay que
              // resolver, y decirlo con nombre propio ahorra abrir el pedido.
              "Falta revisor",
  };
  return { tramos: [planteo, revision], listoParaPasar };
}
