"use client";

import { useState } from "react";
import type { OF } from "@/lib/types";
import type { Seccion } from "@/lib/secciones";
import { ConfirmDialog } from "./ConfirmDialog";

/** «Reintentar la N»: spec 2026-09-15-material-gastado-y-cerrar-of-design.md,
 *  «Confirmado con Iván» punto 4. Sale en el cajón de cerradas en RPS, SOLO
 *  para el autor, cuando la trampa 2/02 dejó una gemela sin escribir. Escribe
 *  únicamente esa operación (`POST /api/fases/cerrar-of/reintentar-gemela`),
 *  que respeta las mismas reglas que el cierre: autor, modoFichaje(), el
 *  tiempo antes que la escritura y una relectura del estado justo antes.
 *
 *  Si sale bien, `onReintentado` refleja la marca sin la gemela y el botón
 *  desaparece solo (deja de haber `gemelaSinEscribir`). Si vuelve a fallar, el
 *  botón se queda y el error dice por qué. */
export function ReintentarGemelaInline({
  of,
  seccion,
  miId,
  onReintentado,
}: {
  of: OF;
  seccion: Seccion;
  miId: string;
  /** La gemela ya se escribió (o ya no hacía falta): el Board actualiza la
   *  marca de esta OF, sin la gemela pendiente. */
  onReintentado: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>, aviso?: string) => void;
}) {
  const gemela = of.cerradaRps?.gemelaSinEscribir;
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!gemela) return null;

  async function confirmarReintento() {
    setConfirmar(false);
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/fases/cerrar-of/reintentar-gemela", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ofId: of.id, seccion: seccion.id, operarioId: miId }),
      });
      const d = (await r.json().catch(() => null)) as
        | { ok: true; yaEstaba?: boolean; resuelta?: boolean }
        | { error: string }
        | null;
      if (!r.ok || !d || !("ok" in d)) {
        setError((d as { error?: string } | null)?.error ?? "No se ha podido escribir en RPS.");
        return;
      }
      onReintentado(
        of.id,
        { ...of.cerradaRps!, gemelaSinEscribir: undefined },
        d.resuelta
          ? `RPS ya no tenía la operación ${gemela}: no hacía falta reintentarla.`
          : d.yaEstaba
            ? `La operación ${gemela} ya estaba terminada en RPS.`
            : undefined,
      );
    } catch {
      setError("No se puede hablar con RPS ahora mismo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        disabled={enviando}
        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-text-muted ring-1 ring-border hover:bg-[var(--glass-highlight)] disabled:opacity-50"
      >
        {enviando ? "Reintentando…" : `Reintentar la ${gemela}`}
      </button>
      {error && (
        <p className="w-full text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        abierto={confirmar}
        titulo="Reintentar operación"
        mensaje={`Se intentará dar por terminada también la operación ${gemela} de la OF ${of.codigo} en RPS. La otra operación de esta OF ya está cerrada; esto solo escribe la que falta.`}
        tono="neutra"
        textoConfirmar="Reintentar"
        onConfirmar={() => void confirmarReintento()}
        onCancelar={() => setConfirmar(false)}
      />
    </>
  );
}
