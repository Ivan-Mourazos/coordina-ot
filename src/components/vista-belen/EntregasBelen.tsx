"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  agruparEntregas,
  diaConNombre,
  filtrarEntregas,
  type FiltrosEntregasBelen,
  type GrupoEntregas,
  type PedidoEntregaBelen,
} from "@/lib/entregas-belen";
import { hoyEnOficina } from "@/lib/consulta";
import { fechaCorta } from "@/lib/vista-belen";
import { chip } from "./estilos-belen";
import { BotonLimpiar, CabeceraOrdenable, CampoBuscar, FiltroFechas, Seleccion } from "./Filtros";

// ─── Pedidos por día de entrega ──────────────────────────────────────────────
// La fecha es la solicitada del pedido (la misma que usa Coordina para todos).
// Ordenada por fecha, la lista va en grupos: Atrasados (plegado), Hoy, Mañana,
// Resto de la semana, Más adelante y Sin fecha. La fecha se dice una vez: en el
// título del grupo o en el separador del día, nunca también en la fila.
// Ordenada por otra columna, es una tabla sola con la fecha en su columna.

// Por defecto, Arzúa: Belén no revisa las delegaciones salvo que lo pida.
const INICIAL: FiltrosEntregasBelen = { texto: "", delegacion: "AR", desde: "", hasta: "", situacion: "", orden: "fechaEntrega", descendente: false };
const DELEGACIONES = { AR: "Arzúa (AR)", SA: "Santiago (SA)", BE: "Bergondo (BE)" } as const;
const sonIniciales = (f: FiltrosEntregasBelen) => (Object.keys(INICIAL) as Array<keyof FiltrosEntregasBelen>).every((k) => f[k] === INICIAL[k]);
type Orden = FiltrosEntregasBelen["orden"];
const COLUMNAS: { clave: Orden; titulo: string; ancho: string; derecha?: boolean }[] = [
  { clave: "codigo", titulo: "Pedido", ancho: "w-[9.5rem]" },
  { clave: "cliente", titulo: "Cliente", ancho: "" },
  { clave: "ciudad", titulo: "Localidad", ancho: "w-[13rem]" },
  { clave: "situacion", titulo: "Situación", ancho: "w-[10rem]" },
  { clave: "ofs", titulo: "OF", ancho: "w-[4rem]", derecha: true },
];
const COLUMNA_FECHA = { clave: "fechaEntrega" as const, titulo: "Fecha de entrega", ancho: "w-[8.5rem]" };
const BOTON =
  "rounded-full bg-[var(--hero-relleno)] px-3.5 py-2 text-sm font-semibold transition-[transform,background-color] hover:bg-[var(--hero-relleno-encima)] active:scale-[.97] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";


function Situacion({ valor }: { valor: PedidoEntregaBelen["situacion"] }) {
  return valor === "fabrica" ? <span className={chip("aviso")}>En fábrica</span> : <span className={chip("ok")}>Esperando salir</span>;
}

function Cabecera({
  filtros,
  conFecha,
  onOrdenar,
}: {
  filtros: FiltrosEntregasBelen;
  conFecha: boolean;
  onOrdenar: (clave: Orden) => void;
}) {
  const columnas = conFecha ? [COLUMNA_FECHA, ...COLUMNAS] : COLUMNAS;
  return (
    <thead>
      <tr>
        {columnas.map((c) => (
          <CabeceraOrdenable
            key={c.clave}
            clave={c.clave}
            titulo={c.titulo}
            orden={{ clave: filtros.orden, descendente: filtros.descendente }}
            onOrdenar={onOrdenar}
            derecha={"derecha" in c && !!c.derecha}
            className={c.ancho}
          />
        ))}
      </tr>
    </thead>
  );
}

function Fila({ p, conFecha, onAbrir }: { p: PedidoEntregaBelen; conFecha: boolean; onAbrir: (c: string) => void }) {
  return (
    <tr
      onClick={() => onAbrir(p.codigo)}
      className="cursor-pointer border-t border-border transition-colors hover:bg-[var(--hero-relleno)] active:bg-[var(--hero-relleno-encima)] focus-within:bg-[var(--hero-relleno)] focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--hero-anillo)]"
    >
      {conFecha && <td className="whitespace-nowrap px-2.5 py-1.5 pl-4 tabular-nums">{fechaCorta(p.fechaEntrega) || "—"}</td>}
      <td className="px-2.5 py-1.5 first:pl-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAbrir(p.codigo);
          }}
          className="whitespace-nowrap rounded font-semibold tabular-nums focus:outline-none"
        >
          {p.codigo}
        </button>
      </td>
      <td className="max-w-0 truncate px-2.5 py-1.5" title={p.cliente ?? undefined}>{p.cliente ?? "—"}</td>
      <td className="max-w-0 truncate px-2.5 py-1.5" title={p.ciudad ?? undefined}>{p.ciudad ?? "—"}</td>
      <td className="px-2.5 py-1.5"><Situacion valor={p.situacion} /></td>
      <td className="px-2.5 py-1.5 pr-4 text-right tabular-nums">{p.ofs}</td>
    </tr>
  );
}

