"use client";

import { useState } from "react";

import {
  agruparPaquetes,
  difiereDelPedido,
  enFrase,
  enTitulo,
  fechaCorta,
  fmtDuracion,
  puntoBultos,
  resumenAvisos,
  type OFBelen,
  type PuntoBultos,
  type ResumenPedido,
  type TipoAviso,
} from "@/lib/vista-belen";
import { AcentoBloque, type TipoBloque } from "../AcentoBloque";
import { chip, ESTADO_OPERACION, FECHA, tonoSituacion } from "./estilos-belen";
import { SIGNIFICA } from "./significados";

// ─── Una OF en la pantalla de Belén ──────────────────────────────────────────
// Todo a la vista, sin desplegar nada (Iván, 11/11/2026: «si busca un pedido,
// que vea todo de golpe, en el orden que ella dijo»). De arriba abajo, en el
// orden de Belén (09 y 10/11/2026):
//
//   1. Prioridad, punto de bultos, OF, situación y descripción.
//   2. Las fechas: solicitada (rojo), comprometida (verde), logística (malva,
//      con quién va) y compras (azul).
//   3. El comentario de la OF, en rojo.
//   4. Entrega y rotulación (solo si difieren del pedido), paquete y TP/COT.
//   5. Las tareas: sección, tiempo fichado, último fichaje y estado; al final
//      los TP/COT con su fecha. Es lo que antes se veía al desplegar.
//   6. El material de compras que falta por recibir.
//   7. El texto de la línea del pedido (medidas), recogido.
//
// A 1280 px cabe sin scroll horizontal: las fechas van en su propia franja
// para no robarle ancho a la descripción.

const PUNTO: Record<PuntoBultos, { clase: string; texto: string }> = {
  verde: { clase: "bg-emerald-600 dark:bg-emerald-400", texto: SIGNIFICA.puntoVerde },
  azul: { clase: "bg-blue-600 dark:bg-blue-400", texto: SIGNIFICA.puntoAzul },
  rojo: { clase: "bg-red-600 dark:bg-red-400", texto: SIGNIFICA.puntoRojo },
};

/** Rótulo pequeño con su ayuda al pasar el ratón (subrayado de puntos). */
function Rotulo({ children, ayuda }: { children: React.ReactNode; ayuda?: string }) {
  return (
    <span
      title={ayuda}
      className={`text-[12px] font-medium text-text-muted ${ayuda ? "cursor-help underline decoration-dotted underline-offset-2" : ""}`}
    >
      {children}
    </span>
  );
}

function CabeceraBloque({ tipo, children, derecha }: { tipo: TipoBloque; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <div data-bloque={tipo} className="cabecera-bloque mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-text">
      <AcentoBloque tipo={tipo} />
      {children}
      {derecha && <span className="ml-auto text-[12px] font-medium tabular-nums text-text-muted">{derecha}</span>}
    </div>
  );
}

/** El texto de la línea del pedido (medidas, acabados): a veces es una línea
 *  y a veces veinte. Se ven dos y el resto al pedirlo. */
function DetalleLinea({ texto }: { texto: string }) {
  const [entero, setEntero] = useState(false);
  const largo = texto.length > 160 || texto.split(/\r?\n/).length > 2;
  return (
    <div className="rounded-2xl bg-[var(--detalle)] px-3.5 py-2 text-[12.5px]">
      <Rotulo>Detalle del pedido · </Rotulo>
      <span className={`whitespace-pre-line ${entero || !largo ? "" : "line-clamp-2"}`}>{texto}</span>
      {largo && (
        <button
          type="button"
          aria-expanded={entero}
          onClick={() => setEntero((v) => !v)}
          className="mt-0.5 block text-[12px] font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {entero ? "Ver menos" : "Ver todo"}
        </button>
      )}
    </div>
  );
}

