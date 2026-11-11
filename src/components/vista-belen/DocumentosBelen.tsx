"use client";

import { useMemo, useState } from "react";
import { ordenarDocumentos, type DocBelen } from "@/lib/documentos-belen";
import { comoServir, type DocumentoRps } from "@/lib/historial";
import { VisorDocumento } from "../VisorDocumento";

// ─── Documentos del pedido, en la pantalla de Belén ──────────────────────────
// Rediseño (Iván, 11/11/2026: «dale un rediseño al apartado documentos»):
//   · Arriba, lo que se viene a buscar, en grande: la última versión del
//     planteamiento, el pedido escaneado y el último presupuesto.
//   · Debajo, píldoras para ver todo o una sola clase (con cuántos hay).
//   · La rejilla con miniaturas grandes y nombres que se leen («Versión 2»,
//     «Foto 3 · OM0252579»); las fotos del SAT, juntas por orden.
//   · Pinchando, el visor de siempre de Coordina, con flechas para pasar.
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

function Destacado({ titulo, doc, nota, onAbrir }: { titulo: string; doc: DocBelen; nota?: string; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${doc.descripcion || doc.archivo} — abrir`}
      className={`group flex items-stretch gap-3 overflow-hidden ${CAJA} bg-[var(--detalle)] p-2 text-left transition-[background-color,transform] duration-150 hover:bg-[var(--hero-relleno)] active:scale-[.98] motion-reduce:transition-none ${ENFOQUE}`}
    >
      <Miniatura doc={doc} className="aspect-[3/4] w-24 shrink-0 rounded-xl shadow-[var(--hero-sombra-campo)]" />
      <span className="flex min-w-0 flex-1 flex-col justify-between py-1 pr-1">
        <span>
          <span className="block text-[15px] font-bold">{titulo}</span>
          {doc.nombre !== titulo && <span className="block truncate text-[13px] text-text-muted">{doc.nombre}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {nota && <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200">{nota}</span>}
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-text shadow-[var(--hero-sombra-campo)] transition-colors group-hover:bg-brand-400 group-hover:text-brand-950">
            Abrir
          </span>
        </span>
      </span>
    </button>
  );
}

function Tarjeta({ doc, onAbrir, enSuOrden = false }: { doc: DocBelen; onAbrir: () => void; enSuOrden?: boolean }) {
  // Dentro del bloque de su orden de mantenimiento, la foto no repite la orden.
  const nombre = enSuOrden && doc.orden ? doc.nombre.replace(` · ${doc.orden}`, "") : doc.nombre;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`${doc.descripcion || doc.archivo} — abrir`}
      className={`flex w-full flex-col overflow-hidden ${CAJA} bg-[var(--detalle)] text-left transition-[background-color,transform] duration-150 hover:bg-[var(--hero-relleno)] active:scale-[.98] motion-reduce:transition-none ${ENFOQUE}`}
    >
      <Miniatura doc={doc} className="aspect-[3/4] w-full" />
      <span className="flex items-center gap-1.5 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{nombre}</span>
        {extension(doc.archivo) && <span className="shrink-0 text-[10.5px] font-semibold text-text-muted">{extension(doc.archivo)}</span>}
      </span>
    </button>
  );
}

export function DocumentosBelen({ documentos }: { documentos: DocumentoRps[] }) {
  const { grupos, destacados, sinFichero } = useMemo(() => ordenarDocumentos(documentos), [documentos]);
  const [filtro, setFiltro] = useState<string>("todo");
  // En «Todo», la rejilla NO repite lo que ya va destacado arriba (Iván,
  // 11/11/2026: «se repiten los documentos»); con una clase elegida salen
  // todos los suyos, también el destacado, para comparar versiones.
  const destacadosDocs = destacados.map((d) => d.doc);
  const visibles =
    filtro === "todo"
      ? grupos
          .map((g) => ({ ...g, documentos: g.documentos.filter((d) => !destacadosDocs.includes(d)) }))
          .filter((g) => g.documentos.length > 0)
      : grupos.filter((g) => g.grupo === filtro);
  // El visor pasa por los documentos en el MISMO orden en que se ven: la
  // lista y la posición se guardan juntas al abrir.
  const [visor, setVisor] = useState<{ docs: DocBelen[]; i: number } | null>(null);
  const abrir = (doc: DocBelen) => {
    const vistos = filtro === "todo" ? [...destacadosDocs, ...visibles.flatMap((g) => g.documentos)] : visibles.flatMap((g) => g.documentos);
    // Un destacado de una clase que el filtro esconde: se pasea por todos.
    const docs = vistos.includes(doc) ? vistos : grupos.flatMap((g) => g.documentos);
    setVisor({ docs, i: docs.indexOf(doc) });
  };
  const total = grupos.reduce((n, g) => n + g.documentos.length, 0);
  // Sin nada más que lo destacado, sobran las píldoras y la rejilla.
  const hayMas = total > destacadosDocs.length;

  if (!total) {
    return (
      <p className="text-sm text-text-muted">
        {sinFichero ? "RPS tiene documentos apuntados, pero ninguno con fichero que abrir." : "Este pedido no tiene documentos en RPS."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {destacados.length > 0 && (
        <section aria-label="Lo más buscado" className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]">
          {destacados.map((d) => (
            <Destacado key={d.titulo} titulo={d.titulo} doc={d.doc} nota={d.nota} onAbrir={() => abrir(d.doc)} />
          ))}
        </section>
      )}

      {/* La misma píldora que se desliza del resto de Coordina. */}
      {hayMas && (
      <div role="group" aria-label="Ver" className="tira-3d glass-chip inline-flex flex-wrap self-start rounded-lg p-[3px]">
        {[["todo", "Todo", total] as const, ...grupos.map((g) => [g.grupo, g.grupo, g.documentos.length] as const)].map(([id, rotulo, n]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filtro === id}
            onClick={() => setFiltro(id)}
            className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold ${ENFOQUE} ${filtro === id ? "pestana-activa" : "text-text-muted hover:text-text"}`}
          >
            {rotulo}
            <span className="text-[11.5px] font-medium tabular-nums text-text-muted">{n}</span>
          </button>
        ))}
      </div>
      )}

      {hayMas && filtro === "todo" && destacados.length > 0 && (
        <h3 className="-mb-2 text-[13px] font-semibold text-text-muted">El resto de documentos</h3>
      )}

      {(hayMas || filtro !== "todo") && visibles.map((g) => {
        // Las fotos, en bloques por orden de mantenimiento; lo demás, de una vez.
        const bloques =
          g.grupo === "Fotos"
            ? [...new Set(g.documentos.map((d) => d.orden ?? ""))].map((o) => ({ titulo: o ? `Orden ${o}` : "Fotos sueltas", docs: g.documentos.filter((d) => (d.orden ?? "") === o) }))
            : [{ titulo: "", docs: g.documentos }];
        return (
          <section key={g.grupo} aria-label={g.grupo}>
            {filtro === "todo" && (
              <h3 className="mb-2 flex items-baseline gap-2 text-[14px] font-semibold">
                {destacados.some((d) => d.doc.grupo === g.grupo) ? `${g.grupo} · otras versiones` : g.grupo}
                <span className="text-[12px] font-medium tabular-nums text-text-muted">{g.documentos.length}</span>
              </h3>
            )}
            {bloques.map((b) => (
              <div key={b.titulo || g.grupo} className="mb-3 last:mb-0">
                {b.titulo && bloques.length > 1 && <p className="mb-1.5 text-[12px] font-semibold text-text-muted">{b.titulo}</p>}
                <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(8.5rem,1fr))]">
                  {b.docs.map((d, i) => (
                    <li key={`${i}-${d.url}`}>
                      <Tarjeta doc={d} onAbrir={() => abrir(d)} enSuOrden={bloques.length > 1} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      {sinFichero > 0 && (
        <p className="text-[12px] text-text-muted">
          {sinFichero === 1 ? "Hay 1 documento más" : `Hay ${sinFichero} documentos más`} que RPS tiene apuntados pero sin fichero que abrir.
        </p>
      )}

      {visor && visor.i >= 0 && (
        <VisorDocumento
          documentos={visor.docs}
          indice={visor.i}
          onIr={(i) => setVisor((v) => (v ? { ...v, i } : v))}
          onCerrar={() => setVisor(null)}
        />
      )}
    </div>
  );
}
