"use client";

import { useEffect, useState } from "react";
import { familiaMeta } from "@/lib/familia";
import { leerCausas, type CausaDevolucion } from "@/lib/causas-cliente";
import { PanelFlotante, BotonCerrarPanel } from "./PanelFlotante";
import { EditorCausas } from "./EditorCausas";

/** La guía de revisión: lo que se mira en cada trabajo, y de dónde salen las
 *  causas de devolución.
 *
 *  La de la tarjeta se usa CON una OF delante, marcando. Esta es la misma lista
 *  entera, con todas las familias: para consultarla cuando no estás revisando,
 *  para enseñársela a quien empieza y —lo que faltaba— para CAMBIARLA sin que
 *  nadie te tenga que pasar algo a revisar. Hasta ahora los puntos vivían en el
 *  código y solo se tocaban en un despliegue.
 *
 *  Cada punto lleva su cara en positivo (lo que se comprueba) y su cara en
 *  negativo (lo que se marca si falla), porque son la misma frase y editarlas
 *  por separado las descuadra. */
export function PanelGuiaRevision({ onCerrar }: { onCerrar: () => void }) {
  const [causas, setCausas] = useState<CausaDevolucion[] | null>(null);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Con las retiradas: en el editor hay que poder verlas para devolverlas al
    // servicio, y en la lista de lectura simplemente no se pintan.
    leerCausas(true).then((cs) => vivo && setCausas(cs));
    return () => {
      vivo = false;
    };
  }, []);

  const activas = (causas ?? []).filter((c) => !c.retirada);
  const puntos = activas.filter((c) => c.mira);
  const genericos = puntos.filter((c) => c.familia === null);
  const porFamilia = new Map<string, CausaDevolucion[]>();
  for (const c of puntos) {
    if (!c.familia) continue;
    porFamilia.set(c.familia, [...(porFamilia.get(c.familia) ?? []), c]);
  }

  return (
    <PanelFlotante titulo="Qué mirar al revisar" onCerrar={onCerrar}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-bold text-text">Qué mirar al revisar</h3>
        <button
          onClick={() => setEditando((v) => !v)}
          className="rounded-lg px-2 py-0.5 text-[10px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
        >
          {editando ? "Ver la guía" : "Cambiar la lista"}
        </button>
        <BotonCerrarPanel className="ml-auto" />
      </div>

      {causas === null && <p className="text-[11px] text-text-muted">Buscando…</p>}

      {causas !== null && editando && (
        <EditorCausas causas={causas} onCambio={setCausas} />
      )}

      {causas !== null && !editando && (
        <>
          <p className="mb-3 text-[11px] leading-snug text-text-muted">
            Los puntos que se repasan antes de dar un trabajo por bueno. Mientras
            revisas los tienes en la propia tarjeta —solo los del trabajo que
            estás mirando— y lo que marques como fallo llega marcado al cuadro de
            devolver.
          </p>

          <Bloque
            titulo="En todos los trabajos"
            explica="Se repasan siempre, sea lo que sea la OF."
            puntos={genericos}
          />

          {[...porFamilia.entries()].map(([familia, suyos]) => (
            <Bloque
              key={familia}
              titulo={familiaMeta(familia).label}
              explica="Solo en los trabajos de esta familia."
              puntos={suyos}
            />
          ))}

          {porFamilia.size === 0 && genericos.length === 0 && (
            <p className="text-[11px] text-text-muted">
              No hay ningún punto en la guía. Con «Cambiar la lista» se añaden.
            </p>
          )}

          <p className="mt-3 border-t border-border pt-2 text-[11px] leading-snug text-text-muted">
            ¿Falta algo de un trabajo que no está aquí? Se añade con «Cambiar la
            lista», o se escribe como causa nueva al devolver y queda para todos.
          </p>
        </>
      )}
    </PanelFlotante>
  );
}

function Bloque({
  titulo,
  explica,
  puntos,
}: {
  titulo: string;
  explica: string;
  puntos: CausaDevolucion[];
}) {
  if (puntos.length === 0) return null;
  return (
    <section className="mb-4">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{titulo}</h4>
      <p className="mb-1.5 text-[10px] text-text-muted">{explica}</p>
      <ol className="flex flex-col gap-2">
        {puntos.map((p) => (
          <li key={p.id} className="border-l-2 border-border pl-2">
            <span className="block text-xs font-semibold text-text">{p.mira}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-text-muted">
              Si falla: {p.etiqueta.toLowerCase()}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
