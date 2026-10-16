"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Desplegable } from "./Desplegable";
import { GrupoAcordeon } from "./Acordeon";

// ─── Una fila que se abre ────────────────────────────────────────────────────
// Sale del Historial, que es donde se resolvió primero, y ahora la usan las
// cuatro listas. Hasta aquí cada pestaña tenía la suya: el mismo gesto —abrir
// un pedido para ver qué tiene dentro— se comportaba distinto según dónde
// estuvieras, y en Visitas ni siquiera se animaba.
//
// EL FONDO ES UN BOTÓN, y las cosas con acción propia (el código del pedido,
// un selector) son HERMANOS suyos, no hijos: anidados, un clic dispararía las
// dos acciones. Por eso `celdas` va con `pointer-events-none` en lo que solo
// se lee y sin él en lo que se pulsa — eso lo decide quien pinta las celdas.
//
// El acento de lo abierto es una barra dorada que recorre fila y detalle,
// sobre fondos opacos: el tinte translúcido se veía crema en claro.
//
// `tarjeta` cambia el corte entre filas de una raya de 1 px a un hueco con
// relieve propio (`bloque-3d`): sin agrupar (los pedidos van sueltos, en el
// orden que manden los filtros) 40 filas seguidas separadas solo por
// `border-b` se leen como un muro. Abierta, ese mismo relieve se invierte a
// `bloque-3d-hundido`: es el tacto de tecla pulsada que ya tienen los botones
// de la casa (`chip-3d:active`), y dice "esto está abierto" sin depender solo
// del tinte dorado. Solo se abre una fila a la vez (Iván, 15/10/2026), y el
// hundido marca dónde empieza y acaba ese pedido. Las otras
// tres vistas ya separan por bloque (Historial por día, Revisiones por
// estado) y no lo necesitan — cambiarles el corte de golpe sería un lenguaje
// nuevo sin que nadie lo haya pedido—, así que es opt-in y no el nuevo
// default.

