"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { filtrarEntregas, type FiltrosEntregasBelen, type PedidoEntregaBelen } from "@/lib/entregas-belen";
import { fechaCorta } from "@/lib/vista-belen";

const INICIAL: FiltrosEntregasBelen = { texto: "", desde: "", hasta: "", situacion: "", orden: "fechaEntrega", descendente: false };
const COLUMNAS: { clave: FiltrosEntregasBelen["orden"]; titulo: string }[] = [
  { clave: "fechaEntrega", titulo: "Fecha de entrega" }, { clave: "codigo", titulo: "Pedido" },
  { clave: "cliente", titulo: "Cliente" }, { clave: "ciudad", titulo: "Localidad" },
  { clave: "situacion", titulo: "Situación" }, { clave: "ofs", titulo: "OF" },
];
const CAMPO = "campo-hundido h-10 rounded-[14px] px-3 text-sm text-text";
const BOTON = "rounded-full bg-[var(--hero-relleno)] px-3.5 py-2 text-sm font-semibold hover:bg-[var(--hero-relleno-encima)] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";
const PAGINA = 100;

export function EntregasBelen({ activa, onAbrir, onVolver }: { activa: boolean; onAbrir: (codigo: string) => void; onVolver: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoEntregaBelen[] | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [filtros, setFiltros] = useState(INICIAL);
  const [pagina, setPagina] = useState(0);
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

  const filas = useMemo(() => filtrarEntregas(pedidos ?? [], filtros), [pedidos, filtros]);
  const ultima = Math.max(0, Math.ceil(filas.length / PAGINA) - 1);
  const actual = Math.min(pagina, ultima);
  const visibles = filas.slice(actual * PAGINA, (actual + 1) * PAGINA);
  const cambiar = useCallback((cambios: Partial<FiltrosEntregasBelen>) => { setFiltros((f) => ({ ...f, ...cambios })); setPagina(0); }, []);

  return (
    <main hidden={!activa} role="tabpanel" id="panel-entregas" aria-labelledby="pestana-entregas" className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-3">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className={BOTON}>← Volver</button>
        <h1 className="text-xl font-bold">Pedidos por día de entrega</h1>
        <button type="button" disabled={cargando} onClick={() => setIntento((n) => n + 1)} className={`ml-auto ${BOTON}`}>{cargando ? "Actualizando…" : "Actualizar"}</button>
      </div>
      <p className="mb-4 text-[13px] text-text-muted">Pedidos AR pendientes de entregar. La misma fecha de entrega que en Coordina para todos.</p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-text-muted">Buscar en la lista
          <input type="search" value={filtros.texto} onChange={(e) => cambiar({ texto: e.target.value })} placeholder="Pedido, cliente o localidad" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">Desde
          <input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">Hasta
          <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">Situación
          <select value={filtros.situacion} onChange={(e) => cambiar({ situacion: e.target.value as FiltrosEntregasBelen["situacion"] })} className={CAMPO}>
            <option value="">Todas</option><option value="fabrica">En fábrica</option><option value="salir">Esperando salir</option>
          </select>
        </label>
        <button type="button" onClick={() => { setFiltros(INICIAL); setPagina(0); }} className={BOTON}>Limpiar filtros</button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-error">{error} <button type="button" onClick={() => setIntento((n) => n + 1)} className="underline">Reintentar</button></p>}
      <p role="status" className="mb-2 text-[13px] text-text-muted">{pedidos === null ? cargando ? "Cargando pedidos…" : "" : `${filas.length} de ${pedidos.length} pedidos`}</p>
      {pedidos !== null && filas.length === 0 && <p className="text-sm text-text-muted">No hay pedidos que coincidan con los filtros.</p>}
      {filas.length > 0 && (
        <div className="tarjeta-of overflow-x-auto rounded-3xl bg-surface" aria-busy={cargando}>
          <table className="w-full border-collapse text-[13px]">
            <thead><tr className="text-left text-[11px] text-text-muted">{COLUMNAS.map((c) => (
              <th key={c.clave} scope="col" aria-sort={filtros.orden === c.clave ? filtros.descendente ? "descending" : "ascending" : "none"} className="px-3 py-3 first:pl-4">
                <button type="button" onClick={() => cambiar({ orden: c.clave, descendente: filtros.orden === c.clave ? !filtros.descendente : false })} className="whitespace-nowrap rounded p-1 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  {c.titulo} <span aria-hidden>{filtros.orden === c.clave ? filtros.descendente ? "↓" : "↑" : "↕"}</span>
                </button>
              </th>
            ))}</tr></thead>
            <tbody>{visibles.map((p, i) => (
              <Fragment key={p.codigo}>
                {filtros.orden === "fechaEntrega" && (i === 0 || p.fechaEntrega !== visibles[i - 1].fechaEntrega) && (
                  <tr><th colSpan={6} scope="rowgroup" className="bg-[var(--hero-relleno)] px-4 py-2 text-left font-semibold">{fechaCorta(p.fechaEntrega) || "Sin fecha de entrega"}</th></tr>
                )}
                <tr className="border-t border-border hover:bg-[var(--hero-relleno)]">
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{fechaCorta(p.fechaEntrega) || "—"}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => onAbrir(p.codigo)} className="whitespace-nowrap rounded font-semibold tabular-nums hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus">{p.codigo}</button></td>
                  <td className="px-3 py-2">{p.cliente ?? "—"}</td><td className="px-3 py-2">{p.ciudad ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{p.situacion === "fabrica" ? "En fábrica" : "Esperando salir"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.ofs}</td>
                </tr>
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
      {ultima > 0 && <nav aria-label="Páginas de pedidos" className="mt-3 flex items-center justify-end gap-3 text-sm">
        <button type="button" disabled={actual === 0} onClick={() => setPagina(actual - 1)} className={BOTON}>Anterior</button>
        <span>Página {actual + 1} de {ultima + 1}</span>
        <button type="button" disabled={actual === ultima} onClick={() => setPagina(actual + 1)} className={BOTON}>Siguiente</button>
      </nav>}
    </main>
  );
}
