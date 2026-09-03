"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EstadoOF, OF, Operario, Pedido, Rol } from "@/lib/types";
import { estaAtrasado, hoyISO } from "@/lib/types";
import { ROL } from "@/lib/estado";
import { Logo } from "./Logo";
import { ViewSwitcher, VISTAS, type Vista } from "./ViewSwitcher";
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
import { MetricasView } from "./MetricasView";
import { PanelNovedades } from "./PanelNovedades";
import { PanelGuiaRevision } from "./PanelGuiaRevision";
import { ULTIMA, cuantasNuevas } from "@/lib/novedades";
import { Drawer } from "./Drawer";
import type { Facet } from "./PedidoCard";
import { OPERARIOS as TODOS_LOS_OPERARIOS } from "@/lib/mock";
import { SECCIONES, SECCION_POR_DEFECTO, esSeccionId, type SeccionId } from "@/lib/secciones";
import { SeccionEnObras } from "./SeccionEnObras";
import { IdentityGate } from "./IdentityGate";
import { ConfirmDialog } from "./ConfirmDialog";
import { MiFichaje } from "./MiFichaje";
import { TecnicoCard } from "./TecnicoCard";
import { Notificaciones } from "./Notificaciones";
import { Herramientas } from "./Herramientas";
import { BuscadorGlobal } from "./BuscadorGlobal";
import { HistorialDrawer } from "./HistorialDrawer";
import {
  agruparAvisos,
  aplicarDescartes,
  descartesDePedido,
  esDescartable,
  identidadAviso,
  type AvisoSuelto,
  type NotifItem,
} from "@/lib/notificaciones";
import { useHydrated } from "@/lib/useHydrated";
import { desfaseDeCabecera } from "@/lib/reloj-servidor";
import { ACCIONES, accionesDisponibles, aplicarAccion, type AccionOF } from "@/lib/acciones";
import { accionAlFichar } from "@/lib/accion-pedido";
import { FASES, ofOcultaDeOT, pedidoListoParaPasar } from "@/lib/fases-tablero";
import {
  FICHAJE_VACIO,
  abierto,
  esFichable,
  fichar,
  pausar,
  rolFichajeDe,
  type Fichaje,
} from "@/lib/fichaje";
import { cambiarRevisor, puedeCambiarRevisor, traspasarAutor } from "@/lib/traspaso";
import { MOTIVO_CAMBIO_REVISOR, type AvisoMovimiento } from "@/lib/avisos";
import { OPERARIO_SISTEMA } from "@/lib/pedido-scan";
import type { NotaPedido } from "@/lib/nota-pedido";
import {
  FILTROS_INICIALES,
  ORDENES,
  ORDEN_LABEL,
  aplicarFiltros,
  contarCategoriasVisibles,
  CLAVES_URL_FILTROS,
  filtrosAParams,
  hayFiltrosActivos,
  opcionesDisponibles,
  paramsAFiltros,
  type Filtros,
  type OrdenLista,
} from "@/lib/filtros";

const IDENTITY_KEY = "coordina-operario-id";
/** La sección que se está mirando, si se eligió a mano. */
const SECCION_KEY = "coordina-seccion";

/** Quién está fichando ahora mismo: en qué OF y con qué rol. */
export interface LiveInfo {
  operario: Operario;
  rol: Rol;
  pedido: Pedido;
  of: OF;
}

/** Vista que pide la URL, si pide alguna.
 *
 *  Acepta TODAS, no solo las que llevan barra de filtros: Historial y
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

/** La sección elegida a mano en este navegador, o null si no se ha tocado.
 *
 *  Se guarda para que no se pierda al recargar —Ángel mira diseño, refresca y
 *  sigue en diseño— pero se borra al cambiar de persona (ver `setMiId`). */
