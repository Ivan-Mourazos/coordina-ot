import { grupoDe, type IdGrupo, type IdHerramienta } from "@/lib/herramientas-belen";

// ─── Iconos de las herramientas de Belén ─────────────────────────────────────
// Trazo de 24 px, 1,8 de grosor, como los demás iconos de Coordina (dibujados
// a mano: el proyecto no usa librería de iconos). El color va por GRUPO, para
// que de un vistazo se distinga lo de fechas, lo de tiempos o lo de material.

const TRAZOS: Record<IdHerramienta, React.ReactNode> = {
  // Calendario
  "entregas": (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17M8 14h2M14 14h2M8 17h2" />
    </>
  ),
  // Calendario con visto: la fecha que dio Producción
  "fechas-comprometidas": (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4" />
    </>
  ),
  // Bandera en una línea: no empezar antes de
  "delimitacion": (
    <>
      <path d="M5 21V4M5 4h11l-2 3.5L16 11H5" />
      <path d="M12 21h7" />
    </>
  ),
  // Bandeja de entrada: pedidos que han entrado y nadie ha tocado
  "sin-gestionar": (
    <>
      <path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z" />
      <path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
    </>
  ),
  // Chincheta de mapa: la visita (TP o COT)
  "tp-cot": (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  // Caja
  "bultos-subidos": (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  // Balanza: lo subido no cuadra con lo que se fabrica
  "desfase": (
    <>
      <path d="M12 4v16M8 20h8M5 7h14" />
      <path d="M5 7 2.5 13a2.6 2.6 0 0 0 5 0zM19 7l-2.5 6a2.6 2.6 0 0 0 5 0z" />
    </>
  ),
  // Reloj
  "sin-tiempos": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  // Reloj de arena: horas donde van minutos
  "tareas-horas": (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.5 3.5c0 4.5 4.5 5.5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5.5-4.5 8.5s4.5 4 4.5 8.5" />
    </>
  ),
  // Nube con flecha parada: fichajes que no suben
  "tiempos-sin-subir": (
    <>
      <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17 18.5" />
      <path d="M12 12.5v8M9 15.5l3-3 3 3" />
    </>
  ),
  // Triángulo de aviso: tiempo improductivo
  "incidencias": (
    <>
      <path d="M10.3 4.2 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5M12 17.2v.1" />
    </>
  ),
  // Camión
  "compras-pendientes": (
    <>
      <path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.5v3h-7z" />
      <circle cx="6.5" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  // Caja con visto: el material ya está
  "detenidas-material": (
    <>
      <path d="M20 11V7.5L12 3 4 7.5v9L12 21l2-1.1" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9M15.5 17.5l2 2 3.5-3.5" />
    </>
  ),
  // Dos engranajes en uno: varias máquinas
  "varias-maquinas": (
    <>
      <circle cx="8.5" cy="9" r="3" />
      <path d="M8.5 3.5V6M8.5 12v2.5M3 9h2.5M11.5 9H14M4.6 5.1l1.8 1.8M10.6 11.1l1.8 1.8M4.6 12.9l1.8-1.8M10.6 6.9l1.8-1.8" />
      <circle cx="16.5" cy="16.5" r="2.5" />
      <path d="M16.5 12v2M16.5 19v2M12 16.5h2M19 16.5h2" />
    </>
  ),
  // Hoja con interrogación: falta la descripción
  "sin-descripcion": (
    <>
      <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3.5V8h4.5M10.3 11.5a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.9.7-.9 1.3v.4M12 17.6v.1" />
    </>
  ),
};

/** Fondo tintado y trazo de cada grupo, en los dos temas. */
export const TINTE_GRUPO: Record<IdGrupo, string> = {
  fechas: "bg-blue-500/12 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  pedidos: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  bultos: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  tiempos: "bg-purple-500/12 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300",
  material: "bg-teal-500/12 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
  datos: "bg-slate-500/12 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
};

export function IconoHerramienta({ id, tam = "md" }: { id: string; tam?: "sm" | "md" }) {
  const trazo = TRAZOS[id as IdHerramienta];
  const caja = tam === "sm" ? "size-7 rounded-lg" : "size-9 rounded-xl";
  const svg = tam === "sm" ? "size-4" : "size-5";
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center ${caja} ${TINTE_GRUPO[grupoDe(id)]}`}>
      <svg viewBox="0 0 24 24" className={svg} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {trazo}
      </svg>
    </span>
  );
}
