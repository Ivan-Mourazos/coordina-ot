"use client";

import type { ReactNode, Ref } from "react";
import type { Prioridad } from "@/lib/types";
import { PRIORIDAD } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";

// ─── El marco de las dos fichas del pedido ───────────────────────────────────
// La de Pendientes (Drawer) y la del Historial (HistorialDrawer) enseñan el
// mismo pedido: el parte a la izquierda y un panel a la derecha con cabecera,
// cuerpo que desplaza y, en Pendientes, un pie. Cada una llevaba su copia del
// marco, y las copias se habían ido separando: la cabecera, los datos del
// pedido, el comentario de venta y la ✕ se pintaban casi igual, pero no igual.
//
// Aquí solo está el MARCO. Lo que cada ficha hace —fichar, revisar y pasar en
// una; consultar el trabajo cerrado en la otra— sigue en su componente.
//
// Las clases `pedido-panel` y `pedido-contenido` las usa globals.css para
// compactar la ficha en pantallas de poca altura (720p): no cambiarlas de sitio.

export function MarcoFicha({
  refModal,
  etiqueta,
  onCerrar,
  visor,
  cabecera,
  pie,
  encima,
  children,
}: {
  /** El contenedor que atrapa el foco (useFocoModal): cubre visor y panel. */
  refModal: Ref<HTMLDivElement>;
  /** Nombre del diálogo para el lector de pantalla. */
  etiqueta: string;
  onCerrar: () => void;
  /** Lo que se ve a la izquierda: el parte o el aviso de que no está. */
  visor: ReactNode;
  /** El Historial deja aire alrededor del parte y lo amplía aparte; en
   *  Pendientes ocupa todo el hueco. */
  cabecera: ReactNode;
  pie?: ReactNode;
  /** Lo que se abre por encima de la ficha (el parte ampliado, confirmar). */
  encima?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      ref={refModal}
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
      className="fixed inset-0 z-50"
    >
      <div className="telon-ficha overlay-in absolute inset-0" onClick={onCerrar} />

      {/* Las DOS piezas flotan sobre el telón y miden lo mismo: arrancan y
          acaban a la misma altura, con el mismo aire alrededor.

          Antes el parte llevaba su margen y el panel iba pegado a los tres
          bordes: dos hermanos con reglas distintas, y se notaba justo en la
          línea de arriba, donde uno empezaba 16 px más abajo que el otro.

          El hueco del parte acaba en 33rem —el ancho del panel (32rem) más su
          margen— y su propio `p-4` deja la calle entre los dos. */}
      <div
        className="overlay-in absolute inset-y-0 left-0 right-[33rem] flex flex-col p-4"
        onClick={onCerrar}
      >
        <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {visor}
        </div>
      </div>

      <aside className="pedido-panel glass-panel-strong drawer-in absolute inset-y-4 right-4 flex w-full max-w-lg flex-col rounded-xl">
        <header
          className="flex items-start gap-3 p-4"
          style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}
        >
          {cabecera}
          <button
            onClick={onCerrar}
            data-foco-inicial
            aria-label="Cerrar"
            title="Cerrar · Esc"
            className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
          >
            ✕
          </button>
        </header>

        <div className="pedido-contenido scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
          {children}
        </div>

        {pie && (
          <footer
            className="p-3 text-[11px] leading-snug text-text-muted"
            style={{ boxShadow: "inset 0 1px 0 0 var(--glass-border)" }}
          >
            {pie}
          </footer>
        )}
      </aside>

      {encima}
    </div>
  );
}

/** Código, prioridad, cliente · negocio y, si se pasan, los datos de identidad
 *  del pedido: cuántas piezas, dónde se entrega y de qué es.
 *
 *  ESOS TRES SUBIERON AQUÍ. Vivían sueltos en el cuerpo, que hace scroll: al
 *  bajar a las OF o al hilo de notas desaparecían, y son del mismo orden que
 *  el cliente — lo que identifica el pedido, no lo que se decide sobre él.
 *
 *  La prioridad falta mientras el Historial carga el detalle: el código ya se
 *  sabe, el resto todavía no. */
export function CabeceraFicha({
  codigo,
  prioridad,
  cliente,
  negocio,
  datos = [],
  familias = [],
}: {
  codigo: string;
  prioridad?: Prioridad;
  cliente?: string | null;
  negocio?: string | null;
  /** Ya escritos ("4 piezas", "Madrid"): quien los pinta sabe pluralizar. */
  datos?: readonly string[];
  familias?: readonly string[];
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-lg font-bold text-text">{codigo}</h2>
        {prioridad !== undefined && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: PRIORIDAD[prioridad].color, color: PRIORIDAD[prioridad].tinta }}
            title={`Prioridad ${PRIORIDAD[prioridad].label}`}
          >
            P{prioridad} {PRIORIDAD[prioridad].label}
          </span>
        )}
      </div>
      <p className="truncate text-sm text-text-muted">
        {cliente || "—"}
        {negocio && <span className="font-semibold text-text"> · {negocio}</span>}
      </p>
      {(datos.length > 0 || familias.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {datos.map((d, i) => (
            // Por índice y no por `d`: son textos ya formateados ("4 piezas",
            // "Madrid") y dos podrían coincidir, lo que React vería como una
            // key duplicada. El orden es fijo (viene de quien llama), así que
            // el índice es una key estable.
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="text-text-muted">·</span>}
              <span className="font-medium text-text">{d}</span>
            </span>
          ))}
          {familias.length > 0 && (
            <span className="flex items-center gap-2">
              {datos.length > 0 && <span aria-hidden="true" className="text-text-muted">·</span>}
              <span className="flex flex-wrap gap-1">
                {familias.map((f) => <FamiliaTag key={f} familia={f} />)}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Los mismos datos, en UNA línea: el rótulo de cada uno al pasar el ratón.
 *
 *  La rejilla de dos por dos gastaba seis líneas para cuatro valores, y en una
 *  ficha de 720 px de alto eso es la diferencia entre ver un centro de trabajo
 *  o verlos los tres. Los rótulos no se pierden: van en el `title` y en el
 *  lector de pantalla, que es donde hacen falta cuando el dato no se explica
 *  solo. Las familias entran aquí como un dato más. */
export function DatosEnLinea({
  datos,
  familias = [],
}: {
  datos: readonly { k: string; v: string }[];
  familias?: readonly string[];
}) {
  return (
    <dl className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {datos.map(({ k, v }, i) => (
        <div key={k} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-text-muted">·</span>}
          <dt className="sr-only">{k}</dt>
          <dd className="font-medium text-text" title={k}>{v}</dd>
        </div>
      ))}
      {familias.length > 0 && (
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-text-muted">·</span>
          <dt className="sr-only">Familias</dt>
          <dd className="flex flex-wrap gap-1">
            {familias.map((f) => (
              <FamiliaTag key={f} familia={f} />
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Caja con rótulo del cuerpo de la ficha (el comentario del pedido). Mismo
 *  borde y fondo que documentos, notas y el resto de bloques. */
export function BloqueFicha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {titulo}
      </h3>
      {children}
    </section>
  );
}
