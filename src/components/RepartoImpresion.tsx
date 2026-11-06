"use client";

import { useState, type ReactNode } from "react";
import {
  AJUSTES_DE_SERIE,
  IMPRESORAS,
  claveTrabajo,
  consultaTrabajo,
  paginasSinImpresora,
  seleccionDeSerie,
  trabajosDe,
  type AjustesImpresion,
  type ImpresoraId,
  type Orientacion,
  type PaginaPdf,
  type SeleccionPaginas,
  type TrabajoPlan,
} from "@/lib/planteamiento";
import type { ModoImpresion } from "@/lib/server/impresion-cola";
import { abrirParaImprimir } from "@/lib/imprimir-pdf";

// ─── Qué páginas salen en cada impresora ─────────────────────────────────────
// En el aviso de pasar (Iván, 04/11/2026). De serie cada página va a la
// impresora que tiene su papel: A4 a Producción, A5 y A3 a la de OT. Arriba, un
// resumen de lo que va a salir; con «Elegir páginas…», las miniaturas de cada
// impresora en dos columnas, cada página con su casilla y su orientación. Las
// columnas no dependen una de la otra: marcar el A5 en Producción (sale ampliado
// a A4) no lo quita de la de OT.

export interface FicheroConTamanos {
  nombre: string;
  paginas: number;
  tamanos?: PaginaPdf[];
}

type ConTamanos = FicheroConTamanos & { tamanos: PaginaPdf[] };

const NOMBRE: Record<ImpresoraId, string> = { produccion: "Producción", ot: "Impresora de OT" };
const PAPELES_TXT: Record<ImpresoraId, string> = { produccion: "solo A4", ot: "A3, A4 y A5" };

const conTamanos = (f: FicheroConTamanos): f is ConTamanos => (f.tamanos?.length ?? 0) > 0;
const seleccionDe = (f: ConTamanos, ajustes: AjustesImpresion): SeleccionPaginas =>
  ajustes.paginas[f.nombre] ?? seleccionDeSerie(f.tamanos);
const natural = (p: PaginaPdf): Orientacion => (p.horizontal ? "horizontal" : "vertical");

/** ¿Hay algo que elegir? Solo con las medidas de cada página. */
export function hayReparto(ficheros: readonly FicheroConTamanos[]): boolean {
  return ficheros.some(conTamanos);
}

function urlTrabajo(pedido: string, fichero: string, t: Pick<TrabajoPlan, "papel" | "paginas">): string {
  const c = consultaTrabajo(t);
  const q = new URLSearchParams({ pedido, nombre: fichero, paginas: c.paginas });
  if (c.girar.includes("1")) q.set("girar", c.girar);
  if (c.papel) q.set("papel", c.papel);
  return `/api/planteamiento/fichero?${q}`;
}

const urlMiniatura = (pedido: string, fichero: string, pagina: number) =>
  `/api/planteamiento/fichero?${new URLSearchParams({ pedido, nombre: fichero, paginas: String(pagina), mini: "1" })}`;

/** Lo que hay que abrir en el cuadro de imprimir al pasar: lo de la de OT si no
 *  tiene código de departamento y las páginas de un tamaño que no tiene ninguna.
 *  Lo que se mandó a mano con «Ajustes de la impresora…» ya se abrió entonces. */
export function urlsAMano(pedido: string, ficheros: readonly FicheroConTamanos[], puedeOt: boolean, ajustes: AjustesImpresion): string[] {
  return ficheros.filter(conTamanos).flatMap((f) => {
    const sel = seleccionDe(f, ajustes);
    const trabajos = trabajosDe(f.tamanos, sel)
      .filter((t) => t.impresora === "ot" && !puedeOt)
      .map((t) => urlTrabajo(pedido, f.nombre, t));
    const sueltas = paginasSinImpresora(f.tamanos, sel, !ajustes.paginas[f.nombre]);
    return sueltas.length > 0
      ? [...trabajos, urlTrabajo(pedido, f.nombre, { papel: "A4", paginas: sueltas.map((pagina) => ({ pagina, girar: false, ajustar: false })) })]
      : trabajos;
  });
}

/** «pág. 2», «págs. 1, 3» o «todas (3 págs.)». */
function listaPags(n: readonly number[], total: number): string {
  if (n.length === total && total > 1) return `todas (${total} págs.)`;
  return `${n.length === 1 ? "pág." : "págs."} ${n.join(", ")}`;
}

