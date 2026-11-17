"use client";

import { inicialesDe } from "@/lib/nombre-persona";
import { tintaSobre } from "@/lib/tinta";
import { colorDeNombre } from "@/lib/color-persona";
import { colorElegidoDeNombre, useColoresPersona, type ColoresPersona } from "@/lib/useColoresPersona";

// ─── La cara de una persona en la pantalla de Belén ──────────────────────────
// Las iniciales en un círculo de color, como en la pantalla de entrar y en el
// tablero. Allí el color sale del catálogo del equipo; aquí sale gente de toda
// la nave (taller, logística), así que el color se deriva del NOMBRE: siempre
// el mismo para la misma persona, y la misma persona se reconoce de un vistazo
// en el paquete, en los tiempos y en las notas.

/** El color de alguien por su nombre: el que eligió, si tiene cuenta y lo
 *  eligió, o el que sale del nombre. */
export function colorDePersona(nombre: string, colores?: ColoresPersona): string {
  return (colores && colorElegidoDeNombre(colores, nombre)) ?? colorDeNombre(nombre);
}

export function CaraPersona({
  nombre,
  tamano = "sm",
  color: delQueLlama,
}: {
  nombre: string;
  tamano?: "xs" | "sm";
  /** Ya resuelto por quien llama (p. ej. por id de cuenta, que no se confunde
   *  entre dos personas con el mismo nombre). */
  color?: string;
}) {
  const colores = useColoresPersona();
  const color = delQueLlama ?? colorDePersona(nombre, colores);
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
