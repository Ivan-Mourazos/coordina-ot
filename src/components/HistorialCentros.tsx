"use client";

import type { HistorialOF, MaterialOF } from "@/lib/historial";
import { fmtCantidad, personasConRol, personasDeOFs, repartirMateriales, repartoDe, tiempoDePersona, type MaterialGastadoOF } from "@/lib/historial";
import { ROL } from "@/lib/estado";
import { fmtDiaMesAno } from "@/lib/fechas";
import {
  CENTRO_TONO,
  NOMBRE_CENTRO,
  agruparCentros,
  centrosConDesglose,
  rangoCentro,
  type HistorialCentro,
} from "@/lib/historial-centros";
import type { SeccionId } from "@/lib/secciones";
import { fmtMin } from "@/lib/estado";
import { TareasDeOF } from "./HistorialTareas";
import { HistorialOFsCompactas } from "./HistorialOFsCompactas";
import {
  BOTON_DETALLE,
  CabeceraVentana,
  LINEA,
  LISTA,
  VentanaAnclada,
  useVentanaAnclada,
} from "./VentanaAnclada";
import { IconoAviso, IconoCaja, IconoMaterial } from "./Iconos";

// ─── Tiempos por centro de la ficha del pedido ──────────────────────────────
// Vivía dentro de HistorialDrawer.tsx. Sale a su fichero porque la consulta
// sin login pintaba la MISMA ficha (hoy usa `TareasPorCentro`), y la pantalla
// del invitado no debe arrastrar el resto del cajón del equipo (notas, parte
// escaneado, avisos).

// ─── La ficha del Historial: el resumen arriba y cada OF con lo suyo ────────
// En el Historial la OF ES la historia del trabajo: quién, cuánto y en qué
// tareas. Se enseñaba dos veces —la lista de OF y, más abajo, «Tareas y
// tiempos» con las mismas OF agrupadas por centro— y para saber cuánto costó
// una había que buscarla en el segundo bloque. Ahora cada OF se despliega con
// sus tareas y su material, y arriba queda solo lo que es del pedido entero:
// el tiempo de cada centro y quién lo echó (decisión de Iván, 09/10/2026).
//
// Solo en el Historial. En Pendientes la OF es donde se TRABAJA (estado,
// avisos, botones) y «Tareas y tiempos» sigue siendo una consulta aparte.

/** Una línea por centro con tiempo: cuánto le costó el pedido y quién lo
 *  echó, con su papel. Es lo único de «Tareas y tiempos» que no es de una OF. */
export function ResumenCentros({ ofs, seccion }: { ofs: HistorialOF[]; seccion: SeccionId }) {
  // Con una sola OF, la OF ya lo dice todo (y al desplegarla, el tiempo de
  // cada centro): el resumen sería el mismo número escrito encima.
  if (new Set(ofs.map((of) => of.codigo)).size <= 1) return null;
  const conDesglose = centrosConDesglose(ofs, seccion);
  const centros = agruparCentros(ofs)
    .filter((c) => c.ofs.length && c.totalMin > 0)
    .sort((a, b) => rangoCentro(a.id, seccion) - rangoCentro(b.id, seccion));
  if (centros.length === 0) return null;
  return (
    <div className="mb-2 space-y-1">
      {centros.map((centro) => (
        <div key={centro.id} className="flex flex-wrap items-baseline gap-x-3 text-xs">
          <span className={`size-2 self-center rounded-full ${CENTRO_TONO[centro.id].punto}`} aria-hidden="true" />
          <span className="font-semibold text-text">{centro.nombre}</span>
          <span className={`font-mono font-semibold tabular-nums ${CENTRO_TONO[centro.id].texto}`}>
            {fmtMin(centro.totalMin)}
          </span>
          {/* Con una sola OF en el centro, quién y cuánto lo dice ya esa OF,
              justo debajo: aquí sería la misma gente otra vez. */}
          {centro.ofs.length > 1 && <PersonasCentro centro={centro} conDesglose={conDesglose} enLinea />}
        </div>
      ))}
    </div>
  );
}

