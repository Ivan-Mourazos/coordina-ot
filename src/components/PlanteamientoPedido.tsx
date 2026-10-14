"use client";

import { useCallback, useEffect, useState } from "react";
import { textoCorreo, textoImpresion, type VistaPlanteamiento } from "@/lib/planteamiento-textos";
import { TITULO_BLOQUE } from "./MarcoFicha";
import { useSoloLectura } from "./SoloLectura";

/** El planteamiento en la ficha del Historial: qué se imprimió y qué se mandó
 *  por correo, y cuándo, con «Reimprimir» y «Reenviar». Pide sus datos aparte, como «gastado»: si falla, el resto de
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

  if (!datos) return null;
  const correo = datos.correo;
  const impresionViva = datos.modo !== "off";
  const correoVivo = !!correo && correo.modo !== "off";
  // Con las dos cosas apagadas, o sin nada que contar, el bloque no sale.
  const hayAlgo = datos.impresiones.length > 0 || (correo?.envios.length ?? 0) > 0 || datos.ficheros.length > 0;
  if ((!impresionViva && !correoVivo) || !hayAlgo) return null;
  const puedeActuar = !!miId && !soloLectura;

  const reenviar = async () => {
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/planteamiento/reenviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, operarioId: miId }),
      });
      setMensaje(r.ok ? "Correo en cola para reenviar" : "No se ha podido reenviar");
      cargar();
    } catch {
      setMensaje("No se ha podido reenviar");
    } finally {
      setEnviando(false);
    }
  };

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
    <section className="mb-4" aria-label="Planteamiento enviado a Producción">
      {/* No «Planteamiento» a secas: justo encima está la carpeta Planteamiento
          de los documentos de RPS, que es el PDF archivado; esto es lo que
          CoordinaOT hizo con él al pasar (Iván, 14/10/2026). */}
      <h3 className={`mb-1.5 ${TITULO_BLOQUE}`}>Planteamiento enviado a Producción</h3>
      <ul className="flex flex-col gap-1 text-xs text-text">
        {datos.impresiones.slice(0, 3).map((f) => (
          <li key={`i${f.id}`}>{textoImpresion(f)}</li>
        ))}
        {correo?.envios.slice(0, 3).map((f) => (
          <li key={`c${f.id}`}>{textoCorreo(f)}</li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        {impresionViva && datos.ficheros.length > 0 && puedeActuar && (
          <button
            type="button"
            onClick={reimprimir}
            disabled={enviando}
            className="chip-3d rounded-lg px-2.5 py-1 text-xs font-semibold text-text disabled:opacity-40"
          >
            Reimprimir planteamiento
          </button>
        )}
        {/* Reenviar solo si ya hubo un correo de verdad (con o sin adjunto: el
            de toldos solo avisa de lo impreso): es repetir ese. */}
        {correoVivo && correo!.envios.some((f) => f.asunto) && puedeActuar && (
          <button
            type="button"
            onClick={reenviar}
            disabled={enviando}
            className="chip-3d rounded-lg px-2.5 py-1 text-xs font-semibold text-text disabled:opacity-40"
          >
            Reenviar correo
          </button>
        )}
      </div>
      {mensaje && <p className="mt-1 text-[11px] text-text-muted">{mensaje}</p>}
    </section>
  );
}
