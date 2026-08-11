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
    icon: "M4 4h16M5 8h14M5 12h14M5 16h14M7 20h10",
  },
  "TOLDO NUEVO": {
    label: "Toldo nuevo",
    color: "#c65a11",
    icon: "M3 9h18M3 9l2-4h14l2 4M4 9v2a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0V9M12 13v6",
  },
  REPARACIONES: {
    label: "Reparaciones",
    color: "#8b6534",
    icon: "M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2L15 12l-3-3z",
  },
  "ACCESORIOS TF": {
    label: "Accesorios toldo",
    color: "#a1662f",
    // piezas sueltas
    icon: "M4 6h6v6H4zM14 6l6 6-6 6M4 16h6",
  },
  LONASNUEVAS: {
    label: "Lonas nuevas",
    color: "#1673b1",
    icon: "M4 6q4 -2 8 0t8 0v12q-4 2 -8 0t-8 0zM8 9.5h.01M16 14.5h.01",
  },
  LONAS: {
    label: "Lonas",
    color: "#1673b1",
    icon: "M4 6q4 -2 8 0t8 0v12q-4 2 -8 0t-8 0zM8 9.5h.01M16 14.5h.01",
  },
  CONFECCION: {
    label: "Confección",
    color: "#7d3c98",
    // aguja e hilo
    icon: "M20 4 8 16M20 4l-2 6M20 4l-6 2M4 20l4-4M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  },
  YURTAS: {
    label: "Yurtas",
    color: "#2e8b57",
    // cúpula sobre base
    icon: "M3 20h18M4 20v-6a8 8 0 0 1 16 0v6M12 6V4",
  },
  CLONA: {
    label: "Cerramiento lona",
    color: "#0e7490",
    // paño colgado entre dos postes
    icon: "M4 4v16M20 4v16M4 6h16v10q-4 2 -8 0t-8 0",
  },
  CBASTIDOR: {
    label: "Cerramiento bastidor",
    color: "#155e75",
    // marco con travesaños
    icon: "M4 4h16v16H4zM4 10h16M12 10v10",
  },
  PORTALES: {
    label: "Portales",
    color: "#0891b2",
    // arco de entrada
    icon: "M4 21V10a8 8 0 0 1 16 0v11M9 21v-6h6v6",
  },
  PISCINA: {
    label: "Piscina",
    color: "#0ea5e9",
    // olas y escalera
    icon: "M2 16q3 -2 6 0t6 0 6 0M2 20q3 -2 6 0t6 0 6 0M8 14V5a2 2 0 0 1 4 0M14 14V5",
  },
  "CAPOTA NUEVA": {
    label: "Capota nueva",
    color: "#5a6472",
    icon: "M2 7h14v8H2zM16 11h6M7 15a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  },
  SERIE50: {
    label: "Serie 50",
    color: "#2e8b57",
    icon: "M12 4 2 20h20zM12 4c0 8-3 12-6 16M12 4c0 8 3 12 6 16",
  },
};

const M: Record<FamiliaConocida, FamiliaMeta> = {
  ...(SUBFAMILIAS as Record<FamiliaConocida, FamiliaMeta>),
  TOLDO: {
    // En plural los seis grandes: son nombres de MONTÓN —"los toldos", "las
    // lonas"— y así se llaman al repartir el trabajo.
    label: "Toldos",
    color: "#c65a11",
    // toldo: marquesina con faldón ondulado
    icon: "M3 9h18M3 9l2-4h14l2 4M4 9v2a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0V9M12 13v6",
  },
  LONA: {
    label: "Lonas",
    color: "#1673b1",
    // lona: tela ondeando con ollaos
    icon: "M4 6q4 -2 8 0t8 0v12q-4 2 -8 0t-8 0zM8 9.5h.01M16 14.5h.01",
  },
  CARPA: {
    label: "Carpa",
    color: "#2e8b57",
    // carpa: tienda
    icon: "M12 4 2 20h20zM12 4c0 8-3 12-6 16M12 4c0 8 3 12 6 16",
  },
  REMOLQUE: {
    label: "Remolques",
    color: "#5a6472",
    // remolque: caja + rueda + lanza
    icon: "M2 7h14v8H2zM16 11h6M7 15a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  },
  TAPIZADO: {
    label: "Tapizado",
    color: "#b1487c",
    // tapizado: cojín con botón
    icon: "M4 8q8 -4 16 0v8q-8 4 -16 0zM12 12h.01",
  },
  REPARACION: {
    label: "Reparación",
    color: "#8b6534",
    // llave inglesa
    icon: "M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2L15 12l-3-3z",
  },
  SUMINISTRO: {
    label: "Suministro",
    color: "#6b7280",
    // caja de material
    icon: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  },
  ESPECTACULO: {
    label: "Espectáculo",
    color: "#7c3aed",
    // escenario con focos
    icon: "M3 20h18M5 20V10h14v10M8 10 5 4M16 10l3-6M12 10V4",
  },
  FUNDA: {
    label: "Fundas",
    color: "#0f8a8a",
    // funda: cubierta con costura
    icon: "M5 8h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM5 8l2-4h10l2 4M9 12h6",
  },
  PUERTA: {
    label: "Puertas",
    color: "#b45309",
    // puerta enrollable: dintel y lamas
    icon: "M4 4h16M5 8h14M5 12h14M5 16h14M7 20h10",
  },
  CAMION: {
    label: "Camiones",
    color: "#3f6212",
    // cabina + caja + ruedas
    icon: "M2 7h11v9H2zM13 10h4l3 3v3h-7M5.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M15.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0",
  },
  // ── Clientes que valen por una familia ───────────────────────────────────
  // Van todos en azules, aparte de los tintes de producto: no son un QUÉ, son
  // un QUIÉN, y conviene que eso se note sin leer el nombre.
  ASSAABLOY: {
    label: "Assa Abloy",
    color: "#1d4ed8",
    // edificio con puerta: es todo puertas automáticas
    icon: "M4 21V6l8-3 8 3v15M9 21v-7h6v7M12 10h.01",
  },
  CCI: {
    label: "Carrocerías Int.",
    color: "#4338ca",
    // furgón
    icon: "M2 7h11v9H2zM13 10h4l3 3v3h-7M5.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M15.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0",
  },
  LAYHER: {
    label: "Layher",
    color: "#0369a1",
    // andamio: montantes y travesaños
    icon: "M4 3v18M12 3v18M20 3v18M4 8h16M4 14h16",
  },
};

const FALLBACK: FamiliaMeta = {
  label: "Otro",
  color: "#6b7280",
  icon: "M20 12l-8 8-9-9V4h7zM7.5 7.5h.01",
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
    return {
      label: `${base?.label ?? bonito(f.slice(0, corte))} · ${
        sub?.label ?? bonito(f.slice(corte + 1))
      }`,
      color: base?.color ?? sub?.color ?? FALLBACK.color,
      icon: sub?.icon ?? base?.icon ?? FALLBACK.icon,
    };
  }

  return { ...FALLBACK, label: bonito(f) };
}
