"use client";

import { useEffect, useState } from "react";
import type { DocumentoRps } from "@/lib/historial";
import {
  enFrase,
  fechaCorta,
  ordenarOFs,
  resumenPedido,
  type FichandoAhora,
  type LineaDescontada,
  type MaterialPedido,
  type PedidoBelen,
  type TiemposPedido,
} from "@/lib/vista-belen";
import { estadoMaterialDe } from "@/lib/types";
import { AcentoBloque } from "../AcentoBloque";
import { Desplegable } from "../Desplegable";
import { DocumentosBelen } from "./DocumentosBelen";
import { NotasPedido } from "../NotasPedido";
import { MaterialBelen } from "./MaterialBelen";
import { DescontadoBelen } from "./DescontadoBelen";
import { FilaOFBelen } from "./FilaOFBelen";
import { chip, FECHA } from "./estilos-belen";
import { usePestanasOrdenables } from "./usePestanasOrdenables";
import { ImprimirOF } from "./ImprimirOF";

// ─── Un pedido en la pantalla de Belén ───────────────────────────────────────
// Arriba, una cabecera con lo que es del PEDIDO: cliente, lo que comparten
// todas sus OF (entrega, rotulación, fecha solicitada) y una línea con lo que
// falta, para saber de un vistazo si hay que mirar algo. Debajo, una ficha por
// OF; las finalizadas, plegadas al final.
//
// Es el detalle del pedido (Iván, 09/11/2026: «una pantalla de detalle de
// pedido elaborada»): debajo de la cabecera, tres subpestañas para que quepa
// en un monitor pequeño sin un scroll eterno. Documentos y tiempos se piden al
// abrir el pedido, en paralelo, para que cambiar de pestaña sea instantáneo.

// Sin «Tareas y tiempos» desde el 11/11/2026: los fichajes van dentro de cada
// OF desplegada, «Por tarea» o «Por persona».
// «Descontado» desde el 14/11/2026: lo que salió de verdad (imputación de material).
type Seccion = "resumen" | "documentos" | "material" | "notas" | "descontado";
type Carga<T> = { tipo: "cargando" } | { tipo: "listo"; datos: T } | { tipo: "error" };

