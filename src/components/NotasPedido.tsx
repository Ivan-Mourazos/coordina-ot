"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Operario } from "@/lib/types";
import { NOTA_MAX, fmtCuandoNota, validarTexto, type NotaPedido } from "@/lib/nota-pedido";
import { OPERARIO_SISTEMA } from "@/lib/pedido-scan";
import { OpDot } from "./Select";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── El hilo de notas de un pedido ───────────────────────────────────────────
// El post-it que pidió Ángel: lo que sabe OT y no está en ningún campo de RPS
// —"falta confirmar el color", "hablar con Juan José antes de cortar"— para que
// no se pierda al pasar el trabajo a otro.
//
// Hilo y no una nota que se reescribe: al traspasar hace falta saber QUIÉN dijo
// qué y CUÁNDO, y con un solo texto el segundo que escribe borra al primero.
//
// El hilo se pide al abrir el pedido y se recarga al guardar. NO hay sondeo: si
// otro escribe mientras lo tienes abierto, lo ves al volver a abrirlo. Para
// seis personas y notas de dos líneas, montar tiempo real no compensa.

export function NotasPedido({
  pedido,
  miId,
  operarios,
  soloLectura = false,
}: {
  /** CÓDIGO del pedido ("AR.26.03914"), no su id interno: es lo que sobrevive
   *  al paso al Historial, donde el id cambia. */
  pedido: string;
  miId: string | null;
  operarios: readonly Operario[];
  /** El Historial no escribe: el pedido ya está cerrado para OT. */
  soloLectura?: boolean;
}) {
  const [notas, setNotas] = useState<NotaPedido[] | null>(null);
  // El error lleva si se arregla recargando. Un fallo de CARGA sí (de ahí el
  // botón "Reintentar"); uno de GUARDADO no, que recargar tiraría lo escrito.
  const [error, setError] = useState<{ texto: string; recargable: boolean } | null>(null);
  const [borrador, setBorrador] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [borrando, setBorrando] = useState<NotaPedido | null>(null);
  const [guardando, setGuardando] = useState(false);
  const reqSeq = useRef(0);
  // El pedido que se ve AHORA. `cargar` está memoizado por pedido
  // (`useCallback(..., [pedido])`) y `mandar` no: `mandar` cierra sobre el
  // pedido de SU propio render, así que al volver de un await no puede
  // fiarse de esa variable capturada para saber si sigue siendo el pedido en
  // pantalla. Este ref es la única fuente que se actualiza sola.
  const pedidoVigenteRef = useRef(pedido);
  useEffect(() => {
    pedidoVigenteRef.current = pedido;
  }, [pedido]);

  const cargar = useCallback(async () => {
    const seq = ++reqSeq.current;
    try {
      const r = await fetch(`/api/notas?pedido=${encodeURIComponent(pedido)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { notas: NotaPedido[] };
      if (seq !== reqSeq.current) return; // respuesta de un pedido anterior: la ignoramos
      setNotas(d.notas);
      setError(null);
    } catch {
      if (seq !== reqSeq.current) return;
      // NO se pone `notas` a [], que pintaría "Sin notas" sobre un pedido que
      // a lo mejor tiene el recado que se venía a leer. "No lo sé" y "no hay
      // ninguna" tienen que poder distinguirse: es justo el fallo que esta
      // función existe para evitar. Si ya había notas cargadas, se quedan.
      setError({ texto: "No se pudieron cargar las notas.", recargable: true });
    }
  }, [pedido]);

  useEffect(() => {
    // Diferido con setTimeout(0), como en HistorialDrawer: un efecto no puede
    // llamar a setState de forma síncrona (react-hooks/set-state-in-effect).
    const id = setTimeout(() => {
      setNotas(null);
      setError(null);
      setEditando(null);
      setEscribiendo(false);
      setBorrador("");
      setBorrando(null);
      void cargar();
    }, 0);
    return () => clearTimeout(id);
  }, [cargar]);

  /** Manda el cambio y recarga el hilo. Devuelve si salió bien, para que quien
   *  llama sepa si puede cerrar su editor. */
  async function mandar(init: RequestInit): Promise<boolean> {
    setGuardando(true);
    // Se limpia al EMPEZAR el intento, no solo cuando sale bien: si no, un
    // reintento tras un fallo seguiría enseñando el error del intento anterior
    // mientras este está en marcha.
    setError(null);
    try {
      const r = await fetch("/api/notas", {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        // Guard de PEDIDO, no solo de orden de llegada: el reqSeq de `cargar`
        // solo sabe qué respuesta es la más reciente, no de qué pedido es, y
        // esta puede haber tardado tanto que la pantalla ya muestra otro
        // pedido (sin key={pedido} la instancia sobrevive al cambio). Sin
        // este guard, pintaríamos aquí el error de un pedido sobre la ficha
        // de otro.
        if (pedidoVigenteRef.current !== pedido) return false;
        setError({ texto: d?.error ?? "No se pudo guardar.", recargable: false });
        return false;
      }
      // Mismo guard antes de recargar: `cargar` cierra sobre ESTE pedido, y
      // si ya no es el que se ve, llamarlo pintaría sus notas sobre las del
      // pedido actual.
      if (pedidoVigenteRef.current !== pedido) return false;
      await cargar();
      return true;
    } catch {
      if (pedidoVigenteRef.current !== pedido) return false; // idem
      setError({ texto: "No se pudo guardar. Comprueba la conexión.", recargable: false });
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const opPorId = (id: string) => operarios.find((o) => o.id === id) ?? null;
  const ahora = new Date().toISOString();
  const puedeEscribir = !soloLectura && miId !== null;
  // Con un editor abierto (nota nueva o edición) no se ofrece abrir otro: el
  // clic cambiaría de objetivo y lo escrito en el primero se perdería sin
  // avisar. Mismo candado que ya usa el botón "+ Añadir".
  const hayEditorAbierto = escribiendo || editando !== null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Notas{notas && notas.length > 0 ? ` (${notas.length})` : ""}
        </p>
        {/* El botón sale SIEMPRE que se pueda escribir, también con el hilo
            vacío: si no, nadie descubre que esto existe. */}
        {puedeEscribir && !hayEditorAbierto && (
          <button
            type="button"
            onClick={() => setEscribiendo(true)}
            className="ml-auto rounded-lg border border-border px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            + Añadir
          </button>
        )}
      </div>

      {/* Tres estados que NO se pueden confundir: aún no lo sé, falló, y no hay
          ninguna. Con el error delante no se dice ni "Cargando" ni "Sin notas":
          quien lee tiene que saber que puede haber un recado que no le llegó. */}
      {notas === null && !error && <p className="text-[11px] text-text-muted">Cargando notas…</p>}

      {notas !== null && notas.length === 0 && !escribiendo && !error && (
        <p className="text-[11px] leading-snug text-text-muted">
          Sin notas. Aquí se apunta lo que hay que saber de este pedido y no está en RPS.
        </p>
      )}

      <ul className="space-y-2">
        {(notas ?? []).map((n) => {
          const op = opPorId(n.operarioId);
          // Las notas que escribe la propia web (p. ej. "han vuelto a escanear
          // el parte"). No son de ningún operario, así que `mia` es falso para
          // todo el mundo y nadie puede editarlas ni borrarlas: son el registro
          // permanente. Solo se les pone cara y nombre, que si no salían con el
          // id crudo, "sistema", y un círculo gris.
          const delSistema = n.operarioId === OPERARIO_SISTEMA;
          const mia = n.operarioId === miId;
          if (editando?.id === n.id) {
            return (
              <li key={n.id}>
                <Editor
                  valor={editando.texto}
                  guardando={guardando}
                  onCambio={(texto) => setEditando({ id: n.id, texto })}
                  onGuardar={async () => {
                    const ok = await mandar({
                      method: "PATCH",
                      body: JSON.stringify({ id: n.id, operarioId: miId, texto: editando.texto }),
                    });
                    if (ok) setEditando(null);
                  }}
                  onCancelar={() => setEditando(null)}
                />
              </li>
            );
          }
          return (
            <li key={n.id} className="flex gap-2">
              {delSistema ? (
                <span
                  aria-hidden
                  className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[9px] text-amber-800 ring-1 ring-inset ring-amber-500/40 dark:text-amber-300"
                >
                  !
                </span>
              ) : op ? (
                <OpDot color={op.color} iniciales={op.iniciales} />
              ) : (
                // Quien ya no está en la plantilla no tiene color ni iniciales,
                // pero su nota sigue valiendo: hueco del mismo tamaño para que
                // las filas no bailen.
                <span className="size-4.5 shrink-0 rounded-full ring-1 ring-inset ring-border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                  <span className="font-semibold text-text">
                    {delSistema ? "CoordinaOT" : (op?.nombre ?? n.operarioId)}
                  </span>
                  <span className="text-text-muted">· {fmtCuandoNota(n.creadoAt, ahora)}</span>
                  {n.editadoAt && (
                    <span
                      className="text-text-muted"
                      title={`Editada el ${fmtCuandoNota(n.editadoAt, ahora)}`}
                    >
                      · editado
                    </span>
                  )}
                  {mia && !soloLectura && !hayEditorAbierto && (
                    <span className="ml-auto flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditando({ id: n.id, texto: n.texto })}
                        className="text-[10px] font-semibold text-text-muted hover:text-text"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setBorrando(n)}
                        className="text-[10px] font-semibold text-text-muted hover:text-red-600 dark:hover:text-red-400"
                      >
                        Borrar
                      </button>
                    </span>
                  )}
                </p>
                <p className="whitespace-pre-line text-[13px] leading-snug text-text">{n.texto}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {puedeEscribir && escribiendo && editando === null && (
        <div className="mt-2">
          <Editor
            valor={borrador}
            guardando={guardando}
            onCambio={setBorrador}
            onGuardar={async () => {
              const ok = await mandar({
                method: "POST",
                body: JSON.stringify({ pedido, operarioId: miId, texto: borrador }),
              });
              if (ok) {
                setBorrador("");
                setEscribiendo(false);
              }
            }}
            onCancelar={() => {
              setBorrador("");
              setEscribiendo(false);
            }}
          />
        </div>
      )}

      {error && (
        <div
          className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 px-2 py-1.5 text-[11px] text-text"
          role="alert"
        >
          {error.texto}
          {/* Mismo remedio que el drawer del historial: sin este botón la única
              salida era cerrar el pedido y volver a abrirlo. */}
          {error.recargable && (
            <button
              type="button"
              onClick={() => void cargar()}
              className="rounded-lg bg-surface px-2 py-0.5 text-[10px] font-semibold ring-1 ring-border hover:bg-surface-2"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        abierto={borrando !== null}
        titulo="Borrar la nota"
        tono="peligro"
        mensaje={`Se quita del hilo:\n\n"${borrando?.texto.slice(0, 160) ?? ""}"`}
        onConfirmar={() => {
          const n = borrando;
          setBorrando(null);
          if (n) {
            void mandar({
              method: "DELETE",
              body: JSON.stringify({ id: n.id, operarioId: miId }),
            });
          }
        }}
        onCancelar={() => setBorrando(null)}
      />
    </div>
  );
}

/** El cuadro de escribir, el mismo para una nota nueva y para editar una. */
function Editor({
  valor,
  onCambio,
  onGuardar,
  onCancelar,
  guardando,
}: {
  valor: string;
  onCambio: (v: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  guardando: boolean;
}) {
  // La validación es la misma que en la ruta (`validarTexto`): antes se
  // recalculaba aquí a mano con `valor.trim().length` y divergía, porque
  // `validarTexto` normaliza `\r\n` a `\n` antes de medir y esta copia no.
  const validacion = validarTexto(valor);
  const vacio = !validacion.ok && validacion.motivo === "vacio";
  const pasado = !validacion.ok && validacion.motivo === "largo";
  // El contador tiene que medir el mismo texto que acaba de medir
  // `validarTexto` (normalizado), no el crudo del textarea: `validarTexto` no
  // devuelve el texto cuando falla, así que se repite aquí la misma normalización.
  const largo = valor.replace(/\r\n/g, "\n").trim().length;
  return (
    <div>
      <textarea
        value={valor}
        autoFocus
        rows={3}
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancelar();
          // Ctrl/Cmd+Enter guarda: el Enter suelto hace falta para el salto de
          // línea, que estas notas suelen llevar más de una.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !vacio && !pasado) onGuardar();
        }}
        placeholder="Lo que hay que saber de este pedido…"
        aria-label="Nota del pedido"
        // Bloqueado mientras se guarda: el camino de éxito limpia el borrador,
        // así que lo que se teclease en esa ventana se iría sin avisar.
        disabled={guardando}
        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] leading-snug text-text disabled:opacity-60"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onGuardar}
          disabled={vacio || pasado || guardando}
          className="rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:text-text disabled:opacity-50"
        >
          Cancelar
        </button>
        {pasado && (
          <span className="text-[10px] text-red-600 dark:text-red-400">
            {largo} de {NOTA_MAX} caracteres
          </span>
        )}
      </div>
    </div>
  );
}
