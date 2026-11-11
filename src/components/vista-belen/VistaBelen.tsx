"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PedidoEncontrado } from "@/lib/buscador";
import { interpretarBusqueda } from "@/lib/codigo-busqueda";
import { useNovedades } from "@/lib/useNovedades";
import { ULTIMA } from "@/lib/novedades";
import { fechaCorta, type PedidoBelen } from "@/lib/vista-belen";
import { esIdLista, LISTAS_BELEN, type FilaLista, type IdLista } from "@/lib/vista-belen-listas";
import { Logo } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";
import { PanelNovedades } from "../PanelNovedades";
import { PedidoBelenView } from "./PedidoBelen";
import { TablaListaBelen, type CargaLista } from "./ListaBelen";
import { InicioBelen } from "./InicioBelen";
import { EntregasBelen } from "./EntregasBelen";
import { AvisosBelen } from "./AvisosBelen";

// ─── La pantalla de Belén Alamancos (Producción) ─────────────────────────────
// Hecha a su medida (09/11/2026): no es la de Producción en general, cada
// compañero tendrá la suya. Lo que más usa es buscar un pedido, así que entra
// con el cursor en el buscador; las pestañas son las hojas de sus Excels que
// pidió primero. Pensada para monitores pequeños (1280-1366 px): nada de
// anchos mínimos grandes y la letra menuda donde no se lee de lejos.
//
// NAVEGACIÓN (Iván, 10/11/2026: «necesitamos un botón de volver atrás o que
// funcione el del ratón»). Manda la dirección de la página:
//   ?pedido=AR.…[&of=…]                 un pedido abierto
//   ?q=texto                            la lista de pedidos que encajan
//   ?vista=comprobaciones&lista=…       una lista de comprobación
//   ?vista=entregas                     pedidos por fecha de entrega
//   (nada)                              el buscador vacío
// Cada paso que da ella se apunta en el historial del navegador, así que el
// «atrás» del ratón, el del navegador, Alt+← y el «← Volver» hacen lo mismo:
// abrir un pedido desde una lista y volver deja otra vez en esa lista.

// Accesos al inicio, las comprobaciones y los pedidos por entrega. Cada
// herramienta también se puede abrir desde su tarjeta en la portada.
type Pestana = "pedido" | "comprobaciones" | "entregas";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "pedido", label: "Inicio" },
  { id: "comprobaciones", label: "Comprobaciones" },
  { id: "entregas", label: "Por fecha solicitada" },
];

type Estado =
  | { tipo: "vacio" }
  | { tipo: "buscando" }
  | { tipo: "elegir"; pedidos: PedidoEncontrado[] }
  | { tipo: "nada"; q: string }
  | { tipo: "pedido"; pedido: PedidoBelen; ofResaltada: string | null; abrirNotas: boolean; version: number; actualizando?: boolean }
  | { tipo: "error"; mensaje: string };

/** Lo que se apunta en el historial con cada paso, para saber si «Volver»
 *  tiene adónde volver dentro de esta pantalla. */
interface PasoHistorial {
  belen: true;
  /** Cuántos pasos se han dado dentro de la pantalla hasta este. */
  n: number;
}

async function pedirJson<T>(url: string, senal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal: senal, cache: "no-store" });
  if (r.status === 401) {
    // La sesión caducó: a entrar otra vez.
    window.location.href = "/entrar";
    throw new Error("Sin sesión");
  }
  const json = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(json.error ?? "No se pudo leer RPS");
  return json;
}

const pasoActual = (): number => {
  const s = history.state as Partial<PasoHistorial> | null;
  return s?.belen ? (s.n ?? 0) : 0;
};