/** Las filas de un grupo. Si el grupo abarca varios días, un separador
 *  discreto por día; Hoy y Mañana ya lo dicen en su título. */
function FilasGrupo({ grupo, onAbrir }: { grupo: GrupoEntregas; onAbrir: (c: string) => void }) {
  const variosDias = grupo.id === "atrasados" || grupo.id === "semana" || grupo.id === "despues";
  return (
    <tbody>
      {grupo.pedidos.map((p, i) => (
        <Fragment key={p.codigo}>
          {variosDias && p.fechaEntrega && (i === 0 || p.fechaEntrega !== grupo.pedidos[i - 1].fechaEntrega) && (
            <tr>
              <th colSpan={5} scope="rowgroup" className="px-4 pb-1 pt-3 text-left text-[12px] font-semibold first-letter:uppercase text-text-muted">
                {diaConNombre(p.fechaEntrega)}
              </th>
            </tr>
          )}
          <Fila p={p} conFecha={false} onAbrir={onAbrir} />
        </Fragment>
      ))}
    </tbody>
  );
}

function TarjetaGrupo({
  grupo,
  hoy,
  filtros,
  onOrdenar,
  onAbrir,
}: {
  grupo: GrupoEntregas;
  hoy: string;
  filtros: FiltrosEntregasBelen;
  onOrdenar: (c: Orden) => void;
  onAbrir: (c: string) => void;
}) {
  const n = grupo.pedidos.length;
  const cuantos = `${n} ${n === 1 ? "pedido" : "pedidos"}`;
  const dia = grupo.id === "hoy" ? diaConNombre(hoy) : grupo.id === "manana" ? diaConNombre(grupo.pedidos[0].fechaEntrega!) : null;
  const tabla = (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <Cabecera filtros={filtros} conFecha={false} onOrdenar={onOrdenar} />
      <FilasGrupo grupo={grupo} onAbrir={onAbrir} />
    </table>
  );
  const titulo = (
    <span className="flex items-baseline gap-2.5">
      <span className={`text-[16px] font-bold ${grupo.id === "atrasados" ? "text-red-700 dark:text-red-300" : ""}`}>{grupo.titulo}</span>
      {dia && <span className="text-[13px] text-text-muted">{dia}</span>}
      <span className="text-[13px] font-semibold tabular-nums text-text-muted">{cuantos}</span>
    </span>
  );

  if (grupo.id === "atrasados") {
    // Plegado: hay pedidos de hace años sin entregar y no deben tapar lo de hoy.
    return (
      <details className="tarjeta-of group rounded-3xl bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-3xl px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="text-text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none">▸</span>
          {titulo}
          <span className="ml-auto text-[12px] text-text-muted">Del más reciente al más antiguo</span>
        </summary>
        <div className="pb-2">{tabla}</div>
      </details>
    );
  }
  return (
    <section aria-label={grupo.titulo} className="tarjeta-of rounded-3xl bg-surface pb-2">
      <h2 className="px-4 pb-1 pt-3">{titulo}</h2>
      {tabla}
    </section>
  );
}

