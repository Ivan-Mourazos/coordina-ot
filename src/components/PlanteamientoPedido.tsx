"use client";

import { useCallback, useEffect, useState } from "react";
import { textoImpresion, type VistaPlanteamiento } from "@/lib/planteamiento-textos";
import { TITULO_BLOQUE } from "./MarcoFicha";
import { useSoloLectura } from "./SoloLectura";

/** El planteamiento en la ficha del Historial: qué se imprimió y cuándo, y
 *  «Reimprimir». Pide sus datos aparte, como «gastado»: si falla, el resto de
 *  la ficha no se entera. Solo se monta en la sección OT. */
export function PlanteamientoPedido({ pedido, miId }: { pedido: string; miId: string | null }) {
  // Dirección (solo lectura) no puede reimprimir: la ruta le daría 403.
  const soloLectura = useSoloLectura();
  const [datos, setDatos] = useState<VistaPlanteamiento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(() => {
    fetch(`/api/planteamiento?pedido=${encodeURIComponent(pedido)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VistaPlanteamiento | null) => setDatos(d))
      .catch(() => setDatos(null));
  }, [pedido]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!datos || datos.modo === "off" || (datos.impresiones.length === 0 && datos.ficheros.length === 0)) return null;

  const reimprimir = async () => {
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/planteamiento/reimprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, operarioId: miId }),
      });
      setMensaje(r.ok ? "Enviado a la cola de impresión" : "No se ha podido reimprimir");
      cargar();
    } catch {
      setMensaje("No se ha podido reimprimir");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="mb-4" aria-label="Planteamiento">
      <h3 className={`mb-1.5 ${TITULO_BLOQUE}`}>Planteamiento</h3>
      <ul className="flex flex-col gap-1 text-xs text-text">
        {datos.impresiones.slice(0, 3).map((f) => (
          <li key={f.id}>{textoImpresion(f)}</li>
        ))}
      </ul>
      {datos.ficheros.length > 0 && miId && !soloLectura && (
        <button
          type="button"
          onClick={reimprimir}
          disabled={enviando}
          className="chip-3d mt-2 rounded-lg px-2.5 py-1 text-xs font-semibold text-text disabled:opacity-40"
        >
          Reimprimir
        </button>
      )}
      {mensaje && <p className="mt-1 text-[11px] text-text-muted">{mensaje}</p>}
    </section>
  );
}
