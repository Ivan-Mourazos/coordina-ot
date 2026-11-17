"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AccionDef } from "@/lib/acciones";

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
 *  Escape o clic fuera cancelan. El foco entra en Confirmar, salvo en las de
 *  `tono="peligro"`, donde entra en Cancelar. */
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  tono = "primaria",
  textoConfirmar = "Confirmar",
  ancho = false,
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
  /** El botón de confirmar dice "Confirmar" salvo que la acción tenga su
   *  propio verbo (p.ej. "Dar por terminada"): así el botón dice lo mismo que
   *  se acaba de pedir, en vez de un genérico que no dice qué va a pasar. */
  textoConfirmar?: string;
  /** Para los avisos con apartados (pasar a Producción): más ancho y más alto,
   *  que en el estrecho había que hacer scroll para ver qué se imprime. */
  ancho?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const dialogoRef = useRef<HTMLDialogElement>(null);
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  // Para `aria-labelledby`/`aria-describedby`: el título y el mensaje se
  // anuncian leyendo el texto que ya está pintado, en vez de repetirlo en un
  // `aria-label` que hay que mantener a la par del <h3>.
  const idTitulo = useId();
  const idMensaje = useId();
  const peligro = tono === "peligro";

  // Abrir y cerrar los manda `abierto`. En efecto de LAYOUT para que el
  // contenido nuevo y el `showModal()` lleguen juntos a pantalla, sin un
  // fotograma del cuadro vacío.
  useLayoutEffect(() => {
    const dlg = dialogoRef.current;
    if (!dlg) return;
    if (abierto && !dlg.open) {
      dlg.showModal();
      // El foco va a la respuesta esperada; en lo destructivo, a la salida
      // segura, para que un Enter de más no ejecute nada. Se hace aquí y no
      // con `autoFocus`: React no escribe ese atributo, enfoca él al montar,
      // y el botón se monta antes de que el cuadro se abra.
      (peligro ? cancelarRef : confirmarRef).current?.focus();
    } else if (!abierto && dlg.open) {
      dlg.close();
    }
  }, [abierto, peligro]);

  // Escape y el clic fuera (`closedby="any"`) los resuelve el navegador, que
  // cierra él solo; aquí solo se avisa al padre para que su estado no se quede
  // en "abierto". Si lo cerró el propio `abierto` (confirmar, cancelar), ya no
  // hay nada que avisar.
  const alCerrar = useEffectEvent(() => {
    if (abierto) onCancelar();
  });
  useEffect(() => {
    const dlg = dialogoRef.current;
    if (!dlg) return;
    const h = () => alCerrar();
    dlg.addEventListener("close", h);
    return () => dlg.removeEventListener("close", h);
  }, []);

  const toneCls = peligro
    ? "bg-red-600 text-white hover:bg-red-700"
    : tono === "primaria"
      ? "bg-teal-700 text-white hover:bg-teal-800"
      : "bg-surface-2 text-text ring-1 ring-border hover:bg-[var(--glass-highlight)]";

  // ─── <dialog> nativo con `showModal()` (17/11/2026) ────────────────────────
  // Antes era un `div` en un PORTAL al `body`, con telón, trampa de foco y
  // Escape propios. Iba en portal porque, pintado dentro de la fila o del
  // Drawer, un ancestro con `filter`/`transform` le robaba el `position: fixed`
  // y el cuadro salía encajado sobre la OF. El modal nativo va a la capa
  // superior del navegador: ningún ancestro le afecta, el resto de la página
  // queda inerte (ni clic ni Tab), Escape lo cierra y el foco vuelve solo a lo
  // que lo abrió. Sin `role`/`aria-modal`: los pone el propio <dialog>.
  //
  // `data-en-portal` se queda: los paneles que se cierran al pinchar fuera
  // (Herramientas, PanelFlotante) lo miran para no cerrarse al pulsar aquí, y
  // pinchar en el telón también cae en el <dialog>.
  //
  // Nada de `flex` a secas: pisaría el `display: none` del cuadro cerrado.
  // Con `open:flex` solo se aplica abierto.
  return (
    <dialog
      ref={dialogoRef}
      data-en-portal
      // Pinchar fuera cancela (Chrome 134+); sin soporte siguen Escape y el botón.
      {...({ closedby: "any" } as Record<string, string>)}
      aria-labelledby={idTitulo}
      aria-describedby={idMensaje}
      className={`dialogo-confirmar glass-panel-strong inset-x-0 mx-auto my-0 w-full flex-col rounded-2xl p-4 text-text open:flex backdrop:bg-black/50 backdrop:backdrop-blur-sm ${
        ancho ? "top-[8vh] max-h-[84vh] max-w-[min(48rem,calc(100vw-2rem))]" : "top-1/3 max-h-[60vh] max-w-sm"
      }`}
    >
      {/* Con techo (`max-h`) y en columna, y el que scrollea es el MENSAJE.
          Antes el cuadro crecía sin freno: al fichar muchas OF el mensaje las
          enumera una por línea y el cuadro se salía por abajo llevándose los
          botones. Dejando fuera del scroll el título y los botones, esos dos
          siempre se ven, y la lista larga se recorre por dentro.
          Cerrado no pinta nada dentro: algunos listados llevan uno por fila. */}
      {abierto && (
        <>
          <h3 id={idTitulo} className={`shrink-0 font-bold text-text ${ancho ? "text-base" : "text-sm"}`}>
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
              ref={cancelarRef}
              type="button"
              onClick={onCancelar}
              className="dialogo-cancelar rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-muted hover:text-text"
            >
              Cancelar
            </button>
            <button
              ref={confirmarRef}
              type="button"
              onClick={onConfirmar}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${toneCls}`}
            >
              {textoConfirmar}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
