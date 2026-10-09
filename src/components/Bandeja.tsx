"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { Operario, Prioridad } from "@/lib/types";
import { PRIORIDAD } from "@/lib/estado";
import { familiaMeta } from "@/lib/familia";
import { Desplegable } from "./Desplegable";
import { FamiliaIcon } from "./FamiliaTag";
import { PedidoCard, type Facet } from "./PedidoCard";
import { IconoBandeja } from "./Iconos";

/** Ancho mínimo de una tarjeta de parte, en px. Era 112 y bajó a 100 para
 *  que quepan más por fila: no menos, porque el código del pedido
 *  ("AR.26.04561", en mono a 11 px) tiene que leerse entero, y a 80 el parte
 *  era un sello de correos que no distinguía un croquis de un correo. La
 *  miniatura se genera a 420 px (ANCHO_MINIATURA), así que aguanta. */
const ANCHO_TARJETA = 100;

/** Plegado o no, por bloque y por navegador: es una preferencia de quien
 *  mira, no un dato del equipo. Hay quien quiere los detenidos siempre a la
 *  vista y quien no los quiere ver nunca, y lo mismo con «Sin asignar». */
function leerAbierto(clave: string): boolean {
  try {
    return localStorage.getItem(clave) !== "plegado";
  } catch {
    return true;
  }
}

function guardarAbierto(clave: string, abierto: boolean) {
  try {
    if (abierto) localStorage.removeItem(clave);
    else localStorage.setItem(clave, "plegado");
  } catch {
    // Sin almacenamiento se pliega igual; solo no se recuerda.
  }
}

/** Un bloque de la bandeja que se pliega desde su título.
 *
 *  Toda la fila es el botón y se ilumina al pasar por encima; el chevron va
 *  en su círculo y a la derecha dice qué hace pulsar. Con solo una flecha
 *  pequeña nadie adivinaba que se plegaba. Plegado, el título sigue diciendo
 *  cuántos hay. Arranca abierto: que nadie deje de ver nada sin haberlo
 *  elegido. */
function BloquePlegable({
  clave,
  cabecera,
  bajarAlAbrir = false,
  className = "",
  children,
}: {
  /** Clave del navegador donde se recuerda si está plegado. */
  clave: string;
  /** Icono, título y contador: lo que se ve con el bloque plegado. */
  cabecera: React.ReactNode;
  /** Al desplegar, la página baja hasta el bloque. Lo usan los detenidos, que
   *  están al fondo: abrirlos sin moverse dejaba las tarjetas fuera de la
   *  pantalla, como si no hubiera pasado nada. «Sin asignar» no lo necesita:
   *  ya está a la vista y moverle la página a alguien sin motivo desorienta. */
  bajarAlAbrir?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(() => leerAbierto(clave));
  const seccion = useRef<HTMLElement | null>(null);
  const cambiar = () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    guardarAbierto(clave, nuevo);
    // Solo al pulsar, nunca al cargar. Y esperando a que termine de abrirse
    // (`desplegar` dura 190 ms en globals.css): antes las tarjetas aún no
    // ocupan su alto, no hay sitio por debajo y el scroll se queda a medias.
    if (nuevo && bajarAlAbrir) {
      const sinAnimar = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(
        () => seccion.current?.scrollIntoView({ behavior: sinAnimar ? "auto" : "smooth", block: "start" }),
        sinAnimar ? 0 : 220,
      );
    }
  };
  return (
    <section ref={seccion} className={`scroll-mt-3 ${className}`}>
      <button
        type="button"
        onClick={cambiar}
        aria-expanded={abierto}
        aria-controls={id}
        className={`group ${abierto ? "mb-2.5" : ""} -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--glass-highlight)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}
      >
        <span className="glass-chip grid size-6 shrink-0 place-items-center rounded-full text-text transition-colors group-hover:border-brand-400">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`size-3.5 transition-transform motion-reduce:transition-none ${abierto ? "" : "-rotate-90"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {cabecera}
        <span className="glass-chip ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-text-muted transition-colors group-hover:text-text">
          {abierto ? "Ocultar" : "Mostrar"}
        </span>
      </button>
      <div id={id}>
        <Desplegable abierto={abierto}>{children}</Desplegable>
      </div>
    </section>
  );
}


/* ── cómo se reparten las tarjetas ── */

/** Lo que hace este panel con el desplegable NO es ordenar, es partir la
 *  bandeja en filas. Se llamaba `Orden` y venía de FilterBar, que además traía
 *  valores ajenos ("entrega", "cliente") que aquí no pintaban nada y caían a un
 *  fallback mudo: tres valores propios y cerrados dicen la verdad. */
export type Agrupacion = "ninguna" | "familia" | "prioridad";

/* ── helpers de orden ── */

/** Prioridad desc, luego fecha asc. */
function cmpPrioFecha(a: Facet, b: Facet) {
  const pa = PRIORIDAD[a.pedido.prioridad].rank;
  const pb = PRIORIDAD[b.pedido.prioridad].rank;
  if (pa !== pb) return pb - pa;
  return a.pedido.fechaPlanificacion.localeCompare(b.pedido.fechaPlanificacion);
}

/** Fecha asc, luego prioridad desc. */
function cmpFechaPrio(a: Facet, b: Facet) {
  const d = a.pedido.fechaPlanificacion.localeCompare(b.pedido.fechaPlanificacion);
  if (d !== 0) return d;
  return PRIORIDAD[b.pedido.prioridad].rank - PRIORIDAD[a.pedido.prioridad].rank;
}

/* ── scroll horizontal arrastrable ── */

function useGrabScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const state = useRef({ down: false, startX: 0, scrollLeft: 0 });

  const onDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    state.current = { down: true, startX: e.pageX, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!state.current.down) return;
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = state.current.scrollLeft - (e.pageX - state.current.startX);
  }, []);

  const onUp = useCallback(() => {
    state.current.down = false;
    const el = ref.current;
    if (el) {
      el.style.cursor = "grab";
      el.style.userSelect = "";
    }
  }, []);

  return { ref, onDown, onMove, onUp, onLeave: onUp };
}

