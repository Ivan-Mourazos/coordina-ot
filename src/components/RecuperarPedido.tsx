"use client";

import { useState } from "react";
import type { Operario } from "@/lib/types";
import { fmtDiaMesAno } from "@/lib/fechas";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── "Volver a plantear el pedido" ───────────────────────────────────────────
// Sección 3 de la spec del 15/09/2026. Vuelve el pedido ENTERO; qué OF se
// reabren se elige aquí, con TODAS marcadas por defecto — es lo que se
// entiende por "recuperar el pedido", y quien sabe cuál hay que corregir
// desmarca el resto.

interface OfARecuperar {
  ofId: string;
  codigo: string;
  descripcion: string;
  autorId: string | null;
  fichable: boolean;
}

interface RespuestaRecuperar {
  ofs: OfARecuperar[];
  entregado: boolean;
  fechaEntregado: string | null;
}

export function RecuperarPedido({
  pedido,
  seccion,
  miId,
  operarios,
  onRecuperado,
}: {
  pedido: string;
  seccion: string;
  miId: string | null;
  operarios: readonly Operario[];
  /** El servidor ya recuperó el pedido: la ficha se cierra y el panel lo
   *  enseñará en cuanto se refresque (la consulta tarda de 7 a 15 s, así que
   *  no hay nada que esperar aquí). */
  onRecuperado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<RespuestaRecuperar | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  async function abrir() {
    setError(null);
    setCargando(true);
    try {
      const r = await fetch(`/api/historial/${pedido}/recuperar?seccion=${seccion}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as RespuestaRecuperar;
      setDatos(d);
      setMarcadas(new Set(d.ofs.map((o) => o.ofId))); // todas marcadas por defecto
      setAbierto(true);
    } catch {
      setError("No se puede consultar RPS ahora mismo. No se ha tocado nada.");
    } finally {
      setCargando(false);
    }
  }

  function alternar(ofId: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (!s.delete(ofId)) s.add(ofId);
      return s;
    });
  }

  async function confirmar() {
    if (marcadas.size === 0) {
      setError("Marca al menos una OF para volver a plantear el pedido.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/historial/${pedido}/recuperar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ofIds: [...marcadas], seccion, operarioId: miId }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: true; error?: string } | null;
      if (!r.ok || !d?.ok) {
        setError(d?.error ?? "No se ha podido recuperar el pedido.");
        return;
      }
      setAbierto(false);
      onRecuperado();
    } catch {
      setError("No se ha podido recuperar el pedido. Comprueba la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  const nombreDe = (id: string | null) => (id ? (operarios.find((o) => o.id === id)?.nombre ?? id) : null);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => void abrir()}
        disabled={cargando}
        // `chip-3d`, el botón de la casa. Con solo un borde gris sobre el
        // panel claro se leía como una línea de texto y no como algo que se
        // pulsa: el canto de 1 px se perdía contra el fondo del panel.
        className="chip-3d rounded-lg px-2.5 py-1 text-xs font-semibold text-text disabled:opacity-50"
      >
        {cargando ? "Consultando…" : "Volver a plantear el pedido"}
      </button>
      {error && !abierto && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        abierto={abierto && datos !== null}
        titulo={`Volver a plantear ${pedido}`}
        tono="primaria"
        textoConfirmar={enviando ? "Volviendo a plantear…" : "Volver a plantear"}
        mensaje={
          datos && (
            <div className="space-y-2">
              {datos.entregado && (
                <p>
                  Este pedido ya se entregó al cliente
                  {datos.fechaEntregado ? ` el ${fmtDiaMesAno(datos.fechaEntregado)}` : ""}.
                </p>
              )}
              <p>
                El pedido vuelve al panel y las OF marcadas vuelven a planteando, con su autor y su
                revisor de antes. Las demás vuelven aprobadas, para que se vea el pedido entero.
              </p>
              <ul className="space-y-1.5">
                {datos.ofs.map((o) => (
                  <li key={o.ofId}>
                    <label className="flex items-start gap-1.5">
                      <input
                        type="checkbox"
                        checked={marcadas.has(o.ofId)}
                        onChange={() => alternar(o.ofId)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-mono font-semibold text-text">{o.codigo}</span> —{" "}
                        {o.descripcion || "(sin descripción)"}, {nombreDe(o.autorId) ?? "sin autor: quedarás tú"}
                        {!o.fichable && (
                          <span className="mt-0.5 block text-amber-700 dark:text-amber-400">
                            RPS no deja fichar en esta OF (FINALIZADA). Si hay que echarle tiempo, pide a
                            Producción que la vuelva a lanzar.
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p>
                En RPS siguen terminadas. En cuanto alguien fiche en una, Producción la verá empezada
                hasta que se vuelva a pasar el pedido.
              </p>
              {error && (
                <p className="text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}
            </div>
          )
        }
        onConfirmar={() => void confirmar()}
        onCancelar={() => setAbierto(false)}
      />
    </div>
  );
}
