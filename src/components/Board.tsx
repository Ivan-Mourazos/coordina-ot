"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EstadoOF, OF, Operario, Pedido, Rol } from "@/lib/types";
import { estaAtrasado, hoyISO } from "@/lib/types";
import { ROL } from "@/lib/estado";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ViewSwitcher, type Vista } from "./ViewSwitcher";
import { FilterBar, type VistaFiltrable } from "./FilterBar";
import { ZonaPersonal } from "./ZonaPersonal";
import { FaseFlyout } from "./FaseFlyout";
import { Bandeja, type Agrupacion } from "./Bandeja";
import { Select } from "./Select";
import { BotonArriba } from "./BotonArriba";
import { ListaView } from "./ListaView";
import { RevisionView } from "./RevisionView";
import { VisitasCotView } from "./VisitasCotView";
import { HistorialView } from "./HistorialView";
import { Drawer } from "./Drawer";
import type { Facet } from "./PedidoCard";
import { IdentityGate } from "./IdentityGate";
import { IdentityBadge } from "./IdentityBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { MiFichaje } from "./MiFichaje";
import { TecnicoCard } from "./TecnicoCard";
import { Notificaciones } from "./Notificaciones";
import { Herramientas } from "./Herramientas";
import {
  agruparAvisos,
  aplicarDescartes,
  esDescartable,
  identidadAviso,
  type AvisoSuelto,
  type NotifItem,
} from "@/lib/notificaciones";
import { LiveDot } from "./LiveBadge";
import { useHydrated } from "@/lib/useHydrated";
import { ACCIONES, accionesDisponibles, aplicarAccion, type AccionOF } from "@/lib/acciones";
import { FASES, ofOcultaDeOT, pedidoListoParaPasar } from "@/lib/fases-tablero";
import { contarRevisorEnEstado } from "@/lib/revision";
import { FICHAJE_VACIO, abierto, fichar, pausar, type Fichaje } from "@/lib/fichaje";
import { cambiarRevisor, puedeCambiarRevisor, traspasarAutor } from "@/lib/traspaso";
import { MOTIVO_CAMBIO_REVISOR, type AvisoMovimiento } from "@/lib/avisos";
import {
  FILTROS_INICIALES,
  ORDENES,
  ORDEN_LABEL,
  aplicarFiltros,
  contarCategoriasVisibles,
  filtrosAParams,
  hayFiltrosActivos,
  opcionesDisponibles,
  paramsAFiltros,
  type Filtros,
  type OrdenLista,
} from "@/lib/filtros";

const IDENTITY_KEY = "coordina-operario-id";

/** Quién está fichando ahora mismo: en qué OF y con qué rol. */
export interface LiveInfo {
  operario: Operario;
  rol: Rol;
  pedido: Pedido;
  of: OF;
}

const VISTAS: Vista[] = ["asignar", "lista", "revision", "visitas", "historial"];

/** Vista que pide la URL, si pide alguna.
 *
 *  Acepta las CINCO, no solo las que llevan barra de filtros: Historial y
 *  Visitas tienen sus propios filtros pero siguen siendo sitios a los que se
 *  pasa un enlace, y limitarlo a las filtrables hacía que `?v=historial`
 *  aterrizara en Asignar y encima reescribiera la URL. */
function vistaDeUrl(): Vista | null {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("v");
  return VISTAS.includes(v as Vista) ? (v as Vista) : null;
}

/** La vista cuyos filtros toca leer de la URL. Historial y Visitas no tienen
 *  barra propia en `filtrosPorVista`, así que sus parámetros no van a ninguna
 *  parte — y es correcto: sus filtros son suyos y viven en su componente. */
function filtrableDeUrl(): VistaFiltrable {
  const v = vistaDeUrl();
  return v === "lista" || v === "revision" ? v : "asignar";
}

/** Filtros iniciales de cada vista, con los de la URL puestos en la suya.
 *
 *  Se lee al construir el estado, no en un efecto: el tablero no se pinta hasta
 *  estar hidratado (ver `mounted` más abajo), así que aquí `window` ya existe y
 *  no hay desajuste con el marcado del servidor. Es el mismo patrón que usa la
 *  identidad guardada en localStorage. */
function filtrosDeUrl(): Record<VistaFiltrable, Filtros> {
  const base: Record<VistaFiltrable, Filtros> = {
    asignar: FILTROS_INICIALES,
    lista: FILTROS_INICIALES,
    revision: FILTROS_INICIALES,
  };
  if (typeof window === "undefined") return base;
  const sp = new URLSearchParams(window.location.search);
  // Solo `v` = un enlace a una vista, sin filtros que restaurar.
  if (![...sp.keys()].some((k) => k !== "v")) return base;
  return { ...base, [filtrableDeUrl()]: paramsAFiltros(sp) };
}

// ── Recordatorio del periodo de pruebas ─────────────────────────────────────
// Mientras el fichaje de CoordinaOT se contrasta con el de siempre hay que
// fichar en los DOS sitios. Se recuerda una vez al día por técnico, la primera
// vez que ficha: en cada fichaje se convertiría en un diálogo que se cierra sin
// leer. Se guarda la FECHA y no un booleano para que caduque solo al cambiar
// de día, sin nada que limpiar.
// QUITAR esto y el cartel de MiFichaje cuando el fichaje pase a "activo".
const AVISO_ANTIGUA_KEY = "coordina-aviso-herramienta-antigua";

function avisoAntiguaPendiente(operarioId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(`${AVISO_ANTIGUA_KEY}:${operarioId}`) !== hoyISO();
  } catch {
    // Sin localStorage (modo privado, permisos) se avisa siempre: molesta menos
    // que perder horas por no haber fichado en la herramienta antigua.
    return true;
  }
}

function marcarAvisoAntiguaVisto(operarioId: string): void {
  try {
    localStorage.setItem(`${AVISO_ANTIGUA_KEY}:${operarioId}`, hoyISO());
  } catch {
    // Da igual: el aviso volverá a salir, que es el lado seguro.
  }
}

function leerIdentidadGuardada(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(IDENTITY_KEY);
  } catch {
    return null;
  }
}

/** Avisos deducidos que ya se abrieron, GUARDADOS POR TÉCNICO.
 *
 *  Por técnico y no en una lista común porque "listo para pasar" le llega a
 *  todos los implicados en el pedido: con una sola lista, apagarlo uno se lo
 *  apagaría al compañero que entrara después en el mismo puesto. */
const DESCARTES_KEY = "coordina-avisos-descartados";

