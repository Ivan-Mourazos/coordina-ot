"use client";

import { useEffect, useRef, useState } from "react";
import {
  causasParecidas,
  codificarDevolucion,
  devolucionCompleta,
  etiquetaValida,
  CAUSA_MAX,
} from "@/lib/devolucion";
import { idsDeCausas } from "@/lib/guia-revision";
import type { CausaDevolucion } from "@/lib/causas-cliente";
import { crearCausa, leerCausas } from "@/lib/causas-cliente";

/** Devolución con causas y motivo escrito ahí mismo (sustituye al window.prompt).
 *
 *  Las dos cosas hacen trabajos distintos y por eso están las dos: las CAUSAS
 *  dicen de qué tipo es el fallo y son lo que se cuenta después; la NOTA dice
 *  cuál es, con nombres y números ("la cota del primer ollao, y el largo 2 cm
 *  de más"), y es lo que el autor lee para saber dónde mirar. Sin nota no se
 *  puede devolver: una causa sola no manda a nadie a hacer nada.
 *
 *  VARIAS causas a la vez. El revisor repasa la OF entera y apunta todo lo que
 *  ve; obligarle a elegir "la principal" tiraría el resto del dato.
 *
 *  El botón de llamada NO va en rojo sólido. Aprobar y devolver competían
 *  como dos bloques de color del mismo peso, cuando lo normal es aprobar:
 *  devolver es la excepción y se pide con un botón discreto. El rojo sólido
 *  se reserva para el "Confirmar devolución" de dentro, que sí es el punto
 *  de no retorno. */
