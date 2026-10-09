"use client";

import { createContext, useContext } from "react";

// ─── Solo lectura ────────────────────────────────────────────────────────────
// Lo enciende el tablero para Dirección (y para quien mira «como Dirección»).
// Cada control que escribe lo pregunta y no se pinta. Contexto y no prop: los
// botones viven diez niveles por debajo de Board.
//
// Es PRESENTACIÓN, no seguridad: quien cierra la escritura es el servidor
// (toda escritura pide rol `tecnico`). Un botón que se escape da un 403.

const SoloLectura = createContext(false);

export const SoloLecturaProvider = SoloLectura.Provider;

export function useSoloLectura(): boolean {
  return useContext(SoloLectura);
}
