"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BotonArriba } from "./BotonArriba";
import { ListaView } from "./ListaView";
import { RevisionView } from "./RevisionView";
import { HistorialView } from "./HistorialView";
import { Drawer } from "./Drawer";
import { PedidoCardView, type Facet } from "./PedidoCard";
import { IdentityGate } from "./IdentityGate";
import { IdentityBadge } from "./IdentityBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { MiFichaje } from "./MiFichaje";
import { TecnicoCard } from "./TecnicoCard";
import { Notificaciones, type NotifItem } from "./Notificaciones";
import { LiveDot } from "./LiveBadge";
import { useHydrated } from "@/lib/useHydrated";
import { ACCIONES, accionesDisponibles, aplicarAccion, type AccionOF } from "@/lib/acciones";
import { FICHAJE_VACIO, abierto, fichar, pausar, type Fichaje } from "@/lib/fichaje";

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
  // Espejo síncrono del estado: las mutaciones calculan su resultado sobre él
  // ANTES del re-render (para persistir el snapshot exacto) y el polling lo
  // usa sin meter `pedidos` en dependencias de callbacks estables.
  const pedidosRef = useRef<Pedido[]>(initial);
  const setPedidosSync = useCallback(
    (next: Pedido[] | ((prev: Pedido[]) => Pedido[])) => {
      const value = typeof next === "function" ? next(pedidosRef.current) : next;
      pedidosRef.current = value;
      setPedidos(value);
    },
    [],
  );
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

  // Motor de fichaje: la única fuente de verdad son los intervalos, nunca
  // minutos sumados. El server es la única fuente de verdad (ya no hay
  // localStorage de por medio): arranca vacío y se reconcilia con lo que
  // devuelve el server (ver postFichaje y el efecto de carga por miId).
  const [fichaje, setFichaje] = useState<Fichaje>(FICHAJE_VACIO);

  // fichandoRol de cada OF se DERIVA del intervalo abierto (denormalizado en
  // pedidos para que LiveBadge, chips y contadores existentes sigan
  // funcionando sin tocarlos).
  useEffect(() => {
    const ab = abierto(fichaje);
    setPedidosSync((prev) =>
      prev.map((p) => ({
        ...p,
        ofs: p.ofs.map((of) => {
          const rol = ab && ab.ofIds.includes(of.id) ? ab.rol : null;
          return of.fichandoRol === rol ? of : { ...of, fichandoRol: rol };
        }),
      })),
    );
  }, [fichaje, setPedidosSync]);

  // Panel de compañero desplegado en Asignar: solo uno a la vez.
  const [superiorColapsado, setSuperiorColapsado] = useState(false);
  // Mi zona contraída con el handle iOS: la fila superior pasa a altura auto.
  const [zonaColapsada, setZonaColapsada] = useState(false);

  // Paneles redimensionables: altura del panel personal en px.
  const [panelTopH, setPanelTopH] = useState<number>(() => {
    if (typeof window === "undefined") return 280;
    try {
      const saved = localStorage.getItem("coordina-panel-sizes");
      return saved ? JSON.parse(saved).top ?? 280 : 280;
    } catch { return 280; }
  });
  const dragRef = useRef<{ edge: "top" | "bottom"; startY: number; startH: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const equipoRef = useRef<HTMLDivElement | null>(null);

  // Persist panel sizes
  useEffect(() => {
    try { localStorage.setItem("coordina-panel-sizes", JSON.stringify({ top: panelTopH })); } catch {}
  }, [panelTopH]);

  // Drag handlers for resizable panels
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      e.preventDefault();
      const delta = e.clientY - dragRef.current.startY;
      let newH = Math.max(120, dragRef.current.startH + delta);
      // Tope: cabecera + equipo + handle + filtros + bandeja mínima siempre visibles.
      const cont = containerRef.current;
      if (cont) {
        const equipoH = equipoRef.current?.offsetHeight ?? 0;
        const max = cont.clientHeight - equipoH - 270;
        newH = Math.min(newH, Math.max(120, max));
      }
      setPanelTopH(newH);
    }
    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    dragRef.current = { edge: "top", startY: e.clientY, startH: panelTopH };
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }, [panelTopH]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);
  const closeExpanded = useCallback(() => setExpandedId(null), []);

  const [vista, setVista] = useState<Vista>("asignar");
  const [openId, setOpenId] = useState<string | null>(null);
  const [active, setActive] = useState<Facet | null>(null);

  // ── Sincronización entre navegadores: polling ligero del tablero ──
  // Cada 30 s se pide el tablero completo (RPS+overlay, servido de caché) y
  // se sustituye el estado local: lo que guardaron los compañeros aparece
  // solo. Se salta con la pestaña oculta o un arrastre en marcha, y se
  // conserva el fichandoRol de MI fichaje abierto (verdad local inmediata).
  const fichajeRef = useRef(fichaje);
  useEffect(() => {
    fichajeRef.current = fichaje;
  }, [fichaje]);
  // Cuenta los POST de fichaje emitidos: la carga inicial (GET por miId) no
  // debe pisar con un snapshot viejo un POST disparado después de arrancar.
  const postSeqRef = useRef(0);
  const activeRef = useRef<Facet | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    const id = setInterval(async () => {
      if (activeRef.current) return; // solo se salta durante un drag&drop
      try {
        const r = await fetch("/api/tablero", { cache: "no-store" });
        if (!r.ok) return;
        const t = (await r.json()) as { pedidos: Pedido[] };
        if (activeRef.current) return; // el arrastre pudo empezar durante el fetch
        const ab = abierto(fichajeRef.current);
        setPedidosSync(
          t.pedidos.map((p) => ({
            ...p,
            ofs: p.ofs.map((of) =>
              ab && ab.ofIds.includes(of.id) ? { ...of, fichandoRol: ab.rol } : of,
            ),
          })),
        );
      } catch {
        // sin red o servidor reiniciando: el siguiente tick lo reintenta
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [setPedidosSync]);
  const [filtros, setFiltrosState] = useState<Filtros>({
    query: "",
    familia: "todas",
    cliente: "todos",
    estado: "todos",
    prioridad: "todas",
    soloAtrasados: false,
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

  const hoy = hoyISO();

  const pedidosFiltrados = useMemo(() => {
    const q = filtros.query.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (q && !`${p.codigo} ${p.cliente} ${p.negocio ?? ""}`.toLowerCase().includes(q)) return false;
      if (filtros.familia !== "todas" && !p.ofs.some((o) => o.familia === filtros.familia)) return false;
      if (filtros.cliente !== "todos" && p.cliente !== filtros.cliente) return false;
      if (filtros.estado !== "todos" && !p.ofs.some((o) => o.estado === filtros.estado)) return false;
      if (filtros.prioridad !== "todas" && p.prioridad !== filtros.prioridad) return false;
      if (filtros.soloAtrasados && !estaAtrasado(p, hoy)) return false;
      return true;
    });
  }, [pedidos, filtros, hoy]);

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
          // 3 = urgente primero (desc); a igualdad, por planificación.
          return b.prioridad - a.prioridad ||
            a.fechaPlanificacion.localeCompare(b.fechaPlanificacion);
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

  // Historial: los más recientes (mayor fecha de finalización) arriba. En un
  // pedido ya terminado, fechaPlanificacion guarda la fecha de finalización.
  const historialOrdenados = useMemo(
    () =>
      pedidosFiltrados
        .filter((p) => p.situacion === "completado" || estaFinalizado(p))
        .sort((a, b) => b.fechaPlanificacion.localeCompare(a.fechaPlanificacion)),
    [pedidosFiltrados],
  );

  // Facets del tablero Asignar, agrupadas por ubicación (autor o bandeja) en
  // UNA pasada, en vez de recorrer todos los pedidos una vez por zona.
  const facetsByLoc = useMemo(() => {
    const map = new Map<string | null, Facet[]>();
    for (const p of pedidosOrdenados) {
      // Proyectos internos (OFs sin pedido): no son trabajo de pedidos.
      // Se fichan desde Mi fichaje y se consultan en la Lista.
      if (p.interno) continue;
      const atrasado = estaAtrasado(p, hoy);
      const porLoc = new Map<string | null, OF[]>();
      for (const of of p.ofs) {
        // Las OFs anuladas ("no se hace en OT") salen del tablero de
        // asignación: si el pedido se queda sin OFs activas, desaparece de
        // Sin asignar (sigue consultable en Lista/Historial).
        if (of.estado === "anulada") continue;
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
    (n, p) =>
      p.interno ? n : n + p.ofs.filter((o) => o.autorId === null).length,
    0,
  );
  const porRevisar = countEstado("por_revisar");
  const enRevision = countEstado("en_revision");

  // ── Quién ficha AHORA (para tarjetas de equipo y cluster "En directo") ──
  // El operario es el del INTERVALO abierto (quien ficha de verdad), no el
  // autor/revisor de la OF: fichar en OFs de un compañero está permitido y
  // el tiempo debe verse a nombre de quien lo está echando.
  const liveByOp = useMemo(() => {
    const map = new Map<string, LiveInfo>();
    const ab = abierto(fichaje);
    if (!ab) return map;
    const op = operarios.find((o) => o.id === ab.operarioId);
    if (!op) return map;
    for (const p of procesadosAll) {
      for (const of of p.ofs) {
        if (of.fichandoRol && ab.ofIds.includes(of.id) && !map.has(op.id)) {
          map.set(op.id, { operario: op, rol: ab.rol, pedido: p, of });
        }
      }
    }
    return map;
  }, [procesadosAll, operarios, fichaje]);

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

  // Aviso visible aunque la pestaña esté al fondo: "(2) CoordinaOT".
  useEffect(() => {
    const n = misPorRevisar + misDevueltas;
    document.title = n > 0 ? `(${n}) CoordinaOT` : "CoordinaOT";
  }, [misPorRevisar, misDevueltas]);

  const irANotificacion = useCallback((destino: Vista, pedidoId: string) => {
    setVista(destino);
    setOpenId(pedidoId);
  }, []);
  const openFacet = useCallback((f: Facet) => setOpenId(f.pedido.id), []);
  const openPedidoCb = useCallback((p: Pedido) => setOpenId(p.id), []);
  const closeDrawer = useCallback(() => setOpenId(null), []);

  // ── mutaciones: estado local + persistencia en el servidor (SQLite) ──
  // El servidor guarda el snapshot completo de flujo de cada OF tocada
  // (autor, revisor, estado, observación); getTablero() lo fusiona al servir,
  // así el tablero sobrevive recargas y se comparte entre navegadores.
  const persistir = useCallback(
    (payload: {
      motivo: string;
      cambiosOF?: Array<{
        ofId: string;
        autorId: string | null;
        revisorId: string | null;
        estado: EstadoOF;
        observacion: string | null;
      }>;
      completarPedidoId?: string;
    }) => {
      fetch("/api/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, operarioId: miId }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        })
        .catch((e) => {
          // La UI ya aplicó el cambio (optimista). Si el guardado falla, el
          // siguiente polling repondrá la verdad del servidor.
          console.warn("[coordina] no se pudo guardar el cambio:", e);
        });
    },
    [miId],
  );

  const snapshotDe = (of: OF) => ({
    ofId: of.id,
    autorId: of.autorId,
    revisorId: of.revisorId,
    estado: of.estado,
    observacion: of.observacion ?? null,
  });

  const mut = useCallback(
    (ofIds: Set<string>, fn: (of: OF) => OF, motivo?: string) => {
      const cambios: ReturnType<typeof snapshotDe>[] = [];
      setPedidosSync((prev) =>
        prev.map((p) => ({
          ...p,
          ofs: p.ofs.map((of) => {
            if (!ofIds.has(of.id)) return of;
            const nueva = fn(of);
            if (motivo && nueva !== of) cambios.push(snapshotDe(nueva));
            return nueva;
          }),
        })),
      );
      if (motivo && cambios.length > 0) persistir({ motivo, cambiosOF: cambios });
    },
    [setPedidosSync, persistir],
  );
  const moverOFs = useCallback(
    (ofIds: Set<string>, autorId: string | null) => {
      mut(
        ofIds,
        (of) =>
          autorId === null
            ? { ...of, autorId: null, revisorId: null, estado: "pendiente", fichandoRol: null }
            : { ...of, autorId },
        "asignar",
      );
    },
    [mut],
  );
  const asignarPedido = useCallback(
    (autorId: string | null) => {
      const pedido = pedidosRef.current.find((p) => p.id === openId);
      if (!pedido) return;
      moverOFs(new Set(pedido.ofs.map((of) => of.id)), autorId);
    },
    [openId, moverOFs],
  );
  // Asignar revisor NO cambia el estado: la OF queda "por revisar" hasta que
  // el revisor pulse "Empezar revisión" (o fiche como revisor), que es lo que
  // arranca su fichaje. Antes saltaba sola a en_revision y dejaba muerta la
  // acción empezar_revision de la máquina de estados.
  const setRevisor = useCallback(
    (ofId: string, revisorId: string | null) => {
      mut(new Set([ofId]), (of) => ({ ...of, revisorId }), "revisor");
    },
    [mut],
  );
  // ── API de fichaje del Board ──
  const ahora = () => new Date().toISOString();

  // Envía la intención al server (fuente de la hora) y reconcilia el estado
  // local con lo que devuelve. Fire-and-forget: si falla la red, se conserva
  // el optimista y la siguiente acción/carga lo corrige.
  const postFichaje = useCallback(
    (ofIds: string[], rol: Rol) => {
      if (!miId) return;
      postSeqRef.current += 1;
      fetch("/api/fichaje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operarioId: miId, ofIds, rol }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { fichaje: Fichaje } | null) => {
          if (d?.fichaje) setFichaje(d.fichaje);
        })
        .catch(() => {});
    },
    [miId],
  );

  const ficharOFs = useCallback(
    (ofIds: string[], rol: Rol) => {
      if (!miId) return;
      // Regla del spec ("ligado suave"): fichar una OF pendiente la pasa a
      // en_curso (igual una devuelta, vía "retomar"). Se aplica con
      // aplicarAccion() directamente sobre mut(), NO con ejecutarAccion(),
      // para no volver a entrar aquí (ejecutarAccion → efectoFichaje
      // "arranca" → ficharOFs sería recursión). Si la OF ya está en_curso
      // (p.ej. porque ejecutarAccion ya la transicionó antes de llamarnos),
      // aplicarAccion() lanza y el catch por-OF la deja tal cual: no hay
      // doble transición ni fichaje duplicado.
      mut(
        new Set(ofIds),
        (of) => {
          try {
            if (of.estado === "pendiente") return aplicarAccion(of, "empezar_planteo");
            if (of.estado === "devuelta") return aplicarAccion(of, "retomar");
            // Mismo ligado para el revisor: fichar una OF "por revisar" (rol
            // revisar) la pasa a en_revision. Requiere revisor asignado; si no
            // lo tiene, aplicarAccion lanza y el catch la deja como está.
            if (of.estado === "por_revisar" && rol === "revisar")
              return aplicarAccion(of, "empezar_revision");
            return of;
          } catch {
            return of;
          }
        },
        "fichar",
      );
      const ab = abierto(fichajeRef.current);
      const conjunto = ab && ab.rol === rol ? [...ab.ofIds, ...ofIds] : ofIds;
      setFichaje((f) => fichar(f, conjunto, rol, miId, ahora())); // optimista
      postFichaje(conjunto, rol);
    },
    [miId, mut, postFichaje],
  );

  const desficharOF = useCallback(
    (ofId: string) => {
      const ab = abierto(fichajeRef.current);
      if (!ab) return;
      const resto = ab.ofIds.filter((id) => id !== ofId);
      setFichaje((f) => fichar(f, resto, ab.rol, ab.operarioId, ahora())); // optimista
      postFichaje(resto, ab.rol);
    },
    [postFichaje],
  );

  // pausarTodo/reanudar: pausa global del fichaje, reservada para el panel
  // "Mi fichaje" (Task 7). El Drawer ya no las usa: fichar/desfichar ahora
  // es por OF (onFichar/onDesfichar).
  const pausarTodo = useCallback(() => {
    setFichaje((f) => pausar(f, ahora())); // optimista
    postFichaje([], "plantear"); // rol ignorado al pausar (ofIds vacío)
  }, [postFichaje]);

  const reanudar = useCallback(() => {
    if (!miId) return;
    const ultimo = fichajeRef.current.intervalos[fichajeRef.current.intervalos.length - 1];
    if (!ultimo || ultimo.fin === null) return;
    // Reabre con la identidad ACTUAL (miId), no con la del último
    // intervalo: si se reanuda tras un cambio de técnico, el tiempo debe
    // quedar fichado a nombre de quien está delante del panel ahora.
    setFichaje((f) => fichar(f, ultimo.ofIds, ultimo.rol, miId, ahora())); // optimista
    postFichaje(ultimo.ofIds, ultimo.rol);
  }, [miId, postFichaje]);

  // Al conocer quién soy, adopto MI fichaje del server (verdad compartida).
  // No se migra el localStorage previo (era contra datos mock).
  useEffect(() => {
    if (!miId) return;
    let cancelado = false;
    const seqAlArrancar = postSeqRef.current;
    fetch(`/api/fichaje?operarioId=${encodeURIComponent(miId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { fichaje: Fichaje } | null) => {
        // No pisar un POST emitido tras arrancar esta carga (la carga inicial
        // trae un snapshot que puede ser anterior a una acción del usuario).
        if (d?.fichaje && !cancelado && postSeqRef.current === seqAlArrancar) {
          setFichaje(d.fichaje);
        }
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [miId]);

  // Cambiar de identidad con un fichaje corriendo perdería de vista ese
  // tiempo (queda fichado a nombre del técnico anterior): se avisa y se deja
  // pausar antes de cambiar, en vez de cambiar en silencio.
  const [cambioIdentidadPendiente, setCambioIdentidadPendiente] = useState<string | null>(null);
  const solicitarCambioIdentidad = useCallback(
    (id: string) => {
      if (id === miId) return; // re-elegirse a uno mismo: ni diálogo ni pausa
      if (abierto(fichaje) !== null) setCambioIdentidadPendiente(id);
      else setMiId(id);
    },
    [fichaje, miId, setMiId],
  );

  // Fichar en OFs asignadas a OTRO operario está permitido (en el taller se
  // hace, p.ej. para revisar o echar una mano), pero se avisa antes para que
  // no ocurra sin querer desde el panel/tarjeta de un compañero.
  const [fichajeAjenoPendiente, setFichajeAjenoPendiente] = useState<{
    ofIds: string[];
    rol: Rol;
    nombres: string[];
  } | null>(null);
  const ficharOFsConAviso = useCallback(
    (ofIds: string[], rol: Rol) => {
      if (!miId) return;
      const ids = new Set(ofIds);
      const ajenos = new Set<string>();
      for (const p of pedidos) {
        for (const of of p.ofs) {
          if (!ids.has(of.id)) continue;
          const asignado = rol === "revisar" ? of.revisorId : of.autorId;
          if (asignado !== null && asignado !== miId) ajenos.add(asignado);
        }
      }
      if (ajenos.size === 0) {
        ficharOFs(ofIds, rol);
        return;
      }
      const nombres = operarios
        .filter((o) => ajenos.has(o.id))
        .map((o) => o.nombre);
      setFichajeAjenoPendiente({ ofIds, rol, nombres });
    },
    [miId, pedidos, operarios, ficharOFs],
  );

  // ── máquina de estados: ejecutarAccion sustituye a los switch de antes ──
  const ejecutarAccion = useCallback(
    (ofIds: string[], accion: AccionOF, obs?: string) => {
      const def = ACCIONES.find((a) => a.id === accion);
      // Acciones con nota obligatoria (p.ej. "devolver") sin nota: cortar aquí
      // ANTES de tocar nada. Si no, aplicarAccion() lanza (y mut() lo atrapa)
      // pero el bloque efectoFichaje==="corta" de abajo cortaría igual el
      // fichaje aunque la OF no haya cambiado de estado.
      if (def?.conNota && !obs?.trim()) return;
      // Solo disparar el efecto de fichaje sobre las OFs donde la acción
      // realmente aplica: si aplicarAccion() la hubiera rechazado para
      // todas (p.ej. "empezar_planteo" sobre una OF "devuelta"), no hay que
      // arrancar/cortar fichaje para nadie. mut() conserva su try/catch por
      // OF como segunda red de seguridad.
      const aplicables = ofIds.filter((id) => {
        const of = pedidos.flatMap((p) => p.ofs).find((o) => o.id === id);
        return of ? accionesDisponibles(of).some((a) => a.id === accion) : false;
      });
      if (aplicables.length === 0) return;
      mut(
        new Set(aplicables),
        (of) => {
          try {
            return aplicarAccion(of, accion, obs);
          } catch {
            return of;
          }
        },
        accion,
      );
      if (def?.efectoFichaje === "corta") {
        setFichaje((f) => {
          const ab = abierto(f);
          if (!ab) return f;
          const resto = ab.ofIds.filter((id) => !aplicables.includes(id));
          return fichar(f, resto, ab.rol, ab.operarioId, ahora());
        });
      } else if (def?.efectoFichaje === "arranca") {
        const rol = accion === "empezar_revision" ? "revisar" : "plantear";
        ficharOFs(aplicables, rol);
      }
    },
    [mut, ficharOFs, pedidos],
  );

  // Adaptador para no romper firmas aguas abajo todavía: RevisionView sigue
  // operando OF por OF con la firma antigua (ofId, accion, obs?). Zona/
  // TecnicoCard/PedidoChip ya llaman a ejecutarAccion directamente desde
  // Task 7; el adaptador accionFacet murió con ellas.
  const accionOF = (ofId: string, a: AccionOF, obs?: string) => ejecutarAccion([ofId], a, obs);

  const completarPedido = useCallback(
    (pedidoId: string) => {
      setPedidosSync((prev) =>
        prev.map((p) => (p.id === pedidoId ? { ...p, situacion: "completado" } : p)),
      );
      persistir({ motivo: "completar", completarPedidoId: pedidoId });
      setOpenId(null);
    },
    [setPedidosSync, persistir],
  );

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
      <div ref={containerRef} className="flex min-h-full flex-col">
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
            <IdentityBadge yo={yo} operarios={operarios} onChange={solicitarCambioIdentidad} />
            <ThemeToggle />
          </div>
        </header>

        {/* ── VISTA ASIGNAR ── */}
        {vista === "asignar" && (
          <>
            {!superiorColapsado && (
            <>
            {/* zona personal: el drag estira/encoge; el panel llena el hueco
                pegado al equipo. Con la zona contraída (handle iOS) la altura
                pasa a auto: nada de hueco muerto, todo sube pegado. */}
            <main
              className="flex shrink-0 flex-col overflow-y-auto p-4 pb-2 scroll-thin"
              style={zonaColapsada ? undefined : { height: panelTopH, minHeight: 120 }}
            >
              <Zona
                className="min-h-0 flex-1"
                onColapsada={setZonaColapsada}
                operario={yo}
                operarios={operarios}
                facets={facetsDe(yo.id)}
                live={liveByOp.get(yo.id) ?? null}
                soyYo
                onOpen={openFacet}
                onAccion={ejecutarAccion}
                onFichar={ficharOFsConAviso}
                onDesfichar={desficharOF}
                setRevisor={setRevisor}
                completarPedido={completarPedido}
              />
            </main>

            {/* equipo: siempre pegado a la división, altura propia */}
            <div ref={equipoRef} className="shrink-0 px-4 pb-3">
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
                    onAccion={ejecutarAccion}
                    onFichar={ficharOFsConAviso}
                    onDesfichar={desficharOF}
                    setRevisor={setRevisor}
                    completarPedido={completarPedido}
                  />
                ))}
              </div>
            </div>

            {/* ── resize handle: sin sentido con la zona contraída ── */}
            {!zonaColapsada && (
              <div
                onMouseDown={startResize}
                onDoubleClick={() => setPanelTopH(280)}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Redimensionar panel superior"
                className="group flex h-2.5 shrink-0 cursor-ns-resize items-center justify-center border-y border-[var(--glass-border)] bg-[var(--surface-2)] transition-colors hover:bg-brand-400/15 active:bg-brand-400/25"
                title="Arrastra para redimensionar · doble clic restablece"
              >
                <span className="flex items-center gap-1 rounded-full bg-[var(--surface)] px-2.5 py-[3px] ring-1 ring-[var(--border-strong)] transition-all group-hover:ring-brand-400 group-active:scale-95">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-[3px] rounded-full bg-text-muted/60 transition-colors group-hover:bg-brand-500"
                    />
                  ))}
                </span>
              </div>
            )}
            </>
            )}
            <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--glass-border)]">
              <div
                className="flex items-center gap-3 px-4 py-2"
                style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}
              >
                <div className="min-w-0 flex-1">
                  <FilterBar filtros={filtros} setFiltros={setFiltros} familias={familias} clientes={clientes} showEstado={false} ordenes={["planificacion", "familia", "prioridad"]} />
                </div>
                <button
                  onClick={() => setSuperiorColapsado((v) => !v)}
                  title={superiorColapsado ? "Mostrar mi zona y el equipo" : "Ocultar arriba para ver más pedidos"}
                  className="glass-chip flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-text-muted hover:text-text"
                >
                  <svg viewBox="0 0 24 24" className={`size-3.5 transition-transform ${superiorColapsado ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m18 15-6-6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {superiorColapsado ? "Mostrar paneles" : "Maximizar bandeja"}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 scroll-thin">
                <Bandeja facets={facetsDe(null)} operarios={operarios} onOpen={openFacet} orden={filtros.orden} />
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
              <FilterBar
                filtros={filtros}
                setFiltros={setFiltros}
                familias={familias}
                clientes={clientes}
                showEstado={false}
                showAtrasados={false}
              />
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
              <FilterBar
                filtros={filtros}
                setFiltros={setFiltros}
                familias={familias}
                clientes={clientes}
                showEstado={false}
                showAtrasados={false}
                ordenes={["cliente", "prioridad"]}
              />
            </div>
            <div className="p-5">
              <HistorialView pedidos={historialOrdenados} operarios={operarios} onOpen={openPedidoCb} />
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

      <BotonArriba />

      <Drawer
        pedido={openPedido}
        operarios={operarios}
        miId={miId}
        onClose={closeDrawer}
        onAssignPedido={asignarPedido}
        onCompletar={completarPedido}
        onSetRevisor={setRevisor}
        onAccion={ejecutarAccion}
        onFichar={ficharOFsConAviso}
        onDesfichar={desficharOF}
      />

      <MiFichaje
        miId={miId}
        operarios={operarios}
        pedidos={procesadosAll}
        fichaje={fichaje}
        onFichar={ficharOFsConAviso}
        onDesfichar={desficharOF}
        onPausarTodo={pausarTodo}
        onReanudar={reanudar}
      />

      <ConfirmDialog
        abierto={cambioIdentidadPendiente !== null}
        titulo="Cambiar de técnico"
        mensaje={`Tienes un fichaje corriendo a nombre de ${yo.nombre}. ¿Pausarlo antes de cambiar?`}
        onConfirmar={() => {
          pausarTodo();
          if (cambioIdentidadPendiente) setMiId(cambioIdentidadPendiente);
          setCambioIdentidadPendiente(null);
        }}
        onCancelar={() => setCambioIdentidadPendiente(null)}
      />

      <ConfirmDialog
        abierto={fichajeAjenoPendiente !== null}
        titulo="Fichar en OF de un compañero"
        mensaje={`Vas a fichar en OFs asignadas a ${fichajeAjenoPendiente?.nombres.join(", ") ?? ""}. El tiempo contará igual (va a Oficina Técnica), pero la OF sigue asignada a esa persona. ¿Continuar?`}
        onConfirmar={() => {
          if (fichajeAjenoPendiente) {
            ficharOFs(fichajeAjenoPendiente.ofIds, fichajeAjenoPendiente.rol);
          }
          setFichajeAjenoPendiente(null);
        }}
        onCancelar={() => setFichajeAjenoPendiente(null)}
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
