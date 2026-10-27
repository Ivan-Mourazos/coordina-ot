"use client";

import { useEffect } from "react";

// Misma técnica que Planteamientos: React conserva sus hijos; solo medimos
// la elegida y movemos el ::before de su carril mediante variables CSS.
const CARRILES = ".tira-3d";
const ELEGIDA = ":scope > :is(.pestana-activa, .glass-chip-activo, [aria-pressed=true])";

export function PildorasDeslizantes() {
  useEffect(() => {
    let pendiente = 0;
    let cerrado = false;
    const observados = new Set<Element>();
    const preparar = new Set<HTMLElement>();
    const pedir = () => {
      if (!cerrado && !pendiente) pendiente = requestAnimationFrame(colocar);
    };
    const tamano = new ResizeObserver(pedir);

    function colocar() {
      pendiente = 0;
      const presentes = new Set<Element>();
      document.querySelectorAll<HTMLElement>(CARRILES).forEach((carril) => {
        const elegida = carril.querySelector<HTMLElement>(ELEGIDA);
        presentes.add(carril);
        if (elegida) presentes.add(elegida);
        if (!elegida || !elegida.offsetWidth) {
          delete carril.dataset.pildora;
          return;
        }
        // Una tira sin posición propia aún no es el offsetParent de sus botones
        // la primera vez: entonces se mide con los rectángulos, y desde ahí el
        // CSS ya la deja en position: relative (Planteamientos, 1709784).
        let x = elegida.offsetLeft;
        let y = elegida.offsetTop;
        if (elegida.offsetParent !== carril) {
          const a = elegida.getBoundingClientRect();
          const c = carril.getBoundingClientRect();
          x = a.left - c.left - carril.clientLeft;
          y = a.top - c.top - carril.clientTop;
        }
        carril.style.setProperty("--px", `${x}px`);
        carril.style.setProperty("--py", `${y}px`);
        carril.style.setProperty("--pw", `${elegida.offsetWidth}px`);
        carril.style.setProperty("--ph", `${elegida.offsetHeight}px`);
        if (!carril.dataset.pildora) {
          carril.dataset.pildora = "puesta";
          preparar.add(carril);
        } else if (preparar.delete(carril)) {
          carril.dataset.pildora = "lista";
        }
      });
      observados.forEach((el) => {
        if (!presentes.has(el)) {
          tamano.unobserve(el);
          observados.delete(el);
          if (el instanceof HTMLElement) preparar.delete(el);
        }
      });
      presentes.forEach((el) => {
        if (!observados.has(el)) {
          tamano.observe(el);
          observados.add(el);
        }
      });
      if (preparar.size) pedir();
    }

    const cambios = new MutationObserver(pedir);
    cambios.observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "aria-pressed", "aria-selected"],
    });
    window.addEventListener("resize", pedir);
    document.fonts.ready.then(pedir).catch(() => {});
    pedir();
    return () => {
      cerrado = true;
      cancelAnimationFrame(pendiente);
      cambios.disconnect();
      tamano.disconnect();
      window.removeEventListener("resize", pedir);
      document.querySelectorAll<HTMLElement>("[data-pildora]").forEach((el) => {
        delete el.dataset.pildora;
        ["--px", "--py", "--pw", "--ph"].forEach((p) => el.style.removeProperty(p));
      });
    };
  }, []);
  return null;
}
