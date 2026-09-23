"use client";

import { useState, type ReactNode, type Ref } from "react";
import type { Prioridad } from "@/lib/types";
import { PRIORIDAD } from "@/lib/estado";
import { FamiliaTag } from "./FamiliaTag";
import { negocioAparte } from "@/lib/negocio";

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

          El hueco del parte acaba donde empieza el panel: su ancho más su
          margen (`right-4`), y su propio `px-4` deja la calle entre los dos.

          El ancho va en PÍXELES y no en rem: el tamaño base baja con el alto de
          la pantalla (ver globals.css), y en rem la ficha se estrechaba justo
          en los monitores pequeños, de 512 a 448 px. En pantalla baja gana
          48 px y los cede el parte: a 1362 de ancho sobraba hoja y faltaba
          ficha. */}
      <div
        // Sin margen ARRIBA NI ABAJO: lo pone el propio visor (16 px, el mismo
        // que el panel de la derecha), así la hoja arranca y acaba a la misma
        // altura que el panel. Con el de aquí más el del visor, la hoja quedaba
        // 24 px más baja arriba y 64 px más corta abajo.
        className="overlay-in absolute inset-y-0 left-0 right-[calc(512px+1rem)] flex flex-col px-4 bajo:right-[calc(560px+1rem)]"
        onClick={onCerrar}
      >
        <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {visor}
        </div>
      </div>

      <aside className="pedido-panel glass-panel-strong drawer-in absolute inset-y-4 right-4 flex w-full max-w-[512px] flex-col rounded-xl bajo:max-w-[560px]">
        {/* Sin raya entre cabecera, cuerpo y pie: igual que en el tablero, lo
            que separa son los bloques con relieve, no líneas de 1 px. */}
        <header className="flex items-start gap-3 p-4 pb-2">
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
          <footer className="p-3 pt-0 text-[11px] leading-snug text-text-muted">
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
  extra,
}: {
  codigo: string;
  prioridad?: Prioridad;
  cliente?: string | null;
  negocio?: string | null;
  /** Ya escritos ("4 piezas", "Madrid"): quien los pinta sabe pluralizar. */
  datos?: readonly string[];
  familias?: readonly string[];
  /** Debajo de los datos: en Pendientes, el autor del pedido. Vivía en el
   *  cuerpo, entre las notas y las OF; aquí está siempre a la vista, que es
   *  donde se busca "de quién es esto". */
  extra?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-lg font-bold text-text">{codigo}</h2>
        {/* Solo la urgente, como en la bandeja: la normal salía en todos los
            pedidos y dejaba de destacar justo cuando corría prisa. */}
        {prioridad === 3 && (
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
        {negocioAparte(cliente, negocio) && (
          <span className="font-semibold text-text"> · {negocioAparte(cliente, negocio)}</span>
        )}
      </p>
      {(datos.length > 0 || familias.length > 0) && (
        <div className="mt-1 overflow-hidden text-xs">
          <div className={FILA_CON_PUNTOS}>
            {datos.map((d, i) => (
              // Por índice y no por `d`: son textos ya formateados ("4 piezas",
              // "Madrid") y dos podrían coincidir, lo que React vería como una
              // key duplicada. El orden es fijo (viene de quien llama), así que
              // el índice es una key estable.
              <span key={i} className={`flex items-center font-medium text-text ${PUNTO}`}>
                {d}
              </span>
            ))}
            {familias.length > 0 && (
              <span className={`flex items-center ${PUNTO}`}>
                <span className="flex flex-wrap gap-1">
                  {familias.map((f) => <FamiliaTag key={f} familia={f} />)}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
      {extra && <div className="mt-2">{extra}</div>}
    </div>
  );
}

/** Datos seguidos con un "·" entre ellos que NO se queda suelto al partirse
 *  la línea. Cada dato lleva su punto DELANTE (`PUNTO`) y la fila se corre
 *  12 px a la izquierda dentro de una caja que recorta (`overflow-hidden` en
 *  quien la envuelve): el punto del primero de CADA línea cae en ese margen y
 *  no se ve. Con el punto como elemento aparte, al partirse la línea bajaba
 *  al principio de la siguiente ("· Toldos · Otro"). */
const FILA_CON_PUNTOS = "-ml-3 flex flex-wrap items-center gap-y-1";
const PUNTO = "before:w-3 before:shrink-0 before:text-center before:text-text-muted before:content-['·']";

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
    <div className="mb-3 overflow-hidden text-xs">
      <dl className={FILA_CON_PUNTOS}>
        {datos.map(({ k, v }) => (
          <div key={k} className={`flex items-center ${PUNTO}`}>
            <dt className="sr-only">{k}</dt>
            <dd className="font-medium text-text" title={k}>{v}</dd>
          </div>
        ))}
        {familias.length > 0 && (
          <div className={`flex items-center ${PUNTO}`}>
            <dt className="sr-only">Familias</dt>
            <dd className="flex flex-wrap gap-1">
              {familias.map((f) => (
                <FamiliaTag key={f} familia={f} />
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/** Caja con rótulo del cuerpo de la ficha (el comentario del pedido). Mismo
 *  borde y fondo que documentos, notas y el resto de bloques. */
export function BloqueFicha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="bloque-3d mb-4 rounded-xl p-3">
      <h3 className={`mb-1.5 ${TITULO_BLOQUE}`}>{titulo}</h3>
      {children}
    </section>
  );
}

/** El rótulo de TODOS los bloques de la ficha: recorrido, OF, notas,
 *  comentario, documentos, tareas. Había cuatro estilos distintos dentro del
 *  mismo panel (10 px en mayúsculas, 12 px en mayúsculas, 12 px en minúsculas
 *  y uno suelto sin caja), y los bloques no parecían piezas del mismo juego. */
export const TITULO_BLOQUE = "text-[11px] font-semibold uppercase tracking-wide text-text-muted";

/** El comentario de venta, plegado a dos líneas. Casi siempre es el mismo
 *  texto legal de TGM (ocho líneas sobre la lona y la estructura del cliente)
 *  y ocupaba lo alto de la ficha, empujando abajo las OF, que es donde se
 *  trabaja. Lo que no es de siempre —"NO INCLUYE INSTALACIÓN ELÉCTRICA"— suele
 *  ir al principio y se sigue leyendo sin desplegar. */
export function ComentarioPedido({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false);
  const largo = texto.length > 160 || texto.includes("\n");
  return (
    <BloqueFicha titulo="Comentario del pedido">
      <p className={`whitespace-pre-line text-[11px] leading-snug text-text ${abierto || !largo ? "" : "line-clamp-2"}`}>
        {texto}
      </p>
      {largo && (
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="mt-1 text-[11px] font-semibold text-brand-800 hover:underline dark:text-brand-300"
        >
          {abierto ? "Ver menos" : "Ver más"}
        </button>
      )}
    </BloqueFicha>
  );
}
