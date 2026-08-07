"use client";

import { useEffect, useState } from "react";
import type { OF, Operario, Pedido, Rol } from "@/lib/types";
import { ESTADO, ROL, fmtMin } from "@/lib/estado";
import { abierto, esFichable, minutosOF, motivoNoFichable, rolFichajeDe, type Fichaje } from "@/lib/fichaje";
import { LiveDot } from "./LiveBadge";

/** Minutos sin ningún fichaje corriendo, con OFs mías en_curso, antes de
 *  avisar en ámbar (aviso "te has puesto a plantear y no estás fichando"). */
const AVISO_SIN_FICHAR_MIN = 10;

/** Minutos de un intervalo corriendo antes de avisar de que lleva mucho
 *  rato. Es un AVISO, no un corte: el cierre automático por inactividad
 *  (latido, ver lib/fichaje.ts) es cosa del servidor y depende de si la
 *  pestaña sigue viva, no de cuánto lleva fichando. Este aviso es lo
 *  contrario — la pestaña SIGUE viva y el fichaje puede ser real (una pieza
 *  larga, una revisión a fondo) — así que no bloquea, no exige respuesta y
 *  si se ignora no pasa nada: solo ofrece el atajo de pausar por si a la
 *  persona se le olvidó. Nunca debe convertirse en un corte automático. */
const AVISO_FICHAJE_LARGO_MIN = 180;

/** Reloj del fichaje que corre AHORA, en h:mm:ss (p.ej. "1:05:42").
 *
 *  Con segundos, no solo minutos: es la señal de que el fichaje está vivo. Un
 *  "0:03" quieto no distingue "va contando" de "se ha colgado", y el fichaje
 *  es justo lo que nadie quiere dar por hecho. Los tiempos por OF siguen en
 *  minutos (`fmtMin`, "1h 5m"): ahí lo que importa es el acumulado del día. */