export function EntregasBelen({ activa, onAbrir }: { activa: boolean; onAbrir: (codigo: string) => void }) {
  const [pedidos, setPedidos] = useState<PedidoEntregaBelen[] | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [filtros, setFiltros] = useState(INICIAL);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!activa) return;
    const ctl = new AbortController();
    void Promise.resolve().then(async () => {
      if (ctl.signal.aborted) return;
      setCargando(true);
      setError("");
      try {
        const r = await fetch("/api/vista-belen?entregas=1", { cache: "no-store", signal: ctl.signal });
        if (r.status === 401) { window.location.href = "/entrar"; return; }
        if (!r.ok) throw new Error("No se pudo cargar la lista de pedidos. Prueba otra vez.");
        const datos = await r.json() as { pedidos: PedidoEntregaBelen[] };
        if (!ctl.signal.aborted) setPedidos(datos.pedidos);
      } catch (e) { if (!ctl.signal.aborted) setError((e as Error).message); }
      finally { if (!ctl.signal.aborted) setCargando(false); }
    });
    return () => ctl.abort();
  }, [activa, intento]);

  const hoy = hoyEnOficina();
  const filas = useMemo(() => filtrarEntregas(pedidos ?? [], filtros), [pedidos, filtros]);
  const enGrupos = filtros.orden === "fechaEntrega" && !filtros.descendente;
  const grupos = useMemo(() => {
    if (!enGrupos) return [];
    return agruparEntregas(filas, hoy).map((g) =>
      g.id === "atrasados" ? { ...g, pedidos: [...g.pedidos].reverse() } : g,
    );
  }, [enGrupos, filas, hoy]);
  const cambiar = useCallback((cambios: Partial<FiltrosEntregasBelen>) => setFiltros((f) => ({ ...f, ...cambios })), []);
  const ordenar = useCallback(
    (clave: Orden) => setFiltros((f) => ({ ...f, orden: clave, descendente: f.orden === clave ? !f.descendente : false })),
    [],
  );

  return (
    <main hidden={!activa} role="tabpanel" id="panel-entregas" aria-labelledby="pestana-entregas" className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-3">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Pedidos por día de entrega</h1>
        <button type="button" disabled={cargando} onClick={() => setIntento((n) => n + 1)} className={`ml-auto ${BOTON}`}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>
      <p className="mb-3 text-[13px] text-text-muted">
        Pedidos pendientes de entregar, por la fecha que pidió el cliente (la solicitada). Pincha uno para abrirlo.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-2.5">
        <CampoBuscar valor={filtros.texto} onCambiar={(texto) => cambiar({ texto })} pista="Pedido, cliente o localidad" />
        <Seleccion
          etiqueta="Delegación"
          valor={filtros.delegacion}
          opciones={[["", "Todas"], ...(Object.entries(DELEGACIONES) as Array<[FiltrosEntregasBelen["delegacion"], string]>)]}
          onCambiar={(delegacion) => cambiar({ delegacion })}
        />
        <FiltroFechas etiqueta="Fecha de entrega" desde={filtros.desde} hasta={filtros.hasta} onCambiar={(desde, hasta) => cambiar({ desde, hasta })} />
        <Seleccion
          etiqueta="Situación"
          valor={filtros.situacion}
          opciones={[["", "Todas"], ["fabrica", "En fábrica"], ["salir", "Esperando salir"]]}
          onCambiar={(situacion) => cambiar({ situacion })}
        />
        {!sonIniciales(filtros) && <BotonLimpiar onClick={() => setFiltros(INICIAL)} />}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-error">{error} <button type="button" onClick={() => setIntento((n) => n + 1)} className="underline">Reintentar</button></p>}
      <p role="status" className="mb-2 px-1 text-[13px] text-text-muted">
        {pedidos === null ? (cargando ? "Cargando pedidos…" : "") : `${filas.length} de ${pedidos.length} pedidos`}
        {!enGrupos && pedidos !== null && (
          <>
            {" · "}
            <button type="button" onClick={() => cambiar({ orden: "fechaEntrega", descendente: false })} className="font-semibold underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
              Volver a agrupar por día
            </button>
          </>
        )}
      </p>
      {pedidos !== null && filas.length === 0 && <p className="px-1 text-sm text-text-muted">No hay pedidos que coincidan con los filtros.</p>}
      {filas.length > 0 && enGrupos && (
        <div className="flex flex-col gap-2.5" aria-busy={cargando}>
          {grupos.map((g) => (
            <TarjetaGrupo key={g.id} grupo={g} hoy={hoy} filtros={filtros} onOrdenar={ordenar} onAbrir={onAbrir} />
          ))}
        </div>
      )}
      {filas.length > 0 && !enGrupos && (
        <div className="tarjeta-of rounded-3xl bg-surface py-2" aria-busy={cargando}>
          <table className="w-full table-fixed border-collapse text-[13px]">
            <Cabecera filtros={filtros} conFecha onOrdenar={ordenar} />
            <tbody>{filas.map((p) => <Fila key={p.codigo} p={p} conFecha onAbrir={onAbrir} />)}</tbody>
          </table>
        </div>
      )}
    </main>
  );
}