/** Las OF de la ficha del Historial: el resumen por centro y, debajo, cada
 *  OF desplegable con sus tareas y su material. */
export function OFsDeLaFicha({
  ofs,
  seccion,
  gastado,
  onReintentarGastado,
  abiertasDeSalida,
  conGastado = true,
}: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  /** Ver `Materiales`. */
  conGastado?: boolean;
  gastado?: Record<string, MaterialGastadoOF[]> | null;
  onReintentarGastado?: () => void;
  /** Todas desplegadas al montar. Lo usan las pruebas, que miran QUÉ sale
   *  dentro de cada OF y no pueden pulsar. */
  abiertasDeSalida?: boolean;
}) {
  return (
    <>
      <ResumenCentros ofs={ofs} seccion={seccion} />
      <HistorialOFsCompactas
        ofs={ofs}
        seccion={seccion}
        abiertasDeSalida={abiertasDeSalida}
        detalle={(_codigo, centros) => (
          <DetalleOF
            centros={centros}
            gastado={gastado}
            onReintentarGastado={onReintentarGastado}
            conGastado={conGastado}
          />
        )}
      />
    </>
  );
}

/** Lo que se ve al desplegar una OF: sus tareas en cada centro, con quién y
 *  cuánto, y su material. Los centros sin un minuto, plegados en una línea,
 *  como estaban en «Tareas y tiempos». */
