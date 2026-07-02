"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { EstadoOF, Familia, OF, Operario, Pedido, Rol } from "@/lib/types";
import { estaAtrasado, estaFinalizado, hoyISO } from "@/lib/types";
import { ROL } from "@/lib/estado";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ViewSwitcher, type Vista } from "./ViewSwitcher";
import { FilterBar, type Filtros } from "./FilterBar";
import { Zona } from "./Zona";
import { Bandeja } from "./Bandeja";
import { ListaView } from "./ListaView";
import { RevisionView } from "./RevisionView";
import { HistorialView } from "./HistorialView";
import { Drawer, type AccionOF } from "./Drawer";
import { PedidoCardView, type Facet } from "./PedidoCard";
import { IdentityGate } from "./IdentityGate";
import { IdentityBadge } from "./IdentityBadge";
import { TecnicoCard } from "./TecnicoCard";
import { Notificaciones, type NotifItem } from "./Notificaciones";
import { LiveDot } from "./LiveBadge";
import { useHydrated } from "@/lib/useHydrated";

const IDENTITY_KEY = "coordina-operario-id";

/** Quién está fichando ahora mismo: en qué OF y con qué rol. */
export interface LiveInfo {
  operario: Operario;
  rol: Rol;
  pedido: Pedido;
  of: OF;
}

function leerIdentidadGuardada(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(IDENTITY_KEY);
  } catch {
    return null;
  }
}

