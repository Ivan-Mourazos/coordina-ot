"use client";

import { useState } from "react";
import { usePopover } from "@/lib/usePopover";
import { HERRAMIENTAS, cuantasDisponibles } from "@/lib/herramientas";
import { ULTIMA } from "@/lib/novedades";
import type { RolAcceso } from "@/lib/personas";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import type { Operario } from "@/lib/types";
import { ResetPin } from "./ResetPin";
import { SelectorSeccion } from "./SelectorSeccion";
import { ThemeToggle } from "./ThemeToggle";
import { porSeccion } from "./IdentityGate";

/** "31 ago". Sin año: lo que se quiere saber de un vistazo es si es de esta
 *  semana o de hace meses, y el año solo estorba para eso. Mes abreviado
 *  porque la fecha ya no ocupa su propia línea: va al final de la de
 *  Novedades, y "31 de agosto" no cabe ahí sin partirla. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
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
export function Herramientas({
  fechaUltimaNovedad,
  onVerNovedades,
  onVerGuiaRevision,
  seccion,
  onCambiarSeccion,
  yo,
  operarios,
  onCambiarIdentidad,
  loginActivo,
  onSalir,
  roles,
}: {
  /** Cuándo salió la última, si el servidor ya la ha sellado. */
  fechaUltimaNovedad?: string;
  onVerNovedades: () => void;
  onVerGuiaRevision: () => void;
  /** Qué lista de trabajo se está mirando. */
  seccion: SeccionId;
  onCambiarSeccion: (s: SeccionId) => void;
  yo: Operario;
  /** TODOS, no los de la sección servida: si solo saliera la tuya, cambiarte a
   *  alguien de la otra sería imposible una vez dentro. */
  operarios: Operario[];
  onCambiarIdentidad: (id: string) => void;
  /** Si el login con PIN está encendido. Con él encendido no hay a quién
   *  cambiarse desde aquí —la identidad la da el servidor—, así que el botón
   *  de siempre ("Cambiar") se convierte en "Salir". */
  loginActivo: boolean;
  onSalir: () => void;
  /** Roles de acceso de quien está dentro. Ver lib/personas.ts; no confundir
   *  con `Rol` (plantear/revisar), que es lo que se hace en una OF. */
  roles: RolAcceso[];
}) {
  // Ignora los portales: es el único de los cuatro que abre un diálogo
  // (ConfirmDialog, desde ResetPin) DESDE DENTRO de su propio desplegable.
  // Ver el porqué de que sea opcional en usePopover.ts.
  const { open, setOpen, ref } = usePopover<HTMLDivElement>({ ignorarPortales: true });
  /** Si se está enseñando la lista de técnicos. Se apaga al cerrar el menú:
   *  quien lo vuelva a abrir espera encontrarlo como estaba al entrar, no a
   *  medio cambiarse de nombre. */
  const [cambiando, setCambiando] = useState(false);
  // Ajuste durante el render y no en un efecto: React descarta este render y
  // repite con el valor bueno, sin pintar el estado intermedio (y el lint no
  // admite setState dentro de un efecto).
  if (!open && cambiando) setCambiando(false);
  const listas = cuantasDisponibles();

  return (
    <div ref={ref} className="relative">
      {/* El botón lleva TU avatar, como cualquier menú de cuenta: aquí dentro
          está quién eres, y si el menú se lo tragara todo sin dejar rastro
          fuera, saber en nombre de quién estás fichando costaría un clic. La
          rejilla se queda al lado para que siga leyéndose como "más sitios a
          los que ir" y no solo como "tu perfil". */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Menú de ${yo.nombre}`}
        aria-expanded={open}
        title="Quién eres, qué lista miras y otras herramientas"
        className="glass-chip flex h-9 items-center gap-1.5 rounded-lg pl-1 pr-2 text-text-muted hover:text-text"
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: yo.color }}
        >
          {yo.iniciales}
        </span>
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
        // Con todo dentro —nueve técnicos, la sección, el tema, las otras
        // páginas y las novedades— el menú es largo y en una pantalla de
        // portátil se salía por abajo: lo último no se podía ni ver. Con tope y
        // scroll cabe siempre.
        <div className="glass-pop scroll-thin absolute right-0 top-full z-40 mt-1.5 max-h-[80vh] w-80 overflow-y-auto rounded-xl p-2">
          {/* QUIÉN ERES, lo primero: de esto dependen el reloj, los avisos y a
              nombre de quién se escribe en RPS.
              Se dice en UNA línea y la lista de técnicos vive detrás de
              "Cambiar". Desplegada siempre son nueve filas y dos rótulos que
              empujan hacia abajo todo lo demás, y cambiarse de nombre se hace
              una vez al día como mucho. */}
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
              style={{ background: yo.color }}
            >
              {yo.iniciales}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-text">{yo.nombre}</span>
              <span className="block text-[10px] leading-tight text-text-muted">
                {SECCIONES[yo.seccion ?? SECCION_POR_DEFECTO].nombre}
              </span>
            </span>
            {loginActivo ? (
              <button
                onClick={() => {
                  onSalir();
                  setOpen(false);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              >
                Salir
              </button>
            ) : (
              <button
                onClick={() => setCambiando((v) => !v)}
                aria-expanded={cambiando}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              >
                {cambiando ? "Cancelar" : "Cambiar"}
              </button>
            )}
          </div>

          {/* Solo un supervisor y solo con el login encendido: apagado no hay
              PIN que resetear, y esconder el botón aquí es solo para no
              confundir — la protección de verdad la pone el servidor, que en
              `PATCH /api/personas` exige el rol `supervisor` pase lo que pase
              con este `if`. */}
          {loginActivo && roles.includes("supervisor") && <ResetPin />}

          {/* Con el login encendido no hay lista que desplegar: `cambiando`
              no puede encenderse de otra forma que el botón de arriba, que
              con el login encendido ya no existe. */}
          {!loginActivo &&
            cambiando &&
            porSeccion(operarios).map(([sec, suyos]) => (
            <div key={sec}>
              {/* El rótulo de sección va separado por una línea y no por más
                  aire: el menú es estrecho y el espacio solo lo alarga sin
                  dejar claro dónde acaba un grupo. */}
              <p className="mt-1 border-t border-border px-2 pb-0.5 pt-1.5 text-[10px] font-semibold text-text-muted">
                {SECCIONES[sec].nombre}
              </p>
              {suyos.map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    onCambiarIdentidad(op.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-[var(--glass-highlight)] ${
                    op.id === yo.id ? "text-brand-600" : "text-text"
                  }`}
                >
                  <span
                    className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: op.color }}
                  >
                    {op.iniciales}
                  </span>
                  {op.nombre}
                  {op.id === yo.id && <span className="ml-auto text-[10px]">✓</span>}
                </button>
              ))}
            </div>
          ))}

          {/* QUÉ LISTA SE MIRA y el claro/oscuro, en una fila y sin rótulos.
              Eran dos secciones con su título en mayúsculas para dos mandos, y
              en un menú de ocho cosas eso es más rótulo que contenido. Lo que
              decían no se pierde: el conmutador lleva su `aria-label` ("Qué
              lista de trabajo se mira") y cada botón su `title`, y la línea de
              arriba ya dice en qué sección estás.

              La lista va PRIMERO y arriba porque no es "otra herramienta": es
              de qué trabajo va todo lo que se está viendo.

              El tema no cierra el menú al cambiarlo: se elige mirando, y
              cerrando habría que volver a abrirlo para probar el otro. */}
          <div className="mt-2 flex items-center justify-between gap-2 px-2">
            <SelectorSeccion
              seccion={seccion}
              onCambiar={(s) => {
                onCambiarSeccion(s);
                setOpen(false);
              }}
            />
            <ThemeToggle />
          </div>

          {/* LAS OTRAS PÁGINAS. Sin el rótulo "Otras herramientas" encima:
              con la cabecera ya separada por su línea, lo único que queda
              debajo son sitios a los que ir, y anidar dos niveles de título
              (uno general y otro por grupo) para tres filas cada uno no
              ordenaba nada.

              Cada una en UNA línea: el nombre. La frase de para qué sirve se
              va al `title` —sale al posar el ratón, y esto solo se usa en PC—
              porque ocho descripciones seguidas convertían el menú en un
              muro de texto que había que leer entero para encontrar el
              enlace de siempre. */}
          <div className="mt-2 border-t border-border pt-2">
            {HERRAMIENTAS.map((grupo) => (
              <div key={grupo.titulo} className="mb-2 last:mb-0">
                {/* Mismo sangrado que las filas (px-2): con el rótulo a px-1
                    el título quedaba 4 px a la izquierda de lo que titula. */}
                <p className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted/70">
                  {grupo.titulo}
                </p>
                <ul>
                  {grupo.items.map((h) =>
                    h.url ? (
                      <li key={h.id}>
                        {/* `noopener` no es opcional: abrir en pestaña nueva sin
                            él deja a la página destino tocar la nuestra. */}
                        <a
                          href={h.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={h.descripcion}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text hover:bg-[var(--glass-highlight)]"
                        >
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
                        </a>
                      </li>
                    ) : (
                      <li
                        key={h.id}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text opacity-50"
                        title={`${h.descripcion} Todavía no está publicada: aparecerá aquí en cuanto lo esté.`}
                      >
                        {h.nombre}
                        <span className="rounded bg-surface-2 px-1 py-px text-[9px] font-bold uppercase text-text-muted ring-1 ring-border">
                          Pronto
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
          </div>

          {/* LO DE ESTA WEB, en su propio bloque y con una sola línea encima:
              lo de arriba son OTRAS páginas y esto es de ésta.

              Las novedades van aquí porque el aviso de la campana se apaga en
              cuanto se lee una vez, y sin una puerta fija no habría forma de
              volver a mirar qué cambió — que es justo lo que se quiere poder
              hacer al volver de unos días fuera. Y la guía de revisión las
              acompaña en vez de irse arriba: mientras se revisa está en la
              propia tarjeta, que es donde sirve; aquí se lee en frío o se le
              enseña a quien empieza.

              La fecha va al final de su fila, en gris, y no en una segunda
              línea que dijera "Qué ha cambiado. Última actualización: …": el
              título ya dice qué es, y lo único que se pregunta al verlo es de
              cuándo es lo último. */}
          <div className="mt-2 border-t border-border pt-2">
            <button
              onClick={() => {
                onVerGuiaRevision();
                setOpen(false);
              }}
              title="Los ocho puntos que se repasan antes de dar una lona por buena."
              className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-text hover:bg-[var(--glass-highlight)]"
            >
              Qué mirar al revisar
            </button>

            {ULTIMA && (
              <button
                onClick={() => {
                  onVerNovedades();
                  setOpen(false);
                }}
                title="Qué ha cambiado en la web."
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-text hover:bg-[var(--glass-highlight)]"
              >
                Novedades de la web
                {fechaUltimaNovedad && (
                  <span className="ml-auto shrink-0 text-[10px] font-medium text-text-muted">
                    {fechaCorta(fechaUltimaNovedad)}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
