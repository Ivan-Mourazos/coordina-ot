"use client";

import { useState, type ReactNode } from "react";
import type { HistorialOF, PersonaConRol } from "@/lib/historial";
import { personasConRol, personasDeOF, repartoDe, resumenMaterial, tiempoDePersona } from "@/lib/historial";
import { IconoAviso, IconoMaterial } from "./Iconos";
import type { SeccionId } from "@/lib/secciones";
import { centrosConDesglose } from "@/lib/historial-centros";
import { ROL } from "@/lib/estado";

/** Una línea por OF, aunque haya trabajado más de un centro. La sección
 *  seleccionada limita el desglose personal, nunca qué OF se pueden ver.
 *
 *  Las personas van con su tiempo, de más a menos, y sin rol: igual que la
 *  fila del pedido y la ficha.
 *
 *  La pintan la ficha del Historial y el desplegable de su lista (los dos con
 *  `OFsDeLaFicha`). Tuvo una variante en columnas para la lista, alineada con
 *  la fila del pedido; se quitó al llevar ahí las OF de la ficha (09/10/2026).
 *
 *  NO lleva el tiempo por centro en la fila: el reparto por centro y tarea se
 *  ve al desplegar la OF. */
export function HistorialOFsCompactas({ ofs, seccion, detalle, abiertasDeSalida = false, sinMaterial = false }: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  /** Lo que se ve al desplegar cada OF (la ficha: sus tareas y su material).
   *  Sin él, las filas no se despliegan (la lista). */
  detalle?: (codigo: string, centros: HistorialOF[]) => ReactNode;
  /** Todas desplegadas al montar (las pruebas). */
  abiertasDeSalida?: boolean;
  /** Sin el resumen de material (la consulta sin login). */
  sinMaterial?: boolean;
}) {
  const porCodigo = new Map<string, HistorialOF[]>();
  for (const of of ofs) {
    const centros = porCodigo.get(of.codigo) ?? [];
    centros.push(of);
    porCodigo.set(of.codigo, centros);
  }
  // Con una sola OF, abierta de salida: es lo que se viene a ver y no hay
  // nada que elegir. Con varias, plegadas, como las de Pendientes.
  const [abiertas, setAbiertas] = useState<Set<string>>(() =>
    abiertasDeSalida || porCodigo.size === 1 ? new Set(porCodigo.keys()) : new Set(),
  );
  const alternar = (codigo: string) =>
    setAbiertas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(codigo)) nuevo.delete(codigo);
      else nuevo.add(codigo);
      return nuevo;
    });
  if (!ofs.length) return <p className="py-1 text-xs text-text-muted">Sin OF vinculadas al pedido en RPS.</p>;
  // Las personas por OF solo con varias OF: con una, ya están en la fila del
  // pedido, justo encima. Del centro que cuenta (ver `centrosConDesglose`).
  const conDesglose = centrosConDesglose(ofs, seccion);
  const variasOF = porCodigo.size > 1;
  const todasAbiertas = abiertas.size === porCodigo.size;
  return (
    <>
    {detalle && variasOF && (
      <div className="-mt-1 mb-1.5 flex justify-end">
        <button
          type="button"
          onClick={() => setAbiertas(todasAbiertas ? new Set() : new Set(porCodigo.keys()))}
          className="text-[11px] font-semibold text-brand-800 hover:underline dark:text-brand-300"
        >
          {todasAbiertas ? "Plegar todas" : "Abrir todas"}
        </button>
      </div>
    )}
    <ul className="space-y-1.5">
      {[...porCodigo].map(([codigo, centros]) => {
        // Cada OF dice siempre quién la planteó y quién la revisó, aunque el
        // pedido tenga una sola: aquí no hay fila de pedido que ya lo diga.
        const deDesglose = centros.find((of) => conDesglose.has(of.centro ?? "ot"));
        // Con el papel de cada uno, igual que la ficha: aquí salía "Adrián 2m ·
        // Iván 2m" mientras la fila de arriba ya decía quién lo planteó.
        const reparto = deDesglose ? repartoDe([deDesglose]) : { autores: [], revisores: [], consta: false, registrados: [] };
        const conTiempo = deDesglose
          ? personasConRol(
              personasDeOF(deDesglose),
              reparto.autores,
              reparto.revisores,
              reparto.consta,
              reparto.registrados,
            )
          : [];
        // En la FICHA, quien consta en el rol DEDUCIDO sale aunque sus minutos
        // sean 0. RPS guarda minutos enteros, y una revisión de menos de uno
        // queda a cero: el revisor desaparecía de la fila (AR.26.04928,
        // 09/10/2026). Es lo mismo que `personasConRol` ya hace con el rol
        // registrado; aquí falta porque lo deducido no pasa por ahí.
        const deducidos: PersonaConRol[] =
          deDesglose?.rolDeducido && !reparto.consta
            ? [...deDesglose.rolDeducido.quienPlanteo, ...deDesglose.rolDeducido.quienReviso]
                .filter((nombre) => !conTiempo.some((p) => p.nombre === nombre))
                .map((nombre) => ({ nombre, min: 0 }))
            : [];
        const personas = [...conTiempo, ...deducidos];
        const descripcion = centros[0].descripcion;
        // El material y la nota son de la OF, no del centro: vale el primer
        // centro que los traiga.
        // Con la OF DESPLEGADA no salen: sus botones (Asignado, nota de
        // Producción) ya lo dicen justo debajo, con el detalle.
        const desplegada = !!detalle && abiertas.has(codigo);
        const material = desplegada || sinMaterial ? null : resumenMaterial(centros.find((c) => c.materiales?.length)?.materiales);
        const notaProduccion = desplegada ? undefined : centros.find((c) => c.notasProduccion)?.notasProduccion;
        // Desplegada, quién y cuánto lo dicen sus tareas: aquí solo queda quien
        // no sale en ninguna (un revisor registrado en la web que no imputó
        // nada en RPS), para que nadie se pierda y nadie salga dos veces.
        const enTareas = new Set(centros.flatMap((c) => (c.tareas ?? []).flatMap((t) => t.personas.map((x) => x.nombre))));
        const personasFila = desplegada ? personas.filter((x) => !enTareas.has(x.nombre)) : personas;
        // Fila hundida y DOS renglones, como las OF de Pendientes
        // (ver `FilaOF`). Iba todo en una línea con `flex-wrap`, y la gente
        // —"Alberto Carbon planteó 23m · Jaime Vázquez revisó 2m"— se comía el
        // ancho: en un pedido de trece OF la descripción quedaba en "LONA
        // ESCENAR…" y no se distinguía una fila de la siguiente.
        //
        // Arriba QUÉ es y cuánto costó, que es lo que se recorre con la vista;
        // debajo y más apagado, QUIÉN. Así la descripción dispone del ancho
        // entero por larga que sea.
        return (
          <li
            key={codigo}
            className="tarjeta-of rounded-lg bg-surface px-2.5 py-1.5 text-xs ring-1 ring-border"
          >
            {/* Con `detalle` (la ficha) la línea de arriba despliega la OF:
                sus tareas y su material viven dentro de ella. */}
            <div className="flex items-baseline gap-2">
              {detalle ? (
                <button
                  type="button"
                  onClick={() => alternar(codigo)}
                  aria-expanded={abiertas.has(codigo)}
                  className="-mx-1 flex min-w-0 flex-1 items-baseline gap-2 rounded px-1 text-left hover:bg-[var(--glass-highlight)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`size-3 shrink-0 self-center text-text-muted transition-transform motion-reduce:transition-none ${abiertas.has(codigo) ? "" : "-rotate-90"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="shrink-0 font-mono font-semibold text-text">{codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-text" title={descripcion}>
                    {descripcion}
                  </span>
                </button>
              ) : (
                <>
                  <span className="shrink-0 font-mono font-semibold text-text">{codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-text" title={descripcion}>
                    {descripcion}
                  </span>
                </>
              )}
              {/* SIN el total de la OF a la derecha. Lo llevó un rato y se
                  quitó: al lado de "planteó 6m · revisó 11m" aparecía un "20m"
                  suelto que no cuadraba con ninguno de los dos y obligaba a
                  hacer la cuenta para entender que era la suma. El desglose
                  por tarea está al desplegar la OF. */}
            </div>
            {/* Debajo, QUIÉN: autor y revisor con su rótulo de color y su
                tiempo, como en Pendientes. Sin roles registrados (OF de antes
                de fichar en la web) salen los nombres con su tiempo, sin
                rótulo: el rol deducido de las horas es una suposición, y
                pintarla igual que un dato sería mentir con colores. */}
            {(personasFila.length > 0 || material || notaProduccion) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 leading-4">
                {personasFila.map((p) => {
                  if (p.rol) {
                    return (
                      <span key={p.nombre} className="flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ROL[p.rol].chip}`}>
                          {p.rol === "plantear" ? "Autor" : "Revisor"}
                        </span>
                        <span className="text-text">{p.nombre}</span>
                        <span className="text-text-muted">{tiempoDePersona(p)}</span>
                      </span>
                    );
                  }
                  // Deducido de las horas: el mismo rótulo, en GRIS y avisando
                  // de dónde sale. Así se lee quién hizo qué en las OF de antes
                  // del fichaje sin hacerlo pasar por un dato registrado.
                  const deducido = deDesglose?.rolDeducido?.quienPlanteo.includes(p.nombre)
                    ? "Autor"
                    : deDesglose?.rolDeducido?.quienReviso.includes(p.nombre)
                      ? "Revisor"
                      : null;
                  return deducido ? (
                    <span
                      key={p.nombre}
                      className="flex items-center gap-1.5"
                      title={`${deducido} deducido de las horas de RPS: esta OF no se fichó en CoordinaOT`}
                    >
                      <span className="rounded bg-text-muted/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border-strong">
                        {deducido}
                      </span>
                      <span className="text-text">{p.nombre}</span>
                      {/* Con un papel, 0 minutos es «menos de uno», no «nada». */}
                      <span className="text-text-muted">{p.min > 0 ? tiempoDePersona(p) : "<1m"}</span>
                    </span>
                  ) : (
                    <span key={p.nombre} className="text-text-muted">
                      <span className="text-text">{p.nombre}</span> {tiempoDePersona(p)}
                    </span>
                  );
                })}
                {/* Material y nota de Producción, a la vista: vivían solo
                    dentro de «Tareas y tiempos», plegado. Ahí sigue el detalle
                    entero; aquí basta con saber que los hay. */}
                {material && (
                  <span
                    className="ml-auto flex items-center gap-1 text-[11px] text-text-muted"
                    title={material.titulo}
                  >
                    <IconoMaterial className="size-3.5" />
                    {material.texto}
                  </span>
                )}
                {notaProduccion && (
                  <span
                    className={`${material ? "" : "ml-auto"} flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-600/25 dark:text-amber-300`}
                    title={notaProduccion}
                  >
                    <IconoAviso className="size-3" />
                    Nota de Producción
                  </span>
                )}
              </div>
            )}
            {detalle && abiertas.has(codigo) && detalle(codigo, centros)}
          </li>
        );
      })}
    </ul>
    </>
  );
}
