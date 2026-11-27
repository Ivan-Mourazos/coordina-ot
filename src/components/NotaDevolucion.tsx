"use client";

import { useState } from "react";
import { huellaNota, leerDevolucion, puntosDeCorreccion, type InfoDevolucion } from "@/lib/devolucion";
import { fmtCuandoNota } from "@/lib/nota-pedido";

/** «Qué corregir»: la nota del revisor cuando devuelve, para el AUTOR.
 *
 *  REHECHA EL 27/11/2026 (comité de la vista del autor, fase 1). Antes todo iba
 *  en rojo y a 11 px, con lo que hay que hacer al final de la frase, detrás del
 *  nombre del paso, y con las etiquetas de causa delante. Ahora:
 *
 *  · LO QUE HAY QUE HACER, EN GRANDE y en el color normal del texto; el paso de
 *    la guía al que pertenece, debajo y en gris. El rojo queda en la barra de
 *    la izquierda: dice «esto vuelve» sin hacer ilegible lo de dentro.
 *  · SIN ETIQUETAS DE CAUSA. Son para las estadísticas; al autor no le dicen
 *    nada que no diga ya el punto.
 *  · LAS «INDICACIONES EXTRA», APARTE Y SIN CASILLA: son contexto, no tareas.
 *  · YA REENVIADA (`enviada`), SE PLIEGA EN GRIS: «Corrección enviada · 2
 *    puntos». Antes seguía en rojo, con casillas, cuando ya estaba en revisión.
 *
 *  Las casillas son SOLO INFORMATIVAS (lo pidió un técnico el 22/10/2026, e
 *  Iván lo dejó claro el 27/11/2026): no bloquean pasar a revisión ni nada.
 *  Desde la fase 2 se guardan en el servidor (`OF.devolucion.hechas`), así que
 *  son las mismas desde cualquier PC y para quien coja la OF después. Sin ese
 *  dato (una pantalla que no lo pase) siguen en el navegador, como antes. */
