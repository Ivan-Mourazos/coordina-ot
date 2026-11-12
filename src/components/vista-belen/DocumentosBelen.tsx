"use client";

import { useMemo, useState } from "react";
import { ordenarDocumentos, type DocBelen } from "@/lib/documentos-belen";
import { comoServir, type DocumentoRps } from "@/lib/historial";
import { VisorDocumento } from "../VisorDocumento";

// ─── Documentos del pedido, en la pantalla de Belén ──────────────────────────
// Una sola lista, por apartados y en el orden del taller: planteamiento,
// pedido escaneado, presupuesto, fotos del SAT y lo demás. Sin bloque de
// destacados ni pestañas (Iván, 12/11/2026: «que salgan algunos y debajo unas
// pestañas con más… hay que simplificarlo»). La versión más reciente lleva su
// etiqueta. Pinchando, el visor de siempre, con flechas para pasar.
// Solo para la vista de Belén: el tablero de OT y el Historial siguen con
// DocumentosRps.

const ENFOQUE = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)]";
// HeroUI hace píldora (999 px) todo botón con un selector que pesa más que una
// clase: las tarjetas, que son botones, salían ovaladas. El «!» deja su forma.
const CAJA = "rounded-2xl!";

function extension(archivo: string): string {
  const ext = archivo.split(".").pop() ?? "";
  return ext && ext.length <= 4 && !/[\s/\\]/.test(ext) ? ext.toUpperCase() : "";
}

/** La primera página o la foto, si el servidor sabe dibujarla; si no, la
 *  extensión en grande (DWG, MSG, XLS). */
function Miniatura({ doc, className }: { doc: DocBelen; className: string }) {
  const [falla, setFalla] = useState(false);
  const dibujable = comoServir(doc.archivo).incrustable;
  const esFoto = doc.grupo === "Fotos";
  if (!dibujable || falla) {
    return (
      <div className={`grid place-items-center bg-[var(--hero-relleno)] ${className}`}>
        <span className="text-[13px] font-bold text-text-muted">{extension(doc.archivo) || "?"}</span>
      </div>
    );
  }
  return (
    // `img` a pelo: ficheros del share servidos por nuestra ruta, sin tamaño
    // conocido. Los papeles se recortan por arriba (cabecera, cliente); las
    // fotos, por el centro.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${doc.url}?mini=1`}
      alt=""
      loading="lazy"
      onError={() => setFalla(true)}
      className={`bg-white object-cover ${esFoto ? "object-center" : "object-top"} ${className}`}
    />
  );
}

function Tarjeta({ doc, onAbrir, enSuOrden = false, nota }: { doc: DocBelen; onAbrir: () => void; enSuOrden?: boolean; nota?: string }) {
  // Dentro del bloque de su orden de mantenimiento, la foto no repite la orden.
  const nombre = enSuOrden && doc.orden ? doc.nombre.replace(` · ${doc.orden}`, "") : doc.nombre;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${doc.descripcion || doc.archivo} — abrir`}
      className={`flex w-full flex-col overflow-hidden ${CAJA} bg-[var(--detalle)] text-left transition-[background-color,transform] duration-150 hover:bg-[var(--hero-relleno)] active:scale-[.98] motion-reduce:transition-none ${ENFOQUE}`}
    >
      <span className="relative block">
        <Miniatura doc={doc} className="aspect-[3/4] w-full" />
        {nota && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm dark:bg-emerald-500 dark:text-emerald-950">
            {nota}
          </span>
        )}
      </span>
      <span className="flex items-start gap-1.5 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 line-clamp-2 text-[12.5px] font-medium leading-snug">{nombre}</span>
        {extension(doc.archivo) && <span className="shrink-0 pt-px text-[10.5px] font-semibold text-text-muted">{extension(doc.archivo)}</span>}
      </span>
    </button>
  );
}

export function DocumentosBelen({ documentos }: { documentos: DocumentoRps[] }) {
  const { grupos, destacados, sinFichero } = useMemo(() => ordenarDocumentos(documentos), [documentos]);
  // «La más reciente», solo donde hay varias versiones para elegir.
  const notas = new Map(destacados.filter((d) => d.nota).map((d) => [d.doc, d.nota!]));
  // El visor pasa por los documentos en el mismo orden en que se ven.
  const todos = grupos.flatMap((g) => g.documentos);
  const [visor, setVisor] = useState<number | null>(null);

  if (!todos.length) {
    return (
      <p className="text-sm text-text-muted">
        {sinFichero ? "RPS tiene documentos apuntados, pero ninguno con fichero que abrir." : "Este pedido no tiene documentos en RPS."}
      </p>
    );
  }

  return (
    // Los papeles (planteamiento, pedido, presupuesto…) van seguidos en la
    // misma fila, cada apartado a su ancho; las fotos, que son muchas, debajo
    // a todo el ancho.
    <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
      {grupos.map((g) => {
        const esFotos = g.grupo === "Fotos";
        // Las fotos, en bloques por orden de mantenimiento; lo demás, de una vez.
        const bloques =
          esFotos
            ? [...new Set(g.documentos.map((d) => d.orden ?? ""))].map((o) => ({ titulo: o ? `Orden ${o}` : "Fotos sueltas", docs: g.documentos.filter((d) => (d.orden ?? "") === o) }))
            : [{ titulo: "", docs: g.documentos }];
        return (
          <section key={g.grupo} aria-label={g.grupo} className={esFotos ? "w-full" : "max-w-full"}>
            <h3 className="mb-2 flex items-baseline gap-2 text-[14px] font-semibold">
              {g.grupo}
              {g.documentos.length > 1 && <span className="text-[12px] font-medium tabular-nums text-text-muted">{g.documentos.length}</span>}
            </h3>
            {bloques.map((b) => (
              <div key={b.titulo || g.grupo} className="mb-3 last:mb-0">
                {b.titulo && bloques.length > 1 && <p className="mb-1.5 text-[12px] font-semibold text-text-muted">{b.titulo}</p>}
                <ul className={esFotos ? "grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))]" : "flex flex-wrap gap-2.5"}>
                  {b.docs.map((d, i) => (
                    <li key={`${i}-${d.url}`} className={esFotos ? "" : "w-[9.5rem]"}>
                      <Tarjeta doc={d} nota={notas.get(d)} onAbrir={() => setVisor(todos.indexOf(d))} enSuOrden={bloques.length > 1} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      {sinFichero > 0 && (
        <p className="w-full text-[12px] text-text-muted">
          {sinFichero === 1 ? "Hay 1 documento más" : `Hay ${sinFichero} documentos más`} que RPS tiene apuntados pero sin fichero que abrir.
        </p>
      )}

      {visor !== null && visor >= 0 && (
        <VisorDocumento documentos={todos} indice={visor} onIr={setVisor} onCerrar={() => setVisor(null)} />
      )}
    </div>
  );
}
