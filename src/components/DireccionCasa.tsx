"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ESTADOS_CONSULTA, type EstadoConsulta, type PedidoConsulta } from "@/lib/consulta";
import type { HistorialOF } from "@/lib/historial";
import { fmtDiaMes, fmtDiaMesAno } from "@/lib/fechas";
import { hoyISO, type Familia } from "@/lib/types";
import { SECCION_POR_DEFECTO } from "@/lib/secciones";
import { repartirEtiquetas } from "@/lib/linea-tiempo";
import { BloqueLista } from "./BloqueLista";
import { FilaDesplegable } from "./FilaDesplegable";
import { FamiliaTag } from "./FamiliaTag";
import { OFsDeLaFicha } from "./HistorialCentros";
import { PedidoCodigo } from "./PedidoCodigo";
import { Select } from "./Select";

// ─── «Toda la casa»: los pedidos de toda la fábrica, para Dirección ─────────
// Pendientes enseña lo que tiene OT o Diseño; un pedido solo de taller no sale
// en ninguna lista. Dirección supervisa la casa entera, y la pestaña «Pedidos»
// del invitado (con su «Siguiente: X») no le convenció: quiere verlo como el
// equipo en Pendientes (09/10/2026). Esto es esa lista con esa forma —una fila
// por pedido con su recorrido de fechas— y, al desplegar, sus OF con las
// tareas por centro: hechas con quién y cuánto, y las que faltan a 0m.
//
// Sale del índice de toda la casa (el de la consulta pública: entregado o no,
// en fábrica o esperando salir, fechas). PENDIENTE ES SIN ENTREGAR, no «con
// tareas sin cerrar»: hay 109.566 pedidos entregados con alguna tarea que
// nadie cerró en OLANET (medido en 09/2026).
//
// Prototipo para enseñárselo a Esteban: el tiempo por sección va en el
// desplegable, no en la fila (en la fila costaría otra consulta a RPS por
// página).

const COLUMNAS =
  "grid grid-cols-[32px_minmax(220px,28rem)_minmax(160px,14rem)_minmax(360px,1fr)] items-center gap-x-3";

