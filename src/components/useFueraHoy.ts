"use client";

import { useEffect, useState } from "react";
import type { FueraHoy, RespuestaFueraHoy } from "@/lib/disponibilidad";

/** Cada cuánto se vuelve a preguntar. El servidor ya guarda 15 min lo de
 *  Bizneo; esto solo hace que una pestaña abierta todo el día cambie de día. */
const REFRESCO_MS = 10 * 60_000;

/** Quién está fuera hoy, según Bizneo. `null` mientras carga, si falla o si
 *  Bizneo no está conectado: quien lo usa simplemente no enseña nada. */
export function useFueraHoy(activo = true): FueraHoy[] | null {
  const [fuera, setFuera] = useState<FueraHoy[] | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const leer = () =>
      fetch("/api/disponibilidad/hoy", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<RespuestaFueraHoy>) : null))
        .then((d) => {
          if (vivo) setFuera(d && d.activo ? d.fuera : null);
        })
        .catch(() => {
          // Sin Bizneo el tablero sigue igual: no se avisa de nada.
        });
    void leer();
    const id = setInterval(leer, REFRESCO_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [activo]);
  return fuera;
}
