"use client";

import type { EleccionPase } from "@/lib/planteamiento";

// ─── «Cambiar lo que se imprime y se manda», en el aviso de pasar ───────────
// Lo normal es la norma de la casa y un clic (Iván, 14/10/2026). Esto es para
// cuando no: un PDF ya se imprimió, uno no tiene que ir adjunto, una OF no
// pinta en el correo. Las OF solo se pueden QUITAR del correo: el resto lo
// sigue montando CoordinaOT. La nota del correo ya no va aquí: está siempre a
// la vista en el aviso de pasar (Board), haya elección o no.

export interface FicheroPase {
  nombre: string;
  todoA4: boolean;
}

export interface OfPase {
  codigo: string;
  descripcion: string;
}

interface Props {
  ficheros: FicheroPase[];
  ofs: OfPase[];
  eleccion: EleccionPase;
  onCambiar: (e: EleccionPase) => void;
  /** La impresión o el correo apagados no se ofrecen. */
  conImpresion: boolean;
  conCorreo: boolean;
  mandarCorreo: boolean;
  onMandarCorreo: (v: boolean) => void;
  /** Volver a la norma, sin nada elegido a mano. */
  onDeshacer: () => void;
}

const alternar = (lista: string[], valor: string, marcado: boolean) =>
  marcado ? (lista.includes(valor) ? lista : [...lista, valor]) : lista.filter((x) => x !== valor);

export function CambiarPlanteamiento({
  ficheros, ofs, eleccion, onCambiar, conImpresion, conCorreo, mandarCorreo, onMandarCorreo, onDeshacer,
}: Props) {
  const fijar = (parte: Partial<EleccionPase>) => onCambiar({ ...eleccion, ...parte });
  return (
    <div className="space-y-3 text-text">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-text-muted">
            <th className="pb-1 text-left font-normal">Planteamiento</th>
            {conImpresion && <th className="w-16 pb-1 text-center font-normal">Imprimir</th>}
            {conCorreo && mandarCorreo && <th className="w-16 pb-1 text-center font-normal">Adjuntar</th>}
          </tr>
        </thead>
        <tbody>
          {ficheros.map((f) => (
            <tr key={f.nombre} className="border-t border-border">
              <td className="py-1 pr-2 break-all">
                {f.nombre}
                {!f.todoA4 && <span className="block text-text-muted">No es todo A4: se abrirá el cuadro de imprimir</span>}
              </td>
              {conImpresion && (
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-500"
                    aria-label={`Imprimir ${f.nombre}`}
                    checked={eleccion.imprimir.includes(f.nombre)}
                    onChange={(e) => fijar({ imprimir: alternar(eleccion.imprimir, f.nombre, e.target.checked) })}
                  />
                </td>
              )}
              {conCorreo && mandarCorreo && (
                <td className="text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-500"
                    aria-label={`Adjuntar ${f.nombre} al correo`}
                    checked={eleccion.adjuntar.includes(f.nombre)}
                    onChange={(e) => fijar({ adjuntar: alternar(eleccion.adjuntar, f.nombre, e.target.checked) })}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {conCorreo && (
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-brand-500"
              checked={mandarCorreo}
              onChange={(e) => onMandarCorreo(e.target.checked)}
            />
            Mandar el correo
          </label>
          {mandarCorreo && (
            <div className="mt-2 space-y-2 pl-6">
              {ofs.length > 0 && (
                <fieldset>
                  <legend className="mb-1 text-text-muted">OF que salen en el correo</legend>
                  {ofs.map((of) => (
                    <label key={of.codigo} className="flex items-start gap-2 py-0.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-brand-500"
                        checked={eleccion.ofs.includes(of.codigo)}
                        onChange={(e) => fijar({ ofs: alternar(eleccion.ofs, of.codigo, e.target.checked) })}
                      />
                      <span>
                        <b>{of.codigo}</b>
                        {of.descripcion.trim() ? ` · ${of.descripcion.trim()}` : ""}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={onDeshacer} className="text-text-muted underline underline-offset-2 hover:text-text">
        Dejarlo como estaba
      </button>
    </div>
  );
}