export function DireccionCasa({ onAbrirPedido }: { onAbrirPedido: (codigo: string) => void }) {
  // De salida, lo que sale hoy y en los próximos 14 días: lo que se mira para
  // la semana. Con «En fábrica» arriba quedaban pedidos de 2021 sin entregar,
  // que son reales pero no son lo primero; están en «Fuera de plazo».
  const [estado, setEstado] = useState<EstadoConsulta>("proximas");
  const [q, setQ] = useState("");
  const [familia, setFamilia] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoConsulta[]>([]);
  const [familias, setFamilias] = useState<string[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [page, setPage] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const seq = useRef(0);

  const cargar = useCallback(
    async (pagina: number, nueva: boolean) => {
      const mio = ++seq.current;
      setCargando(true);
      setAviso(null);
      const sp = new URLSearchParams({ estado, page: String(pagina) });
      if (q.trim()) sp.set("q", q.trim());
      if (familia) sp.set("familia", familia);
      try {
        const r = await fetch(`/api/publico/pedidos?${sp}`, { cache: "no-store" });
        const d = await r.json();
        if (mio !== seq.current) return;
        if (r.status === 503) {
          setAviso("Preparando la lista de pedidos (tarda medio minuto al arrancar el servidor). Vuelve a probar enseguida.");
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        setPedidos((prev) => (nueva ? d.pedidos : [...prev, ...d.pedidos]));
        setHayMas(Boolean(d.hasMore));
        setFamilias(d.familias ?? []);
        setPage(pagina);
      } catch {
        if (mio === seq.current) setAviso("No se pudieron cargar los pedidos.");
      } finally {
        if (mio === seq.current) setCargando(false);
      }
    },
    [estado, q, familia],
  );

  // Cada cambio de filtro empieza de nuevo; la búsqueda espera a que se deje
  // de teclear.
  useEffect(() => {
    const t = setTimeout(() => void cargar(0, true), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [cargar, q]);

  const hoy = hoyISO();

  return (
    <div className="px-5 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="relative w-72">
          <span className="sr-only">Buscar pedidos de toda la casa</span>
          <input
            autoComplete="off"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pedido, cliente, obra u OF…"
            className="glass-chip h-9 w-full rounded-lg px-3 text-sm text-text outline-none placeholder:text-text-muted focus:border-focus"
          />
        </label>
        <div className="flex items-center gap-2">
          <span id="casa-estado" className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Estado</span>
          <Select
            value={estado}
            onChange={(v) => setEstado((v as EstadoConsulta | null) ?? "proximas")}
            placeholder={null}
            ariaLabelledBy="casa-estado"
            options={ESTADOS_CONSULTA.map((e) => ({ value: e.id, label: e.label }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span id="casa-familia" className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Familia</span>
          <Select
            value={familia}
            onChange={setFamilia}
            placeholder="Todas"
            etiquetaVaciar="Todas las familias"
            acentuarActivo
            ariaLabelledBy="casa-familia"
            options={[...new Set([...familias, ...(familia ? [familia] : [])])].map((f) => ({ value: f, label: f }))}
          />
        </div>
        <p className="ml-auto text-[11px] text-text-muted">
          Toda la fábrica, no solo la oficina.
          {!cargando && ` ${pedidos.length}${hayMas ? " y más" : ""} ${pedidos.length === 1 ? "pedido" : "pedidos"}.`}
        </p>
      </div>

      {aviso && <p className="py-4 text-center text-sm text-text-muted">{aviso}</p>}

      <BloqueLista
        columnas={COLUMNAS}
        desbordaHorizontal
        sinCaja
        cabecera={
          <>
            <span />
            <span>Pedido · cliente</span>
            <span>Estado</span>
            <span>
              <span className="block">Recorrido</span>
              <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-text-muted">
                llegada · <span className="font-semibold text-text">solicitada</span> · entregado
              </span>
            </span>
          </>
        }
      >
        {pedidos.map((p) => (
          <FilaCasa key={p.codigo} p={p} hoy={hoy} onAbrirPedido={onAbrirPedido} />
        ))}
      </BloqueLista>

      {!cargando && !aviso && pedidos.length === 0 && (
        <p className="py-6 text-center text-sm text-text-muted">Ningún pedido con estos filtros.</p>
      )}
      {cargando && <p className="py-4 text-center text-sm text-text-muted">Cargando…</p>}
      {hayMas && !cargando && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => void cargar(page + 1, false)}
            className="chip-3d rounded-lg px-4 py-1.5 text-xs font-semibold text-text"
          >
            Ver más
          </button>
        </div>
      )}
    </div>
  );
}

function FilaCasa({ p, hoy, onAbrirPedido }: { p: PedidoConsulta; hoy: string; onAbrirPedido: (codigo: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const [ofs, setOfs] = useState<HistorialOF[] | null>(null);
  const [error, setError] = useState(false);

  const alternar = async () => {
    const abre = !abierta;
    setAbierta(abre);
    if (!abre || ofs) return;
    try {
      const r = await fetch(`/api/historial/${encodeURIComponent(p.codigo)}?seccion=${SECCION_POR_DEFECTO}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setOfs(((await r.json()) as { ofs: HistorialOF[] }).ofs);
    } catch {
      setError(true);
    }
  };

  return (
    <FilaDesplegable
      columnas={COLUMNAS}
      abierta={abierta}
      onAlternar={alternar}
      etiqueta={p.codigo}
      idDetalle={`casa-${p.codigo}`}
      tarjeta
      celdas={
        <>
          <div className="pointer-events-none min-w-0">
            <div className="flex items-baseline gap-1.5">
              <PedidoCodigo codigo={p.codigo} onAbrir={() => onAbrirPedido(p.codigo)} />
              {(p.nOf ?? 0) > 1 && <span className="text-[11px] text-text-muted">· {p.nOf} OF</span>}
              {p.familias.slice(0, 1).map((f) => (
                <FamiliaTag key={f} familia={f as Familia} />
              ))}
            </div>
            <p className="truncate text-[11px] text-text">
              {p.cliente ?? "—"}
              {p.ciudadEntrega && <span className="text-text-muted"> · {p.ciudadEntrega}</span>}
            </p>
          </div>
          <EstadoCasa p={p} />
          <RecorridoCasa p={p} hoy={hoy} />
        </>
      }
      detalle={
        <div className="py-1">
          {error && <p className="text-xs text-error">No se pudo cargar el pedido.</p>}
          {!error && !ofs && <p className="text-xs text-text-muted">Cargando OF…</p>}
          {ofs && <OFsDeLaFicha ofs={ofs} seccion={SECCION_POR_DEFECTO} conGastado={false} enColumnas />}
        </div>
      }
    />
  );
}

/** En qué punto está el pedido, en palabras de la casa: en fábrica, esperando
 *  salir o entregado tal día. Fuera de plazo, en rojo. */
function EstadoCasa({ p }: { p: PedidoConsulta }) {
  const texto =
    p.situacion === "entregado"
      ? p.fechaEntregado
        ? `Entregado el ${fmtDiaMesAno(p.fechaEntregado)}`
        : "Entregado"
      : p.situacion === "salir"
        ? "Fabricado, esperando salir"
        : "En fábrica";
  const tono =
    p.situacion === "entregado" ? "text-emerald-700 dark:text-emerald-300" : p.situacion === "salir" ? "text-cyan-700 dark:text-cyan-300" : "text-text";
  return (
    <div className="pointer-events-none min-w-0 text-[11px] leading-4">
      <p className={`font-semibold ${tono}`}>{texto}</p>
      {p.fueraDePlazo && <p className="font-semibold text-red-700 dark:text-red-400">Fuera de plazo</p>}
    </div>
  );
}

/** Llegada → solicitada → entregado (o hoy, si no ha salido), a escala. La
 *  misma idea que el recorrido de Pendientes, con las fechas que tiene toda la
 *  casa: la planificación es de cada tarea y aquí no hay una sola. */
function RecorridoCasa({ p, hoy }: { p: PedidoConsulta; hoy: string }) {
  const llegada = p.fechaPedido ?? null;
  const solicitada = p.fechaEntrega;
  const fin = p.situacion === "entregado" ? p.fechaEntregado : hoy;
  const puntos = [llegada, solicitada, fin].filter((d): d is string => Boolean(d));
  if (puntos.length < 2) return <div className="text-[11px] text-text-muted">Sin fechas</div>;
  const t = (d: string) => new Date(d + "T00:00:00").getTime();
  const min = Math.min(...puntos.map(t));
  const max = Math.max(...puntos.map(t));
  const pos = (d: string) => (max === min ? 0 : ((t(d) - min) / (max - min)) * 100);
  const tarde = solicitada && fin && fin > solicitada;
  // Los PUNTOS van a escala; los TEXTOS se separan lo justo para no pisarse
  // (igual que en Pendientes, ver `repartirEtiquetas`).
  const hitos = [llegada, solicitada, fin];
  const visibles = hitos.map((d) => (d ? pos(d) : null));
  const separadas = repartirEtiquetas(visibles.filter((x): x is number => x !== null), 9, 3);
  let k = 0;
  const texto = visibles.map((x) => (x === null ? null : separadas[k++]));
  return (
    <div className="pointer-events-none relative h-8 w-full">
      <div className="absolute inset-x-0 top-5 h-0.5 rounded-full bg-[var(--glass-highlight)]" />
      {llegada && fin && (
        <div
          className={`absolute top-5 h-0.5 rounded-full ${tarde ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ left: `${pos(llegada)}%`, width: `${pos(fin) - pos(llegada)}%` }}
        />
      )}
      {llegada && <Hito x={pos(llegada)} xTexto={texto[0]!} etiqueta={fmtDiaMes(llegada)} clase="bg-progress-pending" />}
      {solicitada && <Hito x={pos(solicitada)} xTexto={texto[1]!} etiqueta={fmtDiaMes(solicitada)} clase="bg-brand-500" fuerte />}
      {fin && (
        <Hito
          x={pos(fin)}
          xTexto={texto[2]!}
          etiqueta={p.situacion === "entregado" ? fmtDiaMes(fin) : "hoy"}
          clase={p.situacion === "entregado" ? "bg-emerald-600" : "bg-text"}
        />
      )}
    </div>
  );
}

function Hito({
  x,
  xTexto,
  etiqueta,
  clase,
  fuerte = false,
}: {
  x: number;
  xTexto: number;
  etiqueta: string;
  clase: string;
  fuerte?: boolean;
}) {
  return (
    <>
      <span
        className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] ${fuerte ? "font-semibold text-text" : "text-text-muted"}`}
        style={{ left: `${xTexto}%` }}
      >
        {etiqueta}
      </span>
      <span className={`absolute top-[17px] block size-2 -translate-x-1/2 rounded-full ${clase}`} style={{ left: `${x}%` }} />
    </>
  );
}
