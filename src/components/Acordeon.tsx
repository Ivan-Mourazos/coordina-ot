"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";

/** Un único id evita que cada fila conserve su propio «abierto». Los ámbitos
 *  separan las descripciones de OF de los bloques de la ficha: leer una
 *  descripción no debe cerrar Documentos ni afectar a la lista de detrás. */
export function useAcordeon(inicial: string | null = null) {
  const [abierto, setAbierto] = useState<string | null>(inicial);
  return {
    abierto,
    alternar: (id: string) => setAbierto((prev) => prev === id ? null : id),
  };
}

type Tipo = "bloques" | "descripciones" | "filas";
const Contexto = createContext<Partial<Record<Tipo, ReturnType<typeof useAcordeon>>>>({});

export function GrupoAcordeon({ tipo, children }: { tipo: Tipo; children: ReactNode }) {
  const anterior = useContext(Contexto);
  const acordeon = useAcordeon();
  return <Contexto value={{ ...anterior, [tipo]: acordeon }}>{children}</Contexto>;
}

export function useElementoAcordeon(tipo: Tipo, abiertoDeSalida = false) {
  const id = useId();
  const local = useAcordeon(abiertoDeSalida ? id : null);
  const grupos = useContext(Contexto);
  const grupo = grupos[tipo] ?? local;
  return { abierto: grupo.abierto === id, alternar: () => grupo.alternar(id) };
}