export function DevolverInline({
  onDevolver,
  miId,
  label = "Devolver con nota",
  causasSugeridas,
}: {
  onDevolver: (obs: string) => void;
  /** Quién crea la causa, si crea alguna. Solo para dejarlo apuntado. */
  miId?: string | null;
  /** Causas ya marcadas al abrir, por su etiqueta. Vienen de la guía de
   *  revisión: lo que el revisor marcó como fallo mientras repasaba.
   *
   *  Marcadas, no impuestas: se pueden quitar como cualquier otra. Y se
   *  resuelven contra la lista viva —las que no estén se caen sin ruido—,
   *  porque los ids de las causas no son los mismos en cada instalación. */
  causasSugeridas?: readonly string[];
  /** Cómo se llama la acción, de `lib/acciones.ts`. El componente traía el
   *  literal "Devolver" cosido, así que el botón decía una cosa y el dominio
   *  otra —y quien cambiara el label en `ACCIONES` no cambiaba este—. El valor
   *  por defecto es el mismo que hay allí, para que un olvido no deje el botón
   *  en blanco. */
  label?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [obs, setObs] = useState("");
  const [causas, setCausas] = useState<CausaDevolucion[]>([]);
  const [elegidas, setElegidas] = useState<number[]>([]);
  // Creando una causa nueva: null = no se está creando.
  const [nueva, setNueva] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const campoNueva = useRef<HTMLInputElement>(null);

  // La lista se pide al abrir, no al montar: hay una de estas por cada OF de la
  // pantalla y pedirlas todas de golpe serían decenas de consultas para algo
  // que casi nunca se usa.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    leerCausas().then((cs) => {
      if (!vivo) return;
      setCausas(cs);
      // Lo que la guía marcó como fallo llega ya elegido. Se hace AQUÍ y no al
      // abrir porque hasta que no está la lista no se sabe qué id tiene cada
      // etiqueta. Se añade a lo que hubiera —no se pisa—: quien abrió, cerró y
      // volvió a abrir no debería perder lo que había marcado a mano.
      if (causasSugeridas?.length) {
        const ids = idsDeCausas(causasSugeridas, cs);
        setElegidas((p) => [...new Set([...p, ...ids])]);
      }
    });
    return () => {
      vivo = false;
    };
  }, [abierto, causasSugeridas]);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-500/35 hover:bg-red-500/10 dark:text-red-400"
      >
        {label}
      </button>
    );
  }

  const devolucion = { causas: elegidas, nota: obs };
  const alternar = (id: number) =>
    setElegidas((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Las que ya existen y se parecen a lo que se está escribiendo. Es la única
  // defensa real contra la lista deshilachada: si a quien escribe "falta cota"
  // se le enseña "Error en cotas" AHORA, la pulsa. Sin esto, en dos meses hay
  // cuatro causas para el mismo fallo y las métricas no dicen nada.
  const parecidas = nueva ? causasParecidas(nueva, causas) : [];

  async function guardarNueva() {
    if (!nueva || !etiquetaValida(nueva) || creando) return;
    setCreando(true);
    const c = await crearCausa(nueva, miId ?? null);
    setCreando(false);
    if (!c) return; // el error ya se ve: el campo se queda como estaba
    // Puede volver una que YA existía (otro se adelantó, o estaba retirada):
    // se mete en la lista solo si falta, y se marca en cualquier caso — que es
    // lo que quería quien la escribió.
    setCausas((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
    setElegidas((p) => (p.includes(c.id) ? p : [...p, c.id]));
    setNueva(null);
  }

  return (
    <div className="w-full rounded-lg bg-red-500/10 p-2 ring-1 ring-red-500/30">
      <p className="mb-1.5 text-[11px] font-semibold text-text">¿Por qué vuelve al autor?</p>

      <div className="flex flex-wrap gap-1.5">
        {causas.map((c) => (
          <button
            key={c.id}
            onClick={() => alternar(c.id)}
            aria-pressed={elegidas.includes(c.id)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ${
              elegidas.includes(c.id)
                ? "bg-red-600 text-white ring-transparent"
                : "text-text-muted ring-border hover:text-text"
            }`}
          >
            {c.etiqueta}
          </button>
        ))}
        {nueva === null && (
          <button
            onClick={() => {
              setNueva("");
              // El foco al campo en cuanto exista, que si no hay que volver a
              // pulsar para escribir.
              setTimeout(() => campoNueva.current?.focus(), 0);
            }}
            className="rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted ring-1 ring-dashed ring-border hover:text-text"
          >
            + Nueva causa
          </button>
        )}
      </div>

      {nueva !== null && (
        <div className="mt-1.5">
          <div className="flex gap-1.5">
            <input
              ref={campoNueva}
              value={nueva}
              maxLength={CAUSA_MAX}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void guardarNueva();
                }
                // Escape cierra el campo, no el cuadro entero: lo segundo
                // perdería la nota ya escrita.
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setNueva(null);
                }
              }}
              placeholder="Cómo se llama esta causa…"
              aria-label="Nombre de la causa nueva"
              className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-red-400"
            />
            <button
              onClick={() => void guardarNueva()}
              disabled={!etiquetaValida(nueva) || creando}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted ring-1 ring-border hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              Crear
            </button>
          </div>
          {parecidas.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-text-muted">
              Ya existe:
              {parecidas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    if (!elegidas.includes(c.id)) alternar(c.id);
                    setNueva(null);
                  }}
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-text ring-1 ring-border hover:bg-[var(--glass-highlight)]"
                >
                  {c.etiqueta}
                </button>
              ))}
            </p>
          )}
        </div>
      )}

      <textarea
        autoFocus
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierto(false);
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
            onDevolver(codificarDevolucion(devolucion));
        }}
        placeholder="Qué hay que corregir (la cota, la medida, el color…)"
        rows={2}
        className="mt-1.5 w-full resize-none rounded-md bg-surface px-2 py-1.5 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-red-400"
      />

      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          onClick={() => onDevolver(codificarDevolucion(devolucion))}
          disabled={!devolucionCompleta(devolucion)}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Confirmar devolución
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-text-muted hover:text-text"
        >
          Cancelar
        </button>
        {/* Se dice POR QUÉ está apagado el botón. Sin esto parece que la web se
            ha roto: las causas están puestas y no deja seguir. */}
        {!devolucionCompleta(devolucion) && (
          <span className="text-[10px] text-text-muted">
            Escribe qué hay que corregir
          </span>
        )}
      </div>
    </div>
  );
}
