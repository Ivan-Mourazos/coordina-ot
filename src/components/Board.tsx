"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { EstadoOF, Familia, Operario, Pedido } from "@/lib/types";
import { estaAtrasado, estaFinalizado, hoyISO, ofsDe } from "@/lib/types";
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
    size: 1,
  });
  const setFiltros = (f: Partial<Filtros>) => setFiltrosState((prev) => ({ ...prev, ...f }));

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

  function facetsFor(autorId: string | null): Facet[] {
    return pedidosOrdenados
      .filter((p) => !estaFinalizado(p)) // los finalizados viven en Historial
      .map((p) => ({
        pedido: p,
        locationId: autorId,
        ofs: ofsDe(p, autorId),
        atrasado: estaAtrasado(p, hoy),
      }))
      .filter((f) => f.ofs.length > 0);
  }
  const bandejaFacets = facetsFor(null);

  // KPIs (solo sobre pedidos procesados = trabajo real de OT)
  const procesadosAll = pedidos.filter((p) => p.situacion === "procesado");
  const countEstado = (e: EstadoOF) =>
    procesadosAll.reduce((n, p) => n + p.ofs.filter((o) => o.estado === e).length, 0);
  const sinAsignar = procesadosAll.reduce(
    (n, p) => n + p.ofs.filter((o) => o.autorId === null).length,
    0,
  );
  const porRevisar = countEstado("por_revisar");
  const enRevision = countEstado("en_revision");

  // ── mutaciones (futuro: persistir en SQL Server) ──
  function mut(ofIds: Set<string>, fn: (of: Pedido["ofs"][number]) => Pedido["ofs"][number]) {
    setPedidos((prev) =>
      prev.map((p) => ({
        ...p,
        ofs: p.ofs.map((of) => (ofIds.has(of.id) ? fn(of) : of)),
      })),
    );
  }
  function moverOFs(ofIds: Set<string>, autorId: string | null) {
    mut(ofIds, (of) =>
      autorId === null
        ? { ...of, autorId: null, revisorId: null, estado: "pendiente", fichandoRol: null }
        : { ...of, autorId, estado: of.estado === "pendiente" ? "en_curso" : of.estado },
    );
  }
  function asignarOF(ofId: string, autorId: string | null) {
    moverOFs(new Set([ofId]), autorId);
  }
  function asignarPedido(autorId: string | null) {
    const p = pedidos.find((x) => x.id === openId);
    if (p) moverOFs(new Set(p.ofs.map((o) => o.id)), autorId);
  }
  function setRevisor(ofId: string, revisorId: string | null) {
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
  }
  function accionOF(ofId: string, accion: AccionOF, obs?: string) {
    mut(new Set([ofId]), (of) => {
      switch (accion) {
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
        default:
          return of;
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActive((e.active.data.current?.facet as Facet) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    const facet = e.active.data.current?.facet as Facet | undefined;
    const overId = e.over?.id;
    setActive(null);
    if (!facet || overId == null) return;
    const target = overId === "bandeja" ? null : String(overId);
    if (target === facet.locationId) return;
    moverOFs(new Set(facet.ofs.map((o) => o.id)), target);
  }

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex min-h-full flex-col">
        {/* topbar */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-4 border-b border-border bg-bg/85 px-5 py-3 backdrop-blur">
          <Logo />
          <ViewSwitcher vista={vista} onChange={setVista} badge={{ revision: porRevisar }} />
          <div className="ml-auto flex items-center gap-2 text-xs">
            <Kpi label="Sin asignar" value={sinAsignar} tone="muted" />
            <Kpi label="Por revisar" value={porRevisar} tone="amber" />
            <Kpi label="En revisión" value={enRevision} tone="violet" />
            <ThemeToggle />
          </div>
        </header>

        {/* ── VISTA ASIGNAR ── */}
        {vista === "asignar" && (
          <>
            <main className="grid flex-1 grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {operarios.map((op) => (
                <Zona
                  key={op.id}
                  operario={op}
                  operarios={operarios}
                  facets={facetsFor(op.id)}
                  size={filtros.size}
                  onOpen={(f) => setOpenId(f.pedido.id)}
                />
              ))}
            </main>
            <div className="sticky bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur">
              <div className="border-b border-border px-5 py-2.5">
                <FilterBar filtros={filtros} setFiltros={setFiltros} familias={familias} clientes={clientes} />
              </div>
              <div className="max-h-[38vh] overflow-y-auto p-5 scroll-thin">
                <Bandeja
                  facets={bandejaFacets}
                  size={filtros.size}
                  operarios={operarios}
                  onOpen={(f) => setOpenId(f.pedido.id)}
                />
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
              <ListaView pedidos={listaOrdenados} operarios={operarios} onOpen={(p) => setOpenId(p.id)} />
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
                onOpen={(p) => setOpenId(p.id)}
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
              <HistorialView pedidos={pedidosOrdenados} operarios={operarios} onOpen={(p) => setOpenId(p.id)} />
            </div>
          </>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="rotate-2">
            <PedidoCardView facet={active} size={filtros.size} operarios={operarios} dragging />
          </div>
        ) : null}
      </DragOverlay>

      <Drawer
        pedido={openPedido}
        operarios={operarios}
        onClose={() => setOpenId(null)}
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
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5">
      <span className={`text-sm font-bold ${color}`}>{value}</span>
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  );
}
