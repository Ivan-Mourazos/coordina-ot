"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { textoCorreo, textoImpresion, type VistaPlanteamiento } from "@/lib/planteamiento-textos";
import { AJUSTES_DE_SERIE, type AjustesImpresion } from "@/lib/planteamiento";
import { abrirParaImprimir } from "@/lib/imprimir-pdf";
import { TITULO_BLOQUE } from "./MarcoFicha";
import { useSoloLectura } from "./SoloLectura";
import { ConfirmDialog } from "./ConfirmDialog";
import { RepartoImpresion, hayReparto, urlsAMano } from "./RepartoImpresion";

// «Reimprimir…» y «Reenviar correo…» abren un cuadro (Iván, 24/11/2026): nada
// sale solo al pinchar. El de imprimir es el mismo apartado que al pasar —qué
// PDF y qué páginas a cada impresora, con «Marcar todo»—; el de correo dice
// qué se vuelve a mandar.

function Apartado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-[var(--recuadro)] p-3">
      <h4 className="mb-1 text-[11px] font-semibold text-text-muted">{titulo}</h4>
      {children}
    </section>
  );
}

/** El planteamiento en la ficha del Historial: qué se imprimió y qué se mandó
 *  por correo, y cuándo, con «Reimprimir» y «Reenviar». Pide sus datos aparte, como «gastado»: si falla, el resto de
 *  la ficha no se entera. Solo se monta en la sección OT. */
export function PlanteamientoPedido({ pedido, miId }: { pedido: string; miId: string | null }) {
  // Dirección (solo lectura) no puede reimprimir: la ruta le daría 403.
  const soloLectura = useSoloLectura();
  const [datos, setDatos] = useState<VistaPlanteamiento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [cuadro, setCuadro] = useState<"imprimir" | "correo" | null>(null);
  const [imprimir, setImprimir] = useState<string[]>([]);
  const [ajustes, setAjustes] = useState<AjustesImpresion>(AJUSTES_DE_SERIE);

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
    setCuadro(null);
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

  const abrirImprimir = () => {
    setImprimir(datos.ficheros.map((f) => f.nombre));
    setAjustes(AJUSTES_DE_SERIE);
    setCuadro("imprimir");
  };
  const seImprimen = datos.ficheros.filter((f) => imprimir.includes(f.nombre));
  const ultimoCorreo = correo?.envios.find((f) => f.asunto);

  const reimprimir = async () => {
    // Lo que no sale solo se abre AQUÍ, dentro del clic: fuera de él el
    // navegador lo bloquea. Igual que al pasar.
    for (const url of urlsAMano(pedido, seImprimen, datos.puedeOt ?? false, ajustes)) abrirParaImprimir(url);
    for (const f of seImprimen.filter((x) => !x.todoA4 && !x.tamanos)) {
      abrirParaImprimir(`/api/planteamiento/fichero?pedido=${encodeURIComponent(pedido)}&nombre=${encodeURIComponent(f.nombre)}`);
    }
    setCuadro(null);
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/planteamiento/reimprimir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, operarioId: miId, imprimirSolo: imprimir, impresion: ajustes }),
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
            onClick={abrirImprimir}
            disabled={enviando}
            className="chip-3d rounded-lg px-2.5 py-1 text-xs font-semibold text-text disabled:opacity-40"
          >
            Reimprimir planteamiento…
          </button>
        )}
        {/* Reenviar solo si ya hubo un correo de verdad (con o sin adjunto: el
            de toldos solo avisa de lo impreso): es repetir ese. */}
        {correoVivo && correo!.envios.some((f) => f.asunto) && puedeActuar && (
          <button
            type="button"
            onClick={() => setCuadro("correo")}
            disabled={enviando}
            className="chip-3d rounded-lg px-2.5 py-1 text-xs font-semibold text-text disabled:opacity-40"
          >
            Reenviar correo…
          </button>
        )}
      </div>
      {mensaje && <p className="mt-1 text-[11px] text-text-muted">{mensaje}</p>}

      <ConfirmDialog
        abierto={cuadro === "imprimir"}
        titulo={`Reimprimir el planteamiento de ${pedido}`}
        ancho
        textoConfirmar="Imprimir"
        confirmarDesactivado={imprimir.length === 0}
        onConfirmar={reimprimir}
        onCancelar={() => setCuadro(null)}
        mensaje={
          <div className="mt-2 flex flex-col gap-2.5 text-xs">
            <Apartado titulo="Impresión">
              {datos.impresiones[0] && <p className="mb-2 text-text-muted">Ya se imprimió antes: {textoImpresion(datos.impresiones[0])}</p>}
              <p className="text-text-muted">Qué PDF se imprimen:</p>
              {datos.ficheros.map((f) => (
                <label key={f.nombre} className="flex items-start gap-2 py-0.5 text-text">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-brand-500"
                    checked={imprimir.includes(f.nombre)}
                    onChange={(e) => setImprimir((l) => (e.target.checked ? [...l, f.nombre] : l.filter((n) => n !== f.nombre)))}
                  />
                  <span className="break-all">
                    {f.nombre} <span className="text-text-muted">· {f.paginas} {f.paginas === 1 ? "pág." : "págs."}</span>
                  </span>
                </label>
              ))}
              {hayReparto(seImprimen) && (
                <RepartoImpresion
                  pedido={pedido}
                  ficheros={seImprimen}
                  modo={datos.modo}
                  puedeOt={datos.puedeOt ?? false}
                  ajustes={ajustes}
                  onCambiar={setAjustes}
                />
              )}
              {imprimir.length === 0 && <p className="mt-2 text-text-muted">Marca al menos un PDF.</p>}
            </Apartado>
          </div>
        }
      />
      <ConfirmDialog
        abierto={cuadro === "correo"}
        titulo={`Reenviar el correo de ${pedido}`}
        textoConfirmar="Reenviar"
        onConfirmar={reenviar}
        onCancelar={() => setCuadro(null)}
        mensaje={
          <div className="mt-2 flex flex-col gap-2.5 text-xs">
            <Apartado titulo="Correo">
              <p className="text-text">Se vuelve a mandar el último correo tal cual: mismo asunto, mismo texto y mismos adjuntos.</p>
              {ultimoCorreo && <p className="mt-1 text-text-muted">{textoCorreo(ultimoCorreo)}</p>}
            </Apartado>
          </div>
        }
      />
    </section>
  );
}