export function Board({
  operarios,
  pedidos: initial,
}: {
  operarios: Operario[];
  pedidos: Pedido[];
}) {
  const [pedidos, setPedidos] = useState<Pedido[]>(initial);
  // dnd-kit genera IDs incrementales que no coinciden SSR↔cliente. Render del
  // tablero solo tras montar para que la hidratación case sin warnings.
  const mounted = useHydrated();

  // Identidad del técnico ("login sin login"): se recuerda por navegador,
  // igual que el tema. Se lee con inicializador perezoso para que coincida
  // desde el primer render tras la hidratación, sin parpadeo.
  const [miId, setMiIdState] = useState<string | null>(leerIdentidadGuardada);
  const setMiId = useCallback((id: string) => {
    setMiIdState(id);
    try {
      localStorage.setItem(IDENTITY_KEY, id);
    } catch {}
  }, []);

  // Panel de compañero desplegado en Asignar: solo uno a la vez.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);
  const closeExpanded = useCallback(() => setExpandedId(null), []);

  const [vista, setVista] = useState<Vista>("asignar");
  const [openId, setOpenId] = useState<string | null>(null);
  const [active, setActive] = useState<Facet | null>(null);
  const [filtros, setFiltrosState] = useState<Filtros>({
    query: "",
    familia: "todas",
    cliente: "todos",
    estado: "todos",
    situacion: "procesado",
    orden: "planificacion",
  });
  const setFiltros = useCallback(
    (f: Partial<Filtros>) => setFiltrosState((prev) => ({ ...prev, ...f })),
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const familias = useMemo(
    () => [...new Set(pedidos.flatMap((p) => p.ofs.map((o) => o.familia)))].sort() as Familia[],
    [pedidos],
  );
  const clientes = useMemo(
    () => [...new Set(pedidos.map((p) => p.cliente))].sort(),
    [pedidos],
  );

  const pedidosFiltrados = useMemo(() => {
    const q = filtros.query.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (q && !`${p.codigo} ${p.cliente}`.toLowerCase().includes(q)) return false;
      if (filtros.familia !== "todas" && !p.ofs.some((o) => o.familia === filtros.familia)) return false;
      if (filtros.cliente !== "todos" && p.cliente !== filtros.cliente) return false;
      if (filtros.estado !== "todos" && !p.ofs.some((o) => o.estado === filtros.estado)) return false;
      return true;
    });
  }, [pedidos, filtros]);

  const hoy = hoyISO();

  const cmpPedido = useMemo(() => {
    return (a: Pedido, b: Pedido) => {
      // Atrasados (pasada la planificación sin finalizar) siempre primero.
      const aa = estaAtrasado(a, hoy);
      const ab = estaAtrasado(b, hoy);
      if (aa !== ab) return aa ? -1 : 1;
      switch (filtros.orden) {
        case "planificacion":
          return a.fechaPlanificacion.localeCompare(b.fechaPlanificacion);
        case "entrega":
          return a.fechaEntrega.localeCompare(b.fechaEntrega);
        case "prioridad":
          return a.prioridad - b.prioridad;
        default:
          return a.cliente.localeCompare(b.cliente);
      }
    };
  }, [filtros.orden, hoy]);

  // Lista de TRABAJO = solo procesados por Producción (lo que llega a OT).
  const pedidosOrdenados = useMemo(
    () => pedidosFiltrados.filter((p) => p.situacion === "procesado").sort(cmpPedido),
    [pedidosFiltrados, cmpPedido],
  );

  // Vista Lista: respeta el filtro de Situación (permite buscar los pendientes).
  const listaOrdenados = useMemo(() => {
    const base =
      filtros.situacion === "todos"
        ? pedidosFiltrados
        : pedidosFiltrados.filter((p) => p.situacion === filtros.situacion);
    return [...base].sort(cmpPedido);
  }, [pedidosFiltrados, filtros.situacion, cmpPedido]);

  // Facets del tablero Asignar, agrupadas por ubicación (autor o bandeja) en
  // UNA pasada, en vez de recorrer todos los pedidos una vez por zona.
  const facetsByLoc = useMemo(() => {
    const map = new Map<string | null, Facet[]>();
    for (const p of pedidosOrdenados) {
      if (estaFinalizado(p)) continue; // los finalizados viven en Historial
      const atrasado = estaAtrasado(p, hoy);
      const porLoc = new Map<string | null, OF[]>();
      for (const of of p.ofs) {
        const loc = of.autorId;
        const arr = porLoc.get(loc);
        if (arr) arr.push(of);
        else porLoc.set(loc, [of]);
      }
      for (const [loc, ofs] of porLoc) {
        const facet: Facet = { pedido: p, locationId: loc, ofs, atrasado };
        const arr = map.get(loc);
        if (arr) arr.push(facet);
        else map.set(loc, [facet]);
      }
    }
    return map;
  }, [pedidosOrdenados, hoy]);
  const facetsDe = useCallback(
    (loc: string | null) => facetsByLoc.get(loc) ?? [],
    [facetsByLoc],
  );

  // KPIs (solo sobre pedidos procesados = trabajo real de OT)
  const procesadosAll = useMemo(
    () => pedidos.filter((p) => p.situacion === "procesado"),
    [pedidos],
  );
  const countEstado = (e: EstadoOF) =>
    procesadosAll.reduce((n, p) => n + p.ofs.filter((o) => o.estado === e).length, 0);
  const sinAsignar = procesadosAll.reduce(
    (n, p) => n + p.ofs.filter((o) => o.autorId === null).length,
    0,
  );
  const porRevisar = countEstado("por_revisar");
  const enRevision = countEstado("en_revision");

  // ── Quién ficha AHORA (para tarjetas de equipo y cluster "En directo") ──
  const liveByOp = useMemo(() => {
    const map = new Map<string, LiveInfo>();
    for (const p of procesadosAll) {
      for (const of of p.ofs) {
        if (!of.fichandoRol) continue;
        const opId = of.fichandoRol === "plantear" ? of.autorId : of.revisorId;
        const op = operarios.find((o) => o.id === opId);
        if (op && !map.has(op.id)) {
          map.set(op.id, { operario: op, rol: of.fichandoRol, pedido: p, of });
        }
      }
    }
    return map;
  }, [procesadosAll, operarios]);

  // ── Notificaciones personales (según quién eres ahora mismo) ──
  const notifItems: NotifItem[] = useMemo(() => {
    if (!miId) return [];
    const out: NotifItem[] = [];
    for (const p of procesadosAll) {
      for (const of of p.ofs) {
        if (of.revisorId === miId && of.estado === "en_revision")
          out.push({ pedido: p, of, tipo: "revisar" });
        else if (of.autorId === miId && of.estado === "devuelta")
          out.push({ pedido: p, of, tipo: "devuelta" });
        else if (of.autorId === miId && of.estado === "pendiente")
          out.push({ pedido: p, of, tipo: "sinEmpezar" });
      }
    }
    return out;
  }, [procesadosAll, miId]);
  const misPorRevisar = notifItems.filter((i) => i.tipo === "revisar").length;
  const misDevueltas = notifItems.filter((i) => i.tipo === "devuelta").length;

  const irANotificacion = useCallback((destino: Vista, pedidoId: string) => {
    setVista(destino);
    setOpenId(pedidoId);
  }, []);
  const openFacet = useCallback((f: Facet) => setOpenId(f.pedido.id), []);
  const openPedidoCb = useCallback((p: Pedido) => setOpenId(p.id), []);
  const closeDrawer = useCallback(() => setOpenId(null), []);

  // ── mutaciones (futuro: persistir en SQL Server) ──
  const mut = useCallback(
    (ofIds: Set<string>, fn: (of: OF) => OF) => {
      setPedidos((prev) =>
        prev.map((p) => ({
          ...p,
          ofs: p.ofs.map((of) => (ofIds.has(of.id) ? fn(of) : of)),
        })),
      );
    },
    [],
  );
  const moverOFs = useCallback(
    (ofIds: Set<string>, autorId: string | null) => {
      mut(ofIds, (of) =>
        autorId === null
          ? { ...of, autorId: null, revisorId: null, estado: "pendiente", fichandoRol: null }
          : { ...of, autorId }
      );
    },
    [mut],
  );
  const asignarOF = useCallback(
    (ofId: string, autorId: string | null) => moverOFs(new Set([ofId]), autorId),
    [moverOFs],
  );
  const asignarPedido = useCallback(
    (autorId: string | null) => {
      setPedidos((prev) =>
        prev.map((p) =>
          p.id !== openId
            ? p
            : {
                ...p,
                ofs: p.ofs.map((of) =>
                  autorId === null
                    ? { ...of, autorId: null, revisorId: null, estado: "pendiente" as const, fichandoRol: null }
                    : { ...of, autorId }
                ),
              },
        ),
      );
    },
    [openId],
  );
  const setRevisor = useCallback(
    (ofId: string, revisorId: string | null) => {
      mut(new Set([ofId]), (of) => ({
        ...of,
        revisorId,
        estado:
          revisorId && of.estado === "por_revisar"
            ? "en_revision"
            : !revisorId && of.estado === "en_revision"
              ? "por_revisar"
              : of.estado,
      }));
    },
    [mut],
  );
  const accionOF = useCallback(
    (ofId: string, accion: AccionOF, obs?: string) => {
      mut(new Set([ofId]), (of) => {
        switch (accion) {
          case "empezar":
            return {
              ...of,
              estado: of.estado === "pendiente" ? "en_curso" : of.estado === "por_revisar" ? "en_revision" : of.estado,
              fichandoRol: (of.estado === "por_revisar" || of.estado === "en_revision") ? "revisar" : "plantear",
            };
          case "pausar":
            return { ...of, fichandoRol: null };
          case "terminar":
            return { ...of, estado: "por_revisar", fichandoRol: null };
          case "aprobar":
            return { ...of, estado: "aprobada", fichandoRol: null };
          case "devolver":
            return {
              ...of,
              estado: "devuelta",
              observacion: obs?.trim() || "Devuelta para corregir.",
              fichandoRol: null,
            };
          case "reabrir":
            return { ...of, estado: "en_revision" };
          case "anular":
            return { ...of, estado: "anulada", fichandoRol: null };
          case "deshacer_empezar":
            return { ...of, estado: "pendiente", fichandoRol: null };
          default:
            return of;
        }
      });
    },
    [mut],
  );

  const accionFacet = useCallback(
    (facet: Facet, accion: AccionOF, obs?: string, revisorId?: string) => {
      mut(new Set(facet.ofs.map((o) => o.id)), (of) => {
        let ofObj = revisorId !== undefined ? { ...of, revisorId } : of;
        switch (accion) {
          case "empezar":
            return {
              ...ofObj,
              estado: ofObj.estado === "pendiente" ? "en_curso" : ofObj.estado === "por_revisar" ? "en_revision" : ofObj.estado,
              fichandoRol: (ofObj.estado === "por_revisar" || ofObj.estado === "en_revision") ? "revisar" : "plantear",
            };
          case "pausar":
            return { ...ofObj, fichandoRol: null };
          case "terminar":
            return { ...ofObj, estado: "por_revisar", fichandoRol: null };
          case "aprobar":
            return { ...ofObj, estado: "aprobada", fichandoRol: null };
          case "devolver":
            return {
              ...ofObj,
              estado: "devuelta",
              observacion: obs?.trim() || "Devuelta para corregir.",
              fichandoRol: null,
            };
          case "reabrir":
            return { ...ofObj, estado: "en_revision" };
          case "anular":
            return { ...ofObj, estado: "anulada", fichandoRol: null };
          case "deshacer_empezar":
            return { ...ofObj, estado: "pendiente", fichandoRol: null };
          default:
            return ofObj;
        }
      });
    },
    [mut]
  );

  const completarPedido = useCallback((pedidoId: string) => {
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === pedidoId ? { ...p, situacion: "completado" } : p
      )
    );
    setOpenId(null);
  }, []);

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActive((e.active.data.current?.facet as Facet) ?? null);
  }, []);
  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const facet = e.active.data.current?.facet as Facet | undefined;
      const overId = e.over?.id;
      setActive(null);
      if (!facet || overId == null) return;
      const target = overId === "bandeja" ? null : String(overId);
      if (target === facet.locationId) return;
      moverOFs(new Set(facet.ofs.map((o) => o.id)), target);
    },
    [moverOFs],
  );

  const openPedido = pedidos.find((p) => p.id === openId) ?? null;

  if (!mounted) {
    return (
      <div className="flex min-h-full flex-col">
        <header className="flex items-center gap-4 border-b border-border bg-bg px-5 py-3">
          <Logo />
        </header>
        <div className="grid flex-1 place-items-center text-sm text-text-muted">
          Cargando tablero…
        </div>
      </div>
    );
  }

  if (!miId) {
    return <IdentityGate operarios={operarios} onSelect={setMiId} />;
  }
  const yo = operarios.find((o) => o.id === miId) as Operario;
  const resto = operarios.filter((o) => o.id !== miId);
  const lives = [...liveByOp.values()];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex min-h-full flex-col">
        {/* topbar */}
        <header className="glass-header sticky top-0 z-30 flex flex-wrap items-center gap-4 px-5 py-3">
          {/* el PNG del logo trae aire vertical: se deja desbordar sin engordar la cabecera */}
          <Logo className="-my-3" />
          <ViewSwitcher
            vista={vista}
            onChange={setVista}
            badge={{ revision: misPorRevisar, asignar: misDevueltas }}
          />
          <div className="ml-auto flex items-center gap-2 text-xs">
            {/* En directo: quién está fichando ahora mismo y con qué rol */}
            {lives.length > 0 && (
              <div
                className="glass-chip flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                title="Fichando ahora mismo"
              >
                <span className="text-[11px] text-text-muted">En directo</span>
                <div className="flex -space-x-1">
                  {lives.map((l) => (
                    <button
                      key={l.operario.id}
                      onClick={() => setOpenId(l.pedido.id)}
                      title={`${l.operario.nombre} — ${ROL[l.rol].label.toLowerCase()} ${l.pedido.codigo} · ${l.of.descripcion}`}
                      className="relative grid size-6 place-items-center rounded-full text-[9px] font-bold text-white ring-2 transition-transform hover:z-10 hover:scale-110"
                      style={{
                        background: l.operario.color,
                        ["--tw-ring-color" as string]: ROL[l.rol].color,
                      }}
                    >
                      {l.operario.iniciales}
                      <span className="absolute -right-0.5 -top-0.5">
                        <LiveDot rol={l.rol} className="size-2" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Kpi label="Sin asignar" value={sinAsignar} tone="muted" />
            <Kpi label="Por revisar" value={porRevisar} tone="amber" />
            <Kpi label="En revisión" value={enRevision} tone="violet" />
            <Notificaciones items={notifItems} onNavigate={irANotificacion} />
            <IdentityBadge yo={yo} operarios={operarios} onChange={setMiId} />
            <ThemeToggle />
          </div>
        </header>

        {/* ── VISTA ASIGNAR ── */}
        {vista === "asignar" && (
          <>
            <main className="flex flex-col gap-3 p-4">
              <Zona
                operario={yo}
                operarios={operarios}
                facets={facetsDe(yo.id)}
                live={liveByOp.get(yo.id) ?? null}
                soyYo
                onOpen={openFacet}
                accionFacet={accionFacet}
                completarPedido={completarPedido}
              />

              <div>
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Equipo
                </h2>
                <div className="flex flex-wrap gap-2">
                  {resto.map((op) => (
                    <TecnicoCard
                      key={op.id}
                      operario={op}
                      operarios={operarios}
                      facets={facetsDe(op.id)}
                      live={liveByOp.get(op.id) ?? null}
                      expanded={expandedId === op.id}
                      onToggle={() => toggleExpanded(op.id)}
                      onClose={closeExpanded}
                      onOpen={openFacet}
                      accionFacet={accionFacet}
                      completarPedido={completarPedido}
                    />
                  ))}
                </div>
              </div>
            </main>
            <div className="glass-header flex min-h-0 flex-1 flex-col">
              <div className="px-4 py-2" style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}>
                <FilterBar filtros={filtros} setFiltros={setFiltros} familias={familias} clientes={clientes} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 scroll-thin">
                <Bandeja facets={facetsDe(null)} operarios={operarios} onOpen={openFacet} />
              </div>
            </div>
          </>
        )}

        {/* ── VISTA LISTA ── */}
        {vista === "lista" && (
          <>
            <div className="border-b border-border bg-surface-2/40 px-5 py-2.5">
              <FilterBar filtros={filtros} setFiltros={setFiltros} familias={familias} clientes={clientes} showSituacion />
            </div>
            <div className="p-5">
              <ListaView pedidos={listaOrdenados} operarios={operarios} onOpen={openPedidoCb} />
            </div>
          </>
        )}

        {/* ── VISTA REVISIÓN ── */}
        {vista === "revision" && (
          <>
            <div className="border-b border-border bg-surface-2/40 px-5 py-2.5">
              <FilterBar filtros={filtros} setFiltros={setFiltros} familias={familias} clientes={clientes} />
            </div>
            <div className="p-5">
              <RevisionView
                pedidos={pedidosOrdenados}
                operarios={operarios}
                miId={miId}
                onOpen={openPedidoCb}
                onSetRevisor={setRevisor}
                onAccion={accionOF}
              />
            </div>
          </>
        )}

        {/* ── VISTA HISTORIAL ── */}
        {vista === "historial" && (
          <>
            <div className="border-b border-border bg-surface-2/40 px-5 py-2.5">
              <FilterBar filtros={filtros} setFiltros={setFiltros} familias={familias} clientes={clientes} />
            </div>
            <div className="p-5">
              <HistorialView pedidos={pedidosOrdenados} operarios={operarios} onOpen={openPedidoCb} />
            </div>
          </>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="w-44 rotate-2">
            <PedidoCardView facet={active} operarios={operarios} dragging />
          </div>
        ) : null}
      </DragOverlay>

      <Drawer
        pedido={openPedido}
        operarios={operarios}
        miId={miId}
        onClose={closeDrawer}
        onAssignOF={asignarOF}
        onAssignPedido={asignarPedido}
        onSetRevisor={setRevisor}
        onAccion={accionOF}
      />
    </DndContext>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "violet" | "muted";
}) {
  const color =
    tone === "amber" ? "text-amber-600" : tone === "violet" ? "text-violet-600" : "text-text-muted";
  return (
    <div className="glass-chip flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
      <span className={`text-sm font-bold ${color}`}>{value}</span>
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  );
}