/* ── fila con scroll horizontal (usada por Familia y Prioridad) ── */

function ScrollRow({
  claveGrupo,
  label,
  icon,
  count,
  facets,
  operarios,
  onOpen,
  onAsignar,
  miId,
}: {
  /** Identidad de la fila (familia o prioridad). Entra en la key de cada
   *  tarjeta porque agrupando por familia el mismo pedido sale en varias filas
   *  y `pedido.id` a secas ya no identifica a cuál pertenece la tarjeta. */
  claveGrupo: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  facets: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  onAsignar?: (f: Facet, operarioId: string) => void;
  miId?: string | null;
}) {
  const { ref, onDown, onMove, onUp, onLeave } = useGrabScroll();

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        {/* El rótulo en el color de texto, y el color de la prioridad solo en
            el punto de al lado: pintado del color de "Normal" (dorado) sobre el
            gris del fondo se leía a 1,8:1. */}
        <span className="text-xs font-bold text-text">{label}</span>
        <span className="rounded-full bg-[var(--glass-highlight)] px-1.5 text-[10px] font-semibold text-text-muted">
          {count}
        </span>
      </div>
      <div
        ref={ref}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onLeave}
        className="scroll-thin flex gap-2 overflow-x-auto pb-1"
        style={{ cursor: "grab" }}
      >
        {facets.map((f) => (
          <div key={`${claveGrupo}:${f.pedido.id}`} className="shrink-0" style={{ width: ANCHO_TARJETA }}>
            <PedidoCard
              facet={f}
              operarios={operarios}
              onOpen={onOpen}
              onAsignar={onAsignar}
              miId={miId}
              mostrarPrioridad
              mostrarFecha
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── componente principal ── */

export function Bandeja({
  facets,
  detenidos = [],
  operarios,
  onOpen,
  onAsignar,
  miId,
  agrupar = "ninguna",
  hayFiltrosActivos = false,
}: {
  facets: Facet[];
  /** Lo que Producción tiene detenido y nadie lleva. Va debajo, aparte: no se
   *  puede trabajar, pero hay que poder verlo sin cambiar el filtro. Siempre
   *  seguido y por fecha, se agrupe como se agrupe lo de arriba. */
  detenidos?: Facet[];
  operarios: Operario[];
  onOpen: (f: Facet) => void;
  onAsignar?: (f: Facet, operarioId: string) => void;
  miId?: string | null;
  agrupar?: Agrupacion;
  /** Si la barra de arriba está recortando. Con 0 partes cambia el mensaje:
   *  "no hay nada" y "no hay nada que pase el filtro" no son lo mismo. */
  hayFiltrosActivos?: boolean;
}) {
  const nOFs = facets.reduce((n, f) => n + f.ofs.length, 0);

  /* ── sin agrupar ── */
  const flat = useMemo(
    () => [...facets].sort(cmpFechaPrio),
    [facets],
  );
  const detenidosPorFecha = useMemo(() => [...detenidos].sort(cmpFechaPrio), [detenidos]);
  const nOFsDetenidas = detenidos.reduce((n, f) => n + f.ofs.length, 0);


  /* ── agrupado por familia ── */
  const filasFamilia = useMemo(() => {
    const map = new Map<string, Facet[]>();
    for (const f of facets) {
      // Un pedido con una OF de toldo y otra de lona sale en LAS DOS filas,
      // cada una con solo sus OF. Antes se miraba `ofs[0].familia` y el pedido
      // entero caía en toldo: quien vigilaba la fila "Lona" no veía trabajo que
      // sí era suyo. Estrechar `ofs` es lo mismo que hace la Lista al filtrar.
      for (const fam of new Set(f.ofs.map((o) => o.familia))) {
        const trozo: Facet = { ...f, ofs: f.ofs.filter((o) => o.familia === fam) };
        const arr = map.get(fam);
        if (arr) arr.push(trozo);
        else map.set(fam, [trozo]);
      }
    }
    return [...map.entries()]
      .map(([fam, items]) => ({
        familia: fam,
        meta: familiaMeta(fam),
        facets: items.sort(cmpPrioFecha),
      }))
      // De más pedidos a menos, que es como se pidió: agrupar por familia se
      // usa para ver DE QUÉ hay trabajo, y ahí lo primero que se busca es el
      // montón más alto. La urgencia sigue mandando dentro de cada fila (y
      // decide los empates entre filas del mismo tamaño), así que lo urgente
      // no se pierde: está a la izquierda de su fila.
      .sort(
        (a, b) =>
          b.facets.length - a.facets.length || cmpPrioFecha(a.facets[0], b.facets[0]),
      );
  }, [facets]);

  /* ── agrupado por prioridad ── */
  // Aquí no hay que partir nada: la prioridad es del pedido, no de cada OF, así
  // que un parte cae en una fila y solo en una. Y las filas van 3→2→1, que se
  // lee solo — a diferencia de familia, este orden no hacía falta cambiarlo.
  const filasPrioridad = useMemo(() => {
    const map = new Map<Prioridad, Facet[]>();
    for (const f of facets) {
      const p = f.pedido.prioridad;
      const arr = map.get(p);
      if (arr) arr.push(f);
      else map.set(p, [f]);
    }
    return ([3, 2, 1] as Prioridad[])
      .filter((p) => map.has(p))
      .map((p) => ({
        prioridad: p,
        meta: PRIORIDAD[p],
        facets: (map.get(p) ?? []).sort((a, b) =>
          a.pedido.fechaPlanificacion.localeCompare(b.pedido.fechaPlanificacion),
        ),
      }))
      // De más pedidos a menos, igual que agrupando por familia: agrupar sirve
      // para ver dónde está el bulto, y el montón más alto va arriba. La
      // urgencia decide los empates, así que con el mismo número de pedidos la
      // fila de urgentes sigue saliendo por encima.
      .sort((a, b) => b.facets.length - a.facets.length || b.prioridad - a.prioridad);
  }, [facets]);

  return (
    // En claro, SIN caja: la bandeja es el propio fondo de la página y los
    // partes quedan apoyados directamente sobre él. Sobre el panel blanco, las
    // miniaturas —blancas también, son escaneos— se confundían con lo que
    // tenían detrás. Igual en oscuro: el papel destaca solo contra el grafito
    // y la caja no aportaba nada.
    <div>
      <BloquePlegable
        clave="coordina-sin-asignar-plegado"
        cabecera={
          <>
            <IconoBandeja className="size-4.5 text-text-muted" />
            <h2 className="text-base font-bold text-text">Sin asignar</h2>
            <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[11px] font-bold text-brand-800 dark:text-brand-300">
              {facets.length} ped · {nOFs} OF
            </span>
          </>
        }
      >
        {facets.length === 0 ? (
          /* Decir "no hay partes sin asignar" cuando lo que pasa es que los
             filtros se los han comido es mentir: manda a buscar un problema que
             no existe (o a dar por hecho que no queda trabajo). */
          <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-border text-xs text-text-muted">
            {hayFiltrosActivos
              ? "Hay partes sin asignar, pero ninguno pasa los filtros actuales"
              : "No hay partes sin asignar"}
          </div>
        ) : agrupar === "familia" ? (
          /* ── FILAS POR FAMILIA ── */
          <div className="space-y-3">
            {filasFamilia.map((fila) => (
              <ScrollRow
                key={fila.familia}
                claveGrupo={fila.familia}
                label={fila.meta.label}
                icon={<FamiliaIcon familia={fila.familia} className="size-4" />}
                count={fila.facets.length}
                facets={fila.facets}
                operarios={operarios}
                onOpen={onOpen}
                onAsignar={onAsignar}
                miId={miId}
              />
            ))}
          </div>
        ) : agrupar === "prioridad" ? (
          /* ── FILAS POR PRIORIDAD ── */
          <div className="space-y-3">
            {filasPrioridad.map((fila) => (
              <ScrollRow
                key={fila.prioridad}
                claveGrupo={String(fila.prioridad)}
                label={fila.meta.label}
                icon={
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: fila.meta.color }}
                  />
                }
                count={fila.facets.length}
                facets={fila.facets}
                operarios={operarios}
                onOpen={onOpen}
                onAsignar={onAsignar}
                miId={miId}
              />
            ))}
          </div>
        ) : (
          /* ── SIN AGRUPAR: tarjetas seguidas, fecha en cada una. Va de última
               rama, no de primera con un fallback igual detrás: `Agrupacion`
               tiene tres valores y ya no hay ningún cuarto caso que cubrir. ── */
          /* Rejilla que se reparte el ancho, no tarjetas fijas que dejan un
             hueco a la derecha. `auto-fill` mete las que quepan a 112 px mínimo y
             `1fr` les da el sobrante a partes iguales: con 21 por fila, en vez de
             una franja muerta al final cada tarjeta crece un pelín. El PDF de
             dentro escala con ella, así que se lee mejor cuanto más ancha. */
          // Más aire ENTRE FILAS que entre columnas, y no por gusto: cada
          // tarjeta lleva ahora una línea de texto encima (fecha y prioridad) y
          // dos debajo (código y cliente), así que lo que se tocaba era el
          // cliente de una fila con la fecha de la siguiente. El hueco vertical
          // sale gratis; el horizontal se paga en tarjetas por fila, así que ahí
          // se sube lo justo.
          <div
            className="grid gap-x-2 gap-y-3"
            // Ver ANCHO_TARJETA.
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${ANCHO_TARJETA}px, 1fr))` }}
          >
            {flat.map((f) => (
              <div key={f.pedido.id} className="min-w-0">
                <PedidoCard
                  facet={f}
                  operarios={operarios}
                  onOpen={onOpen}
                  onAsignar={onAsignar}
                  miId={miId}
                  mostrarPrioridad
                  mostrarFecha
                />
              </div>
            ))}
          </div>
        )}
      </BloquePlegable>

      {/* ── DETENIDOS POR PRODUCCIÓN ── Debajo y con su raya: lo de arriba es
          lo que se puede coger. Mismas miniaturas, una detrás de otra. Se
          pliega como «Sin asignar», y al desplegarse baja hasta ellos. */}
      {detenidosPorFecha.length > 0 && (
        <BloquePlegable
          clave="coordina-detenidos-plegado"
          bajarAlAbrir
          className="mt-5 border-t border-[var(--glass-border)] pt-3"
          cabecera={
            <>
              <span className="size-2 rounded-full bg-amber-500" />
              <h2 className="text-base font-bold text-text">Detenidos por Producción</h2>
              <span
                className="rounded-full bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-600/25 dark:text-amber-300"
                title="Producción los tiene detenidos: no se pueden fichar. Cuando los libere suben solos a «Sin asignar»."
              >
                {detenidosPorFecha.length} ped · {nOFsDetenidas} OF
              </span>
            </>
          }
        >
          <div
            className="grid gap-x-2 gap-y-3"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${ANCHO_TARJETA}px, 1fr))` }}
          >
            {detenidosPorFecha.map((f) => (
              <div key={f.pedido.id} className="min-w-0">
                <PedidoCard
                  facet={f}
                  operarios={operarios}
                  onOpen={onOpen}
                  onAsignar={onAsignar}
                  miId={miId}
                  mostrarPrioridad
                  mostrarFecha
                />
              </div>
            ))}
          </div>
        </BloquePlegable>
      )}
    </div>
  );
}
