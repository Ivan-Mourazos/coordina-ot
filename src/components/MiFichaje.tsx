"use client";

import { useCallback, useEffect, useState } from "react";
import type { Pedido } from "@/lib/types";
import { ROL } from "@/lib/estado";
import { abierto, inicioDelTramoContinuo, previoSegundos, type Fichaje } from "@/lib/fichaje";
import { LiveDot } from "./LiveBadge";
import { fmtHMS } from "./RelojVivo";
import { ahoraDelServidor } from "@/lib/reloj-servidor";

/** "Mi fichaje": lo que estás fichando, dentro de la píldora del avatar
 *  (17/11/2026).
 *
 *  Antes era una píldora abajo a la derecha que, desplegada, enseñaba lo que
 *  corría y lo que había a medias. Nadie la abría (Iván, 17/11/2026). Ahora es
 *  un mini-resumen y un botón de pausar, y nada más:
 *
 *  · Solo existe con el reloj en marcha. Parado no se pinta nada: ni aviso de
 *    trabajo a medias ni «Reloj parado».
 *  · Vive en la píldora del avatar (Herramientas), que crece para hacerle sitio
 *    y lleva el barrido de las tarjetas de los compañeros que fichan.
 *  · Un pedido → «Planteando AR.26.05585»; varios → «Fichando varios».
 *  · Donde falta sitio (móvil, y de lg a 2xl) se queda en el punto, el reloj
 *    y el botón; el `title` sigue diciendo qué corre.
 *
 *  Quien lo monta (Board) decide si se pinta: aquí se da por hecho que hay un
 *  fichaje abierto, y si no lo hay no se devuelve nada. */
export function MiFichaje({
  pedidos,
  fichaje,
  desfaseServidor,
  onPausarTodo,
}: {
  pedidos: Pedido[];
  fichaje: Fichaje;
  /** Cuánto se aparta el reloj del servidor del de este navegador, en ms.
   *  Las horas del fichaje son suyas, así que el contador tiene que medir
   *  contra su reloj (ver lib/reloj-servidor.ts). */
  desfaseServidor: number | null;
  onPausarTodo: () => void;
}) {
  // La hora es la DEL SERVIDOR: el `inicio` de los tramos lo sella él, y
  // restarle la hora local es restar dos relojes distintos (el de producción
  // iba 60 s adelantado el 16/08/2026 y el contador se quedaba en 0:00:00).
  const reloj = useCallback(
    () => new Date(ahoraDelServidor(desfaseServidor)).toISOString(),
    [desfaseServidor],
  );
  const [ahora, setAhora] = useState(reloj);
  useEffect(() => {
    const id = setInterval(() => setAhora(reloj()), 1_000);
    return () => clearInterval(id);
  }, [reloj]);

  const ab = abierto(fichaje);
  if (!ab) return null;

  // Lo que SE VE: lo que llevas en estas OF y este rol, contando lo de antes,
  // para que al reanudar siga desde ahí y no vuelva a 0:00:00 (Iván,
  // 16/10/2026).
  const acumuladoSeg =
    ab.ofIds.reduce((n, id) => n + previoSegundos(fichaje.intervalos, ab.operarioId, ab.rol, id), 0) +
    Math.max(0, (Date.parse(ahora) - Date.parse(ab.inicio)) / 1000);
  // Para el `title`: desde que arrancó el reloj SIN PARAR (cambiar qué OF
  // corren abre un tramo nuevo sin parar nada; ver `inicioDelTramoContinuo`).
  const desde = inicioDelTramoContinuo(fichaje) ?? ab.inicio;
  const sinParar = (Date.parse(ahora) - Date.parse(desde)) / 1000;

  // QUÉ corre, por su código de pedido. Si las OF no están en el tablero que
  // se mira (fichas en una sección y miras otra) no hay código que enseñar.
  const pedidosCorriendo = pedidos.filter((p) => p.ofs.some((of) => ab.ofIds.includes(of.id)));
  const queCorre =
    pedidosCorriendo.length === 1
      ? `${ROL[ab.rol].label} ${pedidosCorriendo[0].codigo}`
      : pedidosCorriendo.length > 1
        ? "Fichando varios"
        : ROL[ab.rol].label;
  const titulo = `${ROL[ab.rol].label} en ${ab.ofIds.length} OF${
    pedidosCorriendo.length ? ` (${pedidosCorriendo.map((p) => p.codigo).join(", ")})` : ""
  } · llevas ${fmtHMS(sinParar)} sin parar`;

  return (
    <span className={`flex items-center gap-2 whitespace-nowrap pl-3 pr-1 text-xs font-bold ${ROL[ab.rol].texto}`} title={titulo}>
      <LiveDot rol={ab.rol} className="size-2" />
      {/* El rótulo es lo primero que sobra. En móvil no cabe; de lg a 2xl la
          cabecera va en una sola fila y aplastaba el buscador. Fuera de eso
          (tablet, con su fila propia, y pantalla grande) sí sale. */}
      <span className="hidden max-w-[14rem] truncate md:inline lg:hidden 2xl:inline">{queCorre}</span>
      {/* tabular-nums: sin ancho fijo de cifra, el reloj tiembla cada segundo
          y arrastra lo que tiene al lado. */}
      <span className="tabular-nums">{fmtHMS(acumuladoSeg)}</span>
      <button
        type="button"
        onClick={onPausarTodo}
        aria-label="Pausar el fichaje"
        title="Para el reloj. Las OF se quedan como están: no se cierra nada."
        className={`boton-3d grid size-6 place-items-center rounded-md text-[10px] ${ROL[ab.rol].solido}`}
      >
        ⏸
      </button>
      {/* Separa el fichaje del avatar, que sigue siendo el menú. */}
      <span aria-hidden className="ml-1 h-5 w-px bg-current opacity-25" />
    </span>
  );
}
