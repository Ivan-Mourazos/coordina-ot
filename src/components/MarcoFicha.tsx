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
  visorConMargen = false,
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
  visorConMargen?: boolean;
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
      <div className="overlay-in absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onCerrar} />

      {/* El parte, en el hueco que deja el panel. Pulsar alrededor cierra. */}
      <div
        className={`overlay-in absolute inset-y-0 left-0 right-[32rem] flex flex-col ${visorConMargen ? "p-6" : ""}`}
        onClick={onCerrar}
      >
        <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {visor}
        </div>
      </div>

      <aside className="pedido-panel glass-panel-strong drawer-in absolute right-0 top-0 flex h-full w-full max-w-lg flex-col rounded-l-2xl">
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

/** Código, prioridad y cliente · negocio. La prioridad falta mientras el
 *  Historial carga el detalle: el código ya se sabe, el resto todavía no. */
export function CabeceraFicha({
  codigo,
  prioridad,
  cliente,
  negocio,
}: {
  codigo: string;
  prioridad?: Prioridad;
  cliente?: string | null;
  negocio?: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-lg font-bold text-text">{codigo}</h2>
        {prioridad !== undefined && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
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
    </div>
  );
}

/** Los datos sueltos del pedido, en dos columnas. */
export function DatosFicha({ children }: { children: ReactNode }) {
  return (
    <dl className="mb-4 grid grid-cols-2 content-start gap-x-4 gap-y-2.5 text-xs">{children}</dl>
  );
}

export function DatoFicha({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-text-muted">{k}</dt>
      <dd className="font-medium text-text">{v}</dd>
    </div>
  );
}

export function FamiliasFicha({ familias }: { familias: readonly string[] }) {
  return (
    <div className="col-span-2">
      <dt className="mb-1 text-text-muted">Familias</dt>
      <dd className="flex flex-wrap gap-1">
        {familias.map((f) => (
          <FamiliaTag key={f} familia={f} />
        ))}
      </dd>
    </div>
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
