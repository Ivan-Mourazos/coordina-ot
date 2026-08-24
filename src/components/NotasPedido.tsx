"use client";

import { useCallback, useEffect, useState } from "react";
import type { Operario } from "@/lib/types";
import { NOTA_MAX, fmtCuandoNota, type NotaPedido } from "@/lib/nota-pedido";
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
  operarios: Operario[];
  /** El Historial no escribe: el pedido ya está cerrado para OT. */
  soloLectura?: boolean;
}) {
  const [notas, setNotas] = useState<NotaPedido[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [borrando, setBorrando] = useState<NotaPedido | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/notas?pedido=${encodeURIComponent(pedido)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { notas: NotaPedido[] };
      setNotas(d.notas);
      setError(null);
    } catch {
      setNotas([]);
      setError("No se pudieron cargar las notas.");
    }
  }, [pedido]);

  useEffect(() => {
    // Diferido con setTimeout(0), como en HistorialDrawer: un efecto no puede
    // llamar a setState de forma síncrona (react-hooks/set-state-in-effect).
    const id = setTimeout(() => {
      setNotas(null);
      setEditando(null);
      setEscribiendo(false);
      setBorrador("");
      void cargar();
    }, 0);
    return () => clearTimeout(id);
  }, [cargar]);

  /** Manda el cambio y recarga el hilo. Devuelve si salió bien, para que quien
   *  llama sepa si puede cerrar su editor. */
  async function mandar(init: RequestInit): Promise<boolean> {
    setGuardando(true);
    try {
      const r = await fetch("/api/notas", {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? "No se pudo guardar.");
        return false;
      }
      setError(null);
      await cargar();
      return true;
    } catch {
      setError("No se pudo guardar. Comprueba la conexión.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const opPorId = (id: string) => operarios.find((o) => o.id === id) ?? null;
  const ahora = new Date().toISOString();
  const puedeEscribir = !soloLectura && miId !== null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-highlight)] p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Notas{notas && notas.length > 0 ? ` (${notas.length})` : ""}
        </p>
        {/* El botón sale SIEMPRE que se pueda escribir, también con el hilo
            vacío: si no, nadie descubre que esto existe. */}
        {puedeEscribir && !escribiendo && editando === null && (
          <button
            type="button"
            onClick={() => setEscribiendo(true)}
            className="ml-auto rounded-lg border border-border px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            + Añadir
          </button>
        )}
      </div>

      {notas === null && <p className="text-[11px] text-text-muted">Cargando notas…</p>}

      {notas !== null && notas.length === 0 && !escribiendo && (
        <p className="text-[11px] leading-snug text-text-muted">
          Sin notas. Aquí se apunta lo que hay que saber de este pedido y no está en RPS.
        </p>
      )}

      <ul className="space-y-2">
        {(notas ?? []).map((n) => {
          const op = opPorId(n.operarioId);
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
              {op ? (
                <OpDot color={op.color} iniciales={op.iniciales} />
              ) : (
                // Quien ya no está en la plantilla no tiene color ni iniciales,
                // pero su nota sigue valiendo: hueco del mismo tamaño para que
                // las filas no bailen.
                <span className="size-4.5 shrink-0 rounded-full ring-1 ring-inset ring-border" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                  <span className="font-semibold text-text">{op?.nombre ?? n.operarioId}</span>
                  <span className="text-text-muted">· {fmtCuandoNota(n.creadoAt, ahora)}</span>
                  {n.editadoAt && (
                    <span
                      className="text-text-muted"
                      title={`Editada el ${fmtCuandoNota(n.editadoAt, ahora)}`}
                    >
                      · editado
                    </span>
                  )}
                  {mia && !soloLectura && (
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
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
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
  const largo = valor.trim().length;
  const vacio = largo === 0;
  const pasado = largo > NOTA_MAX;
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
        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] leading-snug text-text"
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
          className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:text-text"
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
