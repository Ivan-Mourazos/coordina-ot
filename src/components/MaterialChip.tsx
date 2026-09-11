"use client";

import type { CompraOF, MaterialAsignado } from "@/lib/types";
import { comprasPendientes, estadoMaterial } from "@/lib/types";
import {
  BOTON_DETALLE,
  CabeceraVentana,
  LINEA,
  LISTA,
  VentanaAnclada,
  useVentanaAnclada,
} from "./VentanaAnclada";

// ─── El recorrido del material de la OF ──────────────────────────────────────
// Tres manos, y en la oficina se llamaba "reservar" a la primera:
//
//   1. ASIGNAR   Al plantear: qué material lleva la OF.
//   2. RESERVAR  Almacén: mira lo asignado y lo aparta del stock.
//   3. COMPRAR   Compras: si no hay, lo pide. Ahí salen las fechas.
//
// Esto enseña los tres. Antes solo enseñaba el paso 2, así que una OF con
// material asignado y sin reservar parecía no llevar nada: pasó con
// AR.26.03981, con 20 m de lona y el panel en blanco.
//
// Y van en DOS listas, no en una cadena por línea, porque en RPS no encadenan:
// de las 44 compras de las OF del tablero (11/08/2026) solo UNA correspondía a
// un material asignado. Lo que Compras pide para una OF suele ser otra cosa
// —tubo, herrajes— o trabajo de fuera (lacado, vinilo, portes). Pintar flechas
// entre las dos sería inventarse un dato que no existe.
//
// La ventana es la misma que la del Historial (VentanaAnclada), y las palabras
// también: «asignado en la OF» y «reservado». La cabecera decía "Asignado por
// Oficina Técnica", y en Diseño no se ha comprobado quién apunta ese material:
// lo que sí es seguro es que está en la OF.

/** dd/mm de una fecha ISO, sin pasar por `new Date` (que se lleva el día por
 *  el huso horario). */
const dm = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

/** Cantidades como se leen: el escandallo trae decimales largos
 *  (3,9627416998 m de lona) y aquí solo estorban. */
const num = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");

/** En qué punto está una compra, dicho como se pregunta: ¿ha llegado ya? */
function estadoCompra(c: CompraOF, hoy: string): { texto: string; clase: string } {
  if (c.recibida >= c.pedida && c.pedida > 0) {
    return { texto: "recibido", clase: "text-emerald-700 dark:text-emerald-300" };
  }
  const parcial = c.recibida > 0 ? ` (${c.recibida} de ${c.pedida})` : "";
  if (!c.estimada) return { texto: `pedido${parcial}`, clase: "text-amber-700 dark:text-amber-300" };
  // Tarde es tarde: si la fecha prevista ya pasó y no ha llegado, eso es lo
  // primero que hay que ver.
  const tarde = c.estimada < hoy;
  return {
    texto: `${tarde ? "debía llegar" : "llega"} ${dm(c.estimada)}${parcial}`,
    clase: tarde
      ? "text-red-700 dark:text-red-300"
      : "text-amber-700 dark:text-amber-300",
  };
}