function ChipAviso({ of, tipo }: { of: OFBelen; tipo: TipoAviso }) {
  const r = resumenAvisos(of.avisos, tipo);
  if (!r) return null;
  const detalle = r.avisos
    .map((a) => `${a.codigo} · ${enFrase(a.descripcion)}${a.cerrado ? ` · hecho ${fechaCorta(a.cerrado)}` : " · pendiente"}`)
    .join("\n");
  return (
    <span title={`${tipo === "TP" ? SIGNIFICA.tp : SIGNIFICA.cot}\n\n${detalle}`} className={`${chip(r.pendiente ? "aviso" : "ok")} cursor-help`}>
      <b>{tipo}</b>
      {r.pendiente ? "pendiente de hacer" : `hecho el ${fechaCorta(r.fecha)}`}
    </span>
  );
}

/** Las tareas de la OF con todo lo suyo y, al final, sus TP/COT. */
function Tareas({ of }: { of: OFBelen }) {
  const ops = of.operaciones;
  const hechas = ops.filter((o) => o.estado === "finalizado").length;
  if (!ops.length && !of.avisos.length) return <p className="text-[12.5px] text-text-muted">Sin tareas en RPS.</p>;
  return (
    <div>
      <CabeceraBloque tipo="tareas" derecha={ops.length ? `${hechas} de ${ops.length} acabadas` : undefined}>
        Tareas
      </CabeceraBloque>
      <table className="w-full table-fixed border-collapse text-[13px]">
        <caption className="sr-only">Tareas de la OF {of.of}</caption>
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <th scope="col" className="py-1 pr-2">Tarea</th>
            <th scope="col" className="w-[13rem] px-2 py-1">Sección</th>
            <th scope="col" className="w-[7rem] px-2 py-1 text-right">Tiempo</th>
            <th scope="col" className="w-[8.5rem] whitespace-nowrap px-2 py-1">Último fichaje</th>
            <th scope="col" className="w-[6.5rem] py-1 pl-2 text-right">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {ops.map((op) => {
            const e = ESTADO_OPERACION[op.estado];
            return (
              <tr key={op.codigo}>
                <td className="truncate py-1.5 pr-2" title={enFrase(op.descripcion)}>
                  <span className={`mr-2 inline-block size-2 rounded-full align-middle ${e.punto}`} aria-hidden />
                  <span className="mr-1.5 inline-block w-6 text-right text-[12px] tabular-nums text-text-muted">{op.codigo}</span>
                  <span className={op.estado === "sin_empezar" ? "text-text-muted" : ""}>{enFrase(op.descripcion)}</span>
                </td>
                <td className="truncate px-2 py-1.5" title={[op.seccion, op.maquina].filter(Boolean).join(" · ") || undefined}>
                  {op.seccion ? enTitulo(op.seccion) : op.maquina ?? <span className="text-text-muted">—</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {op.minutos ? fmtDuracion(op.minutos) : <span className="text-text-muted">—</span>}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{fechaCorta(op.ultimoFichaje) || <span className="text-text-muted">—</span>}</td>
                <td
                  className={`py-1.5 pl-2 text-right text-[12px] font-semibold ${e.tinta}`}
                  title={op.estado === "finalizado" ? SIGNIFICA.finalizado : op.estado === "interrumpido" ? SIGNIFICA.interrumpido : SIGNIFICA.sinEmpezar}
                >
                  {e.texto}
                </td>
              </tr>
            );
          })}
          {of.avisos.map((a) => (
            <tr key={`${a.tipo}-${a.codigo}`}>
              <td colSpan={3} className="truncate py-1.5 pr-2" title={enFrase(a.descripcion)}>
                <span className={`${chip("neutro")} mr-2`}>{a.tipo}</span>
                {enFrase(a.descripcion) || a.codigo}
              </td>
              <td className="px-2 py-1.5 tabular-nums">{fechaCorta(a.cerrado) || <span className="text-text-muted">—</span>}</td>
              <td className={`py-1.5 pl-2 text-right text-[12px] font-semibold ${a.cerrado ? ESTADO_OPERACION.finalizado.tinta : ESTADO_OPERACION.interrumpido.tinta}`}>
                {a.cerrado ? "Hecho" : "Pendiente"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lo que falta por recibir de compras: tres a la vista y el resto al pedirlo
 *  (hay OF con treinta líneas de perfiles). */
function Compras({ of }: { of: OFBelen }) {
  const [todas, setTodas] = useState(false);
  if (!of.compras.length) return null;
  const vistas = todas ? of.compras : of.compras.slice(0, 3);
  return (
    <div className="rounded-2xl bg-[var(--detalle)] px-3.5 py-2">
      <CabeceraBloque tipo="recorrido" derecha={`${of.compras.length} ${of.compras.length === 1 ? "línea" : "líneas"}`}>
        Falta por recibir de compras
      </CabeceraBloque>
      <ul className="flex flex-col gap-0.5 text-[12.5px]">
        {vistas.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-medium">{enFrase(c.articulo)}</span>
            <span className="tabular-nums text-text-muted">({c.recibida} de {c.pedida})</span>
            {c.proveedor && <span className="text-text-muted">· {enFrase(c.proveedor)}</span>}
            {c.prevista && <span className={`font-semibold ${FECHA.compras.tinta}`}>· llega {fechaCorta(c.prevista)}</span>}
          </li>
        ))}
      </ul>
      {of.compras.length > 3 && (
        <button
          type="button"
          aria-expanded={todas}
          onClick={() => setTodas((v) => !v)}
          className="mt-1 text-[12px] font-semibold text-text-muted underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {todas ? "Ver menos" : `Ver las ${of.compras.length - 3} restantes`}
        </button>
      )}
    </div>
  );
}

export function FilaOFBelen({ of, resumen, resaltada }: { of: OFBelen; resumen: ResumenPedido; resaltada: boolean }) {
  const punto = PUNTO[puntoBultos(of.cantidad, of.subidas)];
  const noCuadra = of.subidas > 0 && of.subidas !== of.cantidad;
  const textoPunto = noCuadra ? `${punto.texto}: ${of.subidas} de ${of.cantidad}` : punto.texto;
  const otraEntrega = difiereDelPedido(of, resumen, "formaEntrega");
  const otraRotulacion = difiereDelPedido(of, resumen, "rotulacion");
  // Belén (10/11/2026): con el TP o la COT ya hechos, la OF en amarillo, como
  // en su pantalla de antes. Tinte suave sobre la superficie, no la fila
  // chillona (Iván lo aprobó con capturas el 10/11).
  const avisosHechos = of.avisos.length > 0 && of.avisos.every((a) => a.cerrado);
  const paquetes = agruparPaquetes(of.paquetes);

  const fechas = [
    of.fechaSolicitada && { ...FECHA.solicitada, valor: of.fechaSolicitada, ayuda: SIGNIFICA.solicitada, extra: null },
    of.fechaComprometida && { ...FECHA.comprometida, valor: of.fechaComprometida, ayuda: SIGNIFICA.comprometida, extra: null },
    of.logistica?.fecha && { ...FECHA.logistica, valor: of.logistica.fecha, ayuda: SIGNIFICA.logistica, extra: of.logistica.responsable },
    of.fechaCompras && { ...FECHA.compras, valor: of.fechaCompras, ayuda: SIGNIFICA.compras, extra: null },
  ].filter((f): f is NonNullable<Exclude<typeof f, "" | null | undefined>> => !!f);

  return (
    <article
      aria-label={`OF ${of.of}`}
      data-avisos-hechos={avisosHechos || undefined}
      className={`tarjeta-of relative overflow-hidden rounded-3xl ${
        // HeroUI pinta .tarjeta-of con var(--surface): se tiñe la variable.
        avisosHechos ? "bg-surface [--surface:var(--belen-avisos-hechos)]" : "bg-surface"
      } ${resaltada ? "ring-2 ring-[var(--hero-anillo)]" : ""}`}
    >
      <div className="flex flex-col gap-2.5 px-6 py-4">
        {/* 1. Identidad */}
        <div className="flex items-start gap-3">
          <span
            title={SIGNIFICA.prioridad}
            className="grid h-9 min-w-9 shrink-0 cursor-help place-items-center rounded-xl bg-[var(--hero-relleno)] px-1.5 text-[15px] font-bold tabular-nums"
          >
            <span className="sr-only">Prioridad </span>P{of.prioridad ?? "—"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span role="img" aria-label={textoPunto} title={textoPunto} className={`size-3 shrink-0 cursor-help rounded-full ${punto.clase}`} />
              <span className="font-mono text-[16px] font-bold">{of.of}</span>
              <span title={SIGNIFICA.situacion} className={`${chip(tonoSituacion(of.situacion))} cursor-help`}>
                {enFrase(of.situacion)}
              </span>
              {of.linea !== null && <span className="text-[12px] text-text-muted">línea {of.linea}</span>}
              {noCuadra && <span className={chip("info")}>{of.subidas} de {of.cantidad} uds. subidas</span>}
              <a
                href={`/vista-belen/imprimir?ofs=${encodeURIComponent(of.of)}`}
                target="_blank"
                rel="noopener"
                title="La hoja de ruta y el vale de material, como en RPS, con sus códigos de barras"
                className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--hero-relleno)] px-3 py-1 text-[12.5px] font-semibold text-text transition-[transform,background-color] hover:bg-[var(--hero-relleno-encima)] active:scale-[.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <path d="M6 14h12v7H6z" />
                </svg>
                Imprimir OF y reserva
              </a>
            </div>
            <p className="mt-1 text-[14.5px] font-medium">{enFrase(of.descripcion)}</p>
          </div>
        </div>

        {/* 2. Fechas, en su orden y con sus colores */}
        {fechas.length > 0 && (
          <dl className="flex flex-wrap gap-1.5">
            {fechas.map((f) => (
              <div key={f.rotulo} className="flex items-baseline gap-2 rounded-xl bg-[var(--detalle)] px-3 py-1">
                <dt>
                  <Rotulo ayuda={f.ayuda}>{f.rotulo}</Rotulo>
                </dt>
                <dd className={`text-[15px] font-bold tabular-nums ${f.tinta}`}>
                  {fechaCorta(f.valor)}
                  {f.extra && <span className="ml-1.5 text-[12.5px] font-semibold">· {f.extra}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* 3. Comentario de la OF */}
        {of.notas && (
          <p className="flex items-start gap-2 rounded-xl bg-red-500/8 px-3 py-2 text-[13px] font-semibold text-red-800 dark:bg-red-400/10 dark:text-red-200">
            <AcentoBloque tipo="comentario" />
            <span>{of.notas}</span>
          </p>
        )}

        {/* 4. Entrega, rotulación, paquete y TP/COT */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          {otraEntrega && (
            <span>
              <Rotulo>Entrega</Rotulo> <b className="font-semibold">{enFrase(of.formaEntrega) || "—"}</b>
            </span>
          )}
          {otraRotulacion && (
            <span>
              <Rotulo>Rotulación</Rotulo> <b className="font-semibold">{of.rotulacion ?? "sin rotular"}</b>
            </span>
          )}
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <Rotulo ayuda={SIGNIFICA.paquete}>Paquete</Rotulo>
            {paquetes.length ? (
              paquetes.map((p, i) => (
                <b key={i} className="font-semibold">
                  {p.paquetes} {p.paquetes === 1 ? "paquete" : "paquetes"}
                  {p.unidades > 0 && <span className="font-normal text-text-muted"> ({p.unidades} uds.)</span>}
                  {" · "}
                  {p.quien ?? "—"} · <span className="tabular-nums">{fechaCorta(p.dia)}</span>
                  {i < paquetes.length - 1 && ";"}
                </b>
              ))
            ) : (
              <span className="text-text-muted">sin paquete todavía</span>
            )}
          </span>
          {of.avisos.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              <ChipAviso of={of} tipo="TP" />
              <ChipAviso of={of} tipo="COT" />
            </span>
          )}
        </div>

        {/* 5. Tareas */}
        <Tareas of={of} />

        {/* 6. Compras pendientes */}
        <Compras of={of} />

        {/* 7. Medidas y acabados de la línea */}
        {of.detalleLinea && <DetalleLinea texto={of.detalleLinea} />}
      </div>
    </article>
  );
}
