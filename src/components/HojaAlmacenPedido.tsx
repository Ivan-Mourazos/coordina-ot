"use client";

import { useEffect, useState } from "react";
import type { LineaAlmacen } from "@/lib/vista-belen";
import { AcentoBloque } from "./AcentoBloque";
import { TITULO_BLOQUE } from "./MarcoFicha";
import { FilasHojaAlmacen } from "./vista-belen/HojaAlmacenBelen";

// ─── La hoja de almacén del pedido, EN LA FICHA DE OT ────────────────────────
// Las líneas del pedido que no llevan OF porque las sirve Almacén (casilla
// «Pedido almacén» en RPS), con lo que Almacén ya traspasó: las mismas filas
// que ve Producción. Debajo de las OF: completa el pedido sin tapar el trabajo.
// Solo OT; Diseño no la usa (Iván, 20/11/2026).
//
// Se pide al abrir la ficha (una consulta pequeña) y sale SOLO si hay líneas.
// Si RPS falla, tampoco sale: es información, no algo que haga falta para
// trabajar.

export function HojaAlmacenPedido({ pedido }: { pedido: string }) {
  const [lineas, setLineas] = useState<LineaAlmacen[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/vista-belen?almacen=${encodeURIComponent(pedido)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { almacen: LineaAlmacen[] }) => vivo && setLineas(d.almacen ?? []))
      .catch(() => vivo && setLineas([]));
    return () => {
      vivo = false;
    };
  }, [pedido]);

  if (!lineas?.length) return null;
  const sinHacer = lineas.filter((l) => l.traspasadas <= 0).length;
  return (
    <section className="mb-4">
      <h3 data-bloque="almacen" className={`cabecera-bloque mb-1 flex items-center gap-2 ${TITULO_BLOQUE}`}>
        <AcentoBloque tipo="almacen" />
        Hoja de almacén ({lineas.length})
        {sinHacer > 0 && (
          <span className="font-normal normal-case tracking-normal text-text-muted">· {sinHacer} sin hacer</span>
        )}
      </h3>
      <FilasHojaAlmacen lineas={lineas} apretado />
    </section>
  );
}
