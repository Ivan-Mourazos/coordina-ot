"use client";

import { useMemo, useState } from "react";
import { comoServir, type DocumentoRps } from "@/lib/historial";
import { Desplegable } from "./Desplegable";
import { VisorDocumento, type DocumentoAbrible } from "./VisorDocumento";

// ─── Lo que RPS tiene colgado del pedido, en rejilla ─────────────────────────
// Una sola pinta para los dos sitios donde salen estos documentos: la ficha del
// pedido (mientras se trabaja) y el Historial (cuando ya está cerrado). Eran
// dos listas distintas —una con miniaturas y otra de texto— y el mismo pedido
// se veía de dos maneras según por dónde entraras.
//
// SE VEN, no se enumeran. "AR.26.03556-12.pdf" no dice si ese planteamiento es
// el bueno; la primera página, sí. Las miniaturas las hace el servidor
// (`?mini=1`) y se cachean en disco: la foto de 3 MB del móvil del SAT baja
// como 16 KB.
//
// AGRUPADO POR CLASE y plegable, porque la media engaña: el adjunto de taller
// es uno POR OF, así que un pedido de 12 OFs trae 12 "Adjunto OF …" seguidos y
// entre ellos se pierde el planteamiento, que es lo que se venía a buscar.

/** Orden en el que se enseñan las clases de documento.
 *
 *  No es alfabético a propósito: va del trabajo de Oficina Técnica hacia fuera
 *  —planteamiento y diseño primero, luego el papeleo de venta, y al final lo de
 *  taller—, que es el orden en el que se busca cuando se abre un pedido.
 *  Lo que no esté aquí (clase "Documento" y lo que RPS se invente mañana) cae al
 *  final, sin perderse. */
const ORDEN_CLASES = [
  "Planteamiento",
  "Diseño",
  "Presupuesto",
  "Presupuesto escaneado",
  "Pedido escaneado",
  "Remates",
  "Rotulación",
  "Foto del trabajo",
  "Etiquetas",
  "Hoja de almacén",
  "Adjunto de la OF",
  "Mantenimiento (SAT)",
];

export function DocumentosRps({ documentos }: { documentos: DocumentoRps[] }) {
  // Los abribles, en el orden en que se ven: es la lista por la que pasean las
  // flechas del visor, y por eso se calcula UNA vez aquí y no por grupo.
  const { grupos, abribles } = useMemo(() => agrupar(documentos), [documentos]);
  const [enVisor, setEnVisor] = useState<number | null>(null);

  if (documentos.length === 0) {
    return <p className="text-[11px] text-text-muted">RPS no tiene nada colgado de este pedido.</p>;
  }

  return (
    <>
      <div className="space-y-1.5">
        {grupos.map(([clase, suyos], i) => (
          <Grupo
            key={clase}
            clase={clase}
            documentos={suyos}
            // Solo el primer grupo nace abierto. El orden ya pone delante lo
            // que se viene a buscar (planteamiento, diseño), y así el bloque
            // entero cabe de un vistazo en vez de empujar lo de abajo sesenta
            // líneas. El resto, a un clic.
            inicialAbierto={i === 0}
            onAbrir={(doc) => setEnVisor(abribles.indexOf(doc))}
          />
        ))}
      </div>

      {enVisor !== null && (
        <VisorDocumento
          documentos={abribles}
          indice={enVisor}
          onIr={setEnVisor}
          onCerrar={() => setEnVisor(null)}
        />
      )}
    </>
  );
}

/** Agrupa por clase y saca de paso la lista plana de los que se pueden abrir.
 *
 *  Dentro de cada clase se conserva el orden de llegada: es el del id del
 *  enlace en RPS, o sea el de subida, y es el que hace que "version 1" salga
 *  antes que "version 2". */
function agrupar(documentos: DocumentoRps[]) {
  const porClase = new Map<string, DocumentoRps[]>();
  for (const d of documentos) {
    const suyos = porClase.get(d.clase) ?? [];
    suyos.push(d);
    porClase.set(d.clase, suyos);
  }
  const grupos = [...porClase.entries()].sort((a, b) => {
    const ia = ORDEN_CLASES.indexOf(a[0]);
    const ib = ORDEN_CLASES.indexOf(b[0]);
    return (ia < 0 ? ORDEN_CLASES.length : ia) - (ib < 0 ? ORDEN_CLASES.length : ib);
  });
  // El recorrido del visor sigue el orden de la REJILLA (grupo a grupo), no el
  // que trae RPS: si no, la flecha derecha saltaría de un planteamiento a una
  // foto de mantenimiento y de vuelta.
  const abribles = grupos.flatMap(([, suyos]) => suyos.filter(esAbrible));
  return { grupos, abribles };
}

function esAbrible(d: DocumentoRps): d is DocumentoAbrible {
  return typeof d.url === "string" && d.url.length > 0;
}

