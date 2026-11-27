import type { Familia, FamiliaConocida } from "./types";

// Identidad visual por familia de producto: color + icono. Así un parte "se
// sabe lo que es" (remolque, lona, carpa…) de un vistazo, como cuando el papel
// estaba encima de la mesa. Los colores son tintes propios, separados de los
// colores de estado (esmeralda/violeta/ámbar) y de los de operario.
export interface FamiliaMeta {
  label: string;
  color: string; // acento (icono, tick)
  /** Trazado(s) SVG 24×24, stroke round. */
  icon: string;
  /** Puntos mínimos rellenos `[cx, cy, r]` (ollaos, eje de rueda, botones de
   *  capitoné, pivote, ojal). FamiliaIcon los pinta con `stroke` (y no `fill`)
   *  para que hereden el aclarado de `.dark .familia-icon` en modo oscuro. */
  iconDots?: readonly [number, number, number?][];
}

// ─── Subfamilias de RPS ──────────────────────────────────────────────────────
// Lo que de verdad agrupa el trabajo (ver familiaDeTexto en server/rps.ts). Los
// nombres salen de `GENProductSubFamily.Description`, quitándole el "(VENTAS)"
// que arrastran casi todas y que no dice nada aquí. Los colores mantienen el
// parentesco: lo que era toldo sigue en naranjas, lo de transporte en verdes.
const SUBFAMILIAS: Record<string, FamiliaMeta> = {
  PUERTAS: {
    // "Puerta", en singular y sin apellido: es de las que cuelgan de una sola
    // familia, así que "Suministro · Puertas" sobraría.
    label: "Puerta",
    color: "#b45309",
    // El MISMO icono que PUERTA: aquí se hacen puertas de lona y no merece la
    // pena distinguir dos dibujos que a 14 px no se distinguían (Iván, 27/11/2026).
    icon: "M5 4h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4zM5 8v12M19 8v12M3 20h3.5M17.5 20h3.5M5 11.5h14M5 15.8h14M10.6 14.6l2.8-2",
  },
  "TOLDO NUEVO": {
    label: "Toldo nuevo",
    color: "#c65a11",
    // marquesina a rayas con 3 ondas amplias de faldón y signo +
    icon: "M5 5h14l2.2 6H2.8zM9.5 5l-1 6M14.5 5l1 6M3 11v1.2a3 2.4 0 0 0 6 0a3 2.4 0 0 0 6 0a3 2.4 0 0 0 6 0V11M18 16v5M15.5 18.5h5",
  },
  REPARACIONES: {
    label: "Reparaciones",
    color: "#8b6534",
    // llave fija y destornillador cruzados en aspa
    icon: "M15.8 4.6a3.7 3.7 0 0 0-4.8 4.8l-6.2 6.2a1.7 1.7 0 0 0 2.4 2.4l6.2-6.2a3.7 3.7 0 0 0 4.8-4.8l-2.2 2.2-2.4-2.4zM4.2 5.4l1.2-1.2 2.4 2.4-1.2 1.2zM7.2 7.2l2.6 2.6M13.9 13.9l4.8 4.8a1.6 1.6 0 0 1-2.3 2.3l-4.8-4.8",
  },
  "ACCESORIOS TF": {
    label: "Accesorios toldo",
    color: "#a1662f",
    // manivela de toldo con anilla y tuerca hexagonal
    icon: "M6.5 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6.5 8v6.5l3 2V20M16.5 7l3.8 2.2v4.6L16.5 16l-3.8-2.2V9.2z",
    iconDots: [[16.5, 11.5, 1.15]],
  },
  LONASNUEVAS: {
    label: "Lonas nuevas",
    color: "#1673b1",
    // lona ondeante con ollaos y signo +
    icon: "M3.5 5.8q4-1.8 8 0t8 0V13M3.5 5.8v11.2q4 1.8 8 0M18 15.5v5M15.5 18h5",
    iconDots: [
      [7, 9.2, 1.05],
      [15.5, 9.2, 1.05],
      [7, 13.8, 1.05],
    ],
  },
  LONAS: {
    label: "Lonas",
    color: "#1673b1",
    // rollo cilíndrico de lona desplegándose con ollaos
    icon: "M6.5 8.5m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M6.5 5.3h11a3.2 3.2 0 0 1 0 6.4H6.5M6.5 11.7v7q6.2 1.6 12.5 0v-7.5",
    iconDots: [
      [6.5, 8.5, 0.95],
      [10.2, 15.5, 1.05],
      [15.5, 15.5, 1.05],
    ],
  },
  CONFECCION: {
    label: "Confección",
    color: "#7d3c98",
    // aguja con ojo alargado e hilo en S
    icon: "M4 20L15 9M15 9l2.2-2.2a1.7 1.7 0 0 1 2.4 2.4L17.4 11.4a1.7 1.7 0 0 1-2.4-2.4zM18.8 8.4c3 2.3 2.7 5.5-.4 7.3s-5.4 1-4.8 3.6c.5 1.5 3.1 1.6 6 .1",
  },
  YURTAS: {
    label: "Yurtas",
    color: "#2e8b57",
    // yurta con lucernario (toono), tejado cónico, celosía y puerta
    icon: "M9.5 4.2h5M2.8 10.8L9.5 6h5l6.7 4.8zM3.8 10.8V19.8h16.4v-9M9.8 19.8v-5.5h4.4v5.5M4.2 15.2h5.4M14.4 15.2h5.4M6.8 11v8.6M17.2 11v8.6",
  },
  CLONA: {
    label: "Cerramiento lona",
    color: "#0e7490",
    // cerramiento textil entre postes con tubo superior y ventana PVC
    icon: "M3 5h18M4.5 5v15M19.5 5v15M4.5 18q7.5 1.6 15 0M8 8.5h8v6.2H8zM10.5 12.8l3-2.4",
  },
  CBASTIDOR: {
    label: "Cerramiento bastidor",
    color: "#155e75",
    // bastidor metálico rígido con anclajes laterales, travesaños y riostra
    icon: "M4.5 4.5h15v15h-15zM2.5 7h2M19.5 7h2M2.5 17h2M19.5 17h2M4.5 13h15M12 4.5v15M4.5 19.5l7.5-6.5",
  },
  PORTALES: {
    label: "Portales",
    color: "#0891b2",
    // pórtico de entrada con cornisa recta, columnas y arco de medio punto
    icon: "M3 5h18M4.5 5v15M19.5 5v15M2.5 20h19M8 20v-7a4 4 0 0 1 8 0v7",
  },
  PISCINA: {
    label: "Piscina",
    color: "#0ea5e9",
    // vaso de piscina en planta con enrollador y cubierta tensada + olas
    icon: "M3.5 5.8h17a1 1 0 0 1 1 1v10.4a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V6.8a1 1 0 0 1 1-1zM3 4v16M11.5 5.8v12.4M3.5 12h8M14 9.8q1.4-1.5 2.8 0t2.8 0M14 14.5q1.4-1.5 2.8 0t2.8 0",
  },
  "CAPOTA NUEVA": {
    label: "Capota nueva",
    color: "#5a6472",
    // capota abatible curva con varillas en abanico
    icon: "M4 5v14.5M4 6.2c9 0 16 4.6 16 11.8H4M4 18C7 12.2 10.5 9.2 14.2 8.2M4 18c5.5-3.2 10-4.6 15.2-4.8M20 18v1.6",
    iconDots: [[4, 18, 1.15]],
  },
  SERIE50: {
    label: "Serie 50",
    color: "#2e8b57",
    // carpa estructural pórtico a dos aguas con cercha y pilares rectos
    icon: "M2.5 10.8L12 5L21.5 10.8M4 10.8h16M8.2 10.8L12 5l3.8 5.8M4.5 10.8V20M19.5 10.8V20M3 20h18M9.5 20v-5.5h5V20",
  },
};

