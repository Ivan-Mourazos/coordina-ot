"use client";

import { useEffect, useRef, useState } from "react";
import type { EstadoPunto, PuntoGuia } from "@/lib/guia-revision";

// ─── Qué mirar al revisar ────────────────────────────────────────────────────
// Los puntos que se repasan, al lado de la OF que se está revisando. Salen de
// las causas de devolución vistas del derecho (ver lib/guia-revision.ts) y solo
// los de las familias de este pedido.
//
// MARCAR UN FALLO NO ABRE NADA. Es la decisión de la que depende que esto
// sirva: si el primer fallo abriera el cuadro de devolver, el revisor lo
// escribiría ahí mismo y los puntos siguientes no se llegarían a mirar — y la
// OF volvería otra vez la semana que viene por lo que había dos líneas más
// abajo. Se marca, se sigue bajando, y al final se devuelve UNA vez con todo.
//
// Tres estados y no una casilla: "sin mirar" y "bien" no son lo mismo. Con una
// sola casilla, lo no marcado diría a la vez "no he llegado" y "está mal".
//
// SE MARCA SOLO LO QUE FALLA (Iván, 27/11/2026). El ✓ queda para quien quiera
// llevar la cuenta, pero ya no hace falta tocar cada paso para aprobar: lo que
// bloquea es una ✗ puesta (no se aprueba) o una ✗ sin texto (no se devuelve).
// Ver `bloqueosDeLaGuia`.
//
// Lo marcado SE GUARDA mientras dura la revisión (ver useMarcasRevision): de
// ello depende poder aprobar, y perderlo al refrescar obligaba a repasarlo
// todo. Se borra al aprobar o devolver.
//
// QUÉ FALLA, EN EL MISMO SITIO (16/10/2026). Junto a cada ✗ sale una línea para
// decirlo («la cota del primer ollao»). Es lo que se escribía después, de
// memoria, en la nota de la devolución: ahora la nota sale de aquí, paso a
// paso, y el autor recibe una lista de qué corregir.
//
// SEGUNDA VUELTA. Lo que falló la vez anterior va arriba y señalado: se repasa
// todo igual —una corrección puede estropear otra cosa—, pero empezando por lo
// que había que corregir.

