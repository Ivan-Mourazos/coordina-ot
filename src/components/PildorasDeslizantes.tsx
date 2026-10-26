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
        if (!elegida || elegida.offsetParent !== carril || !elegida.offsetWidth) {
          delete carril.dataset.pildora;
          return;
        }
        carril.style.setProperty("--px", `${elegida.offsetLeft}px`);
        carril.style.setProperty("--py", `${elegida.offsetTop}px`);
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
