"use client";

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
// Lo marcado NO se guarda. Vive mientras la tarjeta esté en pantalla, como el
// dedo sobre el papel: es una ayuda para no perder el hilo, no un parte de
// trabajo. Guardarlo por OF convertiría la revisión en papeleo —un pedido de 12
// OF son 96 casillas— y dejaría por escrito quién no marcó qué, que es otra
// cosa distinta y nadie la ha pedido.

export function GuiaRevision({
  puntos,
  marcas,
  onMarcar,
  abierta,
  onAbrir,
}: {
  puntos: readonly PuntoGuia[];
  marcas: Readonly<Record<number, EstadoPunto>>;
  onMarcar: (id: number, estado: EstadoPunto) => void;
  abierta: boolean;
  onAbrir: (abierta: boolean) => void;
}) {
  // Sin puntos no se pinta nada. Pasa cuando alguien retira todas las de una
  // familia, y un recuadro vacío titulado "Qué mirar" sería peor que nada.
  if (puntos.length === 0) return null;

  const fallos = puntos.filter((p) => marcas[p.id] === "falla").length;
  const vistos = puntos.filter((p) => marcas[p.id] && marcas[p.id] !== "sin_mirar").length;
  const faltan = puntos.length - vistos;

  // MIENTRAS FALTA ALGO, SE VE. Nació como una caja gris más entre las otras y
  // se perdía en la columna: siendo el paso que hay que dar antes de aprobar,
  // pasar desapercibida es justo lo que no puede hacer. Con puntos pendientes
  // va en violeta —el color de "revisar" en toda la app— con su barra de
  // avance; en cuanto está entera, se apaga y se queda discreta, porque ya no
  // hay nada que pedirle a nadie.
  const pendiente = faltan > 0;

  return (
    <div
      className={`w-full overflow-hidden rounded-lg ring-1 ${
        pendiente
          ? "bg-violet-500/10 ring-violet-500/40"
          : "bg-teal-500/5 ring-teal-500/25"
      }`}
    >
      <button
        type="button"
        onClick={() => onAbrir(!abierta)}
        aria-expanded={abierta}
        className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide hover:bg-[var(--glass-highlight)] ${
          pendiente ? "text-violet-700 dark:text-violet-300" : "text-teal-700 dark:text-teal-300"
        }`}
      >
        <span aria-hidden="true" className="text-[9px]">
          {abierta ? "▾" : "▸"}
        </span>
        {pendiente ? "Qué mirar antes de aprobar" : "Repasado entero"}
        {/* El avance, no el total: "3 de 8" dice si la revisión va por la mitad,
            que es lo que se pregunta uno al volver de una interrupción. */}
        <span className="ml-auto shrink-0 tabular-nums">
          {vistos} de {puntos.length}
        </span>
        {fallos > 0 && (
          <span className="shrink-0 rounded bg-red-500/20 px-1 py-px text-[9px] font-bold normal-case text-red-600 dark:text-red-400">
            {fallos === 1 ? "1 falla" : `${fallos} fallan`}
          </span>
        )}
      </button>

      {/* Cuánto llevas, sin tener que abrirla ni contar. Dos píxeles de alto:
          dice lo mismo que el "3 de 8" pero se ve de refilón desde el otro
          extremo de la pantalla. */}
      <div className="h-0.5 w-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full transition-all ${pendiente ? "bg-violet-500" : "bg-teal-500"}`}
          style={{ width: `${puntos.length ? (vistos / puntos.length) * 100 : 0}%` }}
        />
      </div>

      {abierta && (
        <ul className="border-t border-border bg-surface">
          {puntos.map((p) => {
            const estado = marcas[p.id] ?? "sin_mirar";
            const falla = estado === "falla";
            return (
              <li
                key={p.id}
                className={`flex items-center gap-1.5 px-2 py-1 text-[11px] leading-snug ${
                  falla ? "bg-red-500/5" : ""
                }`}
              >
                {/* Al marcar el fallo, la frase se da la vuelta: deja de ser lo
                    que compruebas ("Medidas de la lona hecha") y pasa a ser lo
                    que se le va a decir al autor ("Medidas de la lona mal").
                    Es la misma fila por las dos caras, y así se ve de dónde
                    sale la causa que aparecerá marcada al devolver. */}
                <span
                  className={`min-w-0 flex-1 ${
                    falla
                      ? "font-medium text-red-600 dark:text-red-400"
                      : estado === "bien"
                        ? "text-text-muted line-through decoration-text-muted/40"
                        : "text-text"
                  }`}
                >
                  {falla ? p.etiqueta : p.mira}
                </span>
                <Marca
                  activa={estado === "bien"}
                  onClick={() => onMarcar(p.id, estado === "bien" ? "sin_mirar" : "bien")}
                  etiqueta={`${p.mira}: bien`}
                  tono="bien"
                />
                <Marca
                  activa={falla}
                  onClick={() => onMarcar(p.id, falla ? "sin_mirar" : "falla")}
                  etiqueta={`${p.mira}: falla`}
                  tono="falla"
                />
              </li>
            );
          })}
        </ul>
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
      ? "bg-teal-600 text-white"
      : "bg-red-600 text-white"
    : "text-text-muted/50 ring-1 ring-border hover:text-text";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      aria-label={etiqueta}
      title={etiqueta}
      className={`grid size-4 shrink-0 place-items-center rounded text-[9px] font-bold ${colores}`}
    >
      {tono === "bien" ? "✓" : "✗"}
    </button>
  );
}