function fmtHMS(seg: number): string {
  const total = Math.max(0, Math.floor(seg));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** OFs donde soy autor o revisor, en estados que todavía tienen sentido
 *  fichar/consultar (fuera anuladas y ya aprobadas). Las detenidas SÍ se
 *  incluyen: se ven en el panel pero con el toggle deshabilitado. */
function ofsMiasDe(p: Pedido, miId: string): OF[] {
  return p.ofs.filter(
    (of) =>
      (of.autorId === miId || of.revisorId === miId) &&
      of.estado !== "anulada" &&
      of.estado !== "aprobada",
  );
}

/** Panel flotante "Mi fichaje": píldora colapsada en la esquina inferior
 *  derecha que se expande al detalle de lo que estoy fichando AHORA — el
 *  pedido en marcha con sus OF, o la OF sola si fiché solo una.
 *
 *  Un solo fichaje corre a la vez (un intervalo = un rol). Desde aquí se
 *  para OF a OF o el pedido entero, se ven los minutos de hoy de cada una y
 *  se pausa/reanuda el fichaje completo. Asignar y arrancar trabajo nuevo es
 *  cosa del tablero: este panel responde a "¿qué estoy contando ahora?". */
export function MiFichaje({
  miId,
  operarios,
  pedidos,
  fichaje,
  onFichar,
  onDesfichar,
  onPausarTodo,
  onReanudar,
}: {
  miId: string;
  operarios: Operario[];
  pedidos: Pedido[];
  fichaje: Fichaje;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  onPausarTodo: () => void;
  onReanudar: () => void;
}) {
  const [expandido, setExpandido] = useState(false);

  const ab = abierto(fichaje);

  // Reloj: la proyección avanza aunque nadie toque nada. Los intervalos
  // guardados no cambian; solo se recalcula con este `ahora`.
  //
  // Con un fichaje corriendo va al segundo, que es lo que hace que el
  // contador se vea subir; parado basta con medio minuto (ahí solo sirve
  // para el aviso de "planteando sin fichar", que se mide en minutos) y no
  // tiene sentido repintar 60 veces más a cambio de nada.
  const [ahora, setAhora] = useState(() => new Date().toISOString());
  const corriendo = ab !== null;
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date().toISOString()), corriendo ? 1_000 : 30_000);
    return () => clearInterval(id);
  }, [corriendo]);

  const nOFs = ab?.ofIds.length ?? 0;
  const totalSeg = ab ? (Date.parse(ahora) - Date.parse(ab.inicio)) / 1000 : 0;
  const totalMin = totalSeg / 60;

  // Aviso de fichaje largo (ver AVISO_FICHAJE_LARGO_MIN): solo el rótulo, una
  // OF cualquiera de las que están corriendo basta para identificarlo.
  const ofLargo =
    ab && totalMin >= AVISO_FICHAJE_LARGO_MIN
      ? (pedidos.flatMap((p) => p.ofs).find((of) => ab.ofIds.includes(of.id)) ?? null)
      : null;

  const ultimo = fichaje.intervalos[fichaje.intervalos.length - 1] ?? null;
  const puedeReanudar = ultimo !== null && ultimo.fin !== null;

  // Aviso ámbar: tengo OFs en_curso NO detenidas (una detenida no se puede
  // fichar, así que no tiene sentido avisar por ella) pero no hay ningún
  // fichaje corriendo desde hace más de AVISO_SIN_FICHAR_MIN. Se recuerda el
  // instante en que empezó la situación en estado (no en un ref: leer un ref
  // durante el render está prohibido). El contador va etiquetado con el
  // operario: es por identidad y no debe heredarse al cambiar de técnico
  // (si A llevaba 8 min sin fichar y cambio a B, B arranca de cero).
  const misEnCurso = pedidos.some((p) =>
    p.ofs.some((of) => of.autorId === miId && of.estado === "en_curso" && !of.detenida),
  );
  const [sinFicharDesde, setSinFicharDesde] = useState<{ opId: string; desde: number } | null>(
    null,
  );
  // Ajuste durante el render, no en un efecto: el efecto provocaba un segundo
  // render en cascada (y el lint lo rechaza). React descarta este render y
  // vuelve a empezar con el valor nuevo, sin pintar el estado intermedio.
  const enSituacion = misEnCurso && !ab;
  if (enSituacion && sinFicharDesde?.opId !== miId) {
    // `ahora` en vez de Date.now(): el reloj del render ya viene de fuera y
    // leerlo aquí es puro, además de usar la misma escala que la comparación.
    setSinFicharDesde({ opId: miId, desde: Date.parse(ahora) });
  } else if (!enSituacion && sinFicharDesde !== null) {
    setSinFicharDesde(null);
  }
  const aviso =
    sinFicharDesde !== null &&
    sinFicharDesde.opId === miId &&
    Date.parse(ahora) - sinFicharDesde.desde >= AVISO_SIN_FICHAR_MIN * 60_000;

  const yo = operarios.find((o) => o.id === miId) ?? null;

  // Escape colapsa el panel expandido (mismo patrón que el Drawer).
  useEffect(() => {
    if (!expandido) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpandido(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandido]);

  if (!yo) return null;

  // El widget solo aparece cuando aporta algo: hay un fichaje corriendo (para
  // saber qué se está fichando) o el aviso de "planteando sin fichar". Si no,
  // no molesta: el fichaje se inicia desde las tarjetas del tablero.
  if (!ab && !aviso) return null;

  // Los minutos del panel son de HOY; el histórico completo se conserva para
  // Olanet (solo se filtra la proyección que ve el técnico, no el fichaje).
  const inicioHoy = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const fichajeHoy: Fichaje = {
    intervalos: fichaje.intervalos.filter((iv) => iv.inicio >= inicioHoy),
  };

  // SOLO lo que está corriendo ahora mismo. El panel es el reloj de este
  // fichaje, no la lista de todo lo que tengo asignado: eso ya es el tablero,
  // y repetirlo aquí obligaba a buscar entre veinte pedidos cuál era el que
  // estaba contando. Si fiché el pedido entero salen todas sus OF; si fiché
  // una sola, sale esa sola — el panel refleja lo que se decidió al fichar.
  const enMarcha = new Set(ab?.ofIds ?? []);
  const grupos = pedidos
    .map((p) => ({ pedido: p, ofs: ofsMiasDe(p, miId).filter((of) => enMarcha.has(of.id)) }))
    .filter((g) => g.ofs.length > 0);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {expandido && (
        <div className="panel-solido relative flex max-h-[75vh] w-[22rem] flex-col rounded-2xl p-3 pt-4 shadow-2xl">
          {/* Cabecera: lo primero que se mira al abrir es si algo está
              corriendo y cuánto llevo, no cómo me llamo — eso ya está en la
              barra de arriba. Antes había además dos formas de cerrar (un
              tirador y la ✕), una encima de la otra: se queda la ✕, que es la
              que usan el Drawer y el resto de paneles. */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Mi fichaje
            </span>
            {ab ? (
              <span
                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${ROL[ab.rol].chip}`}
              >
                <LiveDot rol={ab.rol} className="size-1.5" />
                {/* tabular-nums: sin ancho fijo de cifra, el reloj tiembla
                    cada segundo y arrastra lo que tiene al lado. */}
                {ROL[ab.rol].label} · <span className="tabular-nums">{fmtHMS(totalSeg)}</span>
              </span>
            ) : (
              <span className="text-xs font-semibold text-text-muted">Parado</span>
            )}
            <button
              onClick={() => setExpandido(false)}
              aria-label="Cerrar"
              className="ml-auto grid size-6 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            >
              ✕
            </button>
          </div>

          {/* mis OFs agrupadas por pedido */}
          <ul className="scroll-thin -mx-1 flex-1 space-y-2 overflow-y-auto px-1">
            {grupos.length === 0 && (
              <li className="px-1 py-6 text-center text-xs text-text-muted">
                {/* Sin fichaje corriendo la lista está vacía por definición:
                    el panel solo pinta lo que se está fichando. */}
                No estás fichando nada ahora.
              </li>
            )}
            {grupos.map((g) => (
              <GrupoPedido
                key={g.pedido.id}
                pedido={g.pedido}
                ofs={g.ofs}
                miId={miId}
                fichaje={fichajeHoy}
                ahora={ahora}
                onFichar={onFichar}
                onDesfichar={onDesfichar}
              />
            ))}
          </ul>

          {/* pausar/reanudar + total corriendo */}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--glass-border)] pt-2.5">
            {/* El total y el rol ya están en la cabecera: aquí solo la acción. */}
            <span />
            {ab ? (
              <button
                onClick={onPausarTodo}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
              >
                ⏸ Pausar todo
              </button>
            ) : (
              <button
                onClick={onReanudar}
                disabled={!puedeReanudar}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ▶ Reanudar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Aviso de fichaje largo: discreto, junto al contador. NO corta el
          fichaje, no exige respuesta — si se ignora, sigue corriendo igual.
          El botón de pausar es solo un atajo por si a la persona se le
          olvidó, nunca un cierre automático (ese lo hace el servidor por
          falta de latido, algo completamente distinto). */}
      {ofLargo && (
        <div className="glass-chip flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <span>
            ⏳ Llevas {Math.floor(totalMin / 60)}h en {ofLargo.codigo}
          </span>
          <button
            onClick={onPausarTodo}
            className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-600"
          >
            ⏸ Pausar
          </button>
        </div>
      )}

      {/* píldora colapsada/cabecera del panel */}
      <button
        onClick={() => setExpandido((v) => !v)}
        aria-expanded={expandido}
        className={`glass-chip flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-bold shadow-lg transition-colors ${
          ab
            ? ROL[ab.rol].chip
            : aviso
              ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400"
              : "text-text-muted"
        }`}
      >
        {ab ? (
          <>
            <LiveDot rol={ab.rol} className="size-2" />
            <span>
              ⏱ {nOFs} OF{nOFs === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums">{fmtHMS(totalSeg)}</span>
            </span>
          </>
        ) : aviso ? (
          <span>⚠ Planteando sin fichar</span>
        ) : (
          <span>⏱ Sin fichar</span>
        )}
      </button>
    </div>
  );
}

function GrupoPedido({
  pedido,
  ofs,
  miId,
  fichaje,
  ahora,
  onFichar,
  onDesfichar,
}: {
  pedido: Pedido;
  ofs: OF[];
  miId: string;
  fichaje: Fichaje;
  ahora: string;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
}) {
  // Aquí solo llegan OF que se están fichando (ver `enMarcha` arriba), así que
  // en la práctica manda la rama de "Parar pedido". El botón de fichar se
  // mantiene porque la regla de qué se puede arrancar sigue siendo suya, y
  // porque quien la lea no debería tener que fiarse de un filtro que está en
  // otro sitio.
  //
  // "Fichar pedido" solo ficha lo que me toca PLANTEAR (autor): un fichaje
  // corriendo es un único rol, así que mezclar plantear+revisar en un solo
  // botón no tendría un rol claro que pasarle a onFichar.
  const misPlantear = ofs.filter((of) => of.autorId === miId && rolFichajeDe(of) === "plantear");
  const fichablesPlantear = misPlantear.filter(esFichable);
  const detenidas = misPlantear.length - fichablesPlantear.length;
  // Lo que queda POR arrancar. Antes el botón salía igual con todas las OFs
  // ya corriendo: ofrecía fichar lo que ya se estaba fichando, y ocupaba el
  // sitio donde lo útil es lo contrario, pararlas todas de una vez.
  const porArrancar = fichablesPlantear.filter((of) => of.fichandoRol === null);
  const corriendo = misPlantear.filter((of) => of.fichandoRol !== null);

  return (
    <li className="rounded-xl bg-surface-2/50 p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-xs font-semibold text-text">
          {pedido.codigo} <span className="font-normal text-text-muted">· {pedido.cliente}</span>
        </span>
        {porArrancar.length > 0 ? (
          <button
            onClick={() => onFichar(porArrancar.map((o) => o.id), "plantear")}
            className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${ROL.plantear.solido}`}
          >
            {corriendo.length > 0 ? "Fichar el resto" : "Fichar pedido"}
          </button>
        ) : corriendo.length > 1 ? (
          <button
            onClick={() => corriendo.forEach((o) => onDesfichar(o.id))}
            className="ml-auto shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            Parar pedido
          </button>
        ) : null}
      </div>
      {detenidas > 0 && fichablesPlantear.length > 0 && (
        <p className="mt-0.5 text-[10px] text-text-muted">
          fichando {fichablesPlantear.length} de {misPlantear.length} — {detenidas} detenida
          {detenidas === 1 ? "" : "s"}
        </p>
      )}
      <ul className="mt-1.5 space-y-1">
        {ofs.map((of) => (
          <OFItem
            key={of.id}
            of={of}
            fichaje={fichaje}
            ahora={ahora}
            onFichar={onFichar}
            onDesfichar={onDesfichar}
          />
        ))}
      </ul>
    </li>
  );
}

function OFItem({
  of,
  fichaje,
  ahora,
  onFichar,
  onDesfichar,
}: {
  of: OF;
  fichaje: Fichaje;
  ahora: string;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
}) {
  const meta = ESTADO[of.estado];
  const fichando = of.fichandoRol !== null;
  const minutos = Math.round(minutosOF(fichaje, of.id, { ahora }));

  return (
    <li className="flex items-center gap-2 rounded-lg bg-surface-2/70 px-2 py-1.5 text-[11px]">
      <span className="truncate font-mono font-semibold text-text">{of.codigo}</span>
      {/* Etiqueta entera, no la abreviatura: "REVIS." y "POR REV." se
          parecen demasiado, y en este panel sobra ancho para distinguirlas. */}
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
        {meta.label}
      </span>
      <span className="ml-auto shrink-0 text-text-muted" title="Tiempo que llevas hoy en esta OF">
        {fmtMin(minutos)}
      </span>
      {!fichando && motivoNoFichable(of) ? (
        <span
          title={motivoNoFichable(of)!}
          className="shrink-0 cursor-help rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-text-muted/60"
        >
          {of.detenida ? "Detenida" : "No fichable"}
        </span>
      ) : fichando ? (
        <button
          onClick={() => onDesfichar(of.id)}
          className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
        >
          ⏸ Parar
        </button>
      ) : (
        <button
          onClick={() => onFichar([of.id], rolFichajeDe(of))}
          className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
        >
          ⏱ Fichar
        </button>
      )}
    </li>
  );
}
