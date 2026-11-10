import { inicialesDe } from "@/lib/nombre-persona";
import { tintaSobre } from "@/lib/tinta";

// ─── La cara de una persona en la pantalla de Belén ──────────────────────────
// Las iniciales en un círculo de color, como en la pantalla de entrar y en el
// tablero. Allí el color sale del catálogo del equipo; aquí sale gente de toda
// la nave (taller, logística), así que el color se deriva del NOMBRE: siempre
// el mismo para la misma persona, y la misma persona se reconoce de un vistazo
// en el paquete, en los tiempos y en las notas.

/** Tonos sobrios, separados entre sí, que se leen en claro y en oscuro. */
const PALETA = ["#3d7de0", "#1fa37a", "#9b3de0", "#d39a1c", "#e0533d", "#0d7f7f", "#4a5fd0", "#b0477a", "#5f8f2f", "#7a4fc0"];

export function colorDePersona(nombre: string): string {
  let h = 0;
  for (const c of nombre.toLocaleLowerCase("es")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

export function CaraPersona({ nombre, tamano = "sm" }: { nombre: string; tamano?: "xs" | "sm" }) {
  const color = colorDePersona(nombre);
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold ${
        tamano === "xs" ? "size-5 text-[9px]" : "size-7 text-[11px]"
      }`}
      style={{ background: color, color: tintaSobre(color) }}
    >
      {inicialesDe(nombre)}
    </span>
  );
}
