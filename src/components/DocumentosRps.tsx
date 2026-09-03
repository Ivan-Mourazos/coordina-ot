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
  const { grupos, abribles, sinFichero } = useMemo(() => agrupar(documentos), [documentos]);
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

      {/* Los que no se pueden abrir, dichos en una línea y no listados.
          Enumerarlos era peor que no enseñarlos: siete renglones seguidos que
          ponen "Document adjunto" y no abren nada no dicen qué documento es
          ninguno —la descripción que trae RPS es esa para todos—, y lo que
          transmiten es que la web está rota. Pero callarlos del todo tampoco:
          el día que alguien compare con RPS y le salgan 24 documentos donde
          aquí hay 17, pensará que se han perdido. Así que se cuentan. */}
      {sinFichero > 0 && (
        <p className="mt-2 text-[10px] text-text-muted">
          {sinFichero === 1
            ? "Hay 1 documento más que no se puede abrir"
            : `Hay ${sinFichero} documentos más que no se pueden abrir`}
          : RPS los tiene apuntados, pero el fichero no está en su archivo.
        </p>
      )}

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

/** Cuántos documentos de la lista se pueden llegar a abrir.
 *
 *  Lo usa quien pinta el rótulo del bloque ("Documentos (17)"): contar los 24
 *  que trae RPS y enseñar 17 haría que el número no cuadrara con nada de lo
 *  que se ve. Los que faltan los dice la línea del pie. */
export function contarAbribles(documentos: readonly DocumentoRps[]): number {
  return documentos.filter(esAbrible).length;
}

/** Agrupa por clase los que se pueden abrir, y cuenta aparte los que no.
 *
 *  Los que no tienen fichero NO entran en ningún grupo: un grupo entero de
 *  enlaces muertos ("Documento 7") se lee como un apartado de la web que no
 *  funciona. Salen contados en una línea al pie y ya está.
 *
 *  Dentro de cada clase manda el NÚMERO DE VERSIÓN, de la última a la primera.
 *  Antes se dejaba el orden que traía RPS dando por hecho que era el de subida,
 *  y no lo es: AR.26.03555 enseñaba sus planteamientos como 0, 2, 1. Y aunque
 *  viniera bien ordenado, lo primero que se busca es la ÚLTIMA versión, no la
 *  primera. Lo que no lleva número se queda como venía, detrás. */
function agrupar(documentos: DocumentoRps[]) {
  const porClase = new Map<string, DocumentoAbrible[]>();
  let sinFichero = 0;
  for (const d of documentos) {
    if (!esAbrible(d)) {
      sinFichero++;
      continue;
    }
    const suyos = porClase.get(d.clase) ?? [];
    suyos.push(d);
    porClase.set(d.clase, suyos);
  }
  for (const suyos of porClase.values()) ordenarPorVersion(suyos);
  const grupos = [...porClase.entries()].sort((a, b) => {
    const ia = ORDEN_CLASES.indexOf(a[0]);
    const ib = ORDEN_CLASES.indexOf(b[0]);
    return (ia < 0 ? ORDEN_CLASES.length : ia) - (ib < 0 ? ORDEN_CLASES.length : ib);
  });
  // El recorrido del visor sigue el orden de la REJILLA (grupo a grupo), no el
  // que trae RPS: si no, la flecha derecha saltaría de un planteamiento a una
  // foto de mantenimiento y de vuelta.
  const abribles = grupos.flatMap(([, suyos]) => suyos);
  return { grupos, abribles, sinFichero };
}

function esAbrible(d: DocumentoRps): d is DocumentoAbrible {
  return typeof d.url === "string" && d.url.length > 0;
}

/** El número de versión de la descripción de RPS, si lo trae.
 *
 *  Se escribe de las dos formas —"version 2" y "versión 2", según quién lo
 *  colgara— y ninguna es la buena: hay que aceptar las dos. */
function versionDe(doc: DocumentoAbrible): number | null {
  const m = /versi[oó]n?\s*(\d+)/i.exec(doc.descripcion || "");
  return m ? Number(m[1]) : null;
}

/** Ordena un grupo dejando arriba la versión más alta. Estable en lo demás:
 *  lo que no trae número mantiene el orden en que llegó y se va detrás, porque
 *  no hay nada con lo que compararlo. */
function ordenarPorVersion(docs: DocumentoAbrible[]): void {
  const version = new Map(docs.map((d) => [d, versionDe(d)]));
  const posicion = new Map(docs.map((d, i) => [d, i]));
  docs.sort((a, b) => {
    const va = version.get(a) ?? null;
    const vb = version.get(b) ?? null;
    if (va === null && vb === null) return posicion.get(a)! - posicion.get(b)!;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });
}

function Grupo({
  clase,
  documentos,
  inicialAbierto,
  onAbrir,
}: {
  clase: string;
  documentos: DocumentoAbrible[];
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
          {/* La clave lleva el índice porque el nombre no sirve solo: dos
              documentos pueden llamarse igual. */}
          {documentos.map((d, i) => (
            <li key={`${i}-${d.url}`}>
              <Tarjeta doc={d} onAbrir={onAbrir} />
            </li>
          ))}
        </ul>
      </Desplegable>
    </div>
  );
}

/** Un documento que SÍ se puede abrir: miniatura si el servidor sabe
 *  dibujarla, la extensión en grande si no (los `.dwg`, los `.msg` de Outlook,
 *  los `.xls`). Los que no tienen fichero no llegan aquí: van en el renglón de
 *  abajo del grupo, que es lo que ocupan. */
function Tarjeta({
  doc,
  onAbrir,
}: {
  doc: DocumentoAbrible;
  onAbrir: (doc: DocumentoAbrible) => void;
}) {
  const [sinMiniatura, setSinMiniatura] = useState(false);
  const etiqueta = etiquetaCorta(doc);
  const titulo = doc.descripcion || doc.archivo;
  const ext = extension(doc.archivo);
  const dibujable = comoServir(doc.archivo).incrustable;

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
