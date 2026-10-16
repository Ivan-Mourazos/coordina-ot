"use client";

import { useEffect, useState } from "react";
import { ahoraServidorGuardado } from "@/lib/reloj-servidor";

/** Reloj del fichaje que corre AHORA, en h:mm:ss (p.ej. "1:05:42").
 *
 *  Con segundos, no solo minutos: es la señal de que el fichaje está vivo. Un
 *  "0:03" quieto no distingue "va contando" de "se ha colgado", y el fichaje
 *  es justo lo que nadie quiere dar por hecho. Los tiempos por OF siguen en
 *  minutos (`fmtMin`, "1h 5m"): ahí lo que importa es el acumulado del día. */
export function fmtHMS(seg: number): string {
  const total = Math.max(0, Math.floor(seg));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Cuánto lleva corriendo un tramo de fichaje abierto, al segundo. Es lo que
 *  hace que el fichaje de un compañero se vea VIVO y no un punto quieto.
 *
 *  `desde` lo sella el servidor, así que se resta a la hora DEL SERVIDOR (ver
 *  lib/reloj-servidor.ts): con la local, el de producción salía un minuto
 *  desplazado. */
export function RelojVivo({ desde, className = "" }: { desde: string; className?: string }) {
  const inicio = Date.parse(desde);
  const [ahora, setAhora] = useState(() => ahoraServidorGuardado());
  useEffect(() => {
    const id = setInterval(() => setAhora(ahoraServidorGuardado()), 1_000);
    return () => clearInterval(id);
  }, []);
  if (!Number.isFinite(inicio)) return null;
  return <span className={`tabular-nums ${className}`}>{fmtHMS((ahora - inicio) / 1000)}</span>;
}