function Grupo({
  clase,
  documentos,
  inicialAbierto,
  onAbrir,
}: {
  clase: string;
  documentos: DocumentoRps[];
  inicialAbierto: boolean;
  onAbrir: (doc: DocumentoAbrible) => void;
}) {
  const [abierto, setAbierto] = useState(inicialAbierto);

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-[var(--glass-border)]">
      {/* Botón a ancho completo: la fila se pulsa en cualquier punto, no solo
          sobre el rótulo. */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-text-muted hover:bg-surface-2 hover:text-text"
      >
        <span aria-hidden="true" className="text-[9px]">
          {abierto ? "▾" : "▸"}
        </span>
        {clase}
        <span className="rounded bg-surface-2 px-1 text-[9px] font-bold text-text-muted ring-1 ring-border">
          {documentos.length}
        </span>
      </button>

      <Desplegable abierto={abierto}>
        <ul className="grid grid-cols-3 gap-1.5 border-t border-[var(--glass-border)] p-2">
          {/* La clave lleva el índice porque ni el nombre ni la URL sirven
              solos: dos documentos pueden llamarse igual, y los que no se
              pueden abrir no tienen URL con la que distinguirse. */}
          {documentos.map((d, i) => (
            <li key={`${i}-${d.url ?? d.archivo}`}>
              <Tarjeta doc={d} onAbrir={onAbrir} />
            </li>
          ))}
        </ul>
      </Desplegable>
    </div>
  );
}

/** Un documento: miniatura si el servidor sabe dibujarla, icono con la
 *  extensión si no (los `.dwg`, los `.msg` de Outlook, los `.xls`).
 *
 *  Los que RPS guarda en su gestor documental y no como fichero no tienen URL:
 *  se enseñan apagados y no se pueden pulsar. Son 344 de los casi 19 000 de la
 *  serie AR.26, así que esconderlos sería mentir sobre lo que hay. */
function Tarjeta({
  doc,
  onAbrir,
}: {
  doc: DocumentoRps;
  onAbrir: (doc: DocumentoAbrible) => void;
}) {
  const [sinMiniatura, setSinMiniatura] = useState(false);
  const etiqueta = etiquetaCorta(doc);
  const titulo = doc.descripcion || doc.archivo;
  const ext = extension(doc.archivo);
  const dibujable = comoServir(doc.archivo).incrustable;

  if (!esAbrible(doc)) {
    return (
      <div
        className="cursor-not-allowed rounded-lg border border-dashed border-border opacity-60"
        title={`${titulo} — RPS lo tiene en su gestor documental, no como fichero del archivo: desde aquí no se puede abrir.`}
      >
        <div className="grid aspect-[3/4] place-items-center text-[10px] text-text-muted">
          sin fichero
        </div>
        <span className="block truncate px-1.5 pb-1 text-[10px] text-text-muted">{etiqueta}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onAbrir(doc)}
      title={`${titulo} — abrir`}
      className="block w-full overflow-hidden rounded-lg border border-border text-left hover:border-brand-500 focus-visible:border-brand-500"
    >
      {dibujable && !sinMiniatura ? (
        // `img` a pelo y no `next/image`: son ficheros de un share interno
        // servidos por nuestra propia ruta, sin tamaño conocido de antemano.
        // `object-top` y no centrado: en un papel escaneado lo que identifica
        // la hoja está arriba (cabecera, cliente, número), y recortando por el
        // centro se ven tres planteamientos idénticos.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${doc.url}?mini=1`}
          alt={titulo}
          loading="lazy"
          onError={() => setSinMiniatura(true)}
          className="aspect-[3/4] w-full bg-white object-cover object-top"
        />
      ) : (
        // Sin miniatura no se deja el hueco vacío: la extensión ya dice bastante
        // (un DWG se abre con otro programa, un MSG es un correo).
        <div className="grid aspect-[3/4] w-full place-items-center bg-surface-2">
          <span className="text-[11px] font-bold text-text-muted">{ext || "?"}</span>
        </div>
      )}
      <span className="block truncate px-1.5 py-1 text-[10px] text-text">{etiqueta}</span>
    </button>
  );
}

/** Lo que distingue a ESTE documento de sus hermanos de grupo.
 *
 *  La descripción de RPS repite la clase y el código del pedido en todas
 *  ("Planteamiento del pedido AR.26.03556, version 2"), y en una tarjeta de
 *  90 px eso deja fuera justo lo único que cambia. Se recortan el prefijo y el
 *  código, y queda "version 2". Si al quitarlos no sobra nada, se enseña el
 *  nombre del fichero: es lo que hay. */
function etiquetaCorta(doc: DocumentoRps): string {
  const base = doc.descripcion || doc.archivo;
  const limpia = base
    // "Planteamiento del pedido AR.26.03914, version 0" → ", version 0".
    // La clase se quita SOLO si abre la frase: "Adjunto OF 0231158" no lleva
    // delante su clase ("Adjunto de la OF") y ahí no hay nada que recortar.
    .replace(/\bdel pedido\s+[A-Z]{2}\.\d{2}\.\d{5}\b/i, "")
    .replace(new RegExp(`^\\s*${escaparRegExp(doc.clase)}\\b`, "i"), "")
    // Al recortar por el medio quedan espacios dobles y comas huérfanas
    // (", version 0"): se limpian aquí, no en cada `replace` de arriba.
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "");
  return limpia || doc.archivo;
}

/** Para meter un texto cualquiera dentro de una expresión regular: las clases
 *  de RPS traen paréntesis ("Mantenimiento (SAT)") y sin escapar cambiarían el
 *  significado del patrón. */
function escaparRegExp(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extensión del fichero en mayúsculas ("PDF", "DWG"). Vacío si el nombre no
 *  trae una reconocible. */
function extension(archivo: string): string {
  const ext = archivo.split(".").pop() ?? "";
  return ext && ext.length <= 4 && !/[\s/\\]/.test(ext) ? ext.toUpperCase() : "";
}
