"use client";

import { useEffect, useRef, useState } from "react";
import {
  causasParecidas,
  codificarDevolucion,
  devolucionCompleta,
  etiquetaValida,
  CAUSA_MAX,
} from "@/lib/devolucion";
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
  familias,
  ofs,
}: {
  /** Devuelve. `ofIds` dice a CUÁLES: si no se pasa, a todas las del grupo.
   *  Quien lo llama decide qué significa "todas" — este componente solo sabe
   *  lo que le hayan dado en `ofs`. */
  onDevolver: (obs: string, ofIds?: string[]) => void;
  /** Las OF que están a punto de volver. Con más de una, se puede elegir a
   *  cuáles va la nota: el fallo suele ser de UNA (la cota de la lona 2 de un
   *  pedido de cinco) y devolver las cinco manda a corregir cuatro que están
   *  bien. Con una sola no se pregunta nada. */
  ofs?: readonly { id: string; codigo: string }[];
  /** Quién crea la causa, si crea alguna. Solo para dejarlo apuntado. */
  miId?: string | null;
  /** Causas ya marcadas al abrir. Vienen de la guía de revisión: lo que el
   *  revisor marcó como fallo mientras repasaba. Marcadas, no impuestas: se
   *  pueden quitar como cualquier otra. */
  causasSugeridas?: readonly number[];
  /** De qué familias es el trabajo. Solo se ofrecen las causas genéricas y las
   *  de estas familias: el que devuelve una funda no tiene por qué elegir entre
   *  ocho causas sobre aumentos y simetría de lona. Sin familias, salen todas
   *  —es lo que hay que hacer cuando no se sabe de qué es. */
  familias?: readonly string[];
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
  // A cuáles va. Empieza con TODAS marcadas: es lo que hacía antes este botón,
  // y lo normal sigue siendo que el pedido vuelva entero. Quitar las que están
  // bien es un gesto de más para el caso raro, no al revés.
  const [ofsElegidas, setOfsElegidas] = useState<string[]>(() =>
    (ofs ?? []).map((o) => o.id),
  );

  // DEVOLVER DE UNA EN UNA, cada una con su texto. Al confirmar la primera,
  // esa OF deja de estar en revisión y desaparece de `ofs`; sin esto, el
  // cuadro se quedaba abierto con la nota de la anterior escrita y marcando
  // una OF que ya no está — y el siguiente "Confirmar" no habría devuelto
  // nada. Se poda lo que ya no existe y, si no queda nada marcado, se marcan
  // las que quedan: el revisor sigue escribiendo la nota de la siguiente.
  //
  // Durante el render y no en un efecto, como el resto de la casa.
  const idsActuales = (ofs ?? []).map((o) => o.id).join("|");
  const [idsPrevios, setIdsPrevios] = useState(idsActuales);
  if (idsActuales !== idsPrevios) {
    setIdsPrevios(idsActuales);
    const vivas = ofsElegidas.filter((id) => (ofs ?? []).some((o) => o.id === id));
    setOfsElegidas(vivas.length > 0 ? vivas : (ofs ?? []).map((o) => o.id));
  }

  // La lista se pide al abrir, no al montar: hay una de estas por cada OF de la
  // pantalla y pedirlas todas de golpe serían decenas de consultas para algo
  // que casi nunca se usa.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    leerCausas().then((cs) => {
      if (!vivo) return;
      setCausas(cs);
      // Lo que la guía marcó como fallo llega ya elegido. Se añade a lo que
      // hubiera —no se pisa—: quien abrió, cerró y volvió a abrir no debería
      // perder lo que había marcado a mano.
      if (causasSugeridas?.length) {
        setElegidas((p) => [...new Set([...p, ...causasSugeridas])]);
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
  // Sin OF que elegir se manda undefined, que es lo que ya entendían los que
  // llamaban a esto antes: "a todas las del grupo".
  const confirmar = () => {
    onDevolver(codificarDevolucion(devolucion), ofs ? ofsElegidas : undefined);
    // El cuadro se queda abierto y limpio cuando quedan OF por decidir: es lo
    // que permite devolver dos con motivos distintos sin volver a abrirlo. La
    // nota y las causas se borran a propósito — son de la que acaba de irse, y
    // heredarlas sería mandar el fallo de una a otra.
    if (ofs && ofs.length > ofsElegidas.length) {
      setObs("");
      setElegidas([]);
    } else {
      setAbierto(false);
    }
  };
  // Ni causas sin nota, ni una devolución que no vuelve a ninguna parte.
  const listo = devolucionCompleta(devolucion) && (!ofs || ofsElegidas.length > 0);
  const alternar = (id: number) =>
    setElegidas((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Las genéricas y las de este trabajo. Las de otras familias no se ofrecen
  // —sobran— pero una que ya esté marcada SÍ se enseña: puede venir de la guía
  // o de un pedido con dos familias, y hacerla desaparecer sin poder quitarla
  // dejaría marcada una causa invisible.
  const suyas = new Set((familias ?? []).map((f) => f.toUpperCase()));
  const ofrecidas = causas.filter(
    (c) =>
      c.familia === null ||
      !familias ||
      suyas.has(c.familia.toUpperCase()) ||
      elegidas.includes(c.id),
  );

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
      {/* A CUÁLES VUELVE, lo primero: decide sobre qué va todo lo de abajo.
          Solo con más de una — con una sola no hay nada que elegir y preguntar
          sobraría. El fallo suele ser de UNA (la cota de la lona 2 de un pedido
          de cinco), y hasta ahora la nota iba a las cinco: cuatro personas
          leyendo que corrijan algo que está bien. */}
      {ofs && ofs.length > 1 && (
        <div className="mb-2">
          <p className="mb-1 text-[11px] font-semibold text-text">¿Qué vuelve?</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {ofs.map((o) => {
              const puesta = ofsElegidas.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() =>
                    setOfsElegidas((p) =>
                      p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id],
                    )
                  }
                  aria-pressed={puesta}
                  className={`rounded-md px-2 py-1 font-mono text-[11px] font-semibold ring-1 ${
                    puesta
                      ? "bg-red-600 text-white ring-transparent"
                      : "text-text-muted ring-border hover:text-text"
                  }`}
                >
                  {o.codigo}
                </button>
              );
            })}
            {ofsElegidas.length !== ofs.length && (
              <button
                onClick={() => setOfsElegidas(ofs.map((o) => o.id))}
                className="text-[10px] font-semibold text-text-muted underline underline-offset-2 hover:text-text"
              >
                todas
              </button>
            )}
          </div>
        </div>
      )}

      <p className="mb-1.5 text-[11px] font-semibold text-text">¿Por qué vuelve al autor?</p>

      <div className="flex flex-wrap gap-1.5">
        {ofrecidas.map((c) => (
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
            confirmar();
        }}
        placeholder="Qué hay que corregir (la cota, la medida, el color…)"
        rows={2}
        className="mt-1.5 w-full resize-none rounded-md bg-surface px-2 py-1.5 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-red-400"
      />

      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          onClick={confirmar}
          disabled={!listo}
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
