"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AccionDef } from "@/lib/acciones";
import { useFocoModal } from "@/lib/useFocoModal";

/** Estado compartido "acción pendiente de confirmar" (Drawer y otros sitios
 *  con botones de acción): pedirConfirmacion(a) abre el diálogo si la acción
 *  trae texto `confirmar`, o la ejecuta directamente si no; el componente
 *  pinta {dialogo} una vez. */
export function useConfirmacion(ejecutar: (a: AccionDef) => void) {
  const [confirmando, setConfirmando] = useState<AccionDef | null>(null);
  const pedirConfirmacion = (a: AccionDef) => {
    if (a.confirmar) setConfirmando(a);
    else ejecutar(a);
  };
  const dialogo = (
    <ConfirmDialog
      abierto={confirmando !== null}
      titulo={confirmando?.label ?? ""}
      mensaje={confirmando?.confirmar ?? ""}
      tono={confirmando?.tono}
      onConfirmar={() => {
        if (confirmando) ejecutar(confirmando);
        setConfirmando(null);
      }}
      onCancelar={() => setConfirmando(null)}
    />
  );
  return { confirmando, pedirConfirmacion, dialogo };
}

/** Confirmación ligera para acciones con consecuencias (aprobar, anular…).
 *  Escape o clic fuera cancelan; el botón de confirmar recibe el foco.
 *
 *  El foco lo lleva `useFocoModal`, el mismo de los drawers. Antes iba a mano
 *  y solo miraba sus dos botones: bastaba un clic en el mensaje o en el título
 *  —que no se pueden enfocar— para que el foco cayera en el `body`, y desde
 *  ahí el Tab se iba al tablero de detrás del telón con el diálogo abierto. */
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  tono = "primaria",
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo: string;
  /** Texto corrido, o contenido montado por quien abre el cuadro.
   *
   *  Casi todos los avisos son una frase y se quedan en `string`. Pero los hay
   *  que enseñan una LISTA —qué OF se van a fichar— y ahí una cadena con
   *  saltos de línea sale como un bloque gris parejo: la frase de entrada, los
   *  códigos y la advertencia del reparto pesan lo mismo y no se distingue
   *  dónde empieza cada cosa. Esos montan su propio contenido. */
  mensaje: ReactNode;
  tono?: "primaria" | "peligro" | "neutra";
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const modalRef = useFocoModal<HTMLDivElement>(abierto);
  // Para `aria-labelledby`/`aria-describedby`: el título y el mensaje se
  // anuncian leyendo el texto que ya está pintado, en vez de repetirlo en un
  // `aria-label` que hay que mantener a la par del <h3>.
  const idTitulo = useId();
  const idMensaje = useId();

  // Escape lo lleva este componente: `useFocoModal` solo se ocupa del foco.
  useEffect(() => {
    if (!abierto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  const toneCls =
    tono === "peligro"
      ? "bg-red-600 text-white hover:bg-red-700"
      : tono === "primaria"
        ? "bg-teal-600 text-white hover:bg-teal-700"
        : "bg-surface-2 text-text ring-1 ring-border hover:bg-[var(--glass-highlight)]";

  // ─── Por qué va en un PORTAL ───────────────────────────────────────────────
  // Se pintaba donde se declara —dentro de la fila de la OF, dentro del panel
  // del Drawer— y ahí `position: fixed` deja de ir contra la pantalla: basta
  // un ancestro con `filter`, `backdrop-filter` o `transform` (el telón
  // difuminado del Drawer, las animaciones de los paneles) para que ese
  // ancestro pase a ser el bloque contenedor. Resultado: el cuadro salía
  // encajado sobre la propia OF, con el telón oscureciendo por su cuenta el
  // resto de la pantalla —dos cosas a la vez, ninguna en su sitio— y el
  // difuminado repintándose con cada movimiento del ratón, que es el parpadeo.
  //
  // Colgado del `body` no hay ancestro que valga: el cuadro se centra en la
  // pantalla y el telón cubre lo que tiene que cubrir. Mismo patrón que el
  // desplegable de Select, incluida la marca `data-en-portal` para que los
  // paneles que se cierran al hacer clic fuera no se cierren al pulsar aquí.
  return createPortal(
    <div
      ref={modalRef}
      data-en-portal
      className="fixed inset-0 z-[60]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      aria-describedby={idMensaje}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancelar} />
      {/* Con techo (`max-h`) y en columna, y el que scrollea es el MENSAJE.
          Antes el cuadro crecía sin freno desde `top-1/3`: al fichar muchas OF
          el mensaje las enumera una por línea, así que a partir de unas cuantas
          el cuadro se salía por abajo de la pantalla y se llevaba con él los
          botones de Cancelar y Confirmar, sin forma de bajar hasta ellos —el
          telón es `fixed inset-0` y no scrollea. Dejando fuera del scroll el
          título y los botones, esos dos siempre se ven, y la lista larga se
          recorre por dentro. */}
      <div className="glass-panel-strong absolute left-1/2 top-1/3 flex max-h-[60vh] w-full max-w-sm -translate-x-1/2 flex-col rounded-2xl p-4">
        <h3 id={idTitulo} className="shrink-0 text-sm font-bold text-text">
          {titulo}
        </h3>
        {/* El texto corriente sigue yendo en un `<p>` con `whitespace-pre-line`,
            que es lo que necesitan las frases de una o dos líneas. Lo que llega
            montado se pinta tal cual: pintarlo dentro del `<p>` metería bloques
            dentro de un párrafo, que además es HTML inválido. */}
        <div
          id={idMensaje}
          className="scroll-thin mt-1.5 flex-1 overflow-y-auto text-sm text-text-muted"
        >
          {typeof mensaje === "string" ? (
            <p className="whitespace-pre-line">{mensaje}</p>
          ) : (
            mensaje
          )}
        </div>
        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <button
            onClick={onCancelar}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
          >
            Cancelar
          </button>
          <button
            // El foco entra en Confirmar, no en el primero de la fila: es la
            // respuesta que se espera, y con Shift+Tab se llega a Cancelar.
            data-foco-inicial
            onClick={onConfirmar}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${toneCls}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
