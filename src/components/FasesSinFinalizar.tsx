"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOMBRE_SITUACION,
  finalizables,
  resumen,
  situacionDe,
  type FaseDeOF,
} from "@/lib/fase-pendiente";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── "Esta OF se quedó sin finalizar" ────────────────────────────────────────
// Se pasaba el pedido a Producción y la fase de OT se quedaba en pausa: nadie
// la cerraba, tenían que avisar desde el taller, y arreglarlo obligaba a abrir
// la herramienta vieja.
//
// SE CALLA CUANDO TODO ESTÁ BIEN. El caso normal es que no haya nada que
// hacer, y un bloque que dice "todo correcto" en cada pedido del Historial es
// ruido que enseña a no mirar. Solo aparece cuando hay algo pendiente.
//
// SOLO FASES DE OT. Las del taller no son cosa nuestra ni aunque estén a
// medias. Lo decide `esFaseDeOT` y lo vuelve a comprobar el servidor.
//
// SE LLAMA "OPERACIÓN" EN PANTALLA, no "fase". En RPS y aquí dentro el nombre
// del dato es `fase`, pero en la oficina y en el taller a esto se le llama
// operación, y quien lee la pantalla no tiene por qué saber cómo se llama por
// dentro. Los nombres del código se quedan como están: lo que cambia es lo que
// se lee.

interface FaseConBoletin extends FaseDeOF {
  idBoletin: string;
}

export function FasesSinFinalizar({
  ofs,
  miId,
}: {
  /** Códigos de OF del pedido en RPS ("0227619"). */
  ofs: readonly string[];
  miId: string | null;
}) {
  const [fases, setFases] = useState<FaseConBoletin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<FaseConBoletin | null>(null);
  const reqSeq = useRef(0);

  // La lista de OF llega como array nuevo en cada render del padre; sin esto el
  // efecto se dispararía en bucle. La clave es el contenido, no la identidad.
  const clave = ofs.join(",");

  const cargar = useCallback(async () => {
    const seq = ++reqSeq.current;
    if (!clave) {
      setFases([]);
      return;
    }
    try {
      const r = await fetch(`/api/fases?ofs=${encodeURIComponent(clave)}`, { cache: "no-store" });
      if (seq !== reqSeq.current) return; // respuesta de otro pedido: se ignora
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { fases: FaseConBoletin[] };
      if (seq !== reqSeq.current) return;
      setFases(d.fases);
      setError(null);
    } catch {
      if (seq !== reqSeq.current) return;
      // No se pone la lista a [] : "no lo sé" y "está todo bien" son cosas
      // distintas, y confundirlas aquí diría que el pedido está cerrado cuando
      // a lo mejor no lo está.
      setFases(null);
      setError("No se pudo consultar OLANET.");
    }
  }, [clave]);

  useEffect(() => {
    // Diferido: un efecto no puede llamar a setState de forma síncrona
    // (react-hooks/set-state-in-effect), mismo patrón que HistorialDrawer.
    const id = setTimeout(() => {
      setFases(null);
      setError(null);
      void cargar();
    }, 0);
    return () => clearTimeout(id);
  }, [cargar]);

  async function finalizar(f: FaseConBoletin) {
    setCerrando(f.idBoletin);
    setError(null);
    try {
      const r = await fetch("/api/fases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idBoletin: f.idBoletin, operarioId: miId }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) {
        setError(d?.error ?? "No se pudo finalizar.");
        return;
      }
      await cargar();
    } catch {
      setError("No se pudo finalizar. Comprueba la conexión.");
    } finally {
      setCerrando(null);
    }
  }

  // Mientras no se sabe nada, no se dice nada: el bloque solo existe cuando hay
  // algo que contar.
  if (fases === null && !error) return null;

  const pendientes = fases ? finalizables(fases) : [];
  const r = fases ? resumen(fases) : null;
  // Todo cerrado y sin errores: silencio. Es el caso normal.
  if (!error && pendientes.length === 0 && (r?.eliminadas ?? 0) === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
      <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
        {pendientes.length > 0
          ? pendientes.length === 1
            ? "Una operación de Oficina Técnica se quedó sin finalizar"
            : `${pendientes.length} operaciones de Oficina Técnica se quedaron sin finalizar`
          : "Operaciones de Oficina Técnica retiradas de OLANET"}
      </p>

      {pendientes.length > 0 && (
        <>
          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
            En RPS siguen abiertas. Se cierran con la fecha de hoy y a tu nombre.
          </p>
          <ul className="mt-2 space-y-1.5">
            {pendientes.map((f) => (
              <li key={f.idBoletin} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-mono font-semibold tabular-nums text-text">{f.of}</span>
                <span className="text-text-muted">
                  operación {f.fase} · {f.descripcion || "sin descripción"} · {f.maquina}
                </span>
                <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300">
                  {NOMBRE_SITUACION[situacionDe(f.estado)]}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmar(f)}
                  disabled={cerrando !== null || !miId}
                  title={miId ? undefined : "Elige quién eres antes de finalizar"}
                  className="ml-auto rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {cerrando === f.idBoletin ? "Finalizando…" : "Finalizar operación"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Se DICEN aunque no se puedan tocar: una fase que no está finalizada y
          no ofrece botón parece un fallo de la web. OLANET ya las retiró. */}
      {(r?.eliminadas ?? 0) > 0 && (
        <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
          {r!.eliminadas === 1
            ? "Otra operación fue retirada de OLANET y ya no se puede cerrar."
            : `Otras ${r!.eliminadas} operaciones fueron retiradas de OLANET y ya no se pueden cerrar.`}
        </p>
      )}

      {error && (
        <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        abierto={confirmar !== null}
        titulo="Finalizar la operación en RPS"
        tono="peligro"
        mensaje={
          confirmar
            ? `Se cierra la operación ${confirmar.fase} de la OF ${confirmar.of} (${confirmar.maquina}).\n\nEsto escribe en RPS con la fecha de hoy y a tu nombre. Producción la verá como terminada.`
            : ""
        }
        onConfirmar={() => {
          const f = confirmar;
          setConfirmar(null);
          if (f) void finalizar(f);
        }}
        onCancelar={() => setConfirmar(null)}
      />
    </div>
  );
}
