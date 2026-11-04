"use client";

import {
  claveParte,
  hayQueGirar,
  type AjustesImpresion,
  type Orientacion,
  type ParteImpresion,
} from "@/lib/planteamiento";
import type { ModoImpresion } from "@/lib/server/impresion-cola";
import { abrirParaImprimir } from "@/lib/imprimir-pdf";

// ─── Cómo se reparte el planteamiento entre las impresoras ───────────────────
// En el aviso de pasar, cuando el PDF lleva páginas de distintos tamaños (Iván,
// 04/11/2026): cada parte con su miniatura, a qué impresora va, y para el A5 y
// el A3 si sale vertical u horizontal. Viene todo puesto: lo normal es no tocar
// nada y pasar. «Ajustes de la impresora…» abre el cuadro de imprimir con solo
// esa parte, por si un día se quiere otra bandeja o más copias; esa parte deja
// entonces de mandarse sola.

export interface FicheroConPartes {
  nombre: string;
  partes?: ParteImpresion[];
}

/** ¿Hay algo que repartir? Solo si algún PDF no es todo A4. */
export function hayReparto(ficheros: readonly FicheroConPartes[]): boolean {
  return ficheros.some((f) => f.partes?.some((p) => p.papel !== "A4"));
}

/** La dirección de una parte del PDF, girada si se eligió así. */
export function urlParte(pedido: string, fichero: string, parte: ParteImpresion, girar: boolean, mini = false): string {
  const q = new URLSearchParams({ pedido, nombre: fichero, paginas: parte.paginas.join(",") });
  if (girar && !mini) q.set("girar", "1");
  if (mini) q.set("mini", "1");
  return `/api/planteamiento/fichero?${q}`;
}

/** Las partes que salen a mano al pasar: sin impresora que las imprima solas, o
 *  porque se eligió «Ajustes de la impresora…» (esas ya se abrieron al pulsar). */
export function partesAMano(
  ficheros: readonly FicheroConPartes[],
  puedeOt: boolean,
  ajustes: AjustesImpresion,
): Array<{ fichero: string; parte: ParteImpresion; girar: boolean }> {
  return ficheros.flatMap((f) =>
    (f.partes ?? [])
      .filter((p) => p.destino === "manual" || (p.destino === "ot" && !puedeOt))
      .filter((p) => !ajustes.aMano.includes(claveParte(f.nombre, p.papel)))
      .map((parte) => ({ fichero: f.nombre, parte, girar: hayQueGirar(parte, ajustes.orientaciones[claveParte(f.nombre, parte.papel)]) })),
  );
}

const pags = (n: number) => `${n} ${n === 1 ? "pág." : "págs."}`;

export function RepartoImpresion({
  pedido,
  ficheros,
  modo,
  puedeOt,
  ajustes,
  onCambiar,
}: {
  pedido: string;
  ficheros: FicheroConPartes[];
  modo: ModoImpresion;
  puedeOt: boolean;
  ajustes: AjustesImpresion;
  onCambiar: (a: AjustesImpresion) => void;
}) {
  const destinoTexto = (p: ParteImpresion, clave: string): string => {
    if (ajustes.aMano.includes(clave)) return "la imprimes tú desde el cuadro";
    if (p.destino === "manual") return "a mano: se abrirá el cuadro de imprimir";
    if (p.destino === "ot" && !puedeOt) return "a mano: la de OT no tiene código de departamento";
    if (modo === "ensayo") return "impresora de OT (ensayo)";
    return p.destino === "ot" ? "impresora de OT" : "Producción";
  };

  return (
    <div className="mt-3 flex flex-col gap-2" aria-label="Reparto entre impresoras">
      {ficheros.flatMap((f) =>
        (f.partes ?? []).map((parte) => {
          const clave = claveParte(f.nombre, parte.papel);
          const elegida: Orientacion = ajustes.orientaciones[clave] ?? (parte.horizontal ? "horizontal" : "vertical");
          const girar = hayQueGirar(parte, ajustes.orientaciones[clave]);
          const aMano = ajustes.aMano.includes(clave);
          const sola = !aMano && parte.destino !== "manual" && !(parte.destino === "ot" && !puedeOt);
          const orientar = (o: Orientacion) =>
            onCambiar({ ...ajustes, orientaciones: { ...ajustes.orientaciones, [clave]: o } });
          return (
            <div key={clave} className="flex items-center gap-3 rounded-xl bg-[var(--hero-relleno)] p-2">
              <a
                href={urlParte(pedido, f.nombre, parte, girar)}
                target="_blank"
                rel="noreferrer"
                title="Ver esta parte en grande, como saldrá"
                className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlParte(pedido, f.nombre, parte, false, true)}
                  alt={`Página ${parte.paginas[0]} de ${f.nombre}`}
                  className="max-h-14 max-w-14 object-contain transition-transform duration-200 motion-reduce:transition-none"
                  style={{ transform: girar ? "rotate(90deg)" : undefined }}
                />
              </a>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text">
                  {pags(parte.paginas.length)} {parte.papel ?? "de otro tamaño"}
                  <span className="font-normal text-text-muted"> · {f.nombre}</span>
                </p>
                <p className="text-[11px] text-text-muted">→ {destinoTexto(parte, clave)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {parte.papel && parte.papel !== "A4" && (
                    <div className="tira-3d glass-chip inline-flex rounded-lg p-0.5" role="group" aria-label={`Orientación del ${parte.papel}`}>
                      {(["vertical", "horizontal"] as const).map((o) => (
                        <button
                          key={o}
                          type="button"
                          aria-pressed={elegida === o}
                          onClick={() => orientar(o)}
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${elegida === o ? "pestana-activa" : "text-text-muted hover:text-text"}`}
                        >
                          {o === "vertical" ? "Vertical" : "Horizontal"}
                        </button>
                      ))}
                    </div>
                  )}
                  {sola && (
                    <button
                      type="button"
                      // Se abre AQUÍ, dentro del clic: fuera de él el navegador lo bloquea.
                      onClick={() => {
                        abrirParaImprimir(urlParte(pedido, f.nombre, parte, girar));
                        onCambiar({ ...ajustes, aMano: [...ajustes.aMano, clave] });
                      }}
                      className="text-[11px] text-text-muted underline underline-offset-2 hover:text-text"
                    >
                      Ajustes de la impresora…
                    </button>
                  )}
                  {aMano && (
                    <button
                      type="button"
                      onClick={() => onCambiar({ ...ajustes, aMano: ajustes.aMano.filter((k) => k !== clave) })}
                      className="text-[11px] text-text-muted underline underline-offset-2 hover:text-text"
                    >
                      Que salga sola
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}