export function NotaDevolucion({
  observacion,
  className = "",
  marcarComo,
  enviada = false,
  abrirEnviada = false,
  devolucion,
  devueltaPor,
  operarioId,
}: {
  observacion: string;
  className?: string;
  /** Con esto, cada punto lleva una casilla para ir marcando lo hecho. Va el
   *  id de la OF; la clave lleva además la nota, así que una devolución nueva
   *  empieza limpia. */
  marcarComo?: string;
  /** La OF ya volvió a revisión: se pliega en gris y se abre si se pide. */
  enviada?: boolean;
  /** Ya enviada, pero abierta de entrada (el revisor que la va a repasar). */
  abrirEnviada?: boolean;
  /** Quién, cuándo, qué vuelta y lo marcado, del servidor (fase 2). */
  devolucion?: InfoDevolucion;
  /** El nombre de quien la devolvió, ya resuelto. */
  devueltaPor?: string;
  /** Quien marca, para el servidor cuando el login está apagado. */
  operarioId?: string;
}) {
  const { nota } = leerDevolucion(observacion);
  const { puntos, extra } = puntosDeCorreccion(nota);
  const clave = marcarComo ? `coordina:corregido:${marcarComo}:${huellaNota(observacion)}` : null;
  // Lo del servidor manda; si no trae nada, lo que hubiera en este navegador
  // (las marcas de antes de la fase 2 no se pierden).
  const deEntrada = (): ReadonlySet<number> =>
    devolucion?.hechas.length ? new Set(devolucion.hechas) : leerHechas(clave);
  // Con su clave al lado: si llega otra devolución con el componente montado,
  // las marcas de la vieja no se le pasan a la nueva.
  const [marcas, setMarcas] = useState<{ clave: string | null; hechas: ReadonlySet<number> } | null>(null);
  const hechas = marcas && marcas.clave === clave ? marcas.hechas : deEntrada();
  const [releer, setReleer] = useState(abrirEnviada);
  const alternar = (i: number) => {
    const nuevas = new Set(hechas);
    if (!nuevas.delete(i)) nuevas.add(i);
    setMarcas({ clave, hechas: nuevas });
    try {
      if (nuevas.size) localStorage.setItem(clave!, JSON.stringify([...nuevas]));
      else localStorage.removeItem(clave!);
    } catch {
      // Sin almacenamiento (navegación privada): las marcas duran hasta cerrar.
    }
    // Al servidor, si la pantalla trae el dato. Si falla, se queda en este
    // navegador: es información, no hay nada que deshacer.
    if (devolucion && marcarComo) {
      void fetch("/api/revision/correccion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ofId: marcarComo, hechas: [...nuevas], operarioId }),
      }).catch(() => {});
    }
  };

  if (puntos.length === 0 && !extra) return null;
  const n = puntos.length;
  const cuantos = n === 1 ? "1 punto" : `${n} puntos`;

  if (enviada && !releer) {
    return (
      <button
        type="button"
        onClick={() => setReleer(true)}
        className={`flex w-full items-center gap-1.5 rounded-md border-l-[3px] border-border bg-surface-2 px-2.5 py-1 text-left text-[11px] text-text-muted hover:text-text ${className}`}
      >
        <span aria-hidden="true" className="text-[9px]">▸</span>
        Corrección enviada{n > 0 && ` · ${cuantos}`}
      </button>
    );
  }

  const conCasillas = clave !== null && !enviada;
  const hechasN = puntos.filter((_, i) => hechas.has(i)).length;

  return (
    <div
      className={`rounded-md border-l-[3px] bg-surface-2 px-2.5 py-1.5 ${
        enviada ? "border-border" : "border-red-500"
      } ${className}`}
    >
      <div className="flex items-center gap-2 text-[11px]">
        {enviada ? (
          <button
            type="button"
            onClick={() => setReleer(false)}
            className="flex items-center gap-1.5 font-semibold text-text-muted hover:text-text"
          >
            <span aria-hidden="true" className="text-[9px]">▾</span>
            Corrección enviada
          </button>
        ) : (
          <span className="font-semibold text-text">Qué corregir</span>
        )}
        {conCasillas && n > 1 && (
          <span className="ml-auto tabular-nums text-text-muted">
            {hechasN} de {n} hechas
          </span>
        )}
      </div>
      {/* Quién, cuándo y qué vuelta: para saber a quién preguntar y si ya es
          la segunda vez que vuelve. */}
      {devolucion && (
        <p className="text-[11px] text-text-muted">
          Devuelta{devueltaPor ? ` por ${devueltaPor}` : ""} · {fmtCuandoNota(devolucion.at, new Date().toISOString())}
          {devolucion.vuelta > 1 && <span className="font-semibold text-error"> · {devolucion.vuelta}.ª vuelta</span>}
        </p>
      )}

      {n > 0 && (
        <ul className="mt-1 space-y-1">
          {puntos.map((p, i) => {
            const hecha = conCasillas && hechas.has(i);
            const texto = (
              <span className="min-w-0">
                <span className={`block text-[13px] leading-snug ${hecha ? "text-text-muted line-through" : "text-text"}`}>
                  {p.que}
                </span>
                {p.paso && <span className="block text-[11px] text-text-muted">{p.paso}</span>}
              </span>
            );
            return (
              <li key={i}>
                {conCasillas ? (
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={hecha}
                      onChange={() => alternar(i)}
                      className="mt-0.5 size-4 shrink-0 cursor-pointer accent-emerald-600"
                    />
                    {texto}
                  </label>
                ) : (
                  <div className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-px w-4 shrink-0 text-center text-[11px] font-bold text-error">
                      ✗
                    </span>
                    {texto}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {extra && (
        <div className={n > 0 ? "mt-1.5 border-t border-border pt-1.5" : "mt-1"}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Indicaciones extra</p>
          <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-text">{extra}</p>
        </div>
      )}
    </div>
  );
}

/** Cuántos puntos trae una devolución, para el aviso del pedido. */
export function puntosDeLaNota(observacion: string | null | undefined): number {
  return puntosDeCorreccion(leerDevolucion(observacion).nota).puntos.length;
}

function leerHechas(clave: string | null): ReadonlySet<number> {
  if (!clave || typeof window === "undefined") return new Set();
  try {
    const v: unknown = JSON.parse(localStorage.getItem(clave) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}
