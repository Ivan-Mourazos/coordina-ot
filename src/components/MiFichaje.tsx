"use client";

import { useCallback, useEffect, useState } from "react";
import { IconoPausa } from "./Iconos";
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
  franja,
}: {
  pedidos: Pedido[];
  fichaje: Fichaje;
  /** Cuánto se aparta el reloj del servidor del de este navegador, en ms.
   *  Las horas del fichaje son suyas, así que el contador tiene que medir
   *  contra su reloj (ver lib/reloj-servidor.ts). */
  desfaseServidor: number | null;
  onPausarTodo: () => void;
  /** Pintado como franja en la cabecera de la ficha del pedido, y no en la
   *  píldora del avatar. La ficha (con el parte abierto) tapa la cabecera de
   *  la web, y solo se sabía qué corría bajando a las OF —y nada si el reloj
   *  era de OTRO pedido— (Iván, 18/11/2026). */
  franja?: {
    /** El pedido de la ficha abierta. */
    pedidoId: string;
    /** «Ir»: abre el pedido que se está fichando. */
    onIr: (codigo: string) => void;
  };
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

  if (franja) {
    const aqui = pedidosCorriendo.some((p) => p.id === franja.pedidoId);
    // Lo que corre fuera de esta ficha. Sin pedido conocido (fichas en otra
    // sección) no hay a dónde ir, pero el aviso sigue valiendo.
    const fuera = pedidosCorriendo.filter((p) => p.id !== franja.pedidoId);
    const irA = !aqui && fuera.length === 1 ? fuera[0] : null;
    // La frase entera va al `title` y al lector de pantalla; en la píldora,
    // la corta, que comparte línea con el código del pedido.
    const largo = aqui
      ? // Si además corren OF de otro pedido, que no se pierda.
        `${ROL[ab.rol].label} este pedido${fuera.length ? ` y ${fuera.length === 1 ? fuera[0].codigo : `${fuera.length} más`}` : ""}`
      : fuera.length === 1
        ? `${ROL[ab.rol].label} otro pedido: ${fuera[0].codigo}`
        : fuera.length > 1
          ? `${ROL[ab.rol].label} otros ${fuera.length} pedidos`
          : `${ROL[ab.rol].label} otro pedido`;
    const corto = aqui
      ? `${ROL[ab.rol].label}${fuera.length ? ` (+${fuera.length})` : ""}`
      : fuera.length === 1
        ? `En ${fuera[0].codigo}`
        : fuera.length > 1
          ? `En ${fuera.length} pedidos`
          : "Otro pedido";
    return (
      <div
        role="status"
        title={`${largo} · ${titulo}`}
        // Va EN la línea del código, no en una suya encima: con línea propia,
        // al empezar a fichar todo el bloque de la ficha bajaba de golpe
        // (Iván, 27/11/2026). Por eso es corta y se encoge antes que el código.
        //
        // El mismo barrido que la tarjeta de quien ficha (`fila-fichando-*`,
        // hero.css), en píldora de HeroUI: radio entero, sin borde y la sombra
        // de los paneles. Si el reloj es de OTRO pedido, la onda va en ámbar
        // (`franja-fichaje-otro`): es un aviso, no lo que tienes delante.
        className={`fila-fichando-${ab.rol} ${aqui ? ROL[ab.rol].texto : "franja-fichaje-otro text-amber-800 dark:text-amber-200"} flex min-w-0 shrink items-center gap-2 whitespace-nowrap rounded-full py-0.5 pl-3 pr-0.5 text-xs font-bold shadow-[var(--hero-sombra-panel)]`}
      >
        <LiveDot rol={ab.rol} className="size-2 shrink-0" />
        <span aria-hidden className="min-w-0 truncate">{corto}</span>
        <span className="sr-only">{largo}</span>
        <span className="sr-only">{titulo}</span>
        <span className="shrink-0 tabular-nums">{fmtHMS(acumuladoSeg)}</span>
        {irA && (
          <button
            type="button"
            onClick={() => franja.onIr(irA.codigo)}
            title={`Abre ${irA.codigo}`}
            className="shrink-0 rounded-full bg-[var(--hero-relleno)] px-2.5 py-1 text-text hover:bg-[var(--hero-relleno-encima)] active:scale-[.97] motion-reduce:active:scale-100"
          >
            Ir
          </button>
        )}
        <button
          type="button"
          onClick={onPausarTodo}
          aria-label="Pausar el fichaje"
          title="Para el reloj. Las OF se quedan como están: no se cierra nada."
          className={`grid size-6 shrink-0 place-items-center rounded-full active:scale-[.97] motion-reduce:active:scale-100 text-[10px] ${ROL[ab.rol].solido}`}
        >
          <IconoPausa className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <span className={`flex items-center gap-2 whitespace-nowrap pl-3 pr-1 text-xs font-bold ${ROL[ab.rol].texto}`} title={titulo}>
      <LiveDot rol={ab.rol} className="size-2" />
      {/* El rótulo es lo primero que sobra. En móvil no cabe; de lg a 2xl la
          cabecera va en una sola fila y aplastaba el buscador. Fuera de eso
          (tablet, con su fila propia, y pantalla grande) sí sale. */}
      <span aria-hidden className="hidden max-w-[14rem] truncate md:inline lg:hidden 2xl:inline">
        {queCorre}
      </span>
      {/* El de arriba se esconde con `display: none` y el `title` de un span no
          lo lee nadie: los lectores de pantalla tienen este, siempre. */}
      <span className="sr-only">{titulo}</span>
      {/* tabular-nums: sin ancho fijo de cifra, el reloj tiembla cada segundo
          y arrastra lo que tiene al lado. */}
      <span className="tabular-nums">{fmtHMS(acumuladoSeg)}</span>
      <button
        type="button"
        onClick={onPausarTodo}
        aria-label="Pausar el fichaje"
        title="Para el reloj. Las OF se quedan como están: no se cierra nada."
        className={`grid size-6 place-items-center rounded-md text-[10px] ${ROL[ab.rol].solido}`}
      >
        <IconoPausa className="size-3" />
      </button>
      {/* Separa el fichaje del avatar, que sigue siendo el menú. */}
      <span aria-hidden className="ml-1 h-5 w-px bg-current opacity-25" />
    </span>
  );
}