function leerSeccionGuardada(): SeccionId | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(SECCION_KEY);
    return esSeccionId(v) ? v : null;
  } catch {
    return null;
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
/** La última actualización que este navegador ha dado por leída. Sin operario
 *  en la clave: lo que ha cambiado en la web es lo mismo para todos, y quien
 *  comparta equipo no tiene que volver a leerlo. */
const NOVEDADES_KEY = "coordina-novedades-visto";

/** La última actualización que este navegador dio por leída.
 *
 *  `null` cuando no hay nada guardado todavía —o cuando no se puede leer— y ahí
 *  NO se avisa: a quien entra por primera vez contarle "novedades" de cosas que
 *  nunca ha visto de otra forma es ruido. Se sella al vuelo con la última, y a
 *  partir de ahí sí se entera de las siguientes. */
function leerVistoNovedades(): string | null {
  if (typeof window === "undefined") return ULTIMA;
  try {
    const guardado = localStorage.getItem(NOVEDADES_KEY);
    if (guardado) return guardado;
    if (ULTIMA) localStorage.setItem(NOVEDADES_KEY, ULTIMA);
    return ULTIMA;
  } catch {
    // Modo privado o almacenamiento bloqueado: no se avisa, y no pasa nada.
    return ULTIMA;
  }
}

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
  operarios: operariosIniciales,
  pedidos: initial,
  dobleFichaje = true,
}: {
  operarios: Operario[];
  pedidos: Pedido[];
  /** OT sigue fichando también en la herramienta vieja (`FICHAJE_OLANET` no es
   *  `activo`). Se decide en el servidor y no cambia durante la sesión, así que
   *  viaja como prop y no por el sondeo del tablero. Por defecto `true`: si el
   *  dato no llegara, avisar de más molesta menos que dejar de avisar. */
  dobleFichaje?: boolean;
}) {
  // Las zonas del tablero son personas, y cada sección tiene las suyas. El
  // servidor pinta el HTML sin saber quién mira —la identidad vive en el
  // navegador—, así que arranca con las de Oficina Técnica y el primer sondeo
  // trae las que toquen. Ver el efecto del tablero más abajo.
  const [operarios, setOperarios] = useState<Operario[]>(operariosIniciales);
  // QUÉ LISTA se mira, que no es lo mismo que quién eres: Ángel supervisa las
  // dos secciones y necesita ver la de diseño sin dejar de ser Ángel. `null` =
  // todavía no ha elegido nada, así que manda la suya (ver el efecto de abajo).
  const [seccionVista, setSeccionVista] = useState<SeccionId | null>(leerSeccionGuardada);
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
  /** De qué sección son los pedidos que hay ahora mismo en `pedidos`.
   *
   *  NO es lo mismo que la sección que se está mirando: al cambiar de lista,
   *  esa cambia en el acto y los pedidos tardan lo que tarde el fetch —contra
   *  RPS, entre 7 y 15 segundos—. En esa ventana el tablero sigue enseñando los
   *  de la lista anterior, o ninguno. Lo usa la poda de avisos ya vistos, que
   *  no puede juzgar la lista de una sección con los pedidos de otra. */
  const [seccionDeLosPedidos, setSeccionDeLosPedidos] = useState<SeccionId | null>(null);
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
    // Cambiar de persona te devuelve a SU lista: si no, quien entrara después
    // de que Ángel mirase diseño se encontraría el tablero de otro equipo sin
    // saber por qué. La elección de sección es de la sesión, no del navegador.
    setSeccionVista(null);
    try {
      localStorage.removeItem(SECCION_KEY);
    } catch {}
  }, []);

  const cambiarSeccion = useCallback((s: SeccionId) => {
    setSeccionVista(s);
    try {
      localStorage.setItem(SECCION_KEY, s);
    } catch {}
  }, []);

  // Motor de fichaje: la única fuente de verdad son los intervalos, nunca
  // minutos sumados. El server es la única fuente de verdad (ya no hay
  // localStorage de por medio): arranca vacío y se reconcilia con lo que
  // devuelve el server (ver postFichaje y el efecto de carga por miId).
  const [fichaje, setFichaje] = useState<Fichaje>(FICHAJE_VACIO);

  // Cuánto se aparta el reloj del servidor del de este navegador. Las horas del
  // fichaje las pone él, así que sin esto el contador resta dos relojes
  // distintos y se queda parado en 0:00:00 mientras el local no lo alcance —
  // sesenta segundos en el servidor de producción, medidos el 16/08/2026. Ver
  // lib/reloj-servidor.ts.
  const [desfaseServidor, setDesfaseServidor] = useState<number | null>(null);
  const anotarDesfase = useCallback((cabecera: string | null) => {
    const d = desfaseDeCabecera(cabecera, Date.now());
    // Se guarda siempre el último: si a alguien le cambian la hora del portátil
    // a media mañana, la siguiente respuesta lo recoloca sin recargar.
    if (d !== null) setDesfaseServidor(d);
  }, []);

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

  // Notas recientes de TODO el equipo: una nota es un hecho del que los demás
  // se tienen que enterar, igual que un traspaso. No depende de quién soy —la
  // nota de un pedido le importa a cualquiera que vaya a tocarlo—, así que se
  // piden una vez y el filtro de "no las mías" se hace al armar el aviso.
  const [notasRecientes, setNotasRecientes] = useState<NotaPedido[]>([]);
  // Si las notas han llegado del servidor ALGUNA VEZ. Sin esto la poda de
  // descartes de más abajo se lleva por delante los de las notas en el primer
  // render, cuando todavía no ha contestado el fetch. Ver allí.
  const [notasCargadas, setNotasCargadas] = useState(false);
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      fetch("/api/notas-recientes", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { notas: NotaPedido[] } | null) => {
          if (!vivo || !d) return;
          setNotasRecientes(d.notas);
          setNotasCargadas(true);
        })
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, 30_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

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
    // El tablero se pide A NOMBRE DE QUIEN MIRA: de ahí sale su sección, y con
    // ella su lista de trabajo (Oficina Técnica o Diseño Gráfico).
    //
    // Se trae una vez NADA MÁS SABER QUIÉN ERES y no solo cada 30 s: el HTML
    // que sirve el servidor se pinta sin conocer la identidad —vive en el
    // navegador— así que arranca con el de OT. Sin esta primera vuelta, quien
    // sea de diseño se pasaría medio minuto mirando trabajo que no es suyo.
    const traer = async () => {
      try {
        const q = new URLSearchParams();
        if (miId) q.set("operarioId", miId);
        // Solo si se ha elegido a mano: sin esto manda la sección de quien
        // mira, que es lo que hay que ver al entrar.
        if (seccionVista) q.set("seccion", seccionVista);
        // La que se está pidiendo, para poder decir luego de quién son los
        // pedidos que lleguen. Si no se eligió a mano, la del operario.
        const pedida =
          seccionVista ??
          TODOS_LOS_OPERARIOS.find((o) => o.id === miId)?.seccion ??
          SECCION_POR_DEFECTO;
        const url = q.size > 0 ? `/api/tablero?${q}` : "/api/tablero";
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const t = (await r.json()) as { pedidos: Pedido[]; operarios?: Operario[] };
        const ab = abierto(fichajeRef.current);
        setPedidosSync(
          t.pedidos.map((p) => ({
            ...p,
            ofs: p.ofs.map((of) =>
              ab && ab.ofIds.includes(of.id) ? { ...of, fichandoRol: ab.rol } : of,
            ),
          })),
        );
        // Las zonas del tablero son personas, y cada sección tiene las suyas.
        if (t.operarios?.length) setOperarios(t.operarios);
        // DE QUÉ SECCIÓN son los pedidos que acaban de entrar. De esto depende
        // que se pueda podar la lista de avisos ya vistos; ver allí.
        setSeccionDeLosPedidos(pedida);
      } catch {
        // sin red o servidor reiniciando: el siguiente tick lo reintenta
      }
    };
    void traer();
    const id = setInterval(traer, 30_000);
    return () => clearInterval(id);
    // `miId` va en las dependencias a propósito: al elegir quién eres —o al
    // cambiar de persona— hay que volver a preguntar, porque la sección puede
    // ser otra y con ella toda la lista de trabajo.
  }, [setPedidosSync, miId, seccionVista]);
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
    // Se parte de lo que YA hay en la barra y se quita solo lo propio, en vez de
    // construirla desde cero: hay vistas que ponen sus propios parámetros —el
    // apartado de Métricas, sin ir más lejos— y empezar en blanco se los
    // llevaba por delante en cuanto este efecto volvía a correr.
    const sp = new URLSearchParams(window.location.search);
    for (const k of CLAVES_URL_FILTROS) sp.delete(k);
    if (enFiltrable) for (const [k, v] of filtrosAParams(filtros)) sp.set(k, v);
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

  // Solo pedidos procesados = trabajo real de OT.
  const procesadosAll = procesados;

  // ── Quién ficha AHORA (para las tarjetas del equipo y la zona personal) ──
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
    // La campana avisa de lo que te ha PASADO, no de lo que tienes. Para saber
    // qué te queda por hacer están el tablero y la vista de Revisión, que es su
    // trabajo; repetirlo aquí llenaba la campana de cosas que no son noticia:
    //
    //  · "Sin empezar" saltaba por cada OF asignada y sin tocar, incluidas las
    //    que te habías asignado tú. Autoasignarte cinco partes eran cinco
    //    avisos de tus propios actos. Fuera: que otro te dé trabajo ya lo dice
    //    "recibida", que sale del registro y sabe QUIÉN lo hizo (ver avisos.ts).
    //  · "Me toca revisar" cubría también `en_revision`, o sea lo que ya estás
    //    revisando ahora mismo — y con "Coger y empezar" te avisaba de una
    //    revisión que acababas de coger tú. Solo `por_revisar`: te lo han
    //    dejado y aún no lo has tocado.
    const out: AvisoSuelto[] = [];
    for (const p of procesadosAll) {
      for (const of of p.ofs) {
        if (of.revisorId === miId && of.estado === "por_revisar")
          out.push({ pedido: p, of, tipo: "revisar" });
        else if (of.autorId === miId && of.estado === "devuelta")
          out.push({ pedido: p, of, tipo: "devuelta" });
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
    // Notas que ha dejado OTRA persona. Las mías no: la campana avisa de lo
    // que ha pasado y no has provocado tú (ver notificaciones.ts), y avisarme
    // de mi propia nota sería contarme lo que acabo de escribir.
    //
    // La nota cuelga del CÓDIGO del pedido, no de su id: es lo que sobrevive al
    // paso al Historial. Por eso se busca por código.
    for (const n of notasRecientes) {
      if (n.operarioId === miId) continue;
      // Las que escribe la propia web (el re-escaneo) tienen su propio aviso
      // más abajo; contarlas dos veces sería repetir la misma noticia.
      if (n.operarioId === OPERARIO_SISTEMA) continue;
      const pedido = procesadosAll.find((p) => p.codigo === n.pedido);
      if (!pedido) continue; // nota de un pedido que ya no está en el tablero
      out.push({
        pedido,
        of: null,
        tipo: "notaNueva",
        quien: nombre(n.operarioId) ?? n.operarioId,
        // La clave lleva el id de la nota: dos notas seguidas en el mismo
        // pedido son dos noticias, y con `pedido:tipo` la segunda se habría
        // agrupado con la primera y no habría sonado.
        clave: `nota:${n.id}`,
        texto: n.texto,
      });
    }

    // Parte re-escaneado. Sale del propio tablero (`scanCambiado`, que pone
    // getTablero leyendo lo que dejó el vigilante), así que no hace falta pedir
    // nada más. Es de todos: se apaga para el equipo con "Ya lo he visto".
    for (const p of procesadosAll) {
      if (p.scanCambiado) out.push({ pedido: p, of: null, tipo: "parteNuevo" });
    }

    // Trabajo aparecido en un pedido que ya se había pasado a Producción. Lo
    // deduce el servidor al fusionar el overlay (ver `aplicarOverlay`): el
    // pedido vuelve al tablero y trae dentro qué OF lo han reabierto. Sin este
    // aviso el pedido reaparecería sin más, y nadie sabría por qué está ahí
    // uno que se dio por cerrado hace semanas.
    //
    // Solo mientras la OF no tenga dueño: la misma regla que el chip de la
    // tarjeta (`avisaDeOFNueva`). Coger la OF contesta la pregunta que hace el
    // aviso, y hasta que se aprobara seguía sonando.
    for (const p of procesadosAll) {
      for (const id of p.reabiertoPor ?? []) {
        const of = p.ofs.find((o) => o.id === id);
        if (of && of.autorId === null) out.push({ pedido: p, of, tipo: "ofNueva" });
      }
    }
    return agruparAvisos(out);
  }, [procesadosAll, miId, avisosMov, operarios, notasRecientes]);

  // ── Avisos deducidos ya abiertos ──
  // En localStorage y no en el servidor como los de movimiento: estos se
  // vuelven a deducir del tablero en cada render, así que perder el descarte
  // solo hace que el aviso reaparezca —y sigue siendo cierto—, mientras que un
  // movimiento sin marcar no hay forma de recuperarlo. Y sobre todo, podarlos
  // exige saber qué avisos siguen vivos, o sea el tablero entero: justo lo que
  // /api/avisos está diseñado para NO cargar (7-15 s contra RPS). Aquí el
  // tablero ya está en memoria.
  // ── Novedades de la web ──
  // En localStorage y no en el servidor: "ya he leído qué ha cambiado" es de
  // cada persona y de cada sitio donde trabaja, y no pasa nada por leerlo dos
  // veces si entra desde otro equipo. Mismo sitio que los descartes de avisos.
  //
  // Sin nada guardado NO se avisa: a quien entra por primera vez —o estrena
  // navegador— contarle "novedades" de cosas que nunca ha visto de otra manera
  // es ruido. Se marca como visto y a partir de ahí sí se entera de las
  // próximas.
  // `undefined` = todavía sin mirar el almacenamiento. Se lee en el primer
  // render del navegador y no en un efecto: en el servidor no hay
  // localStorage, y leerlo antes de tiempo daría siempre "no visto".
  const [vistoNovedades, setVistoNovedades] = useState<string | null | undefined>(undefined);
  const [novedadesAbiertas, setNovedadesAbiertas] = useState(false);
  // La guía de revisión, abierta desde el menú para leerla en frío. La de
  // trabajar está en la propia tarjeta de "Revisando"; esta es la de consulta.
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  // Cuándo salió cada entrada del log. Lo sella el servidor la primera vez que
  // arranca con ella dentro, así que no cambia mientras la pestaña esté
  // abierta: se pide una vez y no se vuelve a mirar.
  //
  // Si falla, el log se pinta sin fechas. Lo que importa es qué cambió.
  const [fechasNovedades, setFechasNovedades] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    fetch("/api/novedades", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { fechas?: Record<string, string> } | null) => {
        if (vivo && d?.fechas) setFechasNovedades(d.fechas);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  if (vistoNovedades === undefined && typeof window !== "undefined") {
    const visto = leerVistoNovedades();
    setVistoNovedades(visto);
    // EL LOG SE ABRE SOLO la primera vez que se entra tras una actualización.
    //
    // Con la campana a secas no lo leía nadie: hay que fijarse en un punto
    // rojo, saber que ahí hay algo y pulsarlo. El equipo se enteraba de los
    // cambios tropezándose con ellos, que es justo lo que este log existe para
    // evitar.
    //
    // UNA VEZ Y SE ACABÓ: al cerrarlo se da por leído (ver `onCerrar`), y esta
    // rama no vuelve a entrar porque solo corre con `vistoNovedades` todavía
    // sin leer — o sea, una vez por carga de página. Quien lo cierre no se lo
    // encuentra otra vez ni recargando.
    //
    // A quien entra por PRIMERA VEZ no le salta: `leerVistoNovedades` sella la
    // última al vuelo y `cuantasNuevas` devuelve 0. Contarle "novedades" de
    // cosas que nunca ha visto de otra forma sería ruido.
    //
    // Van dos `setState` en la misma pasada, y aquí sí se puede: son estados
    // DISTINTOS. Lo que no se puede es encadenar dos del mismo, que es de lo
    // que avisa el comentario de los descartes más abajo.
    if (cuantasNuevas(visto) > 0) setNovedadesAbiertas(true);
  }

  const [descartes, setDescartes] = useState<{ opId: string | null; claves: string[] }>({
    opId: null,
    claves: [],
  });
  // Qué lista se está mirando. Hace falta AQUÍ —y no solo abajo, donde se pinta
  // el conmutador— porque cada descarte se guarda sabiendo de qué lista es: la
  // poda solo puede juzgar los avisos que tiene delante, y los de la otra
  // sección no están. Sin esto, asomarse a Diseño Gráfico borraba los descartes
  // de Oficina Técnica y al volver renacían los avisos ya atendidos.
  //
  // No se usa `yo` porque se define bastante más abajo, tras la puerta de
  // identidad; el catálogo completo está disponible desde el principio.
  const seccionActual =
    seccionVista ??
    TODOS_LOS_OPERARIOS.find((o) => o.id === miId)?.seccion ??
    SECCION_POR_DEFECTO;
  const { visibles: avisosVisibles, vigentes } = useMemo(
    () => aplicarDescartes(notifItems, descartes.claves, seccionActual),
    [notifItems, descartes.claves, seccionActual],
  );
  // Para `verAvisosDe`, que se llama al abrir un pedido y necesita los avisos
  // de AHORA sin recrearse en cada vuelta del tablero. Se escriben en un efecto
  // y no durante el render: es lo que pide react-hooks/refs, y es el mismo
  // patrón de `avisosMovRef`.
  const notifItemsRef = useRef<NotifItem[]>([]);
  const seccionRef = useRef<SeccionId>(seccionActual);
  useEffect(() => {
    notifItemsRef.current = notifItems;
    seccionRef.current = seccionActual;
  }, [notifItems, seccionActual]);

  // Los números de las pestañas y del título salen de lo que la campana enseña
  // AHORA, no de todos los avisos deducidos. Contaban sobre la lista sin
  // descartar, así que abrir un aviso lo quitaba de la campana pero dejaba el
  // número puesto: salía un "2" en Revisión sin nada detrás que abrir. Un
  // número que no lleva a ninguna parte es peor que no ponerlo.
  const misPorRevisar = avisosVisibles.filter((i) => i.tipo === "revisar").length;
  const misDevueltas = avisosVisibles.filter((i) => i.tipo === "devuelta").length;

  // Aviso visible aunque la pestaña esté al fondo: "(2) CoordinaOT".
  useEffect(() => {
    const n = misPorRevisar + misDevueltas;
    document.title = n > 0 ? `(${n}) CoordinaOT` : "CoordinaOT";
  }, [misPorRevisar, misDevueltas]);
  // Ajuste durante el render, no en un efecto (que además el lint rechaza):
  // React descarta este render y repite con el valor bueno, sin pintar el
  // estado intermedio. Las dos ramas son excluyentes a propósito: encadenar
  // dos setState en la misma pasada haría que el segundo pisara al primero.
  if (descartes.opId !== miId) {
    // Cambio de técnico: los descartes son suyos, no se heredan.
    setDescartes({ opId: miId, claves: leerDescartes(miId) });
  } else if (
    notasCargadas &&
    // Y los pedidos que hay delante tienen que ser LOS DE ESTA SECCIÓN. Al
    // volver de Diseño Gráfico a Oficina Técnica, la sección cambia en el acto
    // pero los pedidos siguen siendo los de antes —o ninguno— hasta que
    // contesta el fetch; en esa ventana la poda creía estar mirando OT sin un
    // solo aviso vivo y se llevaba por delante todos sus descartes. Al
    // siguiente render los avisos volvían a salir sin apagar, y la campana los
    // cantaba otra vez. Es el mismo fallo que ya cubría `notasCargadas`: podar
    // contra una foto incompleta.
    seccionDeLosPedidos === seccionActual &&
    vigentes.length !== descartes.claves.length
  ) {
    // Poda: un descarte solo vale mientras exista el aviso que apaga. Al
    // desaparecer la situación se borra, y si vuelve a darse el aviso suena
    // otra vez —te devuelven la misma OF por segunda vez y te enteras—. De
    // paso, la lista guardada no puede crecer más que los avisos vivos.
    //
    // NO SE PODA HASTA QUE HAYAN LLEGADO LAS NOTAS, y esto no es una
    // precaución teórica: era un fallo que se veía. `notasRecientes` empieza
    // vacío y se llena por fetch, así que en el primer render NINGÚN aviso de
    // nota existe todavía; la poda concluía que sus descartes ya no apagaban
    // nada y los borraba de localStorage. Cuando el fetch contestaba, las
    // notas volvían a salir SIN descarte y la campana las cantaba otra vez.
    // O sea: cada recarga de la página resucitaba los avisos de notas ya
    // vistas, que es lo que el equipo describía como "vuelven a salir notas
    // más antiguas".
    //
    // Los demás avisos deducidos salen del tablero, que llega con el HTML, así
    // que a ellos no les pasa. Si el fetch de notas falla no se poda en toda la
    // sesión, y eso está bien: no podar solo deja crecer una lista de textos,
    // mientras que podar de más resucita avisos que alguien ya atendió.
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

      // Los DEDUCIDOS (nota nueva, listo para pasar, OF nueva, devuelta…) no
      // tienen fila que marcar en el servidor: se apagan guardando su
      // identidad, igual que al pulsarlos en la campana. Sin esto solo los
      // apagaba la campana, así que quien abría el pedido desde el tablero y
      // leía la nota se quedaba el aviso puesto para siempre.
      //
      // Por refs y no por dependencias: esto lo llama cada apertura de pedido,
      // y meter `notifItems` en las dependencias recrearía el callback —y con
      // él los de las tarjetas— en cada vuelta del tablero.
      const vistos = descartesDePedido(notifItemsRef.current, pedidoId, seccionRef.current);
      if (vistos.length > 0) {
        setDescartes((prev) => {
          const nuevas = vistos.filter((c) => !prev.claves.includes(c));
          return nuevas.length === 0 ? prev : { ...prev, claves: [...prev.claves, ...nuevas] };
        });
      }

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
        const clave = identidadAviso(item, seccionActual);
        setDescartes((prev) =>
          prev.claves.includes(clave) ? prev : { ...prev, claves: [...prev.claves, clave] },
        );
      }
      setVista(destino);
      abrirPedido(item.pedido.id);
    },
    [abrirPedido, seccionActual],
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
      // Cortar el reloj por AQUI cuenta igual que un POST de fichaje, y hay que
      // decirlo: el sondeo de /api/fichaje solo descarta su respuesta si
      // `postSeqRef` ha cambiado desde que arrancó. Sin esto, una consulta ya
      // en vuelo al aprobar devolvía la foto de ANTES del corte, pasaba el
      // guardián y reponía el reloj en pantalla —"Pausar" reaparecía sobre una
      // OF ya aprobada— hasta el sondeo siguiente, o sea hasta 30 s.
      if (payload.cortarFichajeDe?.length) postSeqRef.current += 1;
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
  // Quitar el autor devuelve el pedido a la bandeja, y no solo eso: también
  // borra el revisor y deja las OF en "pendiente" (ver moverOFs). Es
  // reversible, pero le quita el trabajo de las manos a alguien —que se entera
  // por la campana, con un aviso "Ya no lo tienes tú"—, así que se pregunta.
  const [quitarAutorPendiente, setQuitarAutorPendiente] = useState<{
    pedidoId: string;
    quien: string;
  } | null>(null);
  const asignarPedido = useCallback(
    (autorId: string | null) => {
      const pedido = pedidosRef.current.find((p) => p.id === openId);
      if (!pedido) return;
      const ids = new Set(pedido.ofs.map((of) => of.id));
      const duenos = [...new Set(pedido.ofs.map((of) => of.autorId).filter(Boolean))] as string[];
      if (autorId === null && duenos.length > 0) {
        const quien = duenos
          .map((id) => operarios.find((o) => o.id === id)?.nombre ?? id)
          .join(" y ");
        setQuitarAutorPendiente({ pedidoId: pedido.id, quien });
        return;
      }
      moverOFs(ids, autorId);
    },
    [openId, moverOFs, operarios],
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
        .then((r) => {
          // De aquí sale el `inicio` del intervalo, con la hora del SERVIDOR:
          // es el momento de apuntar cuánto se aparta de la de este navegador
          // (ver lib/reloj-servidor.ts). Sin esto, el contador se queda a cero
          // hasta que el reloj local alcanza al del servidor.
          anotarDesfase(r.headers.get("date"));
          return r.ok ? r.json() : null;
        })
        .then((d: { fichaje: Fichaje } | null) => {
          if (d?.fichaje) setFichaje(d.fichaje);
        })
        .catch(() => {});
    },
    [miId, anotarDesfase],
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

  /** Saca varias OF del reloj de una vez.
   *
   *  No es llamar N veces a `desficharOF`: cada llamada cierra el tramo abierto
   *  y abre otro con lo que queda (ver `fichar`), así que parar un pedido de
   *  cuatro OF dejaba tres tramos de duración cero por el camino y mandaba
   *  cuatro POST seguidos, cada uno con una foto distinta. Un solo corte deja
   *  un solo tramo y una sola petición. */
  const desficharVarias = useCallback(
    (ofIds: readonly string[]) => {
      const ab = abierto(fichajeRef.current);
      if (!ab) return;
      const fuera = new Set(ofIds);
      const resto = ab.ofIds.filter((id) => !fuera.has(id));
      if (resto.length === ab.ofIds.length) return; // no corría ninguna
      setFichaje((f) => fichar(f, resto, ab.rol, ab.operarioId, ahora())); // optimista
      postFichaje(resto, ab.rol);
    },
    [postFichaje],
  );

  const desficharOF = useCallback(
    (ofId: string) => desficharVarias([ofId]),
    [desficharVarias],
  );

  // Pausa global del fichaje. Solo la usa el aviso de "llevas 3 h fichando"
  // del panel "Mi fichaje": el resto de pausas y reanudaciones son por OF o
  // por pedido, con su nombre delante (ver MiFichaje y AccionesOF).
  const pausarTodo = useCallback(() => {
    setFichaje((f) => pausar(f, ahora())); // optimista
    postFichaje([], "plantear"); // rol ignorado al pausar (ofIds vacío)
  }, [postFichaje]);

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
        .then((r) => {
          // También al cargar: con un fichaje ya abierto de antes, el contador
          // tiene que salir bien desde el primer pintado, sin esperar a que se
          // pulse nada.
          anotarDesfase(r.headers.get("date"));
          return r.ok ? r.json() : null;
        })
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
  }, [miId, anotarDesfase]);

  // ── Latido: mientras tengo un fichaje corriendo, aviso al server de que la
  // pestaña sigue viva (ver /api/fichaje/latido). Se para al pausar
  // (`hayFichajeAbierto` pasa a false) y al desmontar. Si el aviso deja de
  // llegar más de 5 min, el server cierra el intervalo con la hora del ÚLTIMO
  // latido, no con la hora en que se dio cuenta (cerrarPorInactividad).
  //
  // OJO CON LAS DEPENDENCIAS. Este efecto dependía de `fichaje` entero, y el
  // sondeo de arriba hace `setFichaje` con el objeto recién parseado CADA 30 s:
  // referencia nueva, efecto desmontado y `setInterval` arrancado otra vez
  // desde cero. Con el temporizador a 60 s eso significa que NO LLEGABA NINGÚN
  // LATIDO NUNCA — el reloj se sostenía solo con los latidos que registra
  // `guardarFichaje` en cada pulsación, así que bastaban 5 minutos sin tocar la
  // web (por ejemplo, fichando en la herramienta de siempre) para que el
  // servidor diera la pestaña por muerta y cerrara el fichaje. De ahí el
  // "se cortó solo" y que la pausa dejara de responder: el intervalo ya estaba
  // cerrado en el servidor.
  //
  // Así que la dependencia es un BOOLEANO ("¿hay algo corriendo?"), que solo
  // cambia al fichar y al pausar. Y el periodo baja a 30 s: los navegadores
  // frenan los temporizadores de las pestañas de fondo a uno por minuto, y con
  // 60 s se rozaba justo el límite de la tolerancia.
  const hayFichajeAbierto = abierto(fichaje) !== null;
  useEffect(() => {
    if (!miId || !hayFichajeAbierto) return;
    const latir = () =>
      fetch("/api/fichaje/latido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operarioId: miId }),
      }).catch(() => {}); // sin red: el siguiente tick lo reintenta
    latir(); // uno de entrada: al recargar con un fichaje ya abierto, el último
    // latido puede ser de hace rato y no hay que esperar al primer tick.
    const id = setInterval(latir, 30_000);
    // Volver a la pestaña es la prueba de vida más fiable que hay: si el
    // navegador congeló los temporizadores mientras estaba de fondo, este
    // latido llega antes de que el servidor se plantee cerrar nada.
    const alVolver = () => {
      if (document.visibilityState === "visible") latir();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [miId, hayFichajeAbierto]);

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
  // Fichar desde una fila del tablero arranca el reloj en TODAS las OF
  // fichables del pedido a la vez. Es lo que se quiere casi siempre, pero no se
  // veía por ningún lado: el botón dice "Fichar" y no cuántas cosas ficha. Se
  // pregunta solo con más de una —con una no hay nada que explicar— y de paso
  // se cuenta que dentro del pedido se puede fichar OF por OF.
  //
  // Y el aviso habla del conjunto RESULTANTE, no solo de lo que se acaba de
  // pulsar. Fichar no sustituye lo que ya corre: lo SUMA (ver `ficharOFs`), y
  // el tiempo se reparte entre todo lo que hay dentro del tramo. Así que
  // ponerse a fichar un segundo pedido cambia lo que cuenta el primero, y eso
  // no se veía por ninguna parte: el diálogo enseñaba las dos OF nuevas y decía
  // "el tiempo se reparte entre ellas", cuando en realidad se repartía entre
  // las cinco. Ahora se listan las cinco, agrupadas por pedido, y se dice
  // cuántas venían de antes.
  const [fichajeVariasPendiente, setFichajeVariasPendiente] = useState<{
    /** Lo que se acaba de pulsar: es lo que se manda a fichar (el motor ya
     *  suma lo que corría). */
    ofIds: string[];
    rol: Rol;
    /** El conjunto que quedará corriendo, agrupado por pedido, para enseñarlo.
     *
     *  En piezas y no en una cadena ya pegada: el cuadro las pinta con pesos
     *  distintos —el código de pedido en mono, el cliente al lado en normal—, y
     *  con `"AAA · BBB"` hecho de antemano no hay forma de separarlos. */
    porPedido: { codigo: string; cliente: string; ofs: { codigo: string; descripcion: string }[] }[];
    total: number;
    /** Cuántas de esas ya estaban corriendo antes de pulsar. */
    yaCorrian: number;
  } | null>(null);
  /** Fichar ES empezar a trabajar.
   *
   *  Antes eran dos gestos: "Empezar planteo" (que además arrancaba el reloj) y
   *  "Fichar". Dos botones seguidos para lo mismo, y en un pedido a medias
   *  llegaban a salir "Reanudar" y "Empezar planteo" juntos. Ahora el reloj es
   *  el único camino: al ficharlas, las OF sin empezar pasan a "planteando" y
   *  las devueltas se retoman. A partir de ahí solo quedan pausar, reanudar y
   *  pasar a revisión.
   *
   *  El cambio de estado va DESPUÉS del fichaje y sin volver a arrancarlo (no
   *  se pasa por `ejecutarAccion`, que ficharía otra vez). Solo con rol
   *  "plantear": la revisión tiene su propia acción y sus propias reglas de
   *  quién puede empezarla. */
  const arrancarFichaje = useCallback(
    (ofIds: string[], rol: Rol) => {
      ficharOFs(ofIds, rol);
      if (rol !== "plantear" || !miId) return;
      const ids = new Set(ofIds);

      // Fichar en algo que no es de nadie ES cogerlo. Desde la bandeja de "Sin
      // asignar" se podía poner el reloj en marcha sin quedarse la OF, y ahí
      // pasaban dos cosas a la vez: la OF seguía en la bandeja, a la vista de
      // todos como libre, y encima no salía a la persona en "Mi fichaje" —
      // porque ese panel enseña lo tuyo y aquello no era de nadie—. Así que el
      // reloj corría en un sitio que no aparecía por ninguna parte.
      //
      // Se asignan solo las que estaban SIN autor. Fichar en la OF de un
      // compañero no te la quita: eso ya lo avisa `ficharAvisandoSiEsAjeno` y
      // sigue siendo suya, que es como se echa una mano.
      const huerfanas = pedidosRef.current
        .flatMap((p) => p.ofs)
        .filter((of) => ids.has(of.id) && of.autorId === null)
        .map((of) => of.id);
      if (huerfanas.length > 0) {
        mut(new Set(huerfanas), (of) => ({ ...of, autorId: miId }), "asignar");
      }

      // El estado va después: `empezar_planteo` exige autor, así que sobre una
      // OF de la bandeja `aplicarAccion` lanzaba y la dejaba en "pendiente"
      // aunque el reloj estuviera corriendo. `mut` es síncrono sobre
      // `pedidosRef`, así que aquí las recién adoptadas ya tienen autor.
      const porAccion = new Map<AccionOF, string[]>();
      for (const p of pedidosRef.current) {
        for (const of of p.ofs) {
          if (!ids.has(of.id)) continue;
          const accion = accionAlFichar(of);
          if (!accion) continue;
          porAccion.set(accion, [...(porAccion.get(accion) ?? []), of.id]);
        }
      }
      for (const [accion, suyas] of porAccion) {
        mut(new Set(suyas), (of) => {
          try {
            return aplicarAccion(of, accion);
          } catch {
            return of;
          }
        }, accion);
      }
    },
    [ficharOFs, mut, miId],
  );

  // Último tramo del embudo de avisos: fichar en OFs asignadas a OTRO está
  // permitido (se hace, para echar una mano), pero no debe pasar sin querer.
  const ficharAvisandoSiEsAjeno = useCallback(
    (ofIds: string[], rol: Rol) => {
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
        arrancarFichaje(ofIds, rol);
        return;
      }
      const nombres = operarios.filter((o) => ajenos.has(o.id)).map((o) => o.nombre);
      setFichajeAjenoPendiente({ ofIds, rol, nombres });
    },
    [miId, pedidos, operarios, arrancarFichaje],
  );

  /** Embudo de avisos antes de arrancar el reloj, en orden: el doble fichaje
   *  del periodo de pruebas → qué OF se van a fichar → de quién son. Cada
   *  diálogo, al aceptar, sigue por donde iba, así que se encadenan solos. */
  const ficharOFsConAviso = useCallback(
    (ofIds: string[], rol: Rol) => {
      if (!miId) return;
      // Periodo de pruebas: hay que fichar también en la herramienta antigua.
      // El recordatorio salta al PULSAR fichar, que es cuando se puede olvidar,
      // pero solo la PRIMERA vez del día: un diálogo en cada fichaje —y se
      // ficha muchas veces al día— se aprende a cerrar sin leerlo, que es peor
      // que no ponerlo. El resto del día lo recuerda el cartel fijo del panel
      // de Mi fichaje. Los dos se apagan solos al pasar el fichaje a "activo":
      // ahí el tiempo entra en RPS por la web y fichar en las dos duplicaría.
      if (dobleFichaje && avisoAntiguaPendiente(miId)) {
        setRecordatorioAntigua({ ofIds, rol });
        return;
      }
      // Lo que quedará corriendo: lo pulsado MÁS lo que ya corría con el mismo
      // rol, que es lo que hace el motor. Con otro rol no se suma —un tramo
      // tiene un solo rol—, así que ahí el conjunto es solo lo pulsado.
      const ab = abierto(fichajeRef.current);
      const yaCorriendo = ab && ab.rol === rol ? ab.ofIds : [];
      const total = [...new Set([...yaCorriendo, ...ofIds])];
      if (total.length === yaCorriendo.length) return; // ya corrían todas
      if (total.length > 1) {
        const ids = new Set(total);
        const porPedido = pedidos
          .map((p) => ({
            codigo: p.codigo,
            cliente: p.cliente,
            ofs: p.ofs
              .filter((of) => ids.has(of.id))
              .map((of) => ({ codigo: of.codigo, descripcion: of.descripcion })),
          }))
          .filter((g) => g.ofs.length > 0);
        setFichajeVariasPendiente({
          ofIds,
          rol,
          porPedido,
          total: total.length,
          yaCorrian: yaCorriendo.length,
        });
        return;
      }
      ficharAvisandoSiEsAjeno(ofIds, rol);
    },
    [miId, pedidos, dobleFichaje, ficharAvisandoSiEsAjeno],
  );

  // ── máquina de estados: ejecutarAccion sustituye a los switch de antes ──
  const ejecutarAccion = useCallback(
    (ofIds: string[], accion: AccionOF, obs?: string) => {
      const def = ACCIONES.find((a) => a.id === accion);
      // Acciones con nota obligatoria (p.ej. "devolver") sin nota: cortar aquí
      // ANTES de tocar nada. Si no, aplicarAccion() lanza (y mut() lo atrapa)
      // pero el bloque efectoFichaje==="corta" de abajo cortaría igual el
      // fichaje aunque la OF no haya cambiado de estado.
      if ((def?.conNota || def?.conMotivo) && !obs?.trim()) return;
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

  // Adaptador para no romper firmas aguas abajo todavía: RevisionView sigue
  // operando OF por OF con la firma antigua (ofId, accion, obs?). ZonaPersonal,
  // FaseFlyout, TecnicoCard y PedidoLinea ya llaman a ejecutarAccion
  // directamente; el adaptador accionFacet murió con ellas.
  const accionOF = (ofId: string, a: AccionOF, obs?: string) => ejecutarAccion([ofId], a, obs);

  // Pasar a Producción cierra el trabajo de OT: el pedido sale del tablero, sus
  // fases se dan por terminadas en OLANET y a partir de ahí solo se consulta
  // desde el Historial. Y se pulsa desde tres sitios (la fila del panel, el
  // desplegable de una fase y el detalle), así que la pregunta va AQUÍ y no en
  // cada botón: uno solo la hacía y desde los otros el pedido desaparecía de
  // golpe, sin decir a dónde iba ni dar ocasión de rectificar.
  const [pasarPendiente, setPasarPendiente] = useState<string | null>(null);
  const completarPedido = useCallback((pedidoId: string) => setPasarPendiente(pedidoId), []);
  const completarPedidoAhora = useCallback(
    (pedidoId: string) => {
      // Las anuladas no son trabajo de OT: no se finalizan en OLANET.
      const ofIdsPedido = (pedidos.find((p) => p.id === pedidoId)?.ofs ?? [])
        .filter((of) => of.estado !== "anulada")
        .map((of) => of.id);
      setPedidosSync((prev) =>
        prev.map((p) => (p.id === pedidoId ? { ...p, situacion: "completado" } : p)),
      );
      // Pasar a Producción CIERRA el reloj de este pedido, y lo cierra el
      // servidor (que tiene la hora oficial) en la misma escritura.
      //
      // Hace falta desde que una OF aprobada se puede seguir fichando: quedaba
      // trabajo real después de que te la aprobaran —archivos de corte,
      // imprimir— y hasta entonces no había forma de imputarlo. El efecto
      // secundario es este: puedes estar fichando cuando lo pasas. Sin cortar,
      // el pedido sale del tablero con el intervalo abierto y el tiempo se
      // seguiría imputando contra una fase que OLANET acaba de dar por
      // finalizada.
      persistir({
        motivo: "completar",
        completarPedidoId: pedidoId,
        ofIdsPedido,
        cortarFichajeDe: ofIdsPedido,
      });
      // Y mi navegador también tiene que enterarse: `ficharOFs` reenvía todo lo
      // que cree tener abierto, así que si sigue contando estas OF el siguiente
      // "Fichar" las reabriría en el servidor.
      soltarDeMiFichaje(ofIdsPedido);
      setOpenId(null);
    },
    [pedidos, setPedidosSync, persistir, soltarDeMiFichaje],
  );
  const pedidoAPasar = pedidos.find((p) => p.id === pasarPendiente) ?? null;
  const ofsAPasar = pedidoAPasar?.ofs.filter((o) => o.estado !== "anulada").length ?? 0;


  const openPedido = pedidos.find((p) => p.id === openId) ?? null;
  const nombreDeOperario = useCallback(
    (id: string) => operarios.find((o) => o.id === id)?.nombre ?? id,
    [operarios],
  );
  // Pedido del historial abierto en su propio panel (el de solo lectura). Lo
  // abre el buscador global: un resultado del historial no se puede enseñar en
  // el Drawer normal, que espera un pedido vivo del tablero.
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null);
  // Pasados a Producción pero todavía en la vista de pendientes de RPS: los
  // enseña el Historial en un bloque aparte (ver su comentario). Se van solos
  // de aquí en cuanto RPS cierra la fase y el pedido deja de venir.
  const pasadosSinCerrar = pedidos.filter((p) => p.situacion === "completado");

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
    // TODOS, no los de la sección que se esté sirviendo: aquí es donde se dice
    // quién eres, y con la lista filtrada nadie de Diseño Gráfico podría
    // elegirse a sí mismo — el tablero arranca con el de Oficina Técnica.
    return <IdentityGate operarios={TODOS_LOS_OPERARIOS} onSelect={setMiId} />;
  }

  // Sección anunciada pero todavía sin abrir: se dice y no se enseña nada. Va
  // DESPUÉS de saber quién eres —para poder salir a la sección que sí está— y
  // antes de todo lo demás, que es lo que no se debe pintar. El servidor
  // tampoco consulta nada para ella (ver `Seccion.enObras`).
  if (SECCIONES[seccionActual].enObras) {
    return <SeccionEnObras seccion={SECCIONES[seccionActual]} onVolver={cambiarSeccion} />;
  }
  // QUIÉN ERES se busca en el catálogo completo, no en los de la sección que
  // se esté sirviendo. Al cambiarte a alguien de otra sección, su tablero
  // tarda una vuelta en llegar; mientras tanto `operarios` sigue siendo el de
  // la sección anterior y aquí salía `undefined`, que reventaba el render
  // entero con "Cannot read properties of undefined". Tu identidad no depende
  // de qué lista de trabajo se haya cargado ya.
  const yo = (TODOS_LOS_OPERARIOS.find((o) => o.id === miId) ??
    operarios.find((o) => o.id === miId)) as Operario;
  const resto = operarios.filter((o) => o.id !== miId);

  // Lo que hace falta para contar el cierre automático y poder deshacerlo: qué
  // OF eran y cuáles se pueden volver a fichar AHORA (una que entretanto se
  // aprobó, o que Producción detuvo, ya no). El rol sale de las propias OF, y
  // se reanudan solo las de un rol —el del reloj, que es uno solo.
  const ofsDelAviso = avisoCierreAuto
    ? pedidos.flatMap((p) => p.ofs).filter((of) => avisoCierreAuto.ofIds.includes(of.id))
    : [];
  const rolDelAviso = ofsDelAviso.find(esFichable) ?? null;
  const reanudables = rolDelAviso
    ? ofsDelAviso.filter((of) => esFichable(of) && rolFichajeDe(of) === rolFichajeDe(rolDelAviso))
    : [];

  return (
    <>
      <div className="flex min-h-full flex-col">
        {/* topbar */}
        {/* Tres zonas y no una fila que se reparte como puede: identidad y
            navegación a la izquierda, el buscador CENTRADO, y a la derecha los
            botones. Sin `flex-wrap`: al meter el buscador, la cabecera saltaba
            a dos alturas en cuanto la ventana se estrechaba.
            AQUÍ HABÍA tres contadores (sin asignar, por revisar, en revisión) y
            un "en directo" con los avatares de quien ficha. Los tres números ya
            los da el sitio al que llevan —la bandeja cuenta lo suyo, las
            pestañas llevan su badge, la vista de Revisiones enseña las columnas
            con su total—, así que eran el mismo dato dicho dos veces y en el
            único sitio donde no se puede pulsar. Y el "en directo" era el tercer
            sitio que decía quién ficha, después del punto verde de cada fila y
            de la zona de cada compañero. Sin ellos la cabecera es lo que tiene
            que ser: dónde estoy, qué busco y quién soy. */}
        {/* Tres bloques con los DOS laterales a `flex-1 basis-0`: reparten por
            igual lo que sobra, así el buscador queda en el centro de la
            PANTALLA. Antes iba con `mx-auto` dentro del flex, que lo centra en
            el hueco libre — y como la izquierda (logo + pestañas) pesa mucho
            más que la derecha, el buscador se iba escorado. */}
        <header className="glass-header sticky top-0 z-30 flex items-center gap-3 px-4 py-2.5">
          {/* `shrink-0` y no `flex-1 basis-0 min-w-0`: las zonas de los lados
              NO ceden. Cediendo se derrumbaban —esta llegó a medir 11 px— y el
              logo y las pestañas se pintaban DEBAJO del buscador, que es lo que
              se veía como "se agrupan los botones con el buscador".
              El que cede es el buscador, que para eso se encoge por dentro.

              Se pierde el centrado exacto del buscador, y se acepta: entre un
              buscador centrado que tapa las pestañas y uno pegado a ellas que
              se lee, no hay duda. Con la ventana ancha la diferencia no se
              aprecia porque las dos zonas miden parecido. */}
          <div className="flex min-w-0 items-center gap-3">
            {/* el PNG del logo trae aire vertical: se deja desbordar sin engordar la cabecera */}
            <Logo className="-my-3 shrink-0" />
            {/* Las seis pestañas ocupan unos 500 px y no se pueden acortar
                —no hay iconos, y una pestaña sin nombre no se usa—, así que
                por debajo de cierto ancho no caben junto al buscador y los
                botones. En vez de aplastarlas hasta que se pinten debajo del
                buscador, que era el fallo, la tira SE DESPLAZA. */}
            <div className="scroll-thin min-w-0 overflow-x-auto">
              <ViewSwitcher
                vista={vista}
                onChange={setVista}
                badge={{ revision: misPorRevisar, asignar: misDevueltas }}
              />
            </div>
          </div>
          {/* Busca en TODO: `pedidos` sin filtrar (con lo de taller, lo
              detenido, lo anulado y lo ya pasado) más el historial de RPS. Cada
              vista enseña un recorte distinto y sin esto encontrar un pedido
              concreto era adivinar en cuál cayó. */}
          {/* `flex-1` y no `w-full`: sin crecer, el buscador se congelaba en sus
              512 px y el sitio que faltaba lo pagaban las zonas de los lados,
              que desbordaban por debajo de él. Creciendo como ellas, el reparto
              es de los tres y el que cede al estrechar es este, que se encoge
              por dentro sin romperse. */}
          <BuscadorGlobal
            className="min-w-36 max-w-lg flex-1"
            pedidos={pedidos}
            nombre={nombreDeOperario}
            onAbrirPedido={abrirPedido}
            onAbrirHistorial={setHistorialAbierto}
          />
          {/* Mismo trato que la zona de la izquierda, y por lo mismo.
              `ml-auto` la clava en la esquina: como aquí ya no crece nadie, en
              una pantalla ancha el sitio que sobra —687 px en una de 1920— se
              quedaba DETRÁS de estos botones y los dejaba flotando a media
              cabecera. Con el margen automático, lo que sobra se pone delante y
              la campana y el menú van siempre al borde. */}
          <div className="ml-auto flex shrink-0 items-center justify-end gap-2 text-xs">
            {/* TODO lo que no es trabajo vive aquí dentro: quién eres, qué
                lista miras, claro u oscuro y las otras páginas. Estaban los
                cuatro sueltos y sumaban 331 px de cabecera, que es lo que la
                amontonaba en cuanto la ventana se estrechaba. Son cosas que se
                tocan una vez al día, no a cada rato. */}
            <Notificaciones items={avisosVisibles} onNavigate={irANotificacion} />
            {/* EL ÚLTIMO de la cabecera, pegado al borde: es el menú de la
                aplicación y ahí es donde se busca. */}
            <Herramientas
              fechaUltimaNovedad={ULTIMA ? fechasNovedades[ULTIMA] : undefined}
              onVerNovedades={() => setNovedadesAbiertas(true)}
              onVerGuiaRevision={() => setGuiaAbierta(true)}
              seccion={seccionVista ?? (yo.seccion ?? SECCION_POR_DEFECTO)}
              onCambiarSeccion={cambiarSeccion}
              yo={yo}
              operarios={TODOS_LOS_OPERARIOS}
              onCambiarIdentidad={solicitarCambioIdentidad}
            />
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
              const codigos = ofsDelAviso.map((of) => of.codigo);
              const quien = codigos.length > 0 ? codigos.join(", ") : "Un fichaje";
              const hora = new Date(avisoCierreAuto.fin).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              });
              // El MOTIVO, y no solo el hecho: lo único que sabe el servidor es
              // que la pestaña dejó de dar señales, y las causas posibles son
              // pocas y concretas. Decirlas evita la pregunta de siempre ("¿y
              // por qué se cerró?") y, sobre todo, apunta a la que se puede
              // arreglar: que el navegador duerma la pestaña.
              return `${quien} se cerró a las ${hora}, la hora del último aviso. Pasa cuando la pestaña deja de dar señales: se cerró el navegador, se suspendió el equipo, o el navegador durmió la pestaña por llevar mucho rato de fondo.`;
            })()}
          </p>
          {/* Volver a ponerlo en marcha sin ir a buscar el pedido: es lo que se
              quiere hacer el 90% de las veces, porque el trabajo seguía. NO
              recupera el tiempo perdido —ese no lo tiene nadie— sino que abre
              un tramo nuevo desde ahora. */}
          {reanudables.length > 0 && (
            <button
              onClick={() => {
                ficharOFs(
                  reanudables.map((of) => of.id),
                  rolFichajeDe(reanudables[0]),
                );
                setAvisoCierreAuto(null);
                if (miId) {
                  fetch("/api/fichaje/aviso-visto", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ operarioId: miId }),
                  }).catch(() => {});
                }
              }}
              title={`Vuelve a poner el reloj en marcha en ${reanudables
                .map((of) => of.codigo)
                .join(", ")}. El tiempo que pasó con el reloj parado no se recupera: el tramo empieza ahora.`}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                ROL[rolFichajeDe(reanudables[0])].solido
              }`}
            >
              ▶ Reanudar
            </button>
          )}
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
                onFichar={ficharOFsConAviso}
                onDesficharVarias={desficharVarias}
                completarPedido={completarPedido}
                operarios={operarios}
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
                onFichar={ficharOFsConAviso}
                onDesficharVarias={desficharVarias}
                completarPedido={completarPedido}
                operarios={operarios}
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
                    onFichar={ficharOFsConAviso}
                    onDesficharVarias={desficharVarias}
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
                onCambiarRevisor={cambiarRevisorOF}
                onAccion={accionOF}
              />
            </div>
          </>
        )}

        {guiaAbierta && <PanelGuiaRevision onCerrar={() => setGuiaAbierta(false)} />}

        {/* ── VISTA HISTORIAL ── */}
        {novedadesAbiertas && (
          <PanelNovedades
            fechas={fechasNovedades}
            onCerrar={() => {
              setNovedadesAbiertas(false);
              // Se dan por vistas al CERRAR, no al abrir: si se marca al abrir
              // y alguien cierra sin querer, el aviso desaparece sin haber
              // leído nada y no vuelve.
              if (ULTIMA) {
                setVistoNovedades(ULTIMA);
                try {
                  localStorage.setItem(NOVEDADES_KEY, ULTIMA);
                } catch {}
              }
            }}
          />
        )}

        {vista === "metricas" && (
          <div className="p-5">
            <MetricasView seccion={seccionVista ?? (yo.seccion ?? SECCION_POR_DEFECTO)} />
          </div>
        )}

        {vista === "historial" && (
          <div className="p-5">
            <HistorialView
              pasados={pasadosSinCerrar}
              onAbrirPasado={abrirPedido}
              operarios={operarios}
              miId={miId}
            />
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
        dobleFichaje={dobleFichaje}
        onClose={closeDrawer}
        onAssignPedido={asignarPedido}
        onCompletar={completarPedido}
        onSetRevisor={setRevisor}
        onTraspasarAutor={traspasarAutorOF}
        onAccion={ejecutarAccion}
        onFichar={ficharOFsConAviso}
        onDesfichar={desficharOF}
        onDesficharVarias={desficharVarias}
        ofIdsFichandoYo={ofIdsFichandoYo}
      />

      <HistorialDrawer
        pedido={historialAbierto}
        operarios={operarios}
        miId={miId}
        onClose={() => setHistorialAbierto(null)}
      />

      <MiFichaje
        miId={miId}
        operarios={operarios}
        pedidos={procesadosAll}
        fichaje={fichaje}
        dobleFichaje={dobleFichaje}
        desfaseServidor={desfaseServidor}
        onFichar={ficharOFsConAviso}
        onDesfichar={desficharOF}
        onDesficharVarias={desficharVarias}
        onPausarTodo={pausarTodo}
      />

      <ConfirmDialog
        abierto={pedidoAPasar !== null}
        titulo={`Pasar ${pedidoAPasar?.codigo ?? ""} a Producción`}
        mensaje={
          `Se dan por terminadas ${ofsAPasar === 1 ? "su OF" : `sus ${ofsAPasar} OF`} y el pedido sale ` +
          `del tablero: deja de estar en Pendientes y pasa al Historial.\n\n` +
          `Es el final del trabajo de Oficina Técnica. Si después hubiera que retocar algo, habría ` +
          `que hablarlo con Producción.`
        }
        onConfirmar={() => {
          const id = pasarPendiente;
          setPasarPendiente(null);
          if (id) completarPedidoAhora(id);
        }}
        onCancelar={() => setPasarPendiente(null)}
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
        abierto={quitarAutorPendiente !== null}
        titulo="Quitar el autor del pedido"
        tono="peligro"
        mensaje={
          `El pedido sale de las manos de ${quitarAutorPendiente?.quien ?? ""} y vuelve a "Sin asignar", ` +
          `para que lo pueda coger cualquiera.\n\n` +
          `Sus OF vuelven a "sin empezar" y se queda sin revisor. El tiempo ya fichado NO se borra.` +
          (quitarAutorPendiente && quitarAutorPendiente.quien
            ? `\n\nA ${quitarAutorPendiente.quien} le llegará el aviso de que ya no lo lleva.`
            : "")
        }
        onConfirmar={() => {
          const pendiente = quitarAutorPendiente;
          setQuitarAutorPendiente(null);
          const pedido = pendiente && pedidosRef.current.find((p) => p.id === pendiente.pedidoId);
          if (pedido) moverOFs(new Set(pedido.ofs.map((of) => of.id)), null);
        }}
        onCancelar={() => setQuitarAutorPendiente(null)}
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

      {/* Qué se va a fichar. El botón de la fila dice "Fichar" y arranca el
          reloj en todas las OF fichables del pedido: enseñarlas por su nombre
          es la única forma de que eso no sea una sorpresa, y de paso se aprende
          que dentro del pedido se puede fichar una sola.
          Y se enseña el conjunto ENTERO, con lo que ya venía corriendo: el
          reparto es sobre todo lo que hay dentro del tramo, así que ponerse con
          un segundo pedido baja lo que cuenta el primero. */}
      <ConfirmDialog
        abierto={fichajeVariasPendiente !== null}
        titulo={
          (fichajeVariasPendiente?.yaCorrian ?? 0) > 0
            ? `El reloj pasa a repartirse entre ${fichajeVariasPendiente?.total} OF`
            : `Fichar ${fichajeVariasPendiente?.total ?? 0} OF a la vez`
        }
        mensaje={
          // Tres cosas distintas, y antes iban en una sola cadena con saltos de
          // línea: la frase de entrada, la lista y la advertencia del reparto
          // salían del mismo gris y del mismo tamaño, con los códigos de OF
          // sangrados a base de espacios. Se leía como un bloque, que es justo
          // lo que no puede pasar en el cuadro que dice QUÉ vas a fichar.
          //
          // Ahora cada una hace su trabajo: la entrada es una frase, la lista
          // es una lista —el pedido en mono, como en todas partes— y el reparto
          // va detrás de una raya, más pequeño. Lo ÚNICO en negrita es la
          // fracción: es el dato que sorprende, y el que hace volver atrás a
          // quien creía estar fichando una sola OF.
          <>
            <p>
              {(fichajeVariasPendiente?.yaCorrian ?? 0) > 0
                ? `Ya tienes ${fichajeVariasPendiente?.yaCorrian} OF corriendo. Al añadir estas, el reloj queda repartido entre todas:`
                : "Se va a poner el reloj en marcha en:"}
            </p>
            <ul className="mt-2 flex flex-col gap-2.5">
              {(fichajeVariasPendiente?.porPedido ?? []).map((g) => (
                <li key={g.codigo}>
                  <p className="flex items-baseline gap-1.5">
                    {/* Mono solo el código, que es lo que se busca con el ojo.
                        El nombre del cliente en mono se leía como si fuera otro
                        código más. */}
                    <span className="font-mono text-xs font-semibold text-text">{g.codigo}</span>
                    <span className="truncate text-[11px]">{g.cliente}</span>
                  </p>
                  {/* Sangrada y sin viñeta: la sangría ya dice que cuelgan del
                      pedido, y el punto sobraba —el código y su descripción ya
                      van separados por uno—. */}
                  <ul className="mt-1 flex flex-col gap-0.5 pl-3">
                    {g.ofs.map((of) => (
                      <li key={of.codigo} className="flex items-baseline gap-1.5 text-xs">
                        <span className="font-mono text-text-muted">{of.codigo}</span>
                        <span className="truncate">{of.descripcion}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border pt-2 text-[11px]">
              El tiempo se reparte a partes iguales: cada OF cuenta{" "}
              <strong className="font-semibold text-text">
                1/{fichajeVariasPendiente?.total}
              </strong>{" "}
              de lo que marque el reloj. Si solo quieres fichar una, abre el pedido y ficha esa
              OF.
            </p>
          </>
        }
        onConfirmar={() => {
          const pendiente = fichajeVariasPendiente;
          setFichajeVariasPendiente(null);
          if (pendiente) ficharAvisandoSiEsAjeno(pendiente.ofIds, pendiente.rol);
        }}
        onCancelar={() => setFichajeVariasPendiente(null)}
      />

      <ConfirmDialog
        abierto={fichajeAjenoPendiente !== null}
        titulo="Fichar en OF de un compañero"
        mensaje={`Vas a fichar en OFs asignadas a ${fichajeAjenoPendiente?.nombres.join(", ") ?? ""}. El tiempo contará igual (va a Oficina Técnica), pero la OF sigue asignada a esa persona. ¿Continuar?`}
        onConfirmar={() => {
          if (fichajeAjenoPendiente) {
            arrancarFichaje(fichajeAjenoPendiente.ofIds, fichajeAjenoPendiente.rol);
          }
          setFichajeAjenoPendiente(null);
        }}
        onCancelar={() => setFichajeAjenoPendiente(null)}
      />
    </>
  );
}