const M: Record<FamiliaConocida, FamiliaMeta> = {
  ...(SUBFAMILIAS as Record<FamiliaConocida, FamiliaMeta>),
  TOLDO: {
    // En plural los seis grandes: son nombres de MONTÓN —"los toldos", "las
    // lonas"— y así se llaman al repartir el trabajo.
    label: "Toldos",
    color: "#c65a11",
    // toldo de fachada con lona a rayas, faldón frontal y brazos articulados
    icon: "M4.5 4.5h15L21.5 11H2.5zM9.5 4.5l-1 6.5M14.5 4.5l1 6.5M2.5 11v2.6h19V11M4.5 19.5l3-3 1-2.9M19.5 19.5l-3-3-1-2.9M3 19.5h3M18 19.5h3",
  },
  LONA: {
    label: "Lonas",
    color: "#1673b1",
    // paño de lona flexible con esquina doblada y ollaos
    icon: "M3.5 5.8q4.2-1.5 8.5 0t8.5 0v8.7L15.8 19q-6.2 1.2-12.3-.2zM15.8 19v-4.5h4.7",
    iconDots: [
      [7.2, 9, 1.1],
      [16.5, 9, 1.1],
      [7.2, 15.2, 1.1],
    ],
  },
  CARPA: {
    label: "Carpa",
    color: "#2e8b57",
    // carpa pagoda con mástil, techo curvo, postes y vientos tensados
    icon: "M12 2.5v2.2M12 4.7Q9.5 9.8 4.5 11.5h15Q14.5 9.8 12 4.7zM6.5 11.5V20M17.5 11.5V20M4.5 11.5L2.2 20M19.5 11.5L21.8 20M9.5 20v-4a2.5 2.5 0 0 1 5 0v4",
  },
  REMOLQUE: {
    label: "Remolques",
    color: "#5a6472",
    // remolque arquillado/entoldado con cartola, rueda con eje, lanza y jockey
    icon: "M3 14.5V8A2.5 2.5 0 0 1 5.5 5.5h8A2.5 2.5 0 0 1 16 8v6.5M3 11h13M3 14.5h3.6M12.4 14.5h8.2l1.2-1.8M18.5 14.5v3M6.8 15.8a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0",
    iconDots: [[9.5, 15.8, 0.85]],
  },
  TAPIZADO: {
    label: "Tapizado",
    color: "#b1487c",
    // sillón tapizado con respaldo capitoné, brazos y patas
    icon: "M5.5 11V7.5A2.5 2.5 0 0 1 8 5h8a2.5 2.5 0 0 1 2.5 2.5V11M3 13a2 2 0 0 1 2-2h1v4h12v-4h1a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM5.5 18v2.5M18.5 18v2.5",
    iconDots: [
      [9.5, 8.2, 1],
      [14.5, 8.2, 1],
    ],
  },
  REPARACION: {
    label: "Reparación",
    color: "#8b6534",
    // llave fija
    icon: "M15.2 5.3a4.3 4.3 0 0 0-5.6 5.6L4.3 16.2a1.9 1.9 0 0 0 2.7 2.7l5.3-5.3a4.3 4.3 0 0 0 5.6-5.6l-2.6 2.6-2.7-2.7z",
  },
  SUMINISTRO: {
    label: "Suministro",
    color: "#6b7280",
    // caja de material isométrica con precinto superior
    icon: "M12 3L3.5 7.5v9L12 21l8.5-4.5v-9zM3.5 7.5L12 12l8.5-4.5M12 12v9M7.8 5.2L16.2 9.8v3.2",
  },
  ESPECTACULO: {
    label: "Espectáculo",
    color: "#7c3aed",
    // escenario con telón recogido a ambos lados y foco cenital
    icon: "M3 4.5h18M3 19.5h18M4.5 4.5v15M19.5 4.5v15M10 4.5C9.6 9.5 7.4 11.8 4.5 12.6M14 4.5C14.4 9.5 16.6 11.8 19.5 12.6M4.5 12.6c1.8 1.5 2.7 4 2.7 6.9M19.5 12.6c-1.8 1.5-2.7 4-2.7 6.9M12 4.5v3.2M10.3 8h3.4",
  },
  FUNDA: {
    label: "Fundas",
    color: "#0f8a8a",
    // funda a medida con caída textil ondulada, costura y cremallera con tirador
    icon: "M7.5 4.5h9a2.5 2.5 0 0 1 2.5 2.2l1.2 11.5q-4 1.6-8.2 0t-8.2 0L5 6.7A2.5 2.5 0 0 1 7.5 4.5zM5.3 8.5h13.4M12 8.5v5.8",
    iconDots: [[12, 15.2, 1.15]],
  },
  PUERTA: {
    label: "Puertas",
    color: "#b45309",
    // puerta enrollable de lona: tambor arriba, guías y ventana de PVC
    icon: "M5 4h14a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4zM5 8v12M19 8v12M3 20h3.5M17.5 20h3.5M5 11.5h14M5 15.8h14M10.6 14.6l2.8-2",
  },
  CAMION: {
    label: "Camiones",
    color: "#3f6212",
    // camión tautliner con caja alta entoldada, cinchas de lona, cabina y ruedas
    icon: "M2.5 16.5V6.5a1 1 0 0 1 1-1H14V16.5H9.4M4.6 16.5H2.5M6.3 5.5v11M10.2 5.5v11M14 9h4l3.5 3.5v4H19.8M15.2 16.5H14M4.8 17a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M15.3 17a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0",
  },
  // ── Clientes que valen por una familia ───────────────────────────────────
  // Van todos en azules, aparte de los tintes de producto: no son un QUÉ, son
  // un QUIÉN, y conviene que eso se note sin leer el nombre.
  ASSAABLOY: {
    label: "Assa Abloy",
    color: "#1d4ed8",
    // puerta automática corredera con cabezal motorizado y flechas < | >
    icon: "M3.5 20V4.5h17V20M3.5 8.5h17M10.2 6.5h3.6M12 8.5V20M9.2 12.2L7 14.3l2.2 2.1M14.8 12.2L17 14.3l-2.2 2.1",
  },
  CCI: {
    label: "Carrocerías Int.",
    color: "#4338ca",
    // furgón carrozado aerodinámico de caja rígida (distinto del tautliner)
    icon: "M3 16.5V7.2a1.5 1.5 0 0 1 1.5-1.5h9l3.2 3.5 3.6 1.5a1.5 1.5 0 0 1 1 1.4v4.4h-1.8M9.3 16.5h6M3 16.5h1.8M13.5 5.7v10.8M5.8 10.5h5M13.5 9.8h4.5M4.8 17a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0M15.3 17a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0",
  },
  LAYHER: {
    label: "Layher",
    color: "#0369a1",
    // andamio modular: montantes, husillos, barandilla, plataforma y cruces
    icon: "M5.5 3.5v17M18.5 3.5v17M3.2 20.5h4.6M16.2 20.5h4.6M5.5 6.5h13M3.8 11.8h16.4M5.5 12.2L18.5 19.5M18.5 12.2L5.5 19.5",
  },
};