export function GuiaRevision({
  puntos,
  marcas,
  onMarcar,
  abierta,
  onAbrir,
  comentarios = {},
  fallaronAntes,
}: {
  puntos: readonly PuntoGuia[];
  marcas: Readonly<Record<number, EstadoPunto>>;
  onMarcar: (id: number, estado: EstadoPunto, comentario?: string) => void;
  abierta: boolean;
  onAbrir: (abierta: boolean) => void;
  /** Qué falla en cada ✗, por paso. */
  comentarios?: Readonly<Record<number, string>>;
  /** Los pasos que fallaron en la devolución anterior (ver `leerDevolucion`). */
  fallaronAntes?: ReadonlySet<number>;
}) {
  // Sin puntos no se pinta nada. Pasa cuando alguien retira todas las de una
  // familia, y un recuadro vacío titulado "Qué mirar" sería peor que nada.
  const [recien, setRecien] = useState<number | null>(null);
  if (puntos.length === 0) return null;
  // Lo que falló la otra vez, primero; el resto en su orden.
  const ordenados = fallaronAntes?.size
    ? [...puntos.filter((p) => fallaronAntes.has(p.id)), ...puntos.filter((p) => !fallaronAntes.has(p.id))]
    : puntos;

  const fallos = puntos.filter((p) => marcas[p.id] === "falla").length;
  const vistos = puntos.filter((p) => marcas[p.id] && marcas[p.id] !== "sin_mirar").length;
  const sinTexto = puntos.filter((p) => marcas[p.id] === "falla" && !comentarios[p.id]?.trim()).length;

  // En violeta —el color de "revisar" en toda la app— mientras se revisa. Ya
  // no se apaga al marcarla entera ni lleva barra de avance: marcar lo que
  // está bien es opcional, así que "entera" ya no dice que se haya acabado.
  return (
    <div className="w-full overflow-hidden rounded-lg bg-violet-500/10 ring-1 ring-violet-500/40">
      <button
        type="button"
        onClick={() => onAbrir(!abierta)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300"
      >
        <span aria-hidden="true" className="text-[9px]">
          {abierta ? "▾" : "▸"}
        </span>
        Qué mirar
        <span className="font-medium normal-case tracking-normal opacity-70">· marca lo que falle</span>
        {/* El avance, solo si se ha marcado algo: el ✓ es opcional, y «0 de 8»
            parecería una tarea pendiente. Sirve para saber por dónde ibas al
            volver de una interrupción. */}
        <span className="ml-auto shrink-0 tabular-nums">{vistos > 0 ? `${vistos} de ${puntos.length}` : ""}</span>
        {fallos > 0 && (
          <span className="shrink-0 rounded bg-red-500/20 px-1 py-px text-[10px] font-bold normal-case text-error">
            {fallos === 1 ? "1 falla" : `${fallos} fallan`}
            {sinTexto > 0 && ` · ${sinTexto} sin texto`}
          </span>
        )}
      </button>

      {abierta && (
        <ul className="border-t border-border bg-surface">
          {ordenados.map((p) => {
            const estado = marcas[p.id] ?? "sin_mirar";
            const falla = estado === "falla";
            const antes = fallaronAntes?.has(p.id) ?? false;
            return (
              <li key={p.id} className={falla ? "bg-red-500/5" : antes ? "bg-amber-500/10" : ""}>
              <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] leading-snug">
                {/* Al marcar el fallo se ve al lado la causa que irá marcada
                    al devolver: varios pasos comparten causa, y así no hay
                    sorpresa cuando el cuadro de devolver sale ya relleno. */}
                <span
                  className={`min-w-0 flex-1 ${
                    falla
                      ? "font-medium text-error"
                      : estado === "bien"
                        ? "text-text-muted line-through decoration-text-muted/40"
                        : "text-text"
                  }`}
                >
                  {p.mira}
                  {antes && !falla && (
                    <span
                      className="ml-1.5 rounded bg-amber-500/20 px-1 py-px text-[10px] font-semibold text-amber-800 dark:text-amber-200"
                      title="Falló en la revisión anterior: mira que esté corregido"
                    >
                      falló la otra vez
                    </span>
                  )}
                  {falla && (
                    <span className="ml-1.5 rounded bg-red-500/10 px-1 py-px text-[10px] font-semibold">
                      {p.etiqueta}
                    </span>
                  )}
                </span>
                <Marca
                  activa={estado === "bien"}
                  onClick={() => onMarcar(p.id, estado === "bien" ? "sin_mirar" : "bien")}
                  etiqueta={`${p.mira}: bien`}
                  tono="bien"
                />
                <Marca
                  activa={falla}
                  onClick={() => {
                    if (!falla) setRecien(p.id);
                    onMarcar(p.id, falla ? "sin_mirar" : "falla");
                  }}
                  etiqueta={`${p.mira}: falla`}
                  tono="falla"
                />
              </div>
              {falla && (
                <ComentarioFallo
                  // El cursor, dentro al marcar la ✗: escribir qué falla es
                  // obligatorio y es lo siguiente que se hace.
                  enfocar={recien === p.id}
                  inicial={comentarios[p.id] ?? ""}
                  onGuardar={(texto) => onMarcar(p.id, "falla", texto)}
                />
              )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** «¿Qué falla?» bajo un ✗. Obligatorio para devolver (27/11/2026), en una línea. Se guarda al salir del
 *  campo, con Intro, o al dejar de escribir un momento: sin botón de guardar
 *  que olvidar. */
function ComentarioFallo({
  inicial,
  onGuardar,
  enfocar = false,
}: {
  inicial: string;
  onGuardar: (texto: string) => void;
  enfocar?: boolean;
}) {
  const [texto, setTexto] = useState(inicial);
  const guardado = useRef(inicial);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const guardar = (t: string) => {
    clearTimeout(temporizador.current);
    if (t.trim() === guardado.current.trim()) return;
    guardado.current = t;
    onGuardar(t.trim());
  };
  useEffect(() => () => clearTimeout(temporizador.current), []);
  return (
    <div className="px-2 pb-1.5 pl-4">
      <input
        value={texto}
        maxLength={200}
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          clearTimeout(temporizador.current);
          temporizador.current = setTimeout(() => guardar(t), 900);
        }}
        onBlur={() => guardar(texto)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            guardar(texto);
          }
        }}
        autoFocus={enfocar}
        required
        placeholder="¿Qué falla? «la cota del primer ollao», «2 cm de más»…"
        aria-label="Qué falla en este paso (obligatorio para devolver)"
        className="w-full rounded-md bg-surface px-2 py-1 text-[11px] text-text outline-none border border-red-500 placeholder:text-text-muted"
      />
      {!texto.trim() && (
        <p className="mt-0.5 text-[10px] text-error">Hay que decir qué falla para poder devolverla</p>
      )}
    </div>
  );
}

/** Una de las dos marcas de la fila. Volver a pulsarla la quita: marcar algo
 *  por error y no poder desmarcarlo obligaría a recargar para arreglarlo. */
function Marca({
  activa,
  onClick,
  etiqueta,
  tono,
}: {
  activa: boolean;
  onClick: () => void;
  etiqueta: string;
  tono: "bien" | "falla";
}) {
  const colores = activa
    ? tono === "bien"
      ? "bg-teal-700 text-white"
      : "bg-red-600 text-white"
    : "text-text-muted ring-1 ring-border hover:text-text";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      aria-label={etiqueta}
      title={etiqueta}
      // 22 px: a 16 se fallaba el clic entre las dos marcas.
      className={`grid size-5.5 shrink-0 place-items-center rounded-md text-[11px] font-bold ${colores}`}
    >
      {tono === "bien" ? "✓" : "✗"}
    </button>
  );
}
