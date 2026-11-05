"use client";

import { NOTA_MAX, type AjustesImpresion } from "@/lib/planteamiento";
import type { VistaPlanteamiento } from "@/lib/planteamiento-textos";
import { RepartoImpresion, hayReparto } from "./RepartoImpresion";

// ─── Imprimir y mandar el planteamiento al dar una OF por terminada ──────────
// Dar una OF suelta por terminada en RPS es pasarla a Producción (Iván,
// 05/11/2026): sale su planteamiento como al pasar el pedido entero. Aquí se
// elige qué PDF se imprimen (de serie todos; se desmarcan los de otras OF,
// p. ej. el PVC si solo se pasan los toldos) y si se manda el correo, que
// lleva solo esta OF.

export interface EleccionAlCerrar {
  imprimir: string[];
  mandarCorreo: boolean;
  nota: string;
  ajustes: AjustesImpresion;
}

export function PlanteamientoAlCerrar({
  pedido,
  codigoOF,
  vista,
  eleccion,
  onCambiar,
}: {
  pedido: string;
  codigoOF: string;
  vista: VistaPlanteamiento;
  eleccion: EleccionAlCerrar;
  onCambiar: (e: EleccionAlCerrar) => void;
}) {
  const conImpresion = vista.modo !== "off";
  const conCorreo = !!vista.correo && vista.correo.modo !== "off";
  const seImprimen = vista.ficheros.filter((f) => eleccion.imprimir.includes(f.nombre));
  const alternar = (nombre: string, si: boolean) =>
    onCambiar({ ...eleccion, imprimir: si ? [...eleccion.imprimir, nombre] : eleccion.imprimir.filter((n) => n !== nombre) });
  return (
    <div className="mt-3 flex flex-col gap-2.5 text-xs">
      {conImpresion && (
        <section className="rounded-2xl bg-[var(--recuadro)] p-3">
          <h4 className="mb-1.5 text-[11px] font-semibold text-text-muted">Impresión</h4>
          {vista.ficheros.length === 0 ? (
            <p className="text-text">{vista.aviso ?? "No encuentro el planteamiento en Planteamientos"}: no se imprimirá nada.</p>
          ) : (
            <>
              <p className="mb-1 text-text-muted">Qué PDF se imprimen con esta OF:</p>
              {vista.ficheros.map((f) => (
                <label key={f.nombre} className="flex items-center gap-2 py-0.5 text-text">
                  <input type="checkbox" className="size-4 accent-brand-500" checked={eleccion.imprimir.includes(f.nombre)} onChange={(e) => alternar(f.nombre, e.target.checked)} />
                  {f.nombre} <span className="text-text-muted">· {f.paginas} {f.paginas === 1 ? "pág." : "págs."}</span>
                </label>
              ))}
              {hayReparto(seImprimen) && (
                <RepartoImpresion
                  pedido={pedido}
                  ficheros={seImprimen}
                  modo={vista.modo}
                  puedeOt={vista.puedeOt ?? false}
                  ajustes={eleccion.ajustes}
                  onCambiar={(ajustes) => onCambiar({ ...eleccion, ajustes })}
                />
              )}
            </>
          )}
        </section>
      )}
      {conCorreo && (
        <section className="rounded-2xl bg-[var(--recuadro)] p-3">
          <h4 className="mb-1.5 text-[11px] font-semibold text-text-muted">Correo</h4>
          <label className="flex items-center gap-2 text-text">
            <input type="checkbox" className="size-4 accent-brand-500" checked={eleccion.mandarCorreo} onChange={(e) => onCambiar({ ...eleccion, mandarCorreo: e.target.checked })} />
            Mandar el correo a Oficina Técnica y Producción, solo con la OF {codigoOF}
          </label>
          {eleccion.mandarCorreo && (
            <label className="mt-2 block">
              <span className="mb-1 block text-text-muted">Nota para el correo (opcional, sale arriba)</span>
              <textarea
                rows={2}
                maxLength={NOTA_MAX}
                value={eleccion.nota}
                onChange={(e) => onCambiar({ ...eleccion, nota: e.target.value })}
                placeholder="Alguna indicación para Producción"
                className="w-full resize-y rounded-md border border-borde-campo bg-surface px-2.5 py-1.5 text-xs text-text"
              />
            </label>
          )}
        </section>
      )}
    </div>
  );
}