function DetalleMaterial({
  materiales,
  compras,
  hoy,
}: {
  materiales: readonly MaterialAsignado[];
  compras: readonly CompraOF[];
  hoy: string;
}) {
  const reservadas = materiales.filter((m) => estadoMaterial(m) === "reservado").length;

  return (
    <>
      {materiales.length > 0 && (
        <>
          <CabeceraVentana
            titulo="Asignado en la OF"
            cuantos={materiales.length}
            nota={
              reservadas > 0
                ? `${reservadas} reservado${reservadas === 1 ? "" : "s"} por Almacén`
                : "Almacén aún no ha reservado"
            }
            claseNota="text-teal-700 dark:text-teal-300"
          />
          <ul className={LISTA}>
            {materiales.map((m, i) => {
              const estado = estadoMaterial(m);
              return (
                <li
                  key={`${m.descripcion}-${i}`}
                  className={`${LINEA} flex items-start justify-between gap-2`}
                >
                  <span className="min-w-0 text-text">
                    {m.descripcion}
                    {/* Cubierto: no se repite la cantidad, que ya está a la
                        derecha. Lo que hay que ver es lo que NO está. */}
                    {estado === "reservado" && (
                      <span className="block text-[10px] text-teal-700 dark:text-teal-300">
                        reservado por Almacén
                      </span>
                    )}
                    {estado === "aMedias" && (
                      <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                        reservado {num(m.reservada)} de {num(m.cantidad)} · faltan{" "}
                        {num(m.cantidad - m.reservada)}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold ring-1 ${
                      estado === "reservado"
                        ? "bg-teal-600/12 text-teal-700 ring-teal-500/40 dark:text-teal-300"
                        : "bg-surface-2 text-text ring-border"
                    }`}
                  >
                    {num(m.cantidad)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {compras.length > 0 && (
        <>
          {/* Aparte del material asignado y no debajo de cada línea: en RPS no
              van encadenados (ver la cabecera del fichero). Aquí se pide lo que
              falta, y también trabajo de fuera: lacado, vinilo, portes. */}
          <CabeceraVentana
            titulo="Pedido por Compras"
            cuantos={compras.length}
            separada={materiales.length > 0}
          />
          <ul className={LISTA}>
            {compras.map((c, i) => {
              const estado = estadoCompra(c, hoy);
              return (
                <li
                  key={`${c.articulo}-${i}`}
                  className={`${LINEA} flex items-start justify-between gap-2`}
                >
                  <span className="min-w-0 text-text">
                    {c.articulo}
                    <span className={`block text-[10px] ${estado.clase}`}>
                      {estado.texto}
                      {c.fechaPedido && (
                        <span className="text-text-muted"> · se pidió {dm(c.fechaPedido)}</span>
                      )}
                      {c.proveedor && <span className="text-text-muted"> · {c.proveedor}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-text ring-1 ring-border">
                    {c.pedida}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

/** Botón que resume el recorrido del material de la OF y abre el detalle.
 *
 *  El resumen son dos números y, si hay algo comprado sin llegar, un aviso: es
 *  lo que se pregunta de un pedido antes de ponerse con él. */
export function MaterialChip({
  materiales,
  compras = [],
  hoy,
}: {
  materiales?: readonly MaterialAsignado[];
  compras?: readonly CompraOF[];
  /** Hoy en ISO, para saber si una entrega llega tarde. Se pasa de fuera para
   *  no leer el reloj en el render (y para poder probarlo). */
  hoy: string;
}) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();

  const lista = materiales ?? [];
  if (lista.length === 0 && compras.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
        🧵 Sin material asignado
      </span>
    );
  }

  // Solo cuentan las CUBIERTAS: una reservada a medias no esta resuelta.
  const reservadas = lista.filter((m) => estadoMaterial(m) === "reservado").length;
  const aMedias = lista.filter((m) => estadoMaterial(m) === "aMedias").length;
  const todoReservado = lista.length > 0 && reservadas === lista.length;
  // Lo que se ha comprado y no ha llegado: es lo único de aquí que puede parar
  // el trabajo, así que sale en el propio botón sin tener que abrirlo. Se cuenta
  // con el mismo helper que la esquina de la miniatura (types.ts), para que las
  // dos no puedan decir cosas distintas del mismo pedido.
  const { porLlegar, tarde } = comprasPendientes([{ compras: [...compras] }], hoy);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          alternar(e.currentTarget);
        }}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title={
          lista.length === 0
            ? "Sin material asignado, pero con compras para esta OF"
            : todoReservado
              ? "Almacén ha reservado todo el material"
              : [
                  `${lista.length - reservadas} de ${lista.length} sin reservar por Almacén`,
                  aMedias > 0 && `${aMedias} reservado${aMedias === 1 ? "" : "s"} a medias`,
                ]
                  .filter(Boolean)
                  .join(" · ")
        }
        className={`${BOTON_DETALLE} ${
          todoReservado ? "text-teal-700 dark:text-teal-300" : "text-text-muted"
        }`}
      >
        <span aria-hidden>🧵</span>
        Material
        {/* Dos números porque son dos pasos: lo asignado en la OF y lo que
            Almacén ha apartado. Con uno solo no se sabe si falta reservar. */}
        {lista.length > 0 && (
          <span
            className={`rounded-full px-1.5 text-[10px] font-bold text-white ${
              todoReservado ? "bg-teal-600" : aMedias > 0 ? "bg-amber-500" : "bg-gray-500"
            }`}
          >
            {reservadas}/{lista.length}
          </span>
        )}
        {porLlegar > 0 && (
          <span
            className={`rounded-full px-1.5 text-[10px] font-bold text-white ${
              tarde > 0 ? "bg-red-600" : "bg-amber-500"
            }`}
            title={
              tarde > 0
                ? `${tarde} compra${tarde === 1 ? "" : "s"} con la fecha de entrega pasada`
                : `${porLlegar} compra${porLlegar === 1 ? "" : "s"} por llegar`
            }
          >
            📦 {porLlegar}
          </span>
        )}
      </button>

      {anclaje && (
        <VentanaAnclada anclaje={anclaje} onCerrar={cerrar} etiqueta="Material y compras de la OF">
          <DetalleMaterial materiales={lista} compras={compras} hoy={hoy} />
        </VentanaAnclada>
      )}
    </>
  );
}