function leerDescartes(operarioId: string | null): string[] {
  if (typeof window === "undefined" || !operarioId) return [];
  try {
    const crudo = localStorage.getItem(`${DESCARTES_KEY}:${operarioId}`);
    const val: unknown = crudo ? JSON.parse(crudo) : null;
    // Se filtra por tipo: si lo guardado está corrupto, lo peor que puede pasar
    // es volver a ver un aviso, nunca reventar el tablero al arrancar.
    return Array.isArray(val) ? val.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
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
  // El tablero depende de cosas que solo existen en el navegador (identidad
  // guardada, filtros de localStorage): se pinta tras montar para que la
  // hidratación case sin warnings.
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

  // OFs de MI intervalo abierto. `fichandoRol` de una OF dice que alguien la
  // ficha, no que la fiche yo: sin esto la fila ofreceria pausar el fichaje de
  // otro, que en realidad cortaria el mio.
  const ofIdsFichandoYo = useMemo(() => new Set(abierto(fichaje)?.ofIds ?? []), [fichaje]);

  // Avisos de movimiento: no se pueden deducir del tablero (una OF traspasada
  // no guarda de quién venía), así que se piden aparte. Mismo ritmo que el
  // polling del tablero, que es donde se notaría el cambio.
  const [avisosMov, setAvisosMov] = useState<AvisoMovimiento[]>([]);
  // Espejo para leerlos al abrir un pedido sin que los callbacks de apertura
  // se recreen en cada refresco de avisos.
  const avisosMovRef = useRef<AvisoMovimiento[]>([]);
  useEffect(() => {
    avisosMovRef.current = avisosMov;
  }, [avisosMov]);
  useEffect(() => {
    if (!miId) return;
    let vivo = true;
    const cargar = () => {
      fetch(`/api/avisos?operarioId=${encodeURIComponent(miId)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { avisos: AvisoMovimiento[] } | null) => {
          if (vivo && d) setAvisosMov(d.avisos);
        })
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, 30_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [miId]);

  // Fase cuyo "+N más" está desplegado en mi zona (null = ninguno).
  const [faseAbierta, setFaseAbierta] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);
  const closeExpanded = useCallback(() => setExpandedId(null), []);

  const [vista, setVista] = useState<Vista>(() => vistaDeUrl() ?? "asignar");
  const [openId, setOpenId] = useState<string | null>(null);
  // Cómo se reparte la bandeja en filas. NO es un filtro y por eso no vive con
  // ellos: el desplegable se llamaba "Orden" pero lo que hace es agrupar, y
  // encima compartía valores con las otras vistas ("Fecha de entrega") que aquí
  // no significan nada y dejaban el control pintando un "—".
  const [agrupar, setAgrupar] = useState<Agrupacion>("ninguna");

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
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/tablero", { cache: "no-store" });
        if (!r.ok) return;
        const t = (await r.json()) as { pedidos: Pedido[] };
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
  // ── Filtros: UNOS POR VISTA, no unos compartidos ──
  // Antes había un solo juego para Asignar, Lista y Revisión mientras cada
  // vista escondía controles distintos: ponías Estado="Aprobada" en la Lista,
  // volvías a Asignar —que no enseña ese desplegable— y la bandeja seguía
  // recortada por un filtro que no aparecía en ninguna parte. Con un juego por
  // vista, todo filtro activo tiene su control delante.
  const [filtrosPorVista, setFiltrosPorVista] =
    useState<Record<VistaFiltrable, Filtros>>(filtrosDeUrl);
  // Las vistas sin barra (Historial y Visitas llevan la suya) caen en "lista",
  // que nunca se llega a pintar desde ellas: así `vistaFiltrable` es total y no
  // hace falta un null que comprobar en cada uso.
  const vistaFiltrable: VistaFiltrable =
    vista === "asignar" || vista === "revision" ? vista : "lista";
  const filtros = filtrosPorVista[vistaFiltrable];
  const setFiltros = useCallback(
    (f: Partial<Filtros>) =>
      setFiltrosPorVista((prev) => ({
        ...prev,
        [vistaFiltrable]: { ...prev[vistaFiltrable], ...f },
      })),
    [vistaFiltrable],
  );

  // ── Los filtros viven también en la URL ──
  // Para poder recargar sin perderlos y para pasar un enlace ("mira los de
  // MAHOU que van tarde") en vez de dictar por dónde hay que pulsar. La lectura
  // está arriba, en `filtrosDeUrl`; aquí solo la escritura.
  //
  // Con `history.replaceState` y no con `useSearchParams`: ese hook obliga a
  // envolver el componente en un <Suspense> o la build de producción falla
  // ("Missing Suspense boundary with useSearchParams", ver
  // node_modules/next/dist/docs/.../use-search-params.md), y arrastraría el
  // árbol entero del tablero a renderizado en cliente. Aquí solo se quiere que
  // la barra de direcciones acompañe. `replace` y no `push` a propósito:
  // escribir en el buscador no debe dejar una entrada de historial por letra.
  useEffect(() => {
    // `vista` y no `vistaFiltrable`: en Historial o Visitas hay que escribir su
    // nombre, no el de la vista de la que se toman prestados los filtros.
    const enFiltrable = vista === "asignar" || vista === "lista" || vista === "revision";
    const sp = enFiltrable ? filtrosAParams(filtros) : new URLSearchParams();
    sp.set("v", vista);
    window.history.replaceState(null, "", `${window.location.pathname}?${sp}`);
  }, [filtros, vista]);

  const hoy = hoyISO();

  // Lista de TRABAJO = solo procesados por Producción (lo que llega a OT). Sin
  // ordenar: la Lista ordena por sus propias cabeceras y la Bandeja agrupa por
  // su cuenta. El "atrasados primero" que iba cableado aquí, por delante de
  // cualquier criterio elegido, ahora es un interruptor visible en la Lista.
  const procesados = useMemo(
    () => pedidos.filter((p) => p.situacion === "procesado"),
    [pedidos],
  );

  // Lo que cada vista enseña, ya recortado por SUS filtros. `aplicarFiltros`
  // estrecha las OF del pedido en vez de aceptarlo o rechazarlo entero (ver
  // lib/filtros.ts): filtrar por TOLDO enseña el toldo del pedido, no sus
  // cuatro OF porque una fuese de toldo.
  const visiblesLista = useMemo(
    () => aplicarFiltros(pedidos, filtrosPorVista.lista, hoy),
    [pedidos, filtrosPorVista.lista, hoy],
  );
  // Revisión enseñaba una barra de filtros que no filtraba NADA: recibía los
  // pedidos sin pasar por ella, así que buscar o elegir familia ahí no hacía
  // nada y no había forma de saber por qué.
  const visiblesRevision = useMemo(
    () => aplicarFiltros(procesados, filtrosPorVista.revision, hoy),
    [procesados, filtrosPorVista.revision, hoy],
  );
  const visiblesAsignar = useMemo(
    () => aplicarFiltros(procesados, filtrosPorVista.asignar, hoy),
    [procesados, filtrosPorVista.asignar, hoy],
  );

  // Los conteos del desplegable "Ver": lo que saldría al elegir cada categoría
  // con el RESTO de la barra puesta. Si salieran de lo ya filtrado, elegir "OF
  // anuladas" pondría a cero todas las demás opciones.
  const conteosLista = useMemo(
    () => contarCategoriasVisibles(pedidos, filtrosPorVista.lista, hoy),
    [pedidos, filtrosPorVista.lista, hoy],
  );
  const sinAutor = useMemo(
    () => procesados.map((p) => ({ ...p, ofs: p.ofs.filter((o) => o.autorId === null) })),
    [procesados],
  );
  const conteosAsignar = useMemo(
    () => contarCategoriasVisibles(sinAutor, filtrosPorVista.asignar, hoy),
    [sinAutor, filtrosPorVista.asignar, hoy],
  );

  // Lo que ofrece cada desplegable sale de lo que HAY delante en esa vista, no
  // del catálogo entero: con "Ver: Para taller" puesto, "Familia" enseña las
  // familias de esos partes y no las siete. Cada lista se calcula con su propio
  // filtro apagado, para que elegir uno no vacíe su propio menú.
  //
  // El desplegable de cliente ya no existe: obligaba a dar con el nombre exacto
  // entre cientos para hacer lo que el buscador hace escribiendo cuatro letras.
  const opcionesAsignar = useMemo(
    () => opcionesDisponibles(sinAutor, filtrosPorVista.asignar, hoy),
    [sinAutor, filtrosPorVista.asignar, hoy],
  );
  const opcionesLista = useMemo(
    () => opcionesDisponibles(pedidos, filtrosPorVista.lista, hoy),
    [pedidos, filtrosPorVista.lista, hoy],
  );
  const opcionesRevision = useMemo(
    () => opcionesDisponibles(procesados, filtrosPorVista.revision, hoy),
    [procesados, filtrosPorVista.revision, hoy],
  );

  // Facets de las ZONAS del tablero (mi zona y las de los compañeros),
  // agrupadas por autor en UNA pasada en vez de recorrer todos los pedidos una
  // vez por zona.
  //
  // La barra de filtros NO las toca, a propósito: vive sobre la bandeja, que es
  // donde hay cientos de partes. Las zonas tienen cinco o seis pedidos, así que
  // filtrarlas solo servía para hacer desaparecer trabajo propio al escribir en
  // el buscador. La bandeja se calcula aparte, ya filtrada (`facetsBandeja`).
  const facetsByLoc = useMemo(() => {
    const map = new Map<string | null, Facet[]>();
    for (const p of procesados) {
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
        // Tarea de taller y sin rescatar: no es trabajo de OT (ver
        // ofOcultaDeOT). Sigue en la Lista, que es donde se busca un pedido.
        if (ofOcultaDeOT(of)) continue;
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
  }, [procesados, hoy]);
  const facetsDe = useCallback(
    (loc: string | null) => facetsByLoc.get(loc) ?? [],
    [facetsByLoc],
  );

  // La bandeja "Sin asignar": lo que no tiene autor, ya pasado por la barra.
  // Se calcula desde `visiblesAsignar` y no recortando `facetsByLoc`, porque
  // los filtros estrechan las OF del pedido y hay que respetar ese recorte.
  const facetsBandeja = useMemo(() => {
    const salida: Facet[] = [];
    for (const p of visiblesAsignar) {
      const ofs = p.ofs.filter((o) => o.autorId === null);
      if (ofs.length === 0) continue;
      salida.push({ pedido: p, locationId: null, ofs, atrasado: estaAtrasado(p, hoy) });
    }
    return salida;
  }, [visiblesAsignar, hoy]);

  // KPIs (solo sobre pedidos procesados = trabajo real de OT)
  const procesadosAll = procesados;
  // Exactamente lo mismo que enseña la bandeja de abajo, y por eso se cuenta
  // SOBRE ella: la cabecera decía 72 y el panel 47, porque cada uno excluía
  // cosas distintas (el KPI no contaba anuladas ni taller, la bandeja tampoco
  // las detenidas). Un número de cabecera que no cuadra con lo que hay debajo
  // no sirve para nada, y hacerlo derivado es la única forma de que no se
  // vuelvan a separar.
  //
  // Ojo: es la bandeja SIN filtrar por la barra. Filtrar es una decisión de
  // quien mira; el KPI cuenta el trabajo que hay.
  const sinAsignar = useMemo(
    () =>
      aplicarFiltros(procesados, FILTROS_INICIALES, hoy).reduce(
        (n, p) => n + p.ofs.filter((o) => o.autorId === null).length,
        0,
      ),
    [procesados, hoy],
  );
  // Lo mío como revisor, no lo de todos: casa con lo que muestra por defecto
  // la pestaña Revisión (ver src/lib/revision.ts, misma fuente que usa ahí).
  const porRevisar = contarRevisorEnEstado(procesadosAll, "por_revisar", miId);
  const enRevision = contarRevisorEnEstado(procesadosAll, "en_revision", miId);

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
    // Se detectan por OF —es la unidad de trabajo— y se agrupan por pedido al
    // final: mandar a revisar un pedido de cuatro OF encendía cuatro avisos
    // idénticos que llevaban todos al mismo sitio.
    const out: AvisoSuelto[] = [];
    for (const p of procesadosAll) {
      for (const of of p.ofs) {
        // Avisa desde que te la asignan (por_revisar), no solo cuando ya la
        // has empezado: enterarte de que te ha llegado trabajo DESPUÉS de
        // cogerlo no sirve de nada. Se mantiene en_revision para que lo que
        // tienes a medias no desaparezca de la campana.
        if (of.revisorId === miId && (of.estado === "por_revisar" || of.estado === "en_revision"))
          out.push({ pedido: p, of, tipo: "revisar" });
        else if (of.autorId === miId && of.estado === "devuelta")
          out.push({ pedido: p, of, tipo: "devuelta" });
        else if (of.autorId === miId && of.estado === "pendiente")
          out.push({ pedido: p, of, tipo: "sinEmpezar" });
      }
    }

    // Pedidos míos ya completos: aviso a todos los implicados, porque un
    // pedido repartido puede quedarse listo y parado si cada uno da por hecho
    // que lo pasa el otro.
    for (const p of procesadosAll) {
      if (p.situacion !== "procesado") continue;
      if (!p.ofs.some((o) => o.autorId === miId)) continue;
      if (pedidoListoParaPasar(p)) out.push({ pedido: p, of: null, tipo: "pedidoCompleto" });
    }

    // Movimientos leídos del registro. Los ids se resuelven aquí: el servidor
    // manda ids crudos para no tener que cargar el tablero.
    const nombre = (id: string | null) => operarios.find((o) => o.id === id)?.nombre;
    for (const a of avisosMov) {
      const pedido = procesadosAll.find((p) => p.ofs.some((o) => o.id === a.ofId));
      const of = pedido?.ofs.find((o) => o.id === a.ofId);
      if (!pedido || !of) continue; // OF que ya no está en el tablero
      out.push({
        pedido,
        of,
        tipo: a.tipo,
        quien: nombre(a.quien),
        otro: nombre(a.otro),
        clave: a.clave,
      });
    }
    return agruparAvisos(out);
  }, [procesadosAll, miId, avisosMov, operarios]);
  // Los badges cuentan PEDIDOS, igual que la campana: si tres avisos son del
  // mismo parte, el trabajo que tienes delante es uno.
  const misPorRevisar = notifItems.filter((i) => i.tipo === "revisar").length;
  const misDevueltas = notifItems.filter((i) => i.tipo === "devuelta").length;

  // Aviso visible aunque la pestaña esté al fondo: "(2) CoordinaOT".
  useEffect(() => {
    const n = misPorRevisar + misDevueltas;
    document.title = n > 0 ? `(${n}) CoordinaOT` : "CoordinaOT";
  }, [misPorRevisar, misDevueltas]);

  // ── Avisos deducidos ya abiertos ──
  // En localStorage y no en el servidor como los de movimiento: estos se
  // vuelven a deducir del tablero en cada render, así que perder el descarte
  // solo hace que el aviso reaparezca —y sigue siendo cierto—, mientras que un
  // movimiento sin marcar no hay forma de recuperarlo. Y sobre todo, podarlos
  // exige saber qué avisos siguen vivos, o sea el tablero entero: justo lo que
  // /api/avisos está diseñado para NO cargar (7-15 s contra RPS). Aquí el
  // tablero ya está en memoria.
  const [descartes, setDescartes] = useState<{ opId: string | null; claves: string[] }>({
    opId: null,
    claves: [],
  });
  const { visibles: avisosVisibles, vigentes } = useMemo(
    () => aplicarDescartes(notifItems, descartes.claves),
    [notifItems, descartes.claves],
  );
  // Ajuste durante el render, no en un efecto (que además el lint rechaza):
  // React descarta este render y repite con el valor bueno, sin pintar el
  // estado intermedio. Las dos ramas son excluyentes a propósito: encadenar
  // dos setState en la misma pasada haría que el segundo pisara al primero.
  if (descartes.opId !== miId) {
    // Cambio de técnico: los descartes son suyos, no se heredan.
    setDescartes({ opId: miId, claves: leerDescartes(miId) });
  } else if (vigentes.length !== descartes.claves.length) {
    // Poda: un descarte solo vale mientras exista el aviso que apaga. Al
    // desaparecer la situación se borra, y si vuelve a darse el aviso suena
    // otra vez —te devuelven la misma OF por segunda vez y te enteras—. De
    // paso, la lista guardada no puede crecer más que los avisos vivos.
    setDescartes({ opId: miId, claves: vigentes });
  }
  useEffect(() => {
    if (!descartes.opId) return;
    try {
      localStorage.setItem(`${DESCARTES_KEY}:${descartes.opId}`, JSON.stringify(descartes.claves));
    } catch {}
  }, [descartes]);

  /** Abrir el pedido ES haber visto sus avisos: se apagan solos, sin un botón
   *  más que pulsar. Da igual por dónde se abra —la campana, el tablero, la
   *  Lista—: si solo lo hiciera la campana, quien ve la OF aparecer en su zona
   *  y la abre desde ahí arrastraría el aviso hasta que caducase. */
  const verAvisosDe = useCallback(
    (pedidoId: string) => {
      if (!miId) return;
      const suyas = new Set(
        pedidosRef.current.find((p) => p.id === pedidoId)?.ofs.map((o) => o.id) ?? [],
      );
      const claves = avisosMovRef.current.filter((a) => suyas.has(a.ofId)).map((a) => a.clave);
      if (claves.length === 0) return;
      setAvisosMov((prev) => prev.filter((a) => !claves.includes(a.clave)));
      fetch("/api/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operarioId: miId, claves }),
      }).catch(() => {});
    },
    [miId],
  );
  const abrirPedido = useCallback(
    (pedidoId: string) => {
      verAvisosDe(pedidoId);
      setOpenId(pedidoId);
    },
    [verAvisosDe],
  );
  /** Abrir un aviso de la campana lo apaga. Solo ESE: del mismo pedido puedes
   *  tener una OF por revisar y otra devuelta, y atender una no es haber visto
   *  la otra. Los de movimiento no pasan por aquí, ya los apaga `verAvisosDe`
   *  contra el servidor. */
  const irANotificacion = useCallback(
    (destino: Vista, item: NotifItem) => {
      if (esDescartable(item)) {
        const clave = identidadAviso(item);
        setDescartes((prev) =>
          prev.claves.includes(clave) ? prev : { ...prev, claves: [...prev.claves, clave] },
        );
      }
      setVista(destino);
      abrirPedido(item.pedido.id);
    },
    [abrirPedido],
  );
  const openFacet = useCallback((f: Facet) => abrirPedido(f.pedido.id), [abrirPedido]);
  const openPedidoCb = useCallback((p: Pedido) => abrirPedido(p.id), [abrirPedido]);
  const closeDrawer = useCallback(() => setOpenId(null), []);

  // ── mutaciones: estado local + persistencia en el servidor (SQLite) ──
  // El servidor guarda el snapshot completo de flujo de cada OF tocada
  // (autor, revisor, estado, observación); getTablero() lo fusiona al servir,
  // así el tablero sobrevive recargas y se comparte entre navegadores.
  const persistir = useCallback(
    (payload: {
      motivo: string;
      previosOF?: Array<{
        ofId: string;
        autorId: string | null;
        revisorId: string | null;
        estado: EstadoOF;
        observacion: string | null;
      }>;
      cambiosOF?: Array<{
        ofId: string;
        autorId: string | null;
        revisorId: string | null;
        estado: EstadoOF;
        observacion: string | null;
      }>;
      completarPedidoId?: string;
      /** OFs del pedido que se pasa a Producción: son las que se marcan como
       *  finalizadas en OLANET. Van explícitas porque el servidor no sabe qué
       *  OFs tiene un pedido sin volver a la vista de RPS, que tarda 7-15 s. */
      ofIdsPedido?: string[];
      cortarFichajeDe?: string[];
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
    (
      ofIds: Set<string>,
      fn: (of: OF) => OF,
      motivo?: string,
      /** OFs cuyo fichaje abierto tiene que cerrar el servidor (ver persistir).
       *  Este navegador solo puede cerrar el suyo, y ni siquiera con la hora
       *  buena: el reloj oficial del fichaje es el del servidor. */
      cortarFichajeDe?: string[],
    ) => {
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
      if (motivo && cambios.length > 0)
        persistir({ motivo, cambiosOF: cambios, cortarFichajeDe });
    },
    [setPedidosSync, persistir],
  );
  /** Saca de MI intervalo abierto las OF que acaban de dejar de ser mías.
   *
   *  El corte de verdad lo hace el servidor (`cortarFichajeDe`), que es quien
   *  tiene la hora oficial y puede cortarle el fichaje a otra persona. Pero mi
   *  navegador también tiene que enterarse: `ficharOFs` reenvía TODO lo que
   *  cree tener abierto, así que si sigue contando esta OF, el siguiente
   *  "Fichar" la reabriría en el servidor y me imputaría tiempo de un trabajo
   *  que ya no es mío. No hace falta POST: el servidor ya la cerró. */
  const soltarDeMiFichaje = useCallback((ofIds: readonly string[]) => {
    setFichaje((f) => {
      const ab = abierto(f);
      if (!ab || !ab.ofIds.some((id) => ofIds.includes(id))) return f;
      const resto = ab.ofIds.filter((id) => !ofIds.includes(id));
      return fichar(f, resto, ab.rol, ab.operarioId, new Date().toISOString());
    });
  }, []);

  const moverOFs = useCallback(
    (ofIds: Set<string>, autorId: string | null) => {
      const ids = [...ofIds];
      if (autorId === null) {
        // Volver a la bandeja sí resetea: deja de ser trabajo de nadie.
        const vueltas: ReturnType<typeof snapshotDe>[] = [];
        const previasV: ReturnType<typeof snapshotDe>[] = [];
        mut(ofIds, (of) => {
          previasV.push(snapshotDe(of));
          const nueva: OF = {
            ...of,
            autorId: null,
            revisorId: null,
            estado: "pendiente",
            fichandoRol: null,
          };
          vueltas.push(snapshotDe(nueva));
          return nueva;
        });
        soltarDeMiFichaje(ids);
        persistir({
          motivo: "asignar",
          cambiosOF: vueltas,
          previosOF: previasV,
          cortarFichajeDe: ids,
        });
        return;
      }
      // Cambiar de autor por esta vía (el selector de pedido entero, o soltar
      // en la zona de alguien) es el mismo hecho que traspasar una OF suelta,
      // así que aplica la misma regla: `traspasarAutor` borra el revisor —se
      // nombró para el trabajo del autor anterior— y hay que cerrar el fichaje
      // que alguien tuviera abierto. Sin esto se podía acabar siendo autor y
      // revisor de la misma OF, que es la regla dura del dominio.
      const cambios: ReturnType<typeof snapshotDe>[] = [];
      const previas: ReturnType<typeof snapshotDe>[] = [];
      mut(ofIds, (of) => {
        if (of.autorId === autorId) return of;
        previas.push(snapshotDe(of));
        const nueva = traspasarAutor(of, autorId);
        cambios.push(snapshotDe(nueva));
        return nueva;
      });
      if (cambios.length === 0) return;
      soltarDeMiFichaje(ids);
      persistir({
        motivo: "asignar",
        cambiosOF: cambios,
        previosOF: previas,
        cortarFichajeDe: ids,
      });
    },
    [mut, persistir, soltarDeMiFichaje],
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
  // Traspasar UNA OF a otro operario. `mut` no vale tal cual: hay que mandar
  // también `cortarFichajeDe` para que el servidor cierre el fichaje que el
  // anterior tuviera abierto sobre ella (no lo puede hacer este navegador).
  const traspasarAutorOF = useCallback(
    (ofId: string, autorId: string) => {
      const antes = pedidosRef.current
        .flatMap((p) => p.ofs)
        .find((o) => o.id === ofId);
      if (!antes || antes.autorId === autorId) return;
      const nueva = traspasarAutor(antes, autorId);
      mut(new Set([ofId]), () => nueva);
      soltarDeMiFichaje([ofId]);
      persistir({
        motivo: "traspaso",
        cambiosOF: [snapshotDe(nueva)],
        previosOF: [snapshotDe(antes)],
        cortarFichajeDe: [ofId],
      });
    },
    [mut, persistir, soltarDeMiFichaje],
  );
  // Cambiar quién revisa. Si la revisión ya había empezado, la OF vuelve a
  // "por revisar" y hay que cerrar el fichaje de revisión del anterior: su
  // tiempo se queda guardado a su nombre, pero deja de correr.
  const cambiarRevisorOF = useCallback(
    (ofId: string, revisorId: string) => {
      const antes = pedidosRef.current.flatMap((p) => p.ofs).find((o) => o.id === ofId);
      if (!antes || antes.revisorId === revisorId) return;
      // `cambiarRevisor` devuelve la OF en "por revisar", así que llamarlo
      // desde un estado que no lo admite (una OF ya aprobada) la desaprobaría
      // sin que nadie lo haya pedido.
      if (!puedeCambiarRevisor(antes)) return;
      let nueva: OF;
      try {
        nueva = cambiarRevisor(antes, revisorId);
      } catch {
        // cambiarRevisor() lanza si revisorId === autorId (regla dura: revisor
        // ≠ autor). Hoy el Select del tablero ya lo filtra y es inalcanzable,
        // pero el resto del código no confía en eso: mismo criterio que el
        // try/catch por-OF de mut(), se ignora en vez de tumbar el manejador.
        return;
      }
      mut(new Set([ofId]), () => nueva);
      if (antes.estado === "en_revision") soltarDeMiFichaje([ofId]);
      persistir({
        motivo: MOTIVO_CAMBIO_REVISOR,
        cambiosOF: [snapshotDe(nueva)],
        previosOF: [snapshotDe(antes)],
        cortarFichajeDe: antes.estado === "en_revision" ? [ofId] : undefined,
      });
    },
    [mut, persistir, soltarDeMiFichaje],
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

  // Si el servidor cerró un fichaje mío solo (latido perdido, ver el efecto
  // de más abajo), me entero al cargar: si no, mañana veo menos tiempo del
  // que esperaba y no sé por qué. Solo dura hasta que lo cierre (o cambie de
  // identidad): no es un historial, es un aviso de "esto pasó mientras no
  // mirabas".
  const [avisoCierreAuto, setAvisoCierreAuto] = useState<{ ofIds: string[]; fin: string } | null>(
    null,
  );

  // Al conocer quién soy, adopto MI fichaje del server (verdad compartida).
  // No se migra el localStorage previo (era contra datos mock).
  useEffect(() => {
    if (!miId) return;
    let cancelado = false;
    const traer = (conAviso: boolean) => {
      const seqAlArrancar = postSeqRef.current;
      fetch(`/api/fichaje?operarioId=${encodeURIComponent(miId)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            d: {
              fichaje: Fichaje;
              avisoCierre: { ofIds: string[]; fin: string } | null;
            } | null,
          ) => {
            if (cancelado) return;
            // No pisar un POST emitido tras arrancar esta carga (la carga
            // inicial trae un snapshot que puede ser anterior a una acción del
            // usuario).
            if (d?.fichaje && postSeqRef.current === seqAlArrancar) {
              setFichaje(d.fichaje);
            }
            if (conAviso && d?.avisoCierre) setAvisoCierreAuto(d.avisoCierre);
          },
        )
        .catch(() => {});
    };
    traer(true);
    // Y se repite, al mismo ritmo que el tablero. No es un lujo: si otro me
    // traspasa una OF que yo tenía fichada, el servidor cierra mi intervalo
    // pero mi navegador no se entera de nada, y al siguiente "Fichar" volvería
    // a mandar esa OF —`ficharOFs` reenvía lo que cree tener abierto— y la
    // reabriría, imputándome tiempo de un trabajo que ya no es mío.
    const id = setInterval(() => traer(false), 30_000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [miId]);

  // ── Latido: mientras tengo un fichaje corriendo, aviso al server cada
  // 60 s de que la pestaña sigue viva (ver /api/fichaje/latido). Se para al
  // pausar (abierto(fichaje) pasa a null → el efecto se limpia y no arranca
  // otro) y al desmontar. Si el aviso deja de llegar más de 5 min, el server
  // cierra el intervalo con la hora del ÚLTIMO latido, no con la hora en que
  // se dio cuenta (cerrarPorInactividad, lib/fichaje.ts).
  useEffect(() => {
    if (!miId || !abierto(fichaje)) return;
    const id = setInterval(() => {
      fetch("/api/fichaje/latido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operarioId: miId }),
      }).catch(() => {}); // sin red: el siguiente tick lo reintenta
    }, 60_000);
    return () => clearInterval(id);
  }, [miId, fichaje]);

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
  // Lo que se iba a fichar cuando saltó el recordatorio de la herramienta
  // antigua: se retoma tal cual al aceptar, sin que haya que volver a pulsar.
  const [recordatorioAntigua, setRecordatorioAntigua] = useState<{
    ofIds: string[];
    rol: Rol;
  } | null>(null);
  const [fichajeAjenoPendiente, setFichajeAjenoPendiente] = useState<{
    ofIds: string[];
    rol: Rol;
    nombres: string[];
  } | null>(null);
  const ficharOFsConAviso = useCallback(
    (ofIds: string[], rol: Rol) => {
      if (!miId) return;
      // Periodo de pruebas: hay que fichar también en la herramienta antigua.
      // El recordatorio salta al PULSAR fichar, que es cuando se puede olvidar,
      // pero solo la PRIMERA vez del día: un diálogo en cada fichaje —y se
      // ficha muchas veces al día— se aprende a cerrar sin leerlo, que es peor
      // que no ponerlo. El resto del día lo recuerda el cartel fijo del panel
      // de Mi fichaje. QUITAR los dos cuando el fichaje pase a "activo".
      if (avisoAntiguaPendiente(miId)) {
        setRecordatorioAntigua({ ofIds, rol });
        return;
      }
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
      // Con `miId`: es el embudo por el que pasan TODAS las acciones de la
      // interfaz, así que es donde se hace valer que la revisión de otro no la
      // empieza cualquiera (ver `soloEl` en lib/acciones.ts).
      const aplicables = ofIds.filter((id) => {
        const of = pedidos.flatMap((p) => p.ofs).find((o) => o.id === id);
        return of ? accionesDisponibles(of, miId).some((a) => a.id === accion) : false;
      });
      if (aplicables.length === 0) return;
      // El corte del fichaje va DENTRO de la misma persistencia que el cambio
      // de estado: antes solo se hacía `setFichaje` local, así que el servidor
      // —dueño del intervalo y del reloj— seguía contando, el sondeo de 30 s
      // reponía el fichaje en pantalla y el tiempo se le seguía imputando a
      // una OF ya anulada (o ya pasada a revisión, aprobada, devuelta…).
      const corta = def?.efectoFichaje === "corta";
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
        corta ? aplicables : undefined,
      );
      if (corta) {
        // Lo que ya se fichó se queda imputado (el servidor cierra el tramo con
        // su hora y lo encola hacia OLANET); lo que deja de correr es el reloj.
        soltarDeMiFichaje(aplicables);
      } else if (def?.efectoFichaje === "arranca") {
        const rol = accion === "empezar_revision" ? "revisar" : "plantear";
        ficharOFs(aplicables, rol);
      }
    },
    [mut, ficharOFs, soltarDeMiFichaje, pedidos, miId],
  );

  // "Coger y empezar" revisión (columna "Por revisar" sin revisor): asigna al
  // que pulsa como revisor Y arranca la revisión en la MISMA mutación, sobre
  // el snapshot de pedidosRef. Antes RevisionView encadenaba onSetRevisor +
  // onAccion("empezar_revision") en dos llamadas síncronas; como
  // ejecutarAccion filtra las OFs aplicables leyendo `pedidos` (el estado del
  // render actual, no pedidosRef), en el primer clic la OF todavía no tenía
  // revisor, la lista de aplicables salía vacía y la acción se descartaba en
  // silencio (quedaba el revisor puesto pero la OF seguía en por_revisar).
  // Aquí la transición se aplica con aplicarAccion() sobre la OF que YA lleva
  // el revisor puesto, no sobre la vieja: no se duplica la máquina de estados.
  const cogerRevision = useCallback(
    (ofIds: string[]) => {
      if (!miId) return;
      mut(
        new Set(ofIds),
        (of) => {
          // Defensa además del filtro de la UI: revisor ≠ autor es regla dura
          // del dominio, no se puede llegar aquí siendo autor de la propia OF.
          if (of.autorId === miId) return of;
          try {
            const conRevisor = of.revisorId === miId ? of : { ...of, revisorId: miId };
            return aplicarAccion(conRevisor, "empezar_revision");
          } catch {
            return of;
          }
        },
        "empezar_revision",
      );
      // Solo arranca el fichaje de las OFs que de verdad pasaron a en_revision
      // (pedidosRef ya refleja la mutación de arriba: mut() es síncrono).
      const cogidas = pedidosRef.current
        .flatMap((p) => p.ofs)
        .filter(
          (of) => ofIds.includes(of.id) && of.estado === "en_revision" && of.revisorId === miId,
        )
        .map((of) => of.id);
      if (cogidas.length > 0) ficharOFs(cogidas, "revisar");
    },
    [miId, mut, ficharOFs],
  );

  // Adaptador para no romper firmas aguas abajo todavía: RevisionView sigue
  // operando OF por OF con la firma antigua (ofId, accion, obs?). ZonaPersonal,
  // FaseFlyout, TecnicoCard y PedidoLinea ya llaman a ejecutarAccion
  // directamente; el adaptador accionFacet murió con ellas.
  const accionOF = (ofId: string, a: AccionOF, obs?: string) => ejecutarAccion([ofId], a, obs);

  const completarPedido = useCallback(
    (pedidoId: string) => {
      // Las anuladas no son trabajo de OT: no se finalizan en OLANET.
      const ofIdsPedido = (pedidos.find((p) => p.id === pedidoId)?.ofs ?? [])
        .filter((of) => of.estado !== "anulada")
        .map((of) => of.id);
      setPedidosSync((prev) =>
        prev.map((p) => (p.id === pedidoId ? { ...p, situacion: "completado" } : p)),
      );
      persistir({ motivo: "completar", completarPedidoId: pedidoId, ofIdsPedido });
      setOpenId(null);
    },
    [pedidos, setPedidosSync, persistir],
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
    <>
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
            <Herramientas />
            <Notificaciones items={avisosVisibles} onNavigate={irANotificacion} />
            <IdentityBadge yo={yo} operarios={operarios} onChange={solicitarCambioIdentidad} />
            <ThemeToggle />
          </div>
        </header>

      {/* Aviso de "tu fichaje se cerró solo" (latido perdido). NO es un
          diálogo modal: no pide respuesta, solo informa; se descarta con un
          clic y si se ignora no bloquea nada.
          Va EN EL FLUJO, no flotando: como tarjeta fija arriba a la derecha se
          plantaba encima de la cabecera de la tabla en la vista Lista y tapaba
          dos columnas. Aquí empuja el contenido hacia abajo, que para un aviso
          que sale una vez al día es mejor que esconder datos. */}
      {avisoCierreAuto && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2"
        >
          <p className="text-xs font-bold text-text">⏱ Tu fichaje se cerró solo</p>
          <p className="min-w-0 flex-1 text-[11px] text-text-muted">
            {(() => {
              const codigos = pedidos
                .flatMap((p) => p.ofs)
                .filter((of) => avisoCierreAuto.ofIds.includes(of.id))
                .map((of) => of.codigo);
              const quien = codigos.length > 0 ? codigos.join(", ") : "Un fichaje";
              const hora = new Date(avisoCierreAuto.fin).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return `${quien} dejó de avisar (pestaña cerrada o sin conexión) y se cerró a las ${hora}, la hora del último aviso.`;
            })()}
          </p>
          <button
            onClick={() => {
              setAvisoCierreAuto(null);
              // Hasta este acuse el servidor lo sigue devolviendo. Si el POST
              // falla, el aviso reaparece en la próxima carga: preferible a
              // perderlo, que es lo que pasaba cuando se borraba al leerlo.
              if (miId) {
                fetch("/api/fichaje/aviso-visto", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ operarioId: miId }),
                }).catch(() => {});
              }
            }}
            className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            Vale
          </button>
        </div>
      )}

        {/* ── VISTA ASIGNAR ── */}
        {vista === "asignar" && (
          <>
            {/* Zona personal: mide lo que necesita. Sin altura fija ni scroll
                interno — las fases vacías ya no reservan sitio, así que el alto
                sale del contenido y lo que sobra se lo queda la bandeja. */}
            <main className="flex shrink-0 flex-col p-4 pb-2">
              <ZonaPersonal
                operario={yo}
                facets={facetsDe(yo.id)}
                live={liveByOp.get(yo.id) ?? null}
                onOpen={openFacet}
                onVerTodos={setFaseAbierta}
                ofIdsFichandoYo={ofIdsFichandoYo}
                onAccion={ejecutarAccion}
                onFichar={ficharOFsConAviso}
                onDesfichar={desficharOF}
                completarPedido={completarPedido}
                operarios={operarios}
                setRevisor={setRevisor}
              />
            </main>

            {faseAbierta && (
              <FaseFlyout
                facets={facetsDe(yo.id)}
                faseId={faseAbierta}
                onOpen={(f) => {
                  setFaseAbierta(null);
                  openFacet(f);
                }}
                onClose={() => setFaseAbierta(null)}
    ofIdsFichandoYo={ofIdsFichandoYo}
                onAccion={ejecutarAccion}
                onFichar={ficharOFsConAviso}
                onDesfichar={desficharOF}
                completarPedido={completarPedido}
                operarios={operarios}
                setRevisor={setRevisor}
              />
            )}

            {/* equipo: siempre pegado a la división, altura propia */}
            <div className="shrink-0 px-4 pb-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  Equipo
                </h2>
                <span className="flex flex-wrap items-center gap-2.5 text-[10px] text-text-muted">
                  {FASES.map((f) => (
                    <span key={f.id} className="flex items-center gap-1">
                      <span className="size-1.5 rounded-sm" style={{ background: f.color }} />
                      {f.label.toLowerCase()}
                    </span>
                  ))}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {resto.map((op) => (
                  <TecnicoCard
                    key={op.id}
                    operario={op}
                    facets={facetsDe(op.id)}
                    live={liveByOp.get(op.id) ?? null}
                    expanded={expandedId === op.id}
                    onToggle={() => toggleExpanded(op.id)}
                    onClose={closeExpanded}
                    onOpen={openFacet}
                    onAccion={ejecutarAccion}
                    onFichar={ficharOFsConAviso}
                    onDesfichar={desficharOF}
                    completarPedido={completarPedido}
                  />
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--glass-border)]">
              <div
                className="flex items-center gap-3 px-4 py-2"
                style={{ boxShadow: "inset 0 -1px 0 0 var(--glass-border)" }}
              >
                <div className="min-w-0 flex-1">
                  <FilterBar
                    vista="asignar"
                    titulo="Sin asignar"
                    filtros={filtros}
                    setFiltros={setFiltros}
                    opciones={opcionesAsignar}
                    operarios={operarios}
                    conteos={conteosAsignar}
                    rotuloAjustes="Agrupar"
                    ajustes={
                      <Select
                        value={agrupar}
                        onChange={(v) => setAgrupar((v as Agrupacion) ?? "ninguna")}
                        placeholder={null}
                        options={[
                          { value: "ninguna", label: "Sin agrupar" },
                          { value: "familia", label: "Por familia" },
                          { value: "prioridad", label: "Por prioridad" },
                        ]}
                      />
                    }
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 scroll-thin">
                <Bandeja
                  facets={facetsBandeja}
                  operarios={operarios}
                  onOpen={openFacet}
                  onAsignar={(f, op) => moverOFs(new Set(f.ofs.map((o) => o.id)), op)}
                  miId={miId}
                  agrupar={agrupar}
                  hayFiltrosActivos={hayFiltrosActivos(filtrosPorVista.asignar)}
                />
              </div>
            </div>
          </>
        )}

        {/* ── VISTA LISTA ── */}
        {vista === "lista" && (
          <>
            <div className="border-b border-border bg-surface-2/40 px-5 py-2.5">
              <FilterBar
                vista="lista"
                filtros={filtros}
                setFiltros={setFiltros}
                opciones={opcionesLista}
                operarios={operarios}
                conteos={conteosLista}
                rotuloAjustes="Orden"
                ajustes={
                  <>
                    <Select
                      value={filtros.orden}
                      onChange={(v) => setFiltros({ orden: (v as OrdenLista) ?? "planificacion" })}
                      placeholder={null}
                      options={ORDENES.map((o) => ({ value: o, label: ORDEN_LABEL[o] }))}
                    />
                    {/* La dirección, en un botón aparte: el criterio y el
                        sentido son dos preguntas, y meterlas en el mismo
                        desplegable obligaba a listar cada criterio dos veces. */}
                    <button
                      type="button"
                      onClick={() => setFiltros({ ordenDesc: !filtros.ordenDesc })}
                      aria-pressed={filtros.ordenDesc}
                      title={
                        filtros.ordenDesc
                          ? "De mayor a menor. Pulsa para invertir."
                          : "De menor a mayor. Pulsa para invertir."
                      }
                      className="glass-chip grid size-7 place-items-center rounded-lg text-[10px] text-text-muted hover:text-text"
                    >
                      {filtros.ordenDesc ? "▼" : "▲"}
                    </button>
                  </>
                }
              />
            </div>
            <div className="p-5">
              <ListaView
                pedidos={visiblesLista}
                operarios={operarios}
                onOpen={openPedidoCb}
                orden={filtrosPorVista.lista.orden}
                ordenDesc={filtrosPorVista.lista.ordenDesc}
                hayFiltrosActivos={hayFiltrosActivos(filtrosPorVista.lista)}
              />
            </div>
          </>
        )}

        {/* ── VISTA REVISIÓN ── */}
        {vista === "revision" && (
          <>
            <div className="border-b border-border bg-surface-2/40 px-5 py-2.5">
              <FilterBar
                vista="revision"
                filtros={filtros}
                setFiltros={setFiltros}
                opciones={opcionesRevision}
                operarios={operarios}
                conteos={conteosLista}
              />
            </div>
            <div className="p-5">
              <RevisionView
                pedidos={visiblesRevision}
                operarios={operarios}
                miId={miId}
                onOpen={openPedidoCb}
                onCoger={cogerRevision}
                onCambiarRevisor={cambiarRevisorOF}
                onAccion={accionOF}
              />
            </div>
          </>
        )}

        {/* ── VISTA HISTORIAL ── */}
        {vista === "historial" && (
          <div className="p-5">
            <HistorialView />
          </div>
        )}

        {/* ── VISTA VISITAS COT ── */}
        {vista === "visitas" && (
          <div className="p-5">
            <VisitasCotView />
          </div>
        )}
      </div>

      <BotonArriba />

      <Drawer
        pedido={openPedido}
        operarios={operarios}
        miId={miId}
        onClose={closeDrawer}
        onAssignPedido={asignarPedido}
        onCompletar={completarPedido}
        onSetRevisor={setRevisor}
        onTraspasarAutor={traspasarAutorOF}
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

      {/* Periodo de pruebas: recordatorio del doble fichaje, una vez al día. */}
      <ConfirmDialog
        abierto={recordatorioAntigua !== null}
        titulo="Recuerda: ficha también en la herramienta antigua"
        mensaje="Mientras dure el periodo de pruebas, el tiempo tiene que quedar apuntado en los dos sitios. Este aviso sale una vez al día."
        onConfirmar={() => {
          if (miId) marcarAvisoAntiguaVisto(miId);
          const pendiente = recordatorioAntigua;
          setRecordatorioAntigua(null);
          // Se retoma el fichaje que lo disparó: ya está marcado como visto,
          // así que esta vez pasa de largo y sigue su curso normal (incluido el
          // aviso de OF ajena, si lo hubiera).
          if (pendiente) ficharOFsConAviso(pendiente.ofIds, pendiente.rol);
        }}
        onCancelar={() => setRecordatorioAntigua(null)}
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
    </>
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
    tone === "amber" ? "text-amber-700 dark:text-amber-400" : tone === "violet" ? "text-violet-700 dark:text-violet-400" : "text-text-muted";
  return (
    <div className="glass-chip flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
      <span className={`text-sm font-bold ${color}`}>{value}</span>
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  );
}
