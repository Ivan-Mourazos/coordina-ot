"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HistorialItem } from "@/lib/historial";
import { personasConRol } from "@/lib/historial";
import { CENTRO_CORTO } from "@/lib/historial-centros";
import { fmtMin, ROL } from "@/lib/estado";

/** En el servidor no hay nada que medir, y `useLayoutEffect` avisa por
 *  consola si se usa allí. */
const useEfectoDeLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Ancho que hay que dejar libre para el "+N" cuando algún nombre se queda
 *  fuera. Sobra para "+12", que es más gente de la que toca un pedido. */
const ANCHO_CONTADOR = 26;

/** Quién trabajó en lo que cuenta para la fila, de más a menos horas. Solo el
 *  nombre: el tiempo de cada uno va en el `title` y en el desplegable, y el
 *  total en su columna. Con nombre y tiempo aquí, en una fila de una persona
 *  el mismo número salía dos veces.
 *
 *  Si el pedido no tiene nada de la sección, delante va el centro ("Taller ·")
 *  y la fila entera va en gris (ver FilaHistorial).
 *
 *  CUÁNTOS NOMBRES SALEN LO DECIDE EL SITIO, no un número fijo. Eran dos y un
 *  "+N": en una pantalla ancha quedaba media columna vacía diciendo "+3", y en
 *  una estrecha los dos nombres ya no entraban. Ahora se miden y se quedan los
 *  que caben, así que la misma lista dice más cuanto más ancha es la ventana. */
export function Quien({ item }: { item: HistorialItem }) {
  const autores = (item.autores ?? []).filter(Boolean);
  // Quien planteó primero y con su punto de color, pero solo si el rol consta:
  // con dos personas a la misma hora, el orden por minutos dejaba el pedido a
  // nombre de quien lo repasó.
  const personas = personasConRol(
    item.personas ?? [],
    autores,
    item.revisores ?? [],
    item.rolesRegistrados === true,
  );
  const otros = item.otrosCentros ?? [];
  const centro = otros.length > 0 ? `${otros.map((c) => CENTRO_CORTO[c]).join(" y ")} · ` : "";
  const aviso = otros.length > 0 ? "Sin tareas de la sección: es trabajo de otro centro. " : "";
  if (personas.length > 0) {
    const conRol = (p: (typeof personas)[number]) =>
      `${p.nombre} ${fmtMin(p.min)}${p.rol ? ` (${p.rol === "plantear" ? "planteó" : "revisó"})` : ""}`;
    return (
      <LosQueCaben
        personas={personas}
        centro={centro}
        apagado={otros.length > 0}
        title={`${aviso}Tiempo imputado en RPS: ${personas.map(conRol).join(" · ")}`}
      />
    );
  }
  // Registrado en CoordinaOT pero sin una hora en RPS: el nombre, que es todo
  // lo que se sabe.
  if (autores.length > 0) {
    return (
      <span className="block truncate" title={`${aviso}Registrado en CoordinaOT, sin horas imputadas en RPS`}>
        {centro}<span className="text-text">{autores.join(" y ")}</span>
      </span>
    );
  }
  if (item.pasadoPor) {
    return (
      <span className="block truncate" title={`${item.pasadoPor} pulsó "pasar a Producción"; no consta quién lo planteó.`}>
        {centro}Lo pasó {item.pasadoPor}
      </span>
    );
  }
  return <span className="block truncate italic">{centro}Sin horas registradas</span>;
}

/** Los nombres que entran en la columna, y "+N" con los que no.
 *
 *  Se pintan TODOS en el primer paso y se miden ahí mismo, antes de que el
 *  navegador dibuje nada (`useLayoutEffect`): los anchos se guardan y a partir
 *  de entonces cambiar el tamaño de la ventana solo rehace la cuenta, sin
 *  volver a montar los nombres que ya no salen.
 *
 *  Sin medir todavía salen todos y sin contador. Es lo correcto en el servidor
 *  —donde no hay columna que medir— y dura un fotograma en el navegador; poner
 *  un número a ojo saldría mal justo la primera vez. */
function LosQueCaben({
  personas,
  centro,
  apagado,
  title,
}: {
  personas: ReturnType<typeof personasConRol>;
  /** "Taller · " cuando el pedido no tiene trabajo de la sección. Ocupa sitio
   *  en la misma línea, así que se mide y se descuenta. */
  centro: string;
  apagado: boolean;
  title: string;
}) {
  // El `ref` va en el BLOQUE que recorta, no en un `<span>` en línea: en un
  // elemento en línea `clientWidth` vale siempre 0 y no cabía nunca nadie.
  const ref = useRef<HTMLDivElement>(null);
  const anchos = useRef<number[] | null>(null);
  const [caben, setCaben] = useState(personas.length);

  useEfectoDeLayout(() => {
    const el = ref.current;
    if (!el) return;
    anchos.current = null;
    const calcular = () => {
      if (!anchos.current) {
        const trozos = [...el.querySelectorAll<HTMLElement>("[data-nombre]")];
        // Solo se mide con todos delante; si ya se recortó, vale lo guardado.
        if (trozos.length < personas.length) return;
        anchos.current = trozos.map((t) => t.getBoundingClientRect().width);
      }
      const prefijo = el.querySelector<HTMLElement>("[data-centro]");
      const disponible = el.clientWidth - (prefijo?.getBoundingClientRect().width ?? 0);
      let usado = 0;
      let n = 0;
      for (let i = 0; i < anchos.current.length; i++) {
        usado += anchos.current[i];
        // El hueco del contador solo hace falta si de verdad queda alguien
        // fuera: con el último nombre no se reserva y así no sobra sitio.
        const sobraAlguien = i < anchos.current.length - 1;
        if (usado > disponible - (sobraAlguien ? ANCHO_CONTADOR : 0)) break;
        n++;
      }
      // Siempre uno, aunque no quepa entero: una columna que no dice ningún
      // nombre no vale para nada, y el `title` lleva la lista completa.
      setCaben(Math.max(1, n));
    };
    calcular();
    const ro = new ResizeObserver(calcular);
    ro.observe(el);
    return () => ro.disconnect();
  }, [personas]);

  const fuera = personas.length - caben;
  return (
    <div ref={ref} className="truncate" title={title}>
      {centro && <span data-centro="">{centro}</span>}
      <span className={apagado ? "" : "text-text"}>
        {personas.slice(0, caben).map((p, i) => (
          <span key={p.nombre} data-nombre="">
            {i > 0 && " · "}
            {p.rol && (
              <span
                aria-hidden
                className="mr-1 inline-block size-1.5 rounded-full align-middle"
                style={{ background: ROL[p.rol].color }}
              />
            )}
            {p.nombre}
          </span>
        ))}
      </span>
      {fuera > 0 && <span className="text-text-muted"> +{fuera}</span>}
    </div>
  );
}
