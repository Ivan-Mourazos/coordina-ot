"use client";

import { useState } from "react";

/** Contenido que aparece y desaparece con animación al desplegar una fila.
 *
 *  El truco de cerrar está en NO desmontar a la primera: React quitaría el nodo
 *  antes de que se vea nada y el cierre saldría seco. Aquí el hijo se queda
 *  montado mientras dura la animación de plegado y se va en `onAnimationEnd`,
 *  que es un manejador de evento y no un efecto — nada de temporizadores que
 *  adivinen la duración por su cuenta y se descuadren al tocar el CSS.
 *
 *  El paso de "cerrado" a "montado" se ajusta DURANTE el render, no en un
 *  efecto: el efecto provocaría un segundo render en cascada (y el lint lo
 *  rechaza). Es el mismo patrón que ya usa `MiFichaje`. React descarta este
 *  render y vuelve a empezar con el valor nuevo, así que el hijo nunca llega a
 *  pintarse ya desplegado y la animación de apertura sí se ve desde el frame
 *  cero.
 *
 *  Con `prefers-reduced-motion` las animaciones se anulan en globals.css; ojo,
 *  entonces `onAnimationEnd` no llega, así que el desmontado al cerrar se
 *  resuelve igualmente porque `montado` se apaga en el mismo render en que
 *  `abierto` pasa a false (ver abajo). */
export function Desplegable({
  abierto,
  children,
}: {
  abierto: boolean;
  children: React.ReactNode;
}) {
  const [montado, setMontado] = useState(false);
  // Sin animaciones (reduced motion) no hay `animationend` que espere: se
  // detecta preguntándoselo al navegador, no dejando el nodo colgado.
  const animado =
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (abierto && !montado) setMontado(true);
  if (!abierto && montado && !animado) setMontado(false);
  if (!abierto && !montado) return null;

  return (
    <div
      className={`desplegable ${abierto ? "desplegable-abre" : "desplegable-cierra"}`}
      onAnimationEnd={(e) => {
        // Solo la animación de ESTA caja. `animationend` burbujea, y dentro del
        // detalle hay cosas animadas (el punto pulsante de quien está fichando,
        // sin ir más lejos): sin esta guarda, la animación de un hijo cerraría
        // el panel de golpe a media apertura.
        if (e.target !== e.currentTarget) return;
        if (!abierto) setMontado(false);
      }}
    >
      <div>{children}</div>
    </div>
  );
}
