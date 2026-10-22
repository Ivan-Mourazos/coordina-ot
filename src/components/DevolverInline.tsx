"use client";

import { useEffect, useRef, useState } from "react";
import { codificarDevolucion, lineasDe, notaDeLaGuia } from "@/lib/devolucion";
import type { CausaDevolucion } from "@/lib/causas-cliente";
import { leerCausas } from "@/lib/causas-cliente";
import type { FalloGuia } from "@/lib/guia-revision";
import { SelectorOFs, useElegidas } from "./SelectorOFs";

// ─── Cómo se devuelve (16/10/2026, con Iván y un compañero) ──────────────────
// · LLEGA RELLENO DESDE LA GUÍA: las causas de los pasos que fallan, ya
//   puestas, y la nota escrita, una línea por paso con lo que se apuntó en él.
//   Antes se marcaba el fallo en la guía, se volvía a elegir la causa aquí y se
//   escribía la nota de memoria: tres veces lo mismo, y en producción ninguna
//   de las 8 devoluciones desde el 11/10 llevaba causa.
// · TODA DEVOLUCIÓN LLEVA CAUSA: una de la lista u «Otra cosa» con texto.
// · LAS CAUSAS NO SE CREAN AQUÍ: se gestionan en «Pasos y causas». Desde aquí
//   salían repetidas y mal escritas («Faltan anotaciones de material», «Faltan
//   Anotacións»): de 15, 10 acabaron retiradas. Lo que no encaja va a «Otra
//   cosa»; si se repite, se crea allí.

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
  label = "Devolver con nota",
  causasSugeridas,
  fallos = [],
  familias,
  ofs,
  impedido,
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
  /** Por qué no se puede devolver todavía. Hoy: quedan puntos de la guía sin
   *  mirar. Mandar una OF atrás sin haberla repasado entera deja al autor con
   *  media corrección, y a la vuelta aparecerá lo que no se llegó a mirar. */
  impedido?: string | null;
  /** Causas ya marcadas al abrir. Vienen de la guía de revisión: lo que el
   *  revisor marcó como fallo mientras repasaba. Marcadas, no impuestas: se
   *  pueden quitar como cualquier otra. */
  causasSugeridas?: readonly number[];
  /** Lo que la guía marcó como fallo, con su causa y lo que se escribió en
   *  cada paso. Sus causas llegan puestas y la nota sale de aquí. */
  fallos?: readonly FalloGuia[];
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
  // LÍNEAS DE CORRECCIÓN, no un cuadro de texto (22/10/2026). Los revisores ya
  // escribían una cosa por renglón con guiones a mano, y el autor las marca
  // una a una al corregir (ver NotaDevolucion). Se guardan igual que antes:
  // una por línea dentro de la nota.
  const [lineas, setLineas] = useState<string[]>([""]);
  const obs = lineas.map((l) => l.trim()).filter(Boolean).join("\n");
  const campos = useRef<(HTMLInputElement | null)[]>([]);
  // Tras pintar: la línea nueva aún no existe cuando se pide el foco.
  const setEnfocar = (i: number) => requestAnimationFrame(() => campos.current[i]?.focus());
  const cambiarLinea = (i: number, valor: string) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? valor : l)));
  const insertarLineas = (i: number, nuevas: string[]) => {
    setLineas((ls) => [...ls.slice(0, i + 1), ...nuevas, ...ls.slice(i + 1)]);
    setEnfocar(i + nuevas.length);
  };
  const quitarLinea = (i: number) => {
    setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [""]));
    setEnfocar(Math.max(0, i - 1));
  };
  const [causas, setCausas] = useState<CausaDevolucion[]>([]);
  const [elegidas, setElegidas] = useState<number[]>([]);
  // «Otra cosa»: lo que no encaja en ninguna causa. Pide texto.
  const [otra, setOtra] = useState(false);
  // Las causas de la guía, sumadas a las sugeridas a mano.
  const deLaGuia = [...new Set([...(causasSugeridas ?? []), ...fallos.map((f) => f.causaId)])];
  const claveGuia = deLaGuia.join(",");
  // A cuáles va. Empieza con TODAS marcadas: es lo que hacía antes este botón,
  // y lo normal sigue siendo que el pedido vuelva entero. Quitar las que están
  // bien es un gesto de más para el caso raro, no al revés.
  //
  // El hook poda solo las que van desapareciendo al encadenar devoluciones
  // (ver useElegidas): se devuelve una, sale de revisión, y el cuadro se
  // queda con las que quedan.
  const [ofsElegidas, setOfsElegidas] = useElegidas(ofs ?? []);
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
      if (claveGuia) {
        setElegidas((p) => [...new Set([...p, ...claveGuia.split(",").map(Number)])]);
      }
    });
    return () => {
      vivo = false;
    };
  }, [abierto, claveGuia]);

  if (!abierto) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          onClick={() => setAbierto(true)}
          disabled={!!impedido}
          title={impedido ?? undefined}
          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-500/35 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
        >
          {label}
        </button>
        {impedido && <span className="text-[10px] text-text-muted">{impedido}</span>}
      </span>
    );
  }

  // La nota: las líneas de la guía y, detrás, lo que se añada a mano.
  const nota = notaDeLaGuia(fallos, obs);
  const devolucion = { causas: elegidas, pasos: fallos.map((f) => f.pasoId), nota };
  // Sin OF que elegir se manda undefined, que es lo que ya entendían los que
  // llamaban a esto antes: "a todas las del grupo".
  const confirmar = () => {
    if (!listo) return;
    onDevolver(codificarDevolucion(devolucion), ofs ? ofsElegidas : undefined);
    // El cuadro se queda abierto y limpio cuando quedan OF por decidir: es lo
    // que permite devolver dos con motivos distintos sin volver a abrirlo. La
    // nota y las causas se borran a propósito — son de la que acaba de irse, y
    // heredarlas sería mandar el fallo de una a otra.
    if (ofs && ofs.length > ofsElegidas.length) {
      setLineas([""]);
      setElegidas([]);
      setOtra(false);
    } else {
      setAbierto(false);
    }
  };
  // TODA DEVOLUCIÓN LLEVA CAUSA (una de la lista u «Otra cosa»), una nota que
  // diga qué corregir —«Otra cosa» la pide escrita—, y alguna OF a la que ir.
  const faltaCausa = elegidas.length === 0 && !otra;
  const faltaNota = !nota.trim() || (otra && elegidas.length === 0 && !obs.trim());
  const listo = !faltaCausa && !faltaNota && (!ofs || ofsElegidas.length > 0);
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

  return (
    <div className="w-full rounded-lg bg-red-500/10 p-2 ring-1 ring-red-500/30">
      {/* A CUÁLES VUELVE, lo primero: decide sobre qué va todo lo de abajo.
          El fallo suele ser de UNA (la cota de la lona 2 de un pedido de cinco),
          y hasta ahora la nota iba a las cinco. */}
      {ofs && (
        <SelectorOFs ofs={ofs} elegidas={ofsElegidas} onCambiar={setOfsElegidas} tono="devolver" />
      )}
      <p className="mb-1.5 text-[11px] font-semibold text-text">¿Por qué vuelve al autor?</p>

      {/* UNA POR LÍNEA, no en fila envuelta. Empezaron siendo tres píldoras y
          cabían de sobra; ahora son once y se amontonaban en un panel de columna
          —dos y media por renglón, cada una empezando donde acababa la anterior—
          y había que leérselas todas para encontrar la que se busca. En columna
          se recorren con la vista de arriba abajo, que es como se lee una lista.
          Y la casilla delante dice de un vistazo cuáles llevas marcadas. */}
      <ul className="flex flex-col gap-px">
        {ofrecidas.map((c) => {
          const puesta = elegidas.includes(c.id);
          return (
            <li key={c.id}>
              <button
                onClick={() => alternar(c.id)}
                aria-pressed={puesta}
                className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-snug hover:bg-red-500/10 ${
                  puesta ? "font-semibold text-text" : "text-text-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-3.5 shrink-0 place-items-center rounded text-[9px] font-bold ${
                    puesta ? "bg-red-600 text-white" : "ring-1 ring-border"
                  }`}
                >
                  {puesta ? "✓" : ""}
                </span>
                {c.etiqueta}
              </button>
            </li>
          );
        })}
      </ul>

      {/* «Otra cosa»: lo que no encaja en ninguna. Cuenta como devolución sin
          causa de la lista, y pide escribirlo abajo. Si se repite, se crea
          la causa en «Pasos y causas». */}
      <button
        onClick={() => setOtra((o) => !o)}
        aria-pressed={otra}
        className={`mt-px flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-snug hover:bg-red-500/10 ${
          otra ? "font-semibold text-text" : "text-text-muted"
        }`}
      >
        <span
          aria-hidden="true"
          className={`grid size-3.5 shrink-0 place-items-center rounded text-[9px] font-bold ${
            otra ? "bg-red-600 text-white" : "ring-1 ring-border"
          }`}
        >
          {otra ? "✓" : ""}
        </span>
        Otra cosa (escríbela abajo)
      </button>

      {/* Lo que dirá la nota, sacado de la guía: una línea por paso que falla.
          Es lo que el autor recibirá como lista de qué corregir. */}
      {fallos.length > 0 && (
        <div className="mt-1.5 rounded-md bg-surface px-2 py-1.5 text-[11px] ring-1 ring-border">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            De la guía
          </p>
          <ul className="space-y-0.5">
            {fallos.map((f) => (
              <li key={f.pasoId} className="text-text">
                <span className="font-bold text-error">✗</span> {f.mira}
                {f.comentario ? <span className="text-text-muted"> — {f.comentario}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Una línea por cosa a corregir. Intro abre la siguiente y borrar una
          vacía la quita, como en una lista de cualquier editor; pegar un texto
          de varios renglones lo reparte en líneas. */}
      <ol className="mt-1.5 space-y-1">
        {lineas.map((l, i) => (
          <li key={i} className="flex items-center gap-1">
            <span aria-hidden="true" className="w-3 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
              {i + 1}
            </span>
            <input
              ref={(el) => {
                campos.current[i] = el;
              }}
              autoFocus={i === 0}
              value={l}
              aria-label={`Corrección ${i + 1}`}
              onChange={(e) => cambiarLinea(i, e.target.value)}
              onPaste={(e) => {
                const partes = lineasDe(e.clipboardData.getData("text"));
                if (partes.length < 2) return;
                e.preventDefault();
                cambiarLinea(i, `${l}${partes[0]}`);
                insertarLineas(i, partes.slice(1));
              }}
              onKeyDown={(e) => {
                // Escape pliega el cuadro y se queda aquí: sin cortarlo, llegaba a
                // la ficha y la cerraba también.
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAbierto(false);
                } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  confirmar();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (l.trim()) insertarLineas(i, [""]);
                } else if (e.key === "Backspace" && !l && lineas.length > 1) {
                  e.preventDefault();
                  quitarLinea(i);
                }
              }}
              placeholder={
                i > 0
                  ? "Otra cosa a corregir"
                  : fallos.length > 0
                    ? "Algo más que decirle (opcional)"
                    : "Qué hay que corregir (la cota, la medida, el color…)"
              }
              className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-red-400"
            />
            {lineas.length > 1 && (
              <button
                type="button"
                onClick={() => quitarLinea(i)}
                aria-label={`Quitar la corrección ${i + 1}`}
                title="Quitar esta línea"
                className="grid size-5 shrink-0 place-items-center rounded text-xs text-text-muted hover:bg-red-500/10 hover:text-text"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => insertarLineas(lineas.length - 1, [""])}
        className="mt-1 ml-4 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-text-muted hover:bg-red-500/10 hover:text-text"
      >
        + Añadir línea
      </button>

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
        {(faltaCausa || faltaNota) && (
          <span className="text-[10px] text-text-muted">
            {faltaCausa ? "Marca una causa u «Otra cosa»" : "Escribe qué hay que corregir"}
          </span>
        )}
      </div>
    </div>
  );
}
