import type { ReactNode } from "react";
import type { HistorialOF } from "@/lib/historial";
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
 *  Con `columnas` (las de la lista) cada OF cae debajo de lo mismo en la fila
 *  del pedido: código, descripción y gente bajo «Quién». `accion` va en la
 *  última columna de la primera OF, bajo el tiempo del pedido.
 *
 *  NO lleva el tiempo por centro. Lo llevaba, y en un pedido de una sola OF
 *  —que son casi todos— repetía el total que la fila del pedido enseña justo
 *  encima. El reparto entre centros vive en «Tareas y tiempos», que además lo
 *  desglosa por tarea y por persona. */
export function HistorialOFsCompactas({ ofs, seccion, columnas, accion }: {
  ofs: HistorialOF[];
  seccion: SeccionId;
  columnas?: string;
  accion?: ReactNode;
}) {
  const porCodigo = new Map<string, HistorialOF[]>();
  for (const of of ofs) {
    const centros = porCodigo.get(of.codigo) ?? [];
    centros.push(of);
    porCodigo.set(of.codigo, centros);
  }
  if (!ofs.length) return <p className="py-1 text-xs text-text-muted">Sin OF vinculadas al pedido en RPS.</p>;
  // Las personas por OF solo con varias OF: con una, ya están en la fila del
  // pedido, justo encima. Del centro que cuenta (ver `centrosConDesglose`).
  const conDesglose = centrosConDesglose(ofs, seccion);
  const variasOF = porCodigo.size > 1;
  return (
    <ul className="space-y-1.5">
      {[...porCodigo].map(([codigo, centros], i) => {
        // En la LISTA, con una sola OF la gente ya está en la fila del pedido,
        // justo encima. En la FICHA no hay esa fila: ahí cada OF dice siempre
        // quién la planteó y quién la revisó, aunque el pedido tenga una sola.
        const deDesglose =
          variasOF || !columnas ? centros.find((of) => conDesglose.has(of.centro ?? "ot")) : undefined;
        // Con el papel de cada uno, igual que la ficha: aquí salía "Adrián 2m ·
        // Iván 2m" mientras la fila de arriba ya decía quién lo planteó.
        const reparto = deDesglose ? repartoDe([deDesglose]) : { autores: [], revisores: [], consta: false, registrados: [] };
        const personas = deDesglose
          ? personasConRol(
              personasDeOF(deDesglose),
              reparto.autores,
              reparto.revisores,
              reparto.consta,
              reparto.registrados,
            )
          : [];
        const descripcion = centros[0].descripcion;
        // El material y la nota son de la OF, no del centro: vale el primer
        // centro que los traiga.
        const material = resumenMaterial(centros.find((c) => c.materiales?.length)?.materiales);
        const notaProduccion = centros.find((c) => c.notasProduccion)?.notasProduccion;
        const gente = personas.length > 0 && (
          <span className="text-text-muted" title="Tiempo por persona en esta sección: el imputado en RPS o, si aún no hay, el fichado en CoordinaOT">
            {personas.map((p, n) => (
              <span key={p.nombre}>
                {n > 0 && " · "}
                <span className="text-text">{p.nombre}</span>
                {p.rol && (
                  <span className={ROL[p.rol].texto}> {p.rol === "plantear" ? "planteó" : "revisó"}</span>
                )}{" "}
                {tiempoDePersona(p)}
              </span>
            ))}
          </span>
        );
        const accionAqui = i === 0 ? accion : null;
        if (columnas) {
          return (
            // HUNDIDAS sobre el detalle, como las OF de Pendientes (ver
            // `FilaOF`): la fila del pedido ya está hundida al desplegarse, y
            // sus OF dentro necesitan despegarse de ese fondo para leerse como
            // lo que cuelga de ella. Sin esto eran texto suelto sobre el mismo
            // color y no se veía dónde acababa una OF y empezaba la siguiente.
            <li
              key={codigo}
              className={`${columnas} rounded-lg bg-surface px-2.5 py-1.5 text-xs ring-1 ring-border`}
            >
              <span aria-hidden="true" />
              <span className="font-mono font-semibold text-text">{codigo}</span>
              <span className="min-w-0 truncate text-text-muted" title={descripcion}>{descripcion}</span>
              {/* La columna de la familia va vacía en las OF: la familia es del
                  pedido, no de cada una. Se conserva para que lo de debajo siga
                  cayendo bajo su columna de la fila. */}
              <span aria-hidden="true" />
              <span className="min-w-0 leading-4">{gente}</span>
              {/* El botón, bajo el tiempo del pedido. Pegado a la descripción
                  le comía sitio al texto de la OF, que es lo que se viene a
                  leer aquí. */}
              <span className="flex justify-end">{accionAqui}</span>
            </li>
          );
        }
        // EN LA FICHA: fila hundida y DOS renglones, como las OF de Pendientes
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
            className="rounded-lg bg-surface px-2.5 py-1.5 text-xs ring-1 ring-border"
          >
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono font-semibold text-text">{codigo}</span>
              <span className="min-w-0 flex-1 truncate text-text" title={descripcion}>
                {descripcion}
              </span>
              {accionAqui}
              {/* SIN el total de la OF a la derecha. Lo llevó un rato y se
                  quitó: al lado de "planteó 6m · revisó 11m" aparecía un "20m"
                  suelto que no cuadraba con ninguno de los dos y obligaba a
                  hacer la cuenta para entender que era la suma. El desglose
                  entero está en «Tareas y tiempos», justo debajo. */}
            </div>
            {/* Debajo, QUIÉN: autor y revisor con su rótulo de color y su
                tiempo, como en Pendientes. Sin roles registrados (OF de antes
                de fichar en la web) salen los nombres con su tiempo, sin
                rótulo: el rol deducido de las horas es una suposición, y
                pintarla igual que un dato sería mentir con colores. */}
            {(personas.length > 0 || material || notaProduccion) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 leading-4">
                {personas.map((p) => {
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
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-muted ring-1 ring-border">
                        {deducido}
                      </span>
                      <span className="text-text">{p.nombre}</span>
                      <span className="text-text-muted">{tiempoDePersona(p)}</span>
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
          </li>
        );
      })}
    </ul>
  );
}