function useCarga<T>(url: string | null, sacar: (json: unknown) => T): Carga<T> {
  const [carga, setCarga] = useState<Carga<T>>({ tipo: "cargando" });
  useEffect(() => {
    // null = no hay nada que pedir (los documentos de una OF de stock).
    if (url === null) return;
    const ctl = new AbortController();
    fetch(url, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => setCarga({ tipo: "listo", datos: sacar(json) }))
      .catch(() => {
        if (!ctl.signal.aborted) setCarga({ tipo: "error" });
      });
    return () => ctl.abort();
    // sacar es una función pura escrita en el sitio: no cambia lo que se pide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return carga;
}

/** Quién ficha AHORA en las tareas del pedido. Se pregunta cada minuto
 *  mientras la pestaña está a la vista (OLANET rehace su foto cada pocos
 *  minutos: más a menudo no trae nada nuevo). Si falla, se queda lo último. */
const CADA_MS_EN_DIRECTO = 60_000;
function useEnDirecto(pedido: string): FichandoAhora[] {
  const [fichando, setFichando] = useState<FichandoAhora[]>([]);
  useEffect(() => {
    let ctl: AbortController | null = null;
    const pedir = () => {
      if (document.visibilityState !== "visible") return;
      ctl?.abort();
      const este = new AbortController();
      ctl = este;
      fetch(`/api/vista-belen?ahora=${encodeURIComponent(pedido)}`, { signal: este.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { fichando?: FichandoAhora[] }) => setFichando(j.fichando ?? []))
        .catch(() => {});
    };
    pedir();
    const reloj = window.setInterval(pedir, CADA_MS_EN_DIRECTO);
    document.addEventListener("visibilitychange", pedir);
    return () => {
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", pedir);
      ctl?.abort();
    };
  }, [pedido]);
  return fichando;
}

// ─── Recuadros de la cabecera ────────────────────────────────────────────────
// Las cifras que se miran primero, grandes y con color por significado (rojo
// falta, azul no cuadra, verde bien, ámbar en espera). Cada recuadro lleva a
// su pestaña: es por donde se entra al detalle.

type Tono = "rojo" | "azul" | "verde" | "ambar" | "teal" | "neutro";

const TINTA: Record<Tono, string> = {
  rojo: "text-red-700 dark:text-red-300",
  azul: "text-blue-700 dark:text-blue-300",
  verde: "text-emerald-700 dark:text-emerald-300",
  ambar: "text-amber-700 dark:text-amber-300",
  teal: "text-teal-700 dark:text-teal-300",
  neutro: "text-text",
};
const PUNTO: Record<Tono, string> = {
  rojo: "bg-red-500",
  azul: "bg-blue-600 dark:bg-blue-400",
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  teal: "bg-teal-500",
  neutro: "bg-[var(--hero-relleno-pulsado)]",
};

function Cifra({
  etiqueta,
  valor,
  sub,
  tono = "neutro",
  onClick,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  sub?: React.ReactNode;
  tono?: Tono;
  onClick?: () => void;
}) {
  const cuerpo = (
    <>
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-muted">
        <span className={`size-2 rounded-full ${PUNTO[tono]}`} aria-hidden />
        {etiqueta}
      </span>
      <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <span className={`shrink-0 text-[17px] font-bold leading-tight tabular-nums ${TINTA[tono]}`}>{valor}</span>
        {sub && <span className="min-w-0 truncate text-[11.5px] text-text-muted">{sub}</span>}
      </span>
    </>
  );
  // Sin fondo propio: separados por una línea fina. Con fondo, los que son
  // botón y el que no lo es salían de tonos distintos (Iván, 12/11/2026:
  // «iguala las sombras… ahora hay diferentes fondos»).
  const clase =
    "min-w-0 rounded-none! bg-transparent px-3 py-1.5 text-left transition-[transform,background-color] duration-150";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${clase} hover:bg-[var(--hero-relleno)] active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none`}
    >
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

/** El comentario del comercial en UNA línea (monitor pequeño); entero al
 *  pedirlo. */
function ComentarioPedido({ texto }: { texto: string }) {
  const [entero, setEntero] = useState(false);
  return (
    <div className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--detalle)] px-3 py-1.5 text-[13px]">
      <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-text-muted">
        <AcentoBloque tipo="comentario" />
        Comentario
      </span>
      <p className={`min-w-0 flex-1 ${entero ? "whitespace-pre-line" : "truncate"}`} title={entero ? undefined : texto}>
        {texto}
      </p>
      <button
        type="button"
        aria-expanded={entero}
        onClick={() => setEntero((v) => !v)}
        className="shrink-0 text-[12px] font-semibold text-text-muted transition-transform hover:text-text active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none"
      >
        {entero ? "Ver menos" : "Ver todo"}
      </button>
    </div>
  );
}

export function PedidoBelenView({
  pedido,
  ofResaltada,
  miId,
  abrirNotas = false,
  version = 0,
  actualizando = false,
  onActualizar,
}: {
  pedido: PedidoBelen;
  ofResaltada: string | null;
  /** Quién escribe las notas: la sesión. null = sin sesión, notas solo de lectura. */
  miId: string | null;
  abrirNotas?: boolean;
  /** Sube con cada «Actualizar»: vuelve a pedir documentos, tiempos y material. */
  version?: number;
  actualizando?: boolean;
  onActualizar?: () => void;
}) {
  const r = resumenPedido(pedido);
  const { abiertas, finalizadas } = ordenarOFs(pedido.ofs);
  // Si busca una OF finalizada, o no queda ninguna abierta, se despliegan.
  const [verFinalizadas, setVerFinalizadas] = useState(
    abiertas.length === 0 || finalizadas.some((o) => o.of === ofResaltada),
  );

  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
  // Las OF van ENCOGIDAS, en una línea con lo que se mira de un vistazo
  // (Belén, 11/11/2026); al pincharlas se despliega todo. La que se buscó por
  // su número entra ya desplegada.
  // Una OF desplegada a la vez: abrir otra cierra la anterior (Iván,
  // 12/11/2026). Sin «Desplegar todas».
  const [desplegada, setDesplegada] = useState<string | null>(ofResaltada ?? null);
  const alternarOF = (of: string) => setDesplegada((d) => (d === of ? null : of));
  // null = la primera de SU orden de pestañas (usePestanasOrdenables).
  const [eleccion, setSeccion] = useState<Seccion | null>(abrirNotas ? "notas" : null);
  // Una OF de stock no tiene pedido: ni documentos colgados de él, ni notas.
  const stock = !!pedido.stock;
  const docs = useCarga(stock ? null : `/api/pedidos/${encodeURIComponent(pedido.codigo)}/documentos?v=${version}`, (j) =>
    (j as { documentos?: DocumentoRps[] }).documentos ?? [],
  );
  const tiempos = useCarga(`/api/vista-belen?tiempos=${encodeURIComponent(pedido.codigo)}&v=${version}`, (j) =>
    (j as { tiempos: TiemposPedido | null }).tiempos,
  );
  const material = useCarga(`/api/vista-belen?material=${encodeURIComponent(pedido.codigo)}&v=${version}`, (j) =>
    (j as { material: MaterialPedido | null }).material,
  );
  const descontado = useCarga(`/api/vista-belen?descontado=${encodeURIComponent(pedido.codigo)}&v=${version}`, (j) =>
    (j as { descontado: LineaDescontada[] | null }).descontado ?? [],
  );
  const enDirecto = useEnDirecto(pedido.codigo);
  const enDirectoDe = (of: string) => enDirecto.filter((f) => f.of === of);
  // En la pestaña, cómo va lo asignado: lo peor manda, como en el tablero.
  const estadoMat =
    material.tipo === "listo" && material.datos ? estadoMaterialDe(material.datos.ofs) : null;
  // ¿Qué OF tienen algo reservado? Para apagar la casilla «Reserva» donde no
  // hay vale que imprimir. Mientras carga, undefined (se deja marcar).
  const conReserva = (of: string): boolean | undefined =>
    material.tipo !== "listo" ? undefined : !!material.datos?.ofs.find((o) => o.of === of)?.materiales.some((m) => m.reservada > 0);
  const paraImprimir = abiertas.length ? abiertas : pedido.ofs;
  // Los fichajes de cada OF, para su «Por tarea / Por persona». undefined
  // mientras cargan; null si RPS no tiene ninguno.
  const tiemposDe = (of: string) =>
    tiempos.tipo === "cargando" ? undefined : tiempos.tipo === "listo" ? (tiempos.datos?.ofs.find((o) => o.of === of) ?? null) : null;
  const TODAS: { id: Seccion; label: string; extra?: string }[] = [
    { id: "resumen", label: "Resumen", extra: n(r.ofs, "OF", "OF") },
    { id: "documentos", label: "Documentos", extra: docs.tipo === "listo" ? String(docs.datos.length) : undefined },
    {
      id: "material",
      label: "Material",
      extra: estadoMat === "sinReservar" ? "sin reservar" : estadoMat === "aMedias" ? "a medias" : estadoMat === "reservado" ? "reservado" : undefined,
    },
    { id: "notas", label: "Notas" },
    { id: "descontado", label: "Descontado", extra: descontado.tipo === "listo" && descontado.datos.length ? String(descontado.datos.length) : undefined },
  ];
  const SECCIONES = stock ? TODAS.filter((x) => x.id !== "documentos" && x.id !== "notas") : TODAS;
  // Clave aparte para stock: reordenar ahí no debe perder Documentos y Notas.
  const pestanas = usePestanasOrdenables(`coordina.belen.pestanas-${stock ? "stock" : "pedido"}:${miId ?? "local"}`, SECCIONES);
  const seccion: Seccion = eleccion ?? pestanas.items[0].id;

  return (
    <section aria-label={`Pedido ${pedido.codigo}`} className="flex flex-col gap-2">
      <header className="tarjeta-of rounded-3xl bg-surface px-5 pb-3 pt-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[20px] font-bold leading-tight tabular-nums">{pedido.codigo}</h1>
          {stock ? (
            <span className={chip("neutro")} title="OF de fabricación para stock: no cuelga de ningún pedido">
              OF de stock
            </span>
          ) : (
            <span className="text-[15px] font-semibold">{pedido.cliente}</span>
          )}
          {r.tpPendiente > 0 && (
            <span className={chip("aviso")}>
              TP pendiente
            </span>
          )}
          {r.cotPendiente > 0 && (
            <span className={chip("aviso")}>
              COT pendiente
            </span>
          )}
          {onActualizar && (
            <button
              type="button"
              onClick={onActualizar}
              disabled={actualizando}
              title="Vuelve a leer el pedido de RPS: OF, tareas, bultos, material y documentos"
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--hero-relleno)] px-3 text-[12.5px] font-semibold text-text transition-[transform,background-color] hover:bg-[var(--hero-relleno-encima)] active:scale-[.97] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)] motion-reduce:transition-none"
            >
              <svg aria-hidden viewBox="0 0 24 24" className={`size-4 ${actualizando ? "animate-spin motion-reduce:animate-none" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
              </svg>
              {actualizando ? "Actualizando…" : "Actualizar"}
            </button>
          )}
          <span className={onActualizar ? "" : "ml-auto"} title={`Todas las OF ${abiertas.length ? "abiertas " : ""}del pedido`}>
            <ImprimirOF
              ofs={paraImprimir.map((o) => o.of)}
              conReserva={material.tipo !== "listo" ? undefined : paraImprimir.some((o) => conReserva(o.of))}
              etiqueta={paraImprimir.length > 1 ? `Imprimir las ${paraImprimir.length}` : "Imprimir"}
            />
          </span>
          <span className="text-[12.5px] text-text-muted">
            Entrega{" "}
            <b className="font-semibold text-text">
              {r.igual.formaEntrega ? enFrase(r.comunes.formaEntrega) || "—" : "distinta por OF"}
            </b>
            {" · "}Rotulación{" "}
            <b className="font-semibold text-text">
              {r.igual.rotulacion ? r.comunes.rotulacion ?? "sin rotular" : "distinta por OF"}
            </b>
          </span>
        </div>

        <div className="mt-2 grid gap-y-1.5 border-t border-border pt-2 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))] [&>*+*]:border-l! [&>*+*]:border-border">
          <Cifra
            etiqueta="Bultos subidos"
            valor={`${r.bultos.verde} de ${r.ofs}`}
            tono={r.bultos.rojo > 0 ? "rojo" : r.bultos.azul > 0 ? "azul" : "verde"}
            sub={
              r.bultos.verde === r.ofs ? (
                "Todas las OF subidas"
              ) : (
                <>
                  {r.bultos.rojo > 0 && `${n(r.bultos.rojo, "OF", "OF")} sin subir`}
                  {r.bultos.rojo > 0 && r.bultos.azul > 0 && " · "}
                  {r.bultos.azul > 0 && (
                    <span className="font-semibold text-blue-700 dark:text-blue-300">
                      {n(r.bultos.azul, "no cuadra", "no cuadran")}
                    </span>
                  )}
                </>
              )
            }
            onClick={() => setSeccion("resumen")}
          />
          <Cifra
            etiqueta={FECHA.comprometida.rotulo}
            valor={r.comprometida ? fechaCorta(r.comprometida) : "Sin dar"}
            tono={r.comprometida ? "verde" : "neutro"}
            sub={
              <>
                {FECHA.solicitada.rotulo}{" "}
                <b className={`font-semibold ${FECHA.solicitada.tinta}`}>
                  {r.igual.fechaSolicitada ? fechaCorta(r.comunes.fechaSolicitada) || "—" : "distinta por OF"}
                </b>
              </>
            }
          />
          <Cifra
            etiqueta="Material"
            valor={
              estadoMat === "sinReservar"
                ? "Sin reservar"
                : estadoMat === "aMedias"
                  ? "A medias"
                  : estadoMat === "reservado"
                    ? "Reservado"
                    : material.tipo === "listo"
                      ? "Sin asignar"
                      : "…"
            }
            tono={
              estadoMat === "sinReservar"
                ? "rojo"
                : estadoMat === "aMedias"
                  ? "ambar"
                  : estadoMat === "reservado"
                    ? "verde"
                    : "neutro"
            }
            sub={
              r.conMaterialPendiente > 0
                ? `${n(r.conMaterialPendiente, "OF", "OF")} en compras`
                : "Compras al día"
            }
            onClick={() => setSeccion("material")}
          />
          {!stock && <Cifra
            etiqueta="Documentos"
            valor={docs.tipo === "listo" ? docs.datos.length : "…"}
            sub={
              docs.tipo === "listo"
                ? docs.datos.some((d) => d.clase === "Planteamiento")
                  ? "Con planteamiento"
                  : "Sin planteamiento"
                : "Cargando"
            }
            onClick={() => setSeccion("documentos")}
          />}
        </div>

        {pedido.comentarioVenta && <ComentarioPedido texto={pedido.comentarioVenta} />}
      </header>

      {/* La misma píldora que se desliza del resto de Coordina (PildorasDeslizantes). */}
      <div
        role="tablist"
        aria-label="Detalle del pedido"
        className="tira-3d glass-chip mt-1 inline-flex flex-wrap self-start rounded-lg p-[3px]"
      >
        {pestanas.items.map((x, i) => (
          <button
            key={x.id}
            {...pestanas.propsDe(x.id, i)}
            type="button"
            role="tab"
            id={`detalle-${x.id}`}
            aria-selected={seccion === x.id}
            aria-controls={`panel-detalle-${x.id}`}
            onClick={() => setSeccion(x.id)}
            className={`flex h-8 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              seccion === x.id ? "pestana-activa" : "text-text-muted hover:text-text"
            } ${pestanas.claseArrastre(x.id)}`}
          >
            {x.label}
            {x.extra && <span className="text-[11.5px] font-medium tabular-nums text-text-muted">{x.extra}</span>}
          </button>
        ))}
      </div>

      {seccion === "documentos" && (
        <div role="tabpanel" id="panel-detalle-documentos" aria-labelledby="detalle-documentos" className="tarjeta-of rounded-3xl bg-surface px-5 py-4">
          <div data-bloque="documentos" className="cabecera-bloque mb-3 flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">
            <AcentoBloque tipo="documentos" />
            Documentos del pedido
            <span className="ml-auto text-[12.5px] font-normal text-text-muted">Pincha uno para verlo en grande; con las flechas pasas al siguiente</span>
          </div>
          {docs.tipo === "cargando" && (
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))]" aria-label="Cargando documentos">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-[var(--hero-relleno)] motion-reduce:animate-none" />
              ))}
            </div>
          )}
          {docs.tipo === "error" && (
            <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
              No se pudieron leer los documentos de RPS. Prueba otra vez en un momento.
            </p>
          )}
          {docs.tipo === "listo" && <DocumentosBelen documentos={docs.datos} />}
        </div>
      )}

      {seccion === "material" && (
        <div role="tabpanel" id="panel-detalle-material" aria-labelledby="detalle-material">
          {material.tipo === "cargando" && <p className="px-1 text-sm text-text-muted">Cargando material…</p>}
          {material.tipo === "error" && (
            <p role="alert" className="px-1 text-sm font-semibold text-red-700 dark:text-red-300">
              No se pudo leer el material de RPS. Prueba otra vez en un momento.
            </p>
          )}
          {material.tipo === "listo" && material.datos && <MaterialBelen material={material.datos} />}
        </div>
      )}

      {seccion === "descontado" && (
        <div role="tabpanel" id="panel-detalle-descontado" aria-labelledby="detalle-descontado">
          {descontado.tipo === "cargando" && <p className="px-1 text-sm text-text-muted">Cargando material descontado…</p>}
          {descontado.tipo === "error" && (
            <p role="alert" className="px-1 text-sm font-semibold text-red-700 dark:text-red-300">
              No se pudo leer el material descontado de RPS. Prueba otra vez en un momento.
            </p>
          )}
          {descontado.tipo === "listo" && <DescontadoBelen lineas={descontado.datos} />}
        </div>
      )}

      {seccion === "notas" && (
        <div
          role="tabpanel"
          id="panel-detalle-notas"
          aria-labelledby="detalle-notas"
          className="tarjeta-of rounded-3xl bg-surface px-5 py-4"
        >
          <p className="mb-2 rounded-xl bg-[var(--detalle)] px-3 py-2 text-[12.5px] text-text-muted">
            Aquí ves las notas que Oficina Técnica pone <b className="text-text">«para todos»</b> y las tuyas. Lo que
            escribas lo lee todo el equipo.
          </p>
          <NotasPedido pedido={pedido.codigo} miId={miId} operarios={[]} publicaPorDefecto soloParaTodos />
        </div>
      )}

      {seccion === "resumen" && (
      <div role="tabpanel" id="panel-detalle-resumen" aria-labelledby="detalle-resumen" className="flex flex-col gap-2">
      {pedido.ofs.length === 0 && (
        <p className="tarjeta-of rounded-3xl bg-surface px-5 py-4 text-[14px] text-text-muted">
          Este pedido todavía no tiene ninguna OF en RPS.
        </p>
      )}
      {abiertas.map((o) => (
        <FilaOFBelen key={o.of} of={o} resumen={r} resaltada={o.of === ofResaltada} conReserva={conReserva(o.of)} abierta={desplegada === o.of} onAlternar={() => alternarOF(o.of)} tiempos={tiemposDe(o.of)} enDirecto={enDirectoDe(o.of)} />
      ))}
      {finalizadas.length > 0 && (
        <button
          type="button"
          aria-expanded={verFinalizadas}
          onClick={() => setVerFinalizadas((v) => !v)}
          className="self-start rounded-full px-3 py-1 text-[13px] font-semibold text-text-muted transition-[transform,background-color] hover:bg-[var(--hero-relleno)] hover:text-text active:scale-[.97] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span aria-hidden className={`inline-block transition-transform duration-200 motion-reduce:transition-none ${verFinalizadas ? "rotate-90" : ""}`}>
            ▸
          </span>{" "}
          {n(finalizadas.length, "OF finalizada", "OF finalizadas")}
        </button>
      )}
      {/* Se despliegan con la animación de siempre de Coordina (Desplegable). */}
      <Desplegable abierto={verFinalizadas}>
        <div className="flex flex-col gap-2">
          {finalizadas.map((o) => (
            <FilaOFBelen key={o.of} of={o} resumen={r} resaltada={o.of === ofResaltada} conReserva={conReserva(o.of)} abierta={desplegada === o.of} onAlternar={() => alternarOF(o.of)} tiempos={tiemposDe(o.of)} enDirecto={enDirectoDe(o.of)} />
          ))}
        </div>
      </Desplegable>
      </div>
      )}
    </section>
  );
}
