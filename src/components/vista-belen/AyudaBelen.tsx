"use client";

import { useState } from "react";

// ─── «¿Qué significa cada cosa?» ─────────────────────────────────────────────
// La pantalla junta datos de RPS y de OLANET que Belén veía repartidos en sus
// Excels y en otra herramienta, con otros nombres. Iván (10/11/2026): «tengo
// miedo de que la web enseñe todos los datos y ella no sepa qué es qué». Aquí
// está, en palabras de la nave, qué es cada cosa y de dónde sale. Plegado: se
// abre cuando hace falta y no estorba el resto del tiempo.

/** Lo mismo que se lee aquí sale al pasar el ratón por cada sitio: una sola
 *  fuente para las dos cosas. */
export const SIGNIFICA = {
  puntoVerde: "Bultos subidos: se han dado de entrada tantas unidades como lleva la OF. El trabajo está acabado.",
  puntoGranate: "Hay unidades subidas, pero no coinciden con las de la OF (de más o de menos). Revisar.",
  puntoRojo: "Bultos sin subir: todavía no se ha dado de entrada ninguna unidad. El trabajo no está acabado.",
  prioridad: "Prioridad de la OF en RPS.",
  situacion: "Situación de la OF en RPS: con imputaciones (se está trabajando), detenida o finalizada.",
  finalizado: "La operación está acabada: OLANET la dio por finalizada o RPS la tiene al 100 %.",
  interrumpido: "Alguien la empezó (fichó o la cargó en máquina) y no está acabada.",
  sinEmpezar: "Nadie la ha tocado todavía.",
  solicitada: "La fecha que pidió el cliente en el pedido.",
  comprometida: "La fecha que dio Producción (la que apuntas en RPS).",
  llegaMaterial: "Cuándo llega lo último que falta de compras para esta OF.",
  paquete: "Quién hizo el bulto en OLANET y cuándo.",
  logistica: "La instalación programada: quién va y qué día (orden de instalación de RPS).",
  tp: "Trabajo previo a pedido (visita a medir o a ver la obra). Pendiente = sin cerrar en RPS.",
  cot: "Consulta con Oficina Técnica. Pendiente = sin cerrar en RPS.",
  asignado: "Lo que Oficina Técnica apuntó en la OF al plantearla.",
  reservado: "Lo que Almacén ha apartado del stock para esa OF.",
  pedidoProveedor: "Lo que Compras ha pedido al proveedor para la OF; casi siempre es otra cosa que lo asignado (tubo, lacado, portes).",
} as const;

const GRUPOS: Array<{ titulo: string; filas: Array<[string, string, string?]> }> = [
  {
    titulo: "El punto de cada OF (bultos)",
    filas: [
      ["Verde", SIGNIFICA.puntoVerde, "bg-emerald-600"],
      ["Granate", SIGNIFICA.puntoGranate, "bg-rose-900"],
      ["Rojo", SIGNIFICA.puntoRojo, "bg-red-600"],
    ],
  },
  {
    titulo: "Operaciones",
    filas: [
      ["Finalizado", SIGNIFICA.finalizado],
      ["Interrumpido", SIGNIFICA.interrumpido],
      ["Sin empezar", SIGNIFICA.sinEmpezar],
    ],
  },
  {
    titulo: "Fechas",
    filas: [
      ["Solicitada", SIGNIFICA.solicitada],
      ["Comprometida", SIGNIFICA.comprometida],
      ["Llega material", SIGNIFICA.llegaMaterial],
      ["Previsión de logística", SIGNIFICA.logistica],
    ],
  },
  {
    titulo: "Avisos y paquetes",
    filas: [
      ["TP", SIGNIFICA.tp],
      ["COT", SIGNIFICA.cot],
      ["Paquete", SIGNIFICA.paquete],
    ],
  },
  {
    titulo: "Material",
    filas: [
      ["Asignado", SIGNIFICA.asignado],
      ["Reservado", SIGNIFICA.reservado],
      ["Pedido a proveedor", SIGNIFICA.pedidoProveedor],
    ],
  },
];

export function AyudaBelen() {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls="ayuda-belen"
        onClick={() => setAbierta((v) => !v)}
        className="self-end rounded-full px-3 py-1 text-[13px] font-semibold text-text-muted hover:bg-[var(--hero-relleno)] hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {abierta ? "Cerrar la ayuda" : "¿Qué significa cada cosa?"}
      </button>
      {abierta && (
        <div
          id="ayuda-belen"
          className="tarjeta-of mt-1 grid gap-x-6 gap-y-3 rounded-3xl bg-surface px-5 py-4 text-[12.5px] [grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))]"
        >
          {GRUPOS.map((g) => (
            <section key={g.titulo} aria-label={g.titulo}>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">{g.titulo}</h3>
              <dl className="flex flex-col gap-1">
                {g.filas.map(([termino, que, punto]) => (
                  <div key={termino}>
                    <dt className="inline font-semibold">
                      {punto && <span className={`mr-1.5 inline-block size-2.5 rounded-full align-middle ${punto}`} aria-hidden />}
                      {termino}:{" "}
                    </dt>
                    <dd className="inline text-text-muted">{que}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