export function VistaBelen({ nombre, miId = null, direccion = false }: { nombre: string; miId?: string | null; direccion?: boolean }) {
  const perfilNovedades = direccion ? "direccion" : "produccion";
  const novedades = useNovedades(miId ?? "vista-produccion-local", perfilNovedades);
  const [pestana, setPestana] = useState<Pestana>("pedido");
  const [lista, setLista] = useState<IdLista>(LISTAS_BELEN[0].id);
  const [listas, setListas] = useState<Partial<Record<IdLista, CargaLista>>>({});
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "vacio" });
  // Lo último pintado, para que «Actualizar» sepa qué pedido volver a pedir.
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);
  const caja = useRef<HTMLInputElement>(null);
  const enCurso = useRef<AbortController | null>(null);

  // ── Las listas: se piden TODAS al entrar, por detrás ────────────────────────
  // Antes cada una se pedía al pinchar en ella, y los números de los botones
  // salían a medida que se visitaban (Iván: «tuve que ir pestaña por pestaña»).
  const cargarLista = useCallback(async (id: IdLista) => {
    setListas((ls) => ({ ...ls, [id]: ls[id]?.tipo === "listo" ? { ...ls[id], actualizando: true } : { tipo: "cargando" } }));
    try {
      const { filas, calculadaAt } = await pedirJson<{ filas: FilaLista[]; calculadaAt: string }>(
        `/api/vista-belen?lista=${id}`,
      );
      setListas((ls) => ({ ...ls, [id]: { tipo: "listo", filas, calculadaAt } }));
    } catch (e) {
      setListas((ls) => ({ ...ls, [id]: { tipo: "error", mensaje: (e as Error).message } }));
    }
  }, []);

  useEffect(() => {
    // Fuera del cuerpo del efecto: cargarLista pinta «Cargando» al momento.
    void Promise.resolve().then(() => {
      LISTAS_BELEN.forEach((l) => void cargarLista(l.id));
    });
  }, [cargarLista]);

  // ── Pedidos ────────────────────────────────────────────────────────────────
  const mostrarPedido = useCallback(async (codigo: string, ofResaltada: string | null, abrirNotas = false) => {
    enCurso.current?.abort();
    const ctl = new AbortController();
    enCurso.current = ctl;
    setEstado({ tipo: "buscando" });
    try {
      const { pedido } = await pedirJson<{ pedido: PedidoBelen | null }>(
        `/api/vista-belen?pedido=${encodeURIComponent(codigo)}`,
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      setEstado(pedido ? { tipo: "pedido", pedido, ofResaltada, abrirNotas, version: 0 } : { tipo: "nada", q: codigo });
      // En la caja queda el código entero: escribió «4716» y ve AR.26.04716.
      if (pedido) {
        setQ(pedido.codigo);
      }
    } catch (e) {
      if (!ctl.signal.aborted) setEstado({ tipo: "error", mensaje: (e as Error).message });
    }
  }, []);

  /** Vuelve a leer de RPS el pedido abierto (OF, tareas, bultos…) sin quitar
   *  la pantalla ni cambiar de pestaña. Belén, 11/11/2026: «por si hace un
   *  cambio de los bultos o lo que sea, que aparezca al actualizar». La
   *  versión nueva hace que documentos, tiempos y material se pidan otra vez. */
  const actualizarPedido = useCallback(async () => {
    const actual = estadoRef.current;
    if (actual.tipo !== "pedido") return;
    setEstado({ ...actual, actualizando: true });
    try {
      const { pedido } = await pedirJson<{ pedido: PedidoBelen | null }>(
        `/api/vista-belen?pedido=${encodeURIComponent(actual.pedido.codigo)}`,
        new AbortController().signal,
      );
      setEstado((e) =>
        e.tipo === "pedido" && e.pedido.codigo === actual.pedido.codigo
          ? { ...e, pedido: pedido ?? e.pedido, version: e.version + 1, actualizando: false }
          : e,
      );
    } catch {
      setEstado((e) => (e.tipo === "pedido" ? { ...e, actualizando: false } : e));
    }
  }, []);

  /** Lleva la pantalla a lo que dice la dirección. Lo usa todo: los clics
   *  (después de apuntar el paso), el «atrás» y el recargar la página. */
  const aplicarUrl = useCallback(async () => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("vista") === "entregas") {
      enCurso.current?.abort();
      setPestana("entregas");
      return;
    }
    if (p.get("vista") === "comprobaciones") {
      enCurso.current?.abort();
      setPestana("comprobaciones");
      const l = p.get("lista");
      if (esIdLista(l)) setLista(l);
      return;
    }
    setPestana("pedido");
    const pedido = p.get("pedido");
    if (pedido) return mostrarPedido(pedido, p.get("of"), p.get("detalle") === "notas");
    const texto = p.get("q");
    if (!texto) {
      enCurso.current?.abort();
      setEstado({ tipo: "vacio" });
      setQ("");
      return;
    }
    setQ(texto);
    enCurso.current?.abort();
    const ctl = new AbortController();
    enCurso.current = ctl;
    setEstado({ tipo: "buscando" });
    try {
      const { pedidos } = await pedirJson<{ pedidos: PedidoEncontrado[] }>(
        `/api/vista-belen?q=${encodeURIComponent(texto)}`,
        ctl.signal,
      );
      if (ctl.signal.aborted) return;
      if (pedidos.length === 1) {
        // Uno solo: se abre, y la búsqueda no se queda como paso intermedio
        // (volver desde el pedido lleva a donde estaba antes de buscar).
        const que = interpretarBusqueda(texto, new Date().getFullYear());
        const params = new URLSearchParams({ pedido: pedidos[0].codigo });
        if (que.tipo === "of") params.set("of", que.codigo);
        history.replaceState(history.state, "", `?${params}`);
        return mostrarPedido(pedidos[0].codigo, que.tipo === "of" ? que.codigo : null);
      }
      setEstado(pedidos.length ? { tipo: "elegir", pedidos } : { tipo: "nada", q: texto });
    } catch (e) {
      if (!ctl.signal.aborted) setEstado({ tipo: "error", mensaje: (e as Error).message });
    }
  }, [mostrarPedido]);

  /** Un paso nuevo: se apunta en el historial y se aplica. `reemplazar` para
   *  lo que no merece un «atrás» propio (cambiar de lista). */
  const navegar = useCallback(
    (params: Record<string, string>, { reemplazar = false } = {}) => {
      const busqueda = new URLSearchParams(params).toString();
      const url = busqueda ? `?${busqueda}` : window.location.pathname;
      if (reemplazar) history.replaceState(history.state, "", url);
      else history.pushState({ belen: true, n: pasoActual() + 1 } satisfies PasoHistorial, "", url);
      void aplicarUrl();
    },
    [aplicarUrl],
  );

  useEffect(() => {
    // Al recargar, se queda donde estaba; con «atrás» y «adelante», igual.
    void Promise.resolve().then(aplicarUrl);
    const alVolver = () => void aplicarUrl();
    window.addEventListener("popstate", alVolver);
    // Al salir de la pantalla, lo que esté pidiendo ya no le importa a nadie.
    const peticiones = enCurso;
    return () => {
      window.removeEventListener("popstate", alVolver);
      peticiones.current?.abort();
    };
  }, [aplicarUrl]);

  const buscar = (escrito: string) => {
    const term = escrito.trim();
    // Buscar sin nada escrito lleva al inicio, como pinchar en el logo.
    if (!term) {
      irAlInicio();
      return;
    }
    const que = interpretarBusqueda(term, new Date().getFullYear());
    // Un código entero va directo al pedido, sin pasar por la lista: es el
    // caso de casi siempre y así se ahorra un viaje a RPS.
    if (que.tipo === "pedido" && que.exactos.length === 1 && que.prefijos.length === 0) {
      navegar({ pedido: que.exactos[0] });
    } else {
      navegar({ q: term });
    }
  };

  const grande = pestana === "pedido" && estado.tipo === "vacio";

  /** La página de inicio (buscador grande y herramientas). Si ya
   *  está ahí no apunta otro paso en el historial. */
  const irAlInicio = () => {
    if (pestana === "pedido" && estado.tipo === "vacio") return caja.current?.focus();
    navegar({});
  };

  const volver = () => {
    if (pasoActual() > 0) history.back();
    else navegar({});
  };

  const irAPestana = (p: Pestana) => {
    if (p === "pedido") { irAlInicio(); return; }
    if (p === pestana) return;
    if (p === "comprobaciones") navegar({ vista: "comprobaciones", lista });
    else if (p === "entregas") navegar({ vista: "entregas" });
  };

  const salir = async () => {
    await fetch("/api/sesion", { method: "DELETE" }).catch(() => {});
    window.location.href = "/";
  };

  return (
    <div className="min-h-full">
      <header className="glass-header sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        {/* El logo lleva al inicio, como en cualquier web. */}
        <button
          type="button"
          onClick={irAlInicio}
          aria-label="Ir al inicio"
          title="Ir al inicio"
          className="rounded-lg transition-transform active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none"
        >
          <Logo height={38} />
        </button>
        <div
          role="tablist"
          aria-label="Secciones"
          className="tira-3d glass-chip inline-flex flex-wrap rounded-lg p-[3px]"
          onKeyDown={(e) => {
            const i = PESTANAS.findIndex((p) => p.id === pestana);
            let destino: number | null = null;
            if (e.key === "ArrowRight") destino = (i + 1) % PESTANAS.length;
            else if (e.key === "ArrowLeft") destino = (i - 1 + PESTANAS.length) % PESTANAS.length;
            else if (e.key === "Home") destino = 0;
            else if (e.key === "End") destino = PESTANAS.length - 1;
            if (destino === null) return;
            e.preventDefault();
            irAPestana(PESTANAS[destino].id);
            document.getElementById(`pestana-${PESTANAS[destino].id}`)?.focus();
          }}
        >
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={p.id === pestana}
              aria-controls={`panel-${p.id}`}
              tabIndex={p.id === pestana ? 0 : -1}
              onClick={() => irAPestana(p.id)}
              className={`h-8 rounded-md px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                p.id === pestana
                  ? "pestana-activa"
                  : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[13px] text-text-muted">{nombre}</span>
          <AvisosBelen miId={miId} onAbrir={(pedido) => navegar({ pedido, detalle: "notas" })} />
          {ULTIMA && <button type="button" onClick={novedades.abrir} className="rounded-full px-3 py-2 text-[12px] text-text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">Novedades de la web</button>}
          <ThemeToggle />
          <button
            type="button"
            onClick={salir}
            className="boton-arriba h-8 rounded-full px-3 text-[13px] font-semibold text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Salir
          </button>
        </div>
      </header>

      {novedades.abierta && (
        <PanelNovedades perfil={perfilNovedades} fechas={novedades.fechas} nuevos={novedades.nuevos} onCerrar={novedades.cerrar} />
      )}

      {pestana === "pedido" ? (
        <main role="tabpanel" id="panel-pedido" aria-labelledby="pestana-pedido" className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-3">
          {/* En el inicio el buscador es lo principal (Iván, 10/11/2026): grande,
              centrado, sin tarjeta, solo sobre el fondo. Con un pedido abierto vuelve a ser una
              barra compacta, para no quitarle sitio a la ficha. */}
          <div
            className={
              grande
                ? "relative mb-6 flex flex-col items-center px-6 pt-6"
                : "mb-3 flex flex-wrap items-center gap-2"
            }
          >
            {/* En la portada no hay a dónde volver: se sale con las pestañas. */}
            {!grande && (
              <button
                type="button"
                onClick={volver}
                title="Volver a lo de antes (también con el botón «atrás» del ratón o Alt+←)"
                className={`rounded-full bg-[var(--hero-relleno)] px-3.5 text-sm font-semibold text-text transition-[transform,background-color] hover:bg-[var(--hero-relleno-encima)] active:scale-[.97] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  grande ? "absolute left-4 top-4 h-9" : "h-10"
                }`}
              >
                ← Volver
              </button>
            )}
            {grande && <h1 className="mb-3 text-[20px] font-bold">¿Qué pedido buscas?</h1>}
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                buscar(q);
              }}
              className={`flex items-center gap-2 ${grande ? "w-full max-w-2xl" : "min-w-72 max-w-xl flex-1"}`}
            >
              <label className="relative flex-1">
                <span className="sr-only">Buscar pedido, OF o cliente</span>
                {grande && (
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                )}
                <input
                  ref={caja}
                  // Lo primero que hace al entrar es buscar: el cursor ya está ahí.
                  autoFocus
                  autoComplete="off"
                  type="text"
                  enterKeyHint="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Pedido (4716, 26.04716…), OF o cliente"
                  className={`campo-hundido w-full text-text outline-none placeholder:text-text-muted ${
                    grande ? "h-14 rounded-[14px] pl-12 pr-4 text-[18px]" : "h-10 rounded-[14px] px-3 text-[15px]"
                  }`}
                />
              </label>
              <button
                type="submit"
                className={`rounded-full bg-brand-400 font-semibold text-brand-950 transition-transform active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none ${
                  grande ? "h-14 px-7 text-[16px]" : "h-10 px-4 text-sm"
                }`}
              >
                Buscar
              </button>
            </form>
          </div>
          <ResultadoBusqueda estado={estado} miId={miId} onElegir={(codigo) => navegar({ pedido: codigo })} onActualizar={() => void actualizarPedido()} />
          {estado.tipo === "vacio" && (
            <InicioBelen
              miId={miId}
              listas={listas}
              onAbrir={(id) => navegar(id === "entregas" ? { vista: "entregas" } : { vista: "comprobaciones", lista: id })}
            />
          )}
        </main>
      ) : pestana === "comprobaciones" ? (
        <main role="tabpanel" id="panel-comprobaciones" aria-labelledby="pestana-comprobaciones" className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-3">
          {/* La misma píldora que se desliza del resto de Coordina. */}
          <div role="group" aria-label="Lista" className="tira-3d glass-chip mb-3 inline-flex flex-wrap rounded-lg p-[3px]">
            {LISTAS_BELEN.map((l) => {
              const c = listas[l.id];
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.id === lista}
                  onClick={() => navegar({ vista: "comprobaciones", lista: l.id }, { reemplazar: true })}
                  className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    l.id === lista ? "pestana-activa" : "text-text-muted hover:text-text"
                  }`}
                >
                  {l.label}
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums ${
                      c?.tipo === "listo" && c.filas.length > 0
                        ? "bg-amber-500/20 text-amber-900 dark:text-amber-200"
                        : "bg-[var(--hero-relleno-encima)] text-text-muted"
                    }`}
                  >
                    {c?.tipo === "listo" ? c.filas.length : c?.tipo === "error" ? "!" : "…"}
                  </span>
                </button>
              );
            })}
          </div>
          <TablaListaBelen
            key={lista}
            lista={lista}
            carga={listas[lista] ?? { tipo: "cargando" }}
            onActualizar={() => void cargarLista(lista)}
            onAbrir={(pedido, of) => navegar(of ? { pedido, of } : { pedido })}
          />
        </main>
      ) : null}
      <EntregasBelen activa={pestana === "entregas"} onAbrir={(pedido) => navegar({ pedido })} />
    </div>
  );
}

function ResultadoBusqueda({
  estado,
  onElegir,
  onActualizar,
  miId,
}: {
  estado: Estado;
  onElegir: (codigo: string) => void;
  onActualizar: () => void;
  miId: string | null;
}) {
  switch (estado.tipo) {
    case "vacio":
      return null;
    case "buscando":
      return <p className="text-sm text-text-muted" aria-live="polite">Buscando…</p>;
    case "nada":
      return (
        <p className="text-sm text-text-muted" aria-live="polite">
          No hay ningún pedido que encaje con «{estado.q}».
        </p>
      );
    case "error":
      return (
        <p className="text-sm font-semibold text-red-700 dark:text-red-300" role="alert">
          {estado.mensaje}
        </p>
      );
    case "elegir":
      return (
        <ul className="flex max-w-3xl flex-col gap-1.5" aria-label="Pedidos encontrados">
          {estado.pedidos.map((p) => (
            <li key={p.codigo}>
              <button
                type="button"
                onClick={() => onElegir(p.codigo)}
                className="tarjeta-of flex w-full items-baseline gap-3 rounded-2xl bg-surface px-4 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="font-bold tabular-nums">{p.codigo}</span>
                <span className="min-w-0 flex-1 truncate">{p.cliente}</span>
                {p.fecha && (
                  <span className="text-xs tabular-nums text-text-muted">{fechaCorta(p.fecha)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      );
    case "pedido":
      return (
        <PedidoBelenView
          key={`${estado.pedido.codigo}:${estado.abrirNotas}`}
          pedido={estado.pedido}
          ofResaltada={estado.ofResaltada}
          miId={miId}
          abrirNotas={estado.abrirNotas}
          version={estado.version}
          actualizando={!!estado.actualizando}
          onActualizar={onActualizar}
        />
      );
  }
}