export function FilaDesplegable({
  columnas,
  abierta,
  onAlternar,
  etiqueta,
  idDetalle,
  titulo,
  celdas,
  detalle,
  tarjeta = false,
  fichando = null,
}: {
  /** Alguien está fichando este pedido, y en qué papel: la fila se tiñe del
   *  color del rol (verde planteando, violeta revisando) y lleva su raya a la
   *  izquierda. Con solo el puntito, el pedido que tienes entre manos no se
   *  distinguía en la lista (Iván, 16/10/2026). */
  fichando?: "plantear" | "revisar" | null;
  /** La rejilla de columnas, literal (Tailwind no compila las concatenadas). */
  columnas: string;
  abierta: boolean;
  onAlternar: () => void;
  /** Qué se abre, para el lector de pantalla: "Desplegar AR.26.03914". */
  etiqueta: string;
  /** El id del contenedor del detalle, al que apunta `aria-controls`. */
  idDetalle: string;
  /** Lo que se cuenta al posar el ratón sobre la fila entera. Lo usa el
   *  Historial para decir cuándo se pasó a Producción y quién lo pasó: es un
   *  dato que no tiene columna y que no cabría en ninguna. */
  titulo?: string;
  celdas: ReactNode;
  detalle: ReactNode;
  /** Las listas de las pestañas (ver el comentario de arriba). Cada fila —con su
   *  detalle, si está abierta— pasa a ser su propia tarjeta con margen y
   *  relieve propio, en vez de compartir raya con la siguiente. */
  tarjeta?: boolean;
}) {
  const cabecera = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierta) return;
    const el = cabecera.current;
    if (!el) return;
    // El cierre animado del pedido anterior puede subir esta cabecera fuera
    // de pantalla. Se comprueba también al acabar esa animación, sin adivinar
    // su duración; con movimiento reducido basta el siguiente frame.
    const mostrar = () => {
      const rect = el.getBoundingClientRect();
      const techo = Math.max(0, document.querySelector(".glass-header")?.getBoundingClientRect().bottom ?? 0) + 8;
      // «Nearest» por sí solo alinea con el viewport y deja la fila detrás
      // de la cabecera sticky. El margen reserva también ese espacio.
      el.style.scrollMarginTop = `${techo}px`;
      if (rect.top < techo || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      }
    };
    const frame = requestAnimationFrame(mostrar);
    // Solo los cierres que ya están ocurriendo. Escuchar toda la lista para
    // siempre nos devolvería arriba al animar algo mientras leemos el detalle.
    const cierres = document.querySelectorAll(".desplegable-cierra");
    cierres.forEach((cierre) => cierre.addEventListener("animationend", mostrar, { once: true }));
    return () => {
      cancelAnimationFrame(frame);
      cierres.forEach((cierre) => cierre.removeEventListener("animationend", mostrar));
    };
  }, [abierta]);
  return (
    <div
      className={
        tarjeta
          ? abierta
            ? "relative mb-1.5 overflow-hidden rounded-lg bloque-3d-hundido last:mb-0"
            : "relative mb-1.5 overflow-hidden rounded-lg bloque-3d last:mb-0"
          : "relative border-b border-border last:border-b-0"
      }
    >
      {(abierta || fichando) && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 z-10 w-1 ${
            fichando === "plantear" ? "bg-emerald-500" : fichando === "revisar" ? "bg-violet-500" : "bg-brand-500"
          }`}
        />
      )}
      {/* Abierta: cabecera en el fondo de fila (blanco en claro), y debajo el
          detalle hundido en gris. El crema dorado translúcido se leía
          amarillento, y un gris en la cabecera hacía que el pedido abierto
          pareciera apagado (Iván, 15/10/2026). Después fue dorado oscuro en
          oscuro, y tampoco: ahora es la misma que cerrada (16/10/2026). La
          raya dorada de la izquierda dice cuál está abierto. */}
      <div
        ref={cabecera}
        className={`relative ${columnas} px-3 py-1.5 ${
          abierta ? "cabecera-abierta" : "hover:bg-surface-2"
        } ${fichando ? `fila-fichando-${fichando}` : ""}`}
      >
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={idDetalle}
          aria-label={`${abierta ? "Plegar" : "Desplegar"} ${etiqueta}`}
          title={titulo}
          // Este botón toca los cuatro bordes de la fila (`inset-0`), y el
          // foco de teclado de toda la app sale hacia FUERA
          // (`outline-offset: 1px`, en globals.css): el anillo caía justo
          // encima del borde de `BloqueLista`, que lo recorta con
          // `overflow-hidden` por los lados, y arriba y abajo en la primera y
          // la última fila. Con offset negativo el anillo se dibuja hacia
          // DENTRO, donde nada lo recorta.
          //
          // El `!` final NO es estético, es necesario: esa regla de
          // globals.css es CSS suelto, fuera de cualquier `@layer`, y Tailwind
          // v4 mete sus propias utilidades EN capas — en la cascada, lo suelto
          // gana siempre a lo que vive en una capa, aunque tenga menos
          // especificidad. Sin el `!` esta clase compila pero no hace nada:
          // se comprobó en el navegador con getComputedStyle (`outlineOffset`
          // se quedaba en "1px").
          className="absolute inset-0 cursor-pointer rounded-sm focus-visible:z-10 focus-visible:outline-offset-[-2px]!"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none grid size-6 place-items-center text-text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            className={`size-3.5 transition-transform motion-reduce:transition-none ${
              abierta ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {celdas}
      </div>

      {/* Envuelto y no `{abierta && …}`: si React lo quitara al pulsar, el
          contenido desaparecería de golpe y no habría nada que animar. Cerrado
          no ocupa nada — `Desplegable` devuelve null. */}
      <div id={idDetalle}>
        <Desplegable abierto={abierta}>
          <div className="detalle-hundido border-t border-border px-3 py-2">
            <GrupoAcordeon tipo="descripciones">{detalle}</GrupoAcordeon>
          </div>
        </Desplegable>
      </div>
    </div>
  );
}
