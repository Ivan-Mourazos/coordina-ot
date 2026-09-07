"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstadoPunto } from "./guia-revision";

// ─── Lo comprobado de una revisión, ida y vuelta ─────────────────────────────
// Vive en el servidor (ver /api/revision/marcas) y no en la pantalla: de esto
// depende poder aprobar, y con las marcas solo en memoria un refresco a media
// revisión obligaría a repasar los ocho puntos otra vez.
//
// La guía es del PEDIDO y las marcas van por OF: al marcar un punto se escribe
// en todas las OF que esa persona está revisando de ese pedido. Así se puede
// devolver una sola OF sin arrastrar lo comprobado de las demás.

/** Qué se ve en la guía cuando las OF del grupo no coinciden.
 *
 *  Solo se da por comprobado un punto si lo está en TODAS. Si una OF entró en
 *  revisión más tarde y le faltan marcas, el punto vuelve a "sin mirar": es lo
 *  honesto —de esa OF nadie lo ha comprobado— y además es lo que impide
 *  aprobarla sin haberla mirado. */
function fusionar(
  porOf: Record<string, Record<number, string>>,
  ofIds: readonly string[],
): Record<number, EstadoPunto> {
  if (ofIds.length === 0) return {};
  const primera = porOf[ofIds[0]] ?? {};
  const comun: Record<number, EstadoPunto> = {};
  for (const [punto, estado] of Object.entries(primera)) {
    const id = Number(punto);
    if (ofIds.every((of) => (porOf[of] ?? {})[id] === estado)) {
      comun[id] = estado as EstadoPunto;
    }
  }
  return comun;
}

export function useMarcasRevision(ofIds: readonly string[], operarioId: string | null) {
  const [marcas, setMarcas] = useState<Record<number, EstadoPunto>>({});
  // Las ids en una cadena: como dependencia, un array nuevo en cada render
  // volvería a pedirlas sin parar.
  const clave = [...ofIds].sort().join(",");

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    fetch(`/api/revision/marcas?ofIds=${encodeURIComponent(clave)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { marcas: Record<string, Record<number, string>> }) => {
        if (vivo) setMarcas(fusionar(d.marcas ?? {}, clave.split(",")));
      })
      .catch(() => {
        // Sin marcas guardadas se empieza de cero, que es lo que había antes de
        // que esto existiera. No se bloquea la pantalla por no poder leerlas.
      });
    return () => {
      vivo = false;
    };
  }, [clave]);

  const marcar = useCallback(
    (puntoId: number, estado: EstadoPunto) => {
      // Se pinta YA y se guarda detrás: marcar ocho puntos esperando al
      // servidor en cada uno se siente roto. Si falla el guardado, la próxima
      // carga dirá la verdad.
      setMarcas((p) => ({ ...p, [puntoId]: estado }));
      void fetch("/api/revision/marcas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ofIds: clave.split(","),
          puntoId,
          // "sin mirar" no se guarda: se borra la fila.
          estado: estado === "sin_mirar" ? null : estado,
          operarioId,
        }),
      }).catch(() => {});
    },
    [clave, operarioId],
  );

  return { marcas, marcar };
}
