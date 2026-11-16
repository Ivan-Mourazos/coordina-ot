"use client";

import { useEffect, useState } from "react";
import type { PersonaPublica } from "@/lib/personas";

// Las cuentas de la web (/api/personas), para poner nombre a las menciones y
// elegir a quién va una nota. Se piden UNA vez por página y se comparten: la
// lista cambia con un alta, no mientras alguien escribe.

let cache: Promise<PersonaPublica[]> | null = null;

function pedir(): Promise<PersonaPublica[]> {
  cache ??= fetch("/api/personas", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ personas: PersonaPublica[] }>) : { personas: [] }))
    .then((d) => d.personas)
    .catch(() => {
      cache = null; // un fallo de red no se queda guardado: se reintenta luego
      return [];
    });
  return cache;
}

export function usePersonas(): PersonaPublica[] {
  const [personas, setPersonas] = useState<PersonaPublica[]>([]);
  useEffect(() => {
    let vivo = true;
    void pedir().then((p) => {
      if (vivo) setPersonas(p);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return personas;
}
