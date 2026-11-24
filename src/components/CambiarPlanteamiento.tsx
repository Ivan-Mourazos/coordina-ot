"use client";

import type { EleccionPase } from "@/lib/planteamiento";

// ─── «Cambiar lo que se imprime y se manda», en el aviso de pasar ───────────
// Lo normal es la norma de la casa y un clic (Iván, 14/10/2026). Esto es para
// cuando no: un PDF ya se imprimió, uno no tiene que ir adjunto, una OF no
// pinta en el correo. Las OF solo se pueden QUITAR del correo: el resto lo
// sigue montando CoordinaOT. La nota del correo ya no va aquí: está siempre a
// la vista en el aviso de pasar (Board), haya elección o no.
//
// Dos piezas, una por apartado (Iván, 24/11/2026): lo que se imprime va en
// «Impresión» y lo que se manda (adjuntos y OF) en «Correo», sin mezclarse.

export interface FicheroPase {
  nombre: string;
  todoA4: boolean;
}

export interface OfPase {
  codigo: string;
  descripcion: string;
}

const alternar = (lista: string[], valor: string, marcado: boolean) =>
  marcado ? (lista.includes(valor) ? lista : [...lista, valor]) : lista.filter((x) => x !== valor);

/** Qué PDF se imprimen. */
export function CambiarImpresion({
  ficheros,
  eleccion,
  onCambiar,
}: {
  ficheros: FicheroPase[];
  eleccion: EleccionPase;
  onCambiar: (e: EleccionPase) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-text">
      <p className="text-text-muted">Qué PDF se imprimen:</p>
      {ficheros.map((f) => (
        <label key={f.nombre} className="flex items-start gap-2 py-0.5">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-brand-500"
            checked={eleccion.imprimir.includes(f.nombre)}
            onChange={(e) => onCambiar({ ...eleccion, imprimir: alternar(eleccion.imprimir, f.nombre, e.target.checked) })}
          />
          <span className="break-all">
            {f.nombre}
            {!f.todoA4 && <span className="block text-text-muted">No es todo A4: se abrirá el cuadro de imprimir</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Si se manda el correo, qué PDF van adjuntos y qué OF salen. */
export function CambiarCorreo({
  ficheros,
  ofs,
  eleccion,
  onCambiar,
  mandarCorreo,
  onMandarCorreo,
}: {
  ficheros: FicheroPase[];
  ofs: OfPase[];
  eleccion: EleccionPase;
  onCambiar: (e: EleccionPase) => void;
  mandarCorreo: boolean;
  onMandarCorreo: (v: boolean) => void;
}) {
  const fijar = (parte: Partial<EleccionPase>) => onCambiar({ ...eleccion, ...parte });
  return (
    <div className="text-text">
      <label className="flex items-center gap-2">
        <input type="checkbox" className="size-4 accent-brand-500" checked={mandarCorreo} onChange={(e) => onMandarCorreo(e.target.checked)} />
        Mandar el correo
      </label>
      {mandarCorreo && (
        <div className="mt-2 space-y-2 pl-6">
          {ficheros.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-text-muted">PDF adjuntos</legend>
              {ficheros.map((f) => (
                <label key={f.nombre} className="flex items-start gap-2 py-0.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-brand-500"
                    checked={eleccion.adjuntar.includes(f.nombre)}
                    onChange={(e) => fijar({ adjuntar: alternar(eleccion.adjuntar, f.nombre, e.target.checked) })}
                  />
                  <span className="break-all">{f.nombre}</span>
                </label>
              ))}
            </fieldset>
          )}
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
  );
}
