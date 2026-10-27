"use client";

import { useEffect } from "react";
import { iniciarPestanasFluidas } from "@/lib/pestanasFluidas";

/** En Planteamientos se arranca desde main.tsx; aquí no hay main.tsx, así que
 *  lo arranca este componente desde el layout, como PildorasDeslizantes. */
export function PestanasFluidas() {
  useEffect(() => iniciarPestanasFluidas(), []);
  return null;
}