export function DetalleOF({
  centros,
  gastado,
  onReintentarGastado,
  conGastado = true,
}: {
  /** Ver `Materiales`. */
  conGastado?: boolean;
  /** Las entradas de ESTA OF, una por centro que trabajó en ella. */
  centros: HistorialOF[];
  gastado?: Record<string, MaterialGastadoOF[]> | null;
  onReintentarGastado?: () => void;
}) {
  // Los centros, en el orden en que la ruta pasa por ellos: el de su primera
  // tarea. Así se lee como el papel de la OF (plantear, diseño, taller…) y no
  // por bloques en un orden cualquiera.
  const inicio = (of: HistorialOF) =>
    Math.min(...(of.tareas ?? []).map((t) => t.ordenRuta ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  const enRuta = [...centros].sort((a, b) => inicio(a) - inicio(b) || 0);
  const conTiempo = enRuta.filter((of) => of.tiempoImputadoMin > 0);
  const sinTiempo = enRuta.filter((of) => of.tiempoImputadoMin <= 0 && of.tareas?.length);
  const nombre = (of: HistorialOF) => NOMBRE_CENTRO[of.centro ?? "ot"];
  // El papel de cada uno en ESTA OF, para ponerlo junto a su nombre en las
  // tareas. Manda lo registrado en CoordinaOT; si no hay, lo deducido de las
  // horas, que se pinta en gris (ver TareasDeOF).
  const rolDe = (entrada: HistorialOF) => {
    // POR CENTRO: cada uno trae su propio papel (en Diseño planteó Carrón; en
    // OT, Iván y revisó Jaime). Con el del primer centro para todos, las
    // tareas de los demás salían sin rótulo (AR.26.04906, 09/10/2026).
    const reparto = repartoDe([entrada]);
    const deducido = entrada.rolDeducido;
    return (nombre: string) => {
      if (reparto.consta) {
        if (reparto.autores.includes(nombre)) return { rol: "plantear" as const, deducido: false };
        if (reparto.revisores.includes(nombre)) return { rol: "revisar" as const, deducido: false };
        return undefined;
      }
      if (deducido?.quienPlanteo.includes(nombre)) return { rol: "plantear" as const, deducido: true };
      if (deducido?.quienReviso.includes(nombre)) return { rol: "revisar" as const, deducido: true };
      return undefined;
    };
  };
  // El material es de la OF, no del centro: vale el primero que lo traiga.
  const conMaterial = centros.find((of) => of.materiales?.length || of.notasProduccion) ?? centros[0];
  return (
    <div className="mt-2 border-t border-border pt-2">
      {conTiempo.map((of) => {
        const tono = CENTRO_TONO[of.centro ?? "ot"];
        return (
          <div key={of.centro ?? "ot"} className="mb-2.5 last:mb-0">
            {/* La franja del centro, teñida de su color: es lo que separa un
                bloque de otro al recorrer la OF con la vista. */}
            <p className={`mb-1 flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-semibold ${tono.franja}`}>
              <span className={`size-2 shrink-0 rounded-full ${tono.punto}`} aria-hidden="true" />
              <span className="flex-1 text-text">{nombre(of)}</span>
              {/* El tiempo del centro solo cuando hay varios: con uno es el de
                  la OF entera, y lo dice ya quien lo echó, justo encima. */}
              {conTiempo.length > 1 && (
                <span className={`font-mono tabular-nums ${tono.texto}`}>{fmtMin(of.tiempoImputadoMin)}</span>
              )}
            </p>
            <div className={`ml-2 border-l-2 pl-2.5 text-[11px] ${tono.raya}`}>
              <TareasDeOF of={of} conColor rolDe={rolDe(of)} claseTiempo={tono.texto} />
            </div>
          </div>
        );
      })}
      {sinTiempo.length > 0 && (
        <details className="mt-1 text-[11px]">
          <summary className="cursor-pointer text-text-muted hover:text-text">
            Sin tiempo echado:{" "}
            {sinTiempo
              .map((of) => {
                const n = of.tareas?.length ?? 0;
                return `${nombre(of)} (${n} ${n === 1 ? "tarea" : "tareas"})`;
              })
              .join(" · ")}
          </summary>
          {sinTiempo.map((of) => (
            <div key={of.centro ?? "ot"} className="mt-1.5">
              <p className="mb-0.5 flex items-center gap-1.5 font-semibold text-text-muted">
                <span className={`size-1.5 rounded-full ${CENTRO_TONO[of.centro ?? "ot"].punto}`} aria-hidden="true" />
                {nombre(of)}
              </p>
              <div className="ml-1 border-l border-border pl-2.5">
                <TareasDeOF of={of} />
              </div>
            </div>
          ))}
        </details>
      )}
      <Materiales
        of={conMaterial}
        gastadoOF={gastado === null ? null : gastado?.[conMaterial.codigo]}
        onReintentarGastado={onReintentarGastado}
        conGastado={conGastado}
      />
    </div>
  );
}

/** Quién trabajó en el centro y cuánto, con el papel de cada uno. Solo donde
 *  dice algo: con una sola OF los nombres ya salen en sus tareas. */
function PersonasCentro({
  centro,
  conDesglose,
  enLinea = false,
}: {
  centro: HistorialCentro;
  conDesglose: ReadonlySet<string>;
  /** Detrás del nombre y el tiempo del centro, en la misma línea (el resumen
   *  de la ficha), en vez de en un renglón propio debajo. */
  enLinea?: boolean;
}) {
  if (!conDesglose.has(centro.id)) return null;
  // El reparto se junta de TODAS las OF del centro, igual que los minutos, y
  // manda el registrado (ver `repartoDe`).
  const reparto = repartoDe(centro.ofs);
  const personas = personasConRol(
    personasDeOFs(centro.ofs),
    reparto.autores,
    reparto.revisores,
    reparto.consta,
    reparto.registrados,
  );
  if (personas.length === 0) return null;
  // Con una sola persona su tiempo ES el del centro, que está justo encima.
  const unaSola = personas.length === 1 && personas[0].min === centro.totalMin;
  return (
    <ul
      className={`${enLinea ? "" : "mb-2"} flex flex-wrap gap-x-3 text-[11px] text-text-muted`}
      aria-label={`Tiempos por persona de ${centro.nombre}`}
      title="Tiempo por persona: el imputado en RPS o, si aún no hay, el fichado en CoordinaOT"
    >
      {personas.map((p) => (
        <li key={p.nombre}>
          <span className="text-text">{p.nombre}</span>
          {/* El papel DELANTE del tiempo: detrás se leía «Iván Sánchez 2m
              planteó», como si el minuto fuera lo planteado. */}
          {p.rol && <span className={ROL[p.rol].texto}> {p.rol === "plantear" ? "planteó" : "revisó"}</span>}
          {!unaSola && <span className="font-mono tabular-nums"> {tiempoDePersona(p)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Material que lleva la OF y lo que Producción apuntó en ella, tras botones
 *  con cantidad. La ventana es la misma que la de Pendientes (VentanaAnclada).
 *
 *  Y las palabras también: «asignado en la OF» es el material que lleva;
 *  «reservado», que sigue habiendo reserva viva en RPS. Aquí se llamaban
 *  "Apuntado" y "Apartado", y el mismo material se nombraba de dos maneras
 *  según la pestaña.
 *
 *  Lo que aquí NO puede decirse es "sin reservar": la reserva se borra al
 *  consumir el material, así que en un pedido cerrado que no quede ninguna no
 *  demuestra que nunca la hubiera. Por eso la línea sin reserva no lleva marca
 *  y la cabecera habla de HOY.
 *
 *  Casi nunca quedará reserva: de las 36 918 OF de OT ya terminadas, 140
 *  conservan reserva y 14 419 conservan material asignado. La reserva viva
 *  sale en los pedidos recién cerrados, que es justo cuando alguien la mira. */
function Materiales({
  of,
  gastadoOF,
  onReintentarGastado,
  conGastado = true,
}: {
  of: HistorialOF;
  /** El botón de Gastado. La lista del Historial no lo lleva: el gastado es
   *  otra consulta a RPS por pedido, y se mira en la ficha. */
  conGastado?: boolean;
  /** undefined = todavía cargando; null = RPS no contestó; [] = cargado y sin líneas. */
  gastadoOF: MaterialGastadoOF[] | null | undefined;
  onReintentarGastado?: () => void;
}) {
  const { apartados, apuntados } = repartirMateriales(of.materiales);
  // El botón de Gastado sale SIEMPRE (ver MaterialGastado); el resto,
  // solo si dice algo.
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {apartados.length + apuntados.length > 0 && (
        <MaterialHistorico of={of.codigo} reservados={apartados} resto={apuntados} />
      )}
      {conGastado && <MaterialGastado of={of.codigo} lineas={gastadoOF} onReintentar={onReintentarGastado} />}
      {of.notasProduccion && <NotasProduccion of={of.codigo} texto={of.notasProduccion} />}
    </div>
  );
}

function MaterialHistorico({
  of,
  reservados,
  resto,
}: {
  of: string;
  reservados: MaterialOF[];
  resto: MaterialOF[];
}) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  const total = reservados.length + resto.length;
  const conReserva = reservados.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Material asignado en la OF. Se marca el que sigue reservado en RPS; la reserva se borra al consumir el material."
        className={`${BOTON_DETALLE} ${conReserva ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}`}
      >
        <IconoMaterial />
        Asignado
        <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-text ring-1 ring-border">
          {total}
        </span>
      </button>
      {anclaje && (
        <VentanaAnclada anclaje={anclaje} onCerrar={cerrar} etiqueta={`Material de la OF ${of}`}>
          <CabeceraVentana
            titulo="Asignado en la OF"
            cuantos={total}
            nota={conReserva ? `${reservados.length} sigue${reservados.length === 1 ? "" : "n"} reservado${reservados.length === 1 ? "" : "s"}` : "Sin reserva viva hoy"}
            claseNota={conReserva ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}
            tituloNota="La reserva se borra al consumir el material: que hoy no quede ninguna no quiere decir que no se reservara."
          />
          <ul className={LISTA}>
            {/* Lo reservado primero. La clave lleva el índice porque el texto
                puede repetirse: una misma OF puede apuntar dos veces la misma
                lona en cantidades distintas (la 0230706 lleva la misma "LONA
                PLASTEL …" con 72,6 y con 2,4). */}
            {[...reservados, ...resto].map((m, i) => (
              <li key={`${i}-${m.texto}`} className={`${LINEA} text-text`}>
                {m.texto}
                {m.apartado && (
                  <span className="block text-[10px] text-teal-700 dark:text-teal-300">
                    sigue reservado
                  </span>
                )}
              </li>
            ))}
          </ul>
        </VentanaAnclada>
      )}
    </>
  );
}

/** Lo que salió de verdad del almacén (RPS, `CPRImputationMaterialMO`). Sale
 *  SIEMPRE, también en una OF sin nada asignado: con el 57 % de las OF que
 *  gastan sin nada apuntado, escondiendo el botón se perdía justo lo que esto
 *  viene a enseñar (spec §1, "Cómo se ve"). */
function MaterialGastado({
  of,
  lineas,
  onReintentar,
}: {
  of: string;
  lineas: MaterialGastadoOF[] | null | undefined;
  onReintentar?: () => void;
}) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  const cargando = lineas === undefined;
  const error = lineas === null;
  const n = lineas?.length ?? 0;
  const ultimaSalida = (lineas ?? []).reduce<string | null>(
    (max, m) => (m.ultimaSalida && (!max || m.ultimaSalida > max) ? m.ultimaSalida : max),
    null,
  );
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Material que salió del almacén para esta OF, según RPS."
        className={`${BOTON_DETALLE} ${n > 0 ? "text-teal-700 dark:text-teal-300" : "text-text-muted"}`}
      >
        <IconoCaja />
        Gastado
        <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-bold text-text ring-1 ring-border">
          {n}
        </span>
      </button>
      {anclaje && (
        <VentanaAnclada anclaje={anclaje} onCerrar={cerrar} etiqueta={`Material gastado de la OF ${of}`}>
          <CabeceraVentana
            titulo="Salido del almacén"
            cuantos={cargando ? undefined : n}
            nota={ultimaSalida ? `Última salida ${fmtDiaMesAno(ultimaSalida)}` : undefined}
          />
          {error && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              No se pudo consultar el material gastado.{" "}
              <button type="button" onClick={onReintentar} className="underline">
                Reintentar
              </button>
            </p>
          )}
          {!error && cargando && <p className="text-[11px] text-text-muted">Consultando…</p>}
          {!error && !cargando && n === 0 && (
            <div className="text-[11px] text-text-muted">
              <p>Todavía no hay salidas apuntadas para esta OF.</p>
              <p className="mt-1">
                El almacén las apunta según sale el material. Las reparaciones y manipulaciones no suelen llevarlo.
              </p>
            </div>
          )}
          {!error && n > 0 && (
            <ul className={LISTA}>
              {lineas!.map((m, i) => (
                <li key={`${i}-${m.material}`} className={`${LINEA} text-text`}>
                  {m.material}
                  <span className="font-mono tabular-nums"> {fmtCantidad(m.gastado)}</span>
                  {m.gastado < 0 && (
                    <span className="block text-[10px] text-amber-700 dark:text-amber-300">
                      devuelto al almacén
                    </span>
                  )}
                  {m.codigo && <span className="block text-[10px] text-text-muted">{m.codigo}</span>}
                </li>
              ))}
            </ul>
          )}
        </VentanaAnclada>
      )}
    </>
  );
}

function NotasProduccion({ of, texto }: { of: string; texto: string }) {
  const { anclaje, alternar, cerrar } = useVentanaAnclada();
  return (
    <>
      <button
        type="button"
        onClick={(e) => alternar(e.currentTarget)}
        aria-expanded={anclaje !== null}
        aria-haspopup="dialog"
        title="Nota que Producción dejó escrita en la OF."
        className={`${BOTON_DETALLE} text-text-muted`}
      >
        <IconoAviso />
        Notas de Producción
      </button>
      {anclaje && (
        <VentanaAnclada
          anclaje={anclaje}
          onCerrar={cerrar}
          etiqueta={`Notas de Producción de la OF ${of}`}
        >
          <CabeceraVentana titulo="Notas de Producción" />
          <p className="whitespace-pre-line">{texto}</p>
        </VentanaAnclada>
      )}
    </>
  );
}