export function RepartoImpresion({
  pedido,
  ficheros,
  modo,
  puedeOt,
  ajustes,
  onCambiar,
}: {
  pedido: string;
  ficheros: FicheroConTamanos[];
  modo: ModoImpresion;
  puedeOt: boolean;
  ajustes: AjustesImpresion;
  onCambiar: (a: AjustesImpresion) => void;
}) {
  // Cada PDF se despliega por su cuenta: con varios, se elige uno sin
  // tener delante las miniaturas de todos.
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const alternar = (nombre: string) =>
    setAbiertos((a) => {
      const n = new Set(a);
      if (n.has(nombre)) n.delete(nombre);
      else n.add(nombre);
      return n;
    });
  const conMedidas = ficheros.filter(conTamanos);
  const tocado = Object.keys(ajustes.paginas).length > 0 || ajustes.aMano.length > 0;

  return (
    <div className="mt-2.5 flex flex-col gap-2.5">
      {conMedidas.map((f) => {
        const sel = seleccionDe(f, ajustes);
        const trabajos = trabajosDe(f.tamanos, sel);
        const sueltas = paginasSinImpresora(f.tamanos, sel, !ajustes.paginas[f.nombre]);
        const fijar = (impresora: ImpresoraId, paginas: SeleccionPaginas[ImpresoraId]) =>
          onCambiar({ ...ajustes, paginas: { ...ajustes.paginas, [f.nombre]: { ...sel, [impresora]: paginas } } });
        const abierto = abiertos.has(f.nombre);
        const boton = (
          <button
            type="button"
            aria-expanded={abierto}
            onClick={() => alternar(f.nombre)}
            className="chip-3d self-start px-3 py-1 text-[11px] font-semibold text-text"
          >
            {abierto ? "Ocultar páginas" : "Elegir páginas…"}
          </button>
        );
        return (
          <div
            key={f.nombre}
            className="flex flex-col gap-2 rounded-xl bg-surface p-2.5 shadow-[var(--hero-sombra-campo)]"
          >
            {/* Siempre el nombre, también con un solo PDF: qué archivo ha encontrado
                y se va a imprimir (Iván, 06/11/2026). */}
            <p className="flex items-baseline gap-1.5 font-semibold text-text">
              <span aria-hidden>📄</span>{f.nombre}
              <span className="font-normal text-text-muted">· {f.paginas} {f.paginas === 1 ? "pág." : "págs."}</span>
            </p>
            {/* El resumen: qué sale en cada sitio. */}
            <ul className="flex flex-col gap-1">
              {IMPRESORAS.map((imp) => {
                const suyos = trabajos.filter((t) => t.impresora === imp);
                const pags = suyos.flatMap((t) => t.paginas.map((p) => p.pagina)).sort((a, b) => a - b);
                const ajustadas = suyos.flatMap((t) => t.paginas.filter((p) => p.ajustar).map((p) => p.pagina));
                const porCuadro = ajustes.aMano.includes(claveTrabajo(f.nombre, imp));
                const aMano = pags.length > 0 && (porCuadro || (imp === "ot" && !puedeOt));
                return (
                  <li key={imp} className="flex flex-wrap items-center gap-2">
                    <Chip aviso={aMano}>
                      {NOMBRE[imp]}
                      {modo === "ensayo" && imp === "produccion" ? " (ensayo: sale en la de OT)" : ""}
                    </Chip>
                    <span className={pags.length ? "text-text" : "text-text-muted"}>
                      {pags.length === 0 ? "nada" : listaPags(pags, f.paginas)}
                      {ajustadas.length > 0 && (
                        <span className="text-text-muted">
                          {" · "}
                          {ajustadas.length === 1 ? `la ${ajustadas[0]}` : `las ${ajustadas.join(", ")}`} en A4
                        </span>
                      )}
                      {aMano && (
                        <span className="text-text-muted">
                          {" · "}
                          {porCuadro ? "la imprimes tú desde el cuadro" : "a mano: no tiene código de departamento"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
              {sueltas.length > 0 && (
                <li className="flex flex-wrap items-center gap-2">
                  <Chip aviso>A mano</Chip>
                  <span className="text-text">
                    {listaPags(sueltas, 0)} <span className="text-text-muted">· no es A3, A4 ni A5: se abre el cuadro de imprimir</span>
                  </span>
                </li>
              )}
            </ul>

            {abierto && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {IMPRESORAS.map((imp) => (
                  <ColumnaImpresora
                    key={imp}
                    impresora={imp}
                    pedido={pedido}
                    fichero={f}
                    elegidas={sel[imp]}
                    aMano={ajustes.aMano.includes(claveTrabajo(f.nombre, imp))}
                    sinCodigo={imp === "ot" && !puedeOt}
                    onElegir={(p) => fijar(imp, p)}
                    onAjustes={() => {
                      // Se abre AQUÍ, dentro del clic: fuera de él el navegador lo bloquea.
                      for (const t of trabajos.filter((t) => t.impresora === imp)) abrirParaImprimir(urlTrabajo(pedido, f.nombre, t));
                      onCambiar({ ...ajustes, aMano: [...ajustes.aMano, claveTrabajo(f.nombre, imp)] });
                    }}
                    onSola={() => onCambiar({ ...ajustes, aMano: ajustes.aMano.filter((k) => k !== claveTrabajo(f.nombre, imp)) })}
                  />
                ))}
              </div>
            )}
            {boton}
          </div>
        );
      })}
      {tocado && (
        <button type="button" onClick={() => onCambiar(AJUSTES_DE_SERIE)} className="chip-3d self-start px-3 py-1 text-[11px] font-semibold text-text">
          Volver a lo de serie
        </button>
      )}
    </div>
  );
}

function Chip({ aviso = false, children }: { aviso?: boolean; children: ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        aviso ? "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200" : "bg-[var(--hero-relleno)] text-text"
      }`}
    >
      {children}
    </span>
  );
}

function ColumnaImpresora({
  impresora,
  pedido,
  fichero,
  elegidas,
  aMano,
  sinCodigo,
  onElegir,
  onAjustes,
  onSola,
}: {
  impresora: ImpresoraId;
  pedido: string;
  fichero: ConTamanos;
  elegidas: SeleccionPaginas[ImpresoraId];
  aMano: boolean;
  sinCodigo: boolean;
  onElegir: (p: SeleccionPaginas[ImpresoraId]) => void;
  onAjustes: () => void;
  onSola: () => void;
}) {
  const de = new Map(elegidas.map((e) => [e.pagina, e.orientacion]));
  const poner = (pagina: number, o: Orientacion | null) =>
    onElegir(
      o === null
        ? elegidas.filter((e) => e.pagina !== pagina)
        : [...elegidas.filter((e) => e.pagina !== pagina), { pagina, orientacion: o }].sort((a, b) => a.pagina - b.pagina),
    );
  return (
    <section className="rounded-xl bg-surface p-2.5 shadow-[var(--hero-sombra-campo)]" aria-label={`Páginas para ${NOMBRE[impresora]}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h5 className="text-xs font-semibold text-text">{NOMBRE[impresora]}</h5>
        <span className="text-[11px] text-text-muted">{PAPELES_TXT[impresora]}</span>
      </div>
      {sinCodigo && <p className="mb-2 text-[11px] text-text-muted">Sin código de departamento: lo de aquí se abre para imprimir a mano.</p>}
      <div className="grid grid-cols-3 gap-2">
        {fichero.tamanos.map((p, i) => {
          const pagina = i + 1;
          const o = de.get(pagina);
          const marcada = o !== undefined;
          const ajusta = impresora === "produccion" ? p.papel !== "A4" : p.papel === null;
          return (
            <div key={pagina} className="flex flex-col items-center gap-1">
              <button
                type="button"
                aria-pressed={marcada}
                aria-label={`Página ${pagina}${p.papel ? ` (${p.papel})` : ""} en ${NOMBRE[impresora]}`}
                onClick={() => poner(pagina, marcada ? null : natural(p))}
                className={`relative grid aspect-square w-full place-items-center overflow-hidden !rounded-lg bg-[var(--hero-relleno)] transition-opacity motion-reduce:transition-none ${
                  marcada ? "ring-2 ring-[var(--hero-anillo)]" : "opacity-55 hover:opacity-90"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlMiniatura(pedido, fichero.nombre, pagina)}
                  alt=""
                  loading="lazy"
                  className="max-h-[80%] max-w-[80%] rounded-sm bg-white object-contain shadow-sm transition-transform duration-200 motion-reduce:transition-none"
                  style={{ transform: marcada && o !== natural(p) ? "rotate(90deg)" : undefined }}
                />
                {marcada && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-[var(--hero-anillo)] text-[10px] font-bold text-white"
                  >
                    ✓
                  </span>
                )}
              </button>
              <span className="text-center text-[10px] leading-tight text-text-muted">
                Pág. {pagina} · {p.papel ?? "otro"}
                {marcada && ajusta && <b className="block font-semibold text-text">sale en A4</b>}
              </span>
              {marcada && (
                <div className="tira-3d glass-chip inline-flex rounded-lg p-0.5" role="group" aria-label={`Orientación de la página ${pagina}`}>
                  {(["vertical", "horizontal"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={o === v}
                      title={v === "vertical" ? "Vertical" : "Horizontal"}
                      onClick={() => poner(pagina, v)}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                        o === v ? "pestana-activa" : "text-text-muted hover:text-text"
                      }`}
                    >
                      {v === "vertical" ? "Vert." : "Horiz."}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {elegidas.length > 0 && !sinCodigo && (
        <div className="mt-2.5">
          {aMano ? (
            <button type="button" onClick={onSola} className="chip-3d px-2.5 py-0.5 text-[11px] font-semibold text-text">
              Que salga sola
            </button>
          ) : (
            <button type="button" onClick={onAjustes} className="chip-3d px-2.5 py-0.5 text-[11px] font-semibold text-text">
              Ajustes de la impresora…
            </button>
          )}
        </div>
      )}
    </section>
  );
}
