import type { Pedido, Rol } from "./types";
import { ofsQueCuentan, pedidoListoParaPasar, pedidoParado } from "./fases-tablero";

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
  /** Trabajo ya HECHO por esa persona (revisó, devolvió) o que aún no le toca
   *  (revisará). Se pinta apagado: lo que llama la vista es lo pendiente. */
  hecho?: boolean;
  /** De qué OF habla la línea, por sus códigos. Va en el `title`: en la fila
   *  no caben, y el detalle OF por OF ya está al desplegarla. */
  detalle?: string;
}

export interface EstadoPedido {
  /** Los tramos del flujo: quién plantea y, cuando toca, quién revisa. El de
   *  revisión puede ser MÁS DE UNO: una línea por revisor, cada una con lo
   *  suyo. */
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
  // Parado por Producción: no hay trabajo que contar y tampoco es que falte
  // asignarlo (ver faseDePedido).
  const parado = pedidoParado(p);

  const planteoMin = ofs.reduce((n, o) => n + o.tiempoPlanteoMin, 0);
  const revisionMin = ofs.reduce((n, o) => n + o.tiempoRevisionMin, 0);
  const planteando = ofs.some((o) => o.fichandoRol === "plantear");

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
    verbo: parado
      ? // Sin OF que contar y con algo detenido, todo lo de abajo daría "Sin
        // asignar", que es mentira: no es que no lo haya cogido nadie, es que
        // Producción lo tiene parado y no se puede tocar.
        "Parado por Producción"
      : planteando
        ? "Planteando"
        : hayDevueltas
          ? // Devuelta = la pelota vuelve al AUTOR. Los dos tramos decían
            // "Devuelto", la misma palabra dos veces, y ninguna decía a quién
            // le toca mover ficha: aquí es el autor quien tiene trabajo, y el
            // revisor ya hizo el suyo.
            "A corregir"
          : todasEntregadas
            ? "Planteado"
            : planteoMin > 0
              ? // Empezado y con el reloj parado. Es el caso que más se repite
                // y el que antes no se distinguía de "Planteando".
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
  // Todo aprobado: una sola línea con quien revisó. No hay nada que repartir.
  if (ofs.length > 0 && aprobadas === ofs.length) {
    return {
      tramos: [
        planteo,
        {
          rol: "revisar",
          quien: revisores,
          verbo: "Revisado",
          minutos: revisionMin,
          enMarcha: false,
          pendienteDeAlguien: revisores.length === 0,
        },
      ],
      listoParaPasar,
    };
  }

  // UNA LÍNEA POR REVISOR, CADA UNA CON LO SUYO.
  //
  // Era una sola línea para todo el pedido: nombraba a cualquiera que fuera
  // revisor de alguna OF y, si no estaban todas aprobadas, decía "Por revisar".
  // En un pedido con una OF ya revisada y otra añadida después salía "Jaime ·
  // Por revisar", y Jaime no tenía nada en Revisiones (AR.26.04671 y
  // AR.26.04633, 07/10/2026).
  //
  // Cada revisor cuenta SOLO sus OF, sin total del pedido: "1 de 3" daba a
  // entender que las otras dos también eran suyas, y pueden ser de otro o no
  // tener revisor todavía (Iván, 07/10/2026).
  const lineas: Array<{ orden: number; tramo: TramoEstado }> = [];
  const cuenta = (n: number) => (n === ofs.length ? "" : ` ${n} OF`);
  const codigos = (lista: typeof ofs) => lista.map((o) => o.codigo).join(", ");
  const min = (lista: typeof ofs) => lista.reduce((n, o) => n + o.tiempoRevisionMin, 0);

  const ids = [...new Set(ofs.map((o) => o.revisorId).filter((id): id is string => id !== null))];
  for (const id of ids) {
    const suyas = ofs.filter((o) => o.revisorId === id);
    const fichando = suyas.filter((o) => o.fichandoRol === "revisar");
    const esperando = suyas.filter((o) => o.estado === "por_revisar" || o.estado === "en_revision");
    const devueltas = suyas.filter((o) => o.estado === "devuelta");
    // `revisada` y no "tiene revisor": dice si la revisión ocurrió (types.ts).
    const revisadas = suyas.filter((o) => o.estado === "aprobada" && o.revisada === true);
    // Revisor ya nombrado en una OF que su autor aún no ha entregado.
    const sinEntregar = suyas.filter((o) => o.estado === "pendiente" || o.estado === "en_curso");

    // Manda lo que tiene pendiente; lo ya hecho se apunta detrás.
    const [verbo, lista, orden] =
      fichando.length > 0
        ? (["Revisando", fichando, 0] as const)
        : esperando.length > 0
          ? (["Por revisar", esperando, 1] as const)
          : devueltas.length > 0
            ? // En pasado: su parte está hecha. El trabajo pendiente está en la
              // línea de arriba ("A corregir").
              (["Devolvió", devueltas, 3] as const)
            : revisadas.length > 0
              ? (["Revisó", revisadas, 4] as const)
              : sinEntregar.length > 0
                ? (["Revisará", sinEntregar, 5] as const)
                : ([null, [], 9] as const);
    // Aprobada sin que él llegara a revisarla: no hay nada suyo que contar.
    if (verbo === null) continue;

    const pendiente = orden <= 1;
    const apunte = (n: number, una: string, varias: string) =>
      pendiente && n > 0 ? ` · ${n} ${n === 1 ? una : varias}` : "";
    const yaHechas =
      apunte(devueltas.length, "devuelta", "devueltas") +
      apunte(revisadas.length, "revisada", "revisadas");
    lineas.push({
      orden,
      tramo: {
        rol: "revisar",
        quien: [nombre(id)],
        verbo: `${verbo}${cuenta(lista.length)}${yaHechas}`,
        minutos: min(suyas),
        enMarcha: fichando.length > 0,
        pendienteDeAlguien: false,
        hecho: !pendiente,
        detalle: codigos(lista),
      },
    });
  }

  // Entregadas y sin nadie a quien le toque: es lo que hay que resolver, y
  // decirlo con nombre propio ahorra abrir el pedido.
  const sinRevisor = ofs.filter(
    (o) => o.revisorId === null && (o.estado === "por_revisar" || o.estado === "en_revision"),
  );
  if (sinRevisor.length > 0) {
    lineas.push({
      orden: 2,
      tramo: {
        rol: "revisar",
        quien: [],
        verbo: `Falta revisor${cuenta(sinRevisor.length)}`,
        minutos: min(sinRevisor),
        enMarcha: false,
        pendienteDeAlguien: true,
        detalle: codigos(sinRevisor),
      },
    });
  }

  // Primero lo que alguien tiene pendiente; debajo, lo ya hecho.
  lineas.sort((a, b) => a.orden - b.orden);
  return { tramos: [planteo, ...lineas.map((l) => l.tramo)], listoParaPasar };
}
