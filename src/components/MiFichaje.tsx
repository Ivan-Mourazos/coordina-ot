"use client";

import { useEffect, useState } from "react";
import type { OF, Operario, Pedido, Rol } from "@/lib/types";
import { ESTADO, ROL, fmtMin } from "@/lib/estado";
import { abierto, esFichable, minutosOF, rolFichajeDe, type Fichaje } from "@/lib/fichaje";
import { LiveDot } from "./LiveBadge";
import { OpDot } from "./Select";

/** Minutos sin ningún fichaje corriendo, con OFs mías en_curso, antes de
 *  avisar en ámbar (aviso "te has puesto a plantear y no estás fichando"). */
const AVISO_SIN_FICHAR_MIN = 10;

/** Redondea a minutos y da formato h:mm (p.ej. "1:05"), para el total
 *  "corriendo ahora" de la píldora. Los minutos por OF usan `fmtMin`
 *  (formato "1h 5m"); este es solo para el reloj agregado del fichaje activo. */
function fmtHM(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
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
 *  derecha que se expande a un panel con mis OFs agrupadas por pedido.
 *  Un solo fichaje corre a la vez (un intervalo = un rol); este panel deja
 *  fichar/desfichar OF a OF y en bloque por pedido, ver los minutos de hoy
 *  y pausar/reanudar el fichaje completo. */
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

  // Reloj: se refresca cada 30s para que los minutos "de hoy" y el total
  // corriendo avancen aunque nadie interactúe. Los intervalos guardados
  // nunca cambian; solo se recalcula la proyección con este `ahora`.
  const [ahora, setAhora] = useState(() => new Date().toISOString());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date().toISOString()), 30_000);
    return () => clearInterval(id);
  }, []);

  const ab = abierto(fichaje);
  const nOFs = ab?.ofIds.length ?? 0;
  const totalMin = ab ? (Date.parse(ahora) - Date.parse(ab.inicio)) / 60000 : 0;

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
  useEffect(() => {
    if (misEnCurso && !ab) {
      setSinFicharDesde((prev) =>
        prev && prev.opId === miId ? prev : { opId: miId, desde: Date.now() },
      );
    } else {
      setSinFicharDesde(null);
    }
  }, [misEnCurso, ab, miId]);
  const aviso =
    sinFicharDesde !== null &&
    sinFicharDesde.opId === miId &&
    Date.parse(ahora) - sinFicharDesde.desde >= AVISO_SIN_FICHAR_MIN * 60_000;

  const yo = operarios.find((o) => o.id === miId) ?? null;
  if (!yo) return null;

  const grupos = pedidos
    .map((p) => ({ pedido: p, ofs: ofsMiasDe(p, miId) }))
    .filter((g) => g.ofs.length > 0);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {expandido && (
        <div className="glass-panel-strong flex max-h-[75vh] w-[22rem] flex-col rounded-2xl p-3 shadow-2xl">
          {/* identidad, bien visible arriba */}
          <div className="mb-2 flex items-center gap-2">
            <OpDot color={yo.color} iniciales={yo.iniciales} />
            <span className="text-sm font-bold text-text">{yo.nombre}</span>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Mi fichaje
            </span>
            <button
              onClick={() => setExpandido(false)}
              aria-label="Cerrar"
              className="grid size-6 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            >
              ✕
            </button>
          </div>

          {/* mis OFs agrupadas por pedido */}
          <ul className="scroll-thin -mx-1 flex-1 space-y-2 overflow-y-auto px-1">
            {grupos.length === 0 && (
              <li className="px-1 py-6 text-center text-xs text-text-muted">
                No tienes OFs para fichar.
              </li>
            )}
            {grupos.map((g) => (
              <GrupoPedido
                key={g.pedido.id}
                pedido={g.pedido}
                ofs={g.ofs}
                miId={miId}
                fichaje={fichaje}
                ahora={ahora}
                onFichar={onFichar}
                onDesfichar={onDesfichar}
              />
            ))}
          </ul>

          {/* pausar/reanudar + total corriendo */}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--glass-border)] pt-2.5">
            <span className="text-[11px] text-text-muted">
              {ab ? `⏱ ${nOFs} OF${nOFs === 1 ? "" : "s"} · ${fmtHM(totalMin)}` : "Sin fichar"}
            </span>
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

      {/* píldora colapsada/cabecera del panel */}
      <button
        onClick={() => setExpandido((v) => !v)}
        className={`glass-chip flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-bold shadow-lg transition-colors motion-reduce:animate-none ${
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
              ⏱ {nOFs} OF{nOFs === 1 ? "" : "s"} · {fmtHM(totalMin)}
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
  // "Fichar pedido" solo ficha lo que me toca PLANTEAR (autor): un fichaje
  // corriendo es un único rol, así que mezclar plantear+revisar en un solo
  // botón no tendría un rol claro que pasarle a onFichar.
  const misPlantear = ofs.filter((of) => of.autorId === miId && rolFichajeDe(of) === "plantear");
  const fichablesPlantear = misPlantear.filter(esFichable);
  const detenidas = misPlantear.length - fichablesPlantear.length;

  return (
    <li className="rounded-xl bg-surface-2/50 p-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-xs font-semibold text-text">
          {pedido.codigo} <span className="font-normal text-text-muted">· {pedido.cliente}</span>
        </span>
        {fichablesPlantear.length > 0 && (
          <button
            onClick={() => onFichar(fichablesPlantear.map((o) => o.id), "plantear")}
            className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${ROL.plantear.solido}`}
          >
            Fichar pedido
          </button>
        )}
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
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}>
        {meta.short}
      </span>
      <span className="ml-auto shrink-0 text-text-muted">{fmtMin(minutos)}</span>
      {of.detenida ? (
        <span className="shrink-0 rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-text-muted/60">
          Detenida
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
