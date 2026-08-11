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

const M: Record<FamiliaConocida, FamiliaMeta> = {
  TOLDO: {
    label: "Toldo",
    color: "#c65a11",
    // toldo: marquesina con faldón ondulado
    icon: "M3 9h18M3 9l2-4h14l2 4M4 9v2a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0V9M12 13v6",
  },
  LONA: {
    label: "Lona",
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
    label: "Remolque",
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
    label: "Funda",
    color: "#0f8a8a",
    // funda: cubierta con costura
    icon: "M5 8h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM5 8l2-4h10l2 4M9 12h6",
  },
  PUERTA: {
    label: "Puerta rápida",
    color: "#b45309",
    // puerta enrollable: dintel y lamas
    icon: "M4 4h16M5 8h14M5 12h14M5 16h14M7 20h10",
  },
  CAMION: {
    label: "Camión",
    color: "#3f6212",
    // cabina + caja + ruedas
    icon: "M2 7h11v9H2zM13 10h4l3 3v3h-7M5.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M15.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0",
  },
  ASSAABLOY: {
    label: "Assa Abloy",
    // Azul suyo, distinto de los tintes de producto: no es un QUÉ, es un QUIÉN,
    // y conviene que se note a simple vista.
    color: "#1d4ed8",
    // edificio con puerta: es todo puertas automáticas
    icon: "M4 21V6l8-3 8 3v15M9 21v-7h6v7M12 10h.01",
  },
};

const FALLBACK: FamiliaMeta = {
  label: "Otro",
  color: "#6b7280",
  icon: "M20 12l-8 8-9-9V4h7zM7.5 7.5h.01",
};

/** Meta de una familia. Acepta valores desconocidos (RPS puede traer familias
 *  nuevas: ESCENARIO, ESTRUCTURA…) y devuelve un tinte neutro con su nombre. */
export function familiaMeta(f: Familia | string): FamiliaMeta {
  return (
    M[f as FamiliaConocida] ?? {
      ...FALLBACK,
      label: f.charAt(0) + f.slice(1).toLowerCase(),
    }
  );
}
