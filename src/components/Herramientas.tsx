"use client";

import { usePopover } from "@/lib/usePopover";
import { HERRAMIENTAS, cuantasDisponibles } from "@/lib/herramientas";
import { ULTIMA } from "@/lib/novedades";

/** "31 de agosto". Sin año: lo que se quiere saber de un vistazo es si es de
 *  esta semana o de hace meses, y el año solo estorba para eso. */
function fechaCorta(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
  });
}

/** Las otras páginas de Oficina Técnica, en un cajón de la cabecera.
 *
 *  Un menú y no una pestaña más: no son parte del trabajo de CoordinaOT, son
 *  sitios a los que se va y se vuelve. Poniéndolas como vista competirían con
 *  Asignar y Lista, que es donde se está todo el día.
 *
 *  Las que aún no están desplegadas SÍ salen, apagadas y sin poder pulsarse:
 *  saber qué viene evita la pregunta de "¿esto existe ya?" y, cuando aparezca,
 *  se reconoce en el sitio donde ya se había visto. El catálogo está en
 *  lib/herramientas.ts. */
export function Herramientas({ onVerNovedades }: { onVerNovedades: () => void }) {
  const { open, setOpen, ref } = usePopover<HTMLDivElement>();
  const listas = cuantasDisponibles();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Otras herramientas"
        aria-expanded={open}
        title="Otras páginas de Oficina Técnica"
        className="glass-chip grid size-9 place-items-center rounded-lg text-text-muted hover:text-text"
      >
        {/* Rejilla de aplicaciones: el icono que todo el mundo asocia a "más
            sitios a los que ir", sin tener que rotularlo. */}
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
          <circle cx="5" cy="5" r="1.8" />
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="19" cy="5" r="1.8" />
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
          <circle cx="5" cy="19" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
          <circle cx="19" cy="19" r="1.8" />
        </svg>
      </button>

      {open && (
        <div className="glass-pop absolute right-0 top-full z-40 mt-1.5 w-80 rounded-xl p-2">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Otras herramientas
          </p>

          {HERRAMIENTAS.map((grupo) => (
            <div key={grupo.titulo} className="mb-2 last:mb-0">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted/70">
                {grupo.titulo}
              </p>
              <ul className="space-y-0.5">
                {grupo.items.map((h) =>
                  h.url ? (
                    <li key={h.id}>
                      {/* `noopener` no es opcional: abrir en pestaña nueva sin
                          él deja a la página destino tocar la nuestra. */}
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="block rounded-lg px-2 py-1.5 hover:bg-[var(--glass-highlight)]"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
                          {h.nombre}
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden
                            className="size-3 shrink-0 text-text-muted"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className="block text-[11px] leading-snug text-text-muted">
                          {h.descripcion}
                        </span>
                      </a>
                    </li>
                  ) : (
                    <li
                      key={h.id}
                      className="rounded-lg px-2 py-1.5 opacity-50"
                      title="Todavía no está publicada. Aparecerá aquí en cuanto lo esté."
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
                        {h.nombre}
                        <span className="rounded bg-surface-2 px-1 py-px text-[9px] font-bold uppercase text-text-muted ring-1 ring-border">
                          Pronto
                        </span>
                      </span>
                      <span className="block text-[11px] leading-snug text-text-muted">
                        {h.descripcion}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}

          {listas === 0 && (
            <p className="px-2 pb-1 text-[11px] leading-snug text-text-muted">
              Todavía no hay ninguna publicada. Irán apareciendo aquí según se vayan
              desplegando.
            </p>
          )}

          {/* Separado del resto: lo de arriba son OTRAS páginas y esto es de
              ésta. Va aquí porque el aviso de la campana se apaga en cuanto se
              lee una vez, y sin una puerta fija no habría forma de volver a
              mirar qué cambió — que es justo lo que se quiere poder hacer al
              volver de unos días fuera. */}
          {ULTIMA && (
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={() => {
                  onVerNovedades();
                  setOpen(false);
                }}
                className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-[var(--glass-highlight)]"
              >
                <span className="block text-xs font-semibold text-text">
                  Novedades de la web
                </span>
                <span className="block text-[11px] leading-snug text-text-muted">
                  Qué ha cambiado. Última actualización: {fechaCorta(ULTIMA)}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