const FALLBACK: FamiliaMeta = {
  label: "Otro",
  color: "#6b7280",
  icon: "M4 11.3V5.5A1.5 1.5 0 0 1 5.5 4h5.8l8.4 8.4a1.5 1.5 0 0 1 0 2.1l-5.2 5.2a1.5 1.5 0 0 1-2.1 0z",
  iconDots: [[8.5, 8.5, 1.2]],
};

const bonito = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Meta de una familia. Acepta valores desconocidos (RPS puede traer familias
 *  nuevas: ESCENARIO, ESTRUCTURA…) y devuelve un tinte neutro con su nombre.
 *
 *  También entiende las COMPUESTAS, "FAMILIA/SUBFAMILIA", que son las
 *  subfamilias genéricas con su apellido (ver SUBFAMILIAS_GENERICAS en
 *  server/rps.ts). Ahí el color lo pone la familia —que es justo el eje que la
 *  subfamilia sola borraba: un camión y una carpa no son lo mismo aunque las
 *  dos lleven lona nueva— y el icono, la subfamilia, que es lo que se hace. */
export function familiaMeta(f: Familia | string): FamiliaMeta {
  const directa = M[f as FamiliaConocida];
  if (directa) return directa;

  // La barra manda aunque no se conozca ninguno de los dos trozos: RPS puede
  // clasificar mañana bajo una familia o una subfamilia que aquí no esté, y
  // "Agrigana · Lonas nuevas" se lee; "Agrigana/lonasnuevas", no.
  const corte = f.indexOf("/");
  if (corte > 0) {
    const base = M[f.slice(0, corte) as FamiliaConocida];
    const sub = M[f.slice(corte + 1) as FamiliaConocida];
    const icono = sub ?? base ?? FALLBACK;
    return {
      label: `${base?.label ?? bonito(f.slice(0, corte))} · ${
        sub?.label ?? bonito(f.slice(corte + 1))
      }`,
      color: base?.color ?? sub?.color ?? FALLBACK.color,
      icon: icono.icon,
      iconDots: icono.iconDots,
    };
  }

  return { ...FALLBACK, label: bonito(f) };
}

const planoFamilia = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(ES|S)$/, "");

/** La subfamilia de RPS, solo si dice algo que la familia no diga ya. RPS la
 *  escribe a su manera ("PUERTAS", "TOLDO NUEVO"), y comparada a pelo contra
 *  el id de la familia (`PUERTA`) una simple "S" la hacía distinta: la ficha
 *  pintaba "Puertas · PUERTAS". Se compara contra el id y contra el nombre
 *  visible, sin mayúsculas, acentos, espacios ni plural. */
export function subfamiliaAparte(familia: string, subfamilia: string | null | undefined): string | null {
  const sub = (subfamilia ?? "").trim();
  if (!sub) return null;
  const s = planoFamilia(sub);
  const meta = familiaMeta(familia);
  if (s === planoFamilia(familia) || s === planoFamilia(meta.label ?? "")) return null;
  return sub;
}
