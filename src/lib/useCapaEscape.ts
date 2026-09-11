"use client";

import { useEffect, useRef } from "react";
import { apilarCapa } from "./capas-escape";

/** Mientras `activa`, esta capa ocupa su sitio en la pila de Escape (ver
 *  capas-escape.ts): se cierra solo cuando es la de arriba.
 *
 *  `cerrar` se lee de una ref y no entra en las dependencias. Si entrase, cada
 *  render con una función nueva sacaría la capa y la volvería a meter ARRIBA
 *  del todo, y la ficha pasaría por delante del desplegable que tiene abierto. */
export function useCapaEscape(activa: boolean, cerrar: () => void): void {
  const ultima = useRef(cerrar);
  useEffect(() => {
    ultima.current = cerrar;
  });
  useEffect(() => {
    if (!activa) return;
    return apilarCapa(() => ultima.current());
  }, [activa]);
}
