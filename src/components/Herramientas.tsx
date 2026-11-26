"use client";

import { useState, type ReactNode } from "react";
import { usePopover } from "@/lib/usePopover";
import { HERRAMIENTAS, cuantasDisponibles } from "@/lib/herramientas";
import { ULTIMA } from "@/lib/novedades";
import type { RolAcceso } from "@/lib/personas";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import type { Operario, Rol } from "@/lib/types";
import { ElegirColor } from "./ElegirColor";
import { ResetPin } from "./ResetPin";
import { SelectorSeccion } from "./SelectorSeccion";
import { ThemeToggle } from "./ThemeToggle";
import { porSeccion } from "./IdentityGate";
import { tintaSobre } from "@/lib/tinta";

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
  onVerImpresoras,
  seccion,
  onCambiarSeccion,
  yo,
  operarios,
  onCambiarIdentidad,
  loginActivo,
  onSalir,
  roles,
  verComoDireccion,
  fichando,
}: {
  /** Cuándo salió la última, si el servidor ya la ha sellado. */
  fechaUltimaNovedad?: string;
  onVerNovedades: () => void;
  onVerGuiaRevision: () => void;
  /** El panel de las impresoras: su estado, su cola y lo que mandó la web. */
  onVerImpresoras: () => void;
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
  /** Solo para quien tiene técnico y dirección. Cambia lo que se pinta, no lo que puede hacer la cuenta. */
  verComoDireccion?: { activo: boolean; onCambiar: (v: boolean) => void };
  /** Lo que estás fichando, DENTRO de esta píldora (17/11/2026): la píldora
   *  crece y lleva el mismo barrido que la tarjeta de un compañero que ficha.
   *  `null` con el reloj parado. Ver MiFichaje. */
  fichando?: { rol: Rol; contenido: ReactNode } | null;
}) {
  // El ConfirmDialog de ResetPin se abre DESDE DENTRO del desplegable: al
  // colgar de él en el DOM, el navegador lo cuenta como parte del popover y
  // confirmar no lo cierra (ver usePopover.ts).
  const { open, setOpen, ref, panelRef, idPanel } = usePopover<HTMLDivElement>();
  /** Si se está enseñando la lista de técnicos. Se apaga al cerrar el menú:
   *  quien lo vuelva a abrir espera encontrarlo como estaba al entrar, no a
   *  medio cambiarse de nombre. */
  const [cambiando, setCambiando] = useState(false);
  // Ajuste durante el render y no en un efecto: React descarta este render y
  // repite con el valor bueno, sin pintar el estado intermedio (y el lint no
  // admite setState dentro de un efecto).
  if (!open && cambiando) setCambiando(false);
  const listas = cuantasDisponibles();
  const esSupervisor = roles.includes("supervisor");
  const esDireccion = roles.includes("direccion");
  const hayAdministracion = esSupervisor || esDireccion || !!verComoDireccion;
  /** Las secciones de quien trabaja en varias (Manuel); vacío para el resto. */
  const misSecciones: SeccionId[] = yo.tambienEn?.length
    ? [yo.seccion ?? SECCION_POR_DEFECTO, ...yo.tambienEn]
    : [];
  const cambiarSeccion = (s: SeccionId) => {
    onCambiarSeccion(s);
    setOpen(false);
  };

  return (
    // La píldora es el envoltorio y no el botón: con el reloj en marcha lleva
    // dentro el resumen del fichaje y su botón de pausar, que no puede ir
    // dentro de otro botón.
    <div
      ref={ref}
      className={`relative flex h-9 items-center rounded-lg ${fichando ? `fila-fichando-${fichando.rol}` : "glass-chip"}`}
    >
      <div className="pildora-fichaje flex h-full items-center" data-abierta={fichando ? "" : undefined}>
        {fichando?.contenido}
      </div>
      {/* El botón lleva TU avatar, como cualquier menú de cuenta: aquí dentro
          está quién eres, y si el menú se lo tragara todo sin dejar rastro
          fuera, saber en nombre de quién estás fichando costaría un clic. La
          rejilla se queda al lado para que siga leyéndose como "más sitios a
          los que ir" y no solo como "tu perfil". */}
      <button
        type="button"
        popoverTarget={idPanel}
        // Con la sección que se ve («OT»): quien dicta por voz dice lo que lee.
        aria-label={`Menú de ${yo.nombre}, ${SECCIONES[seccion].nombreCorto}`}
        aria-expanded={open}
        title="Quién eres, qué lista miras y otras herramientas"
        className="flex h-full items-center gap-1.5 rounded-lg pl-1 pr-2 text-text-muted hover:text-text"
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
          style={{ background: yo.color, color: tintaSobre(yo.color) }}
        >
          {yo.iniciales}
        </span>
        {/* Tu nombre, como cualquier menú de cuenta (26/11/2026): antes ponía
            la sección («OT») y se leía como si fueras «OT». La sección solo
            se añade a quien trabaja en varias (Manuel), que es quien necesita
            saber qué lista tiene delante. */}
        <span className="max-w-40 truncate text-xs font-semibold text-text" title={`Lista de trabajo: ${SECCIONES[seccion].nombre}`}>
          {yo.nombre}
          {misSecciones.length > 0 && <span className="font-normal text-text-muted"> · {SECCIONES[seccion].nombreCorto}</span>}
        </span>
        {/* Una flecha y no la rejilla de puntos (26/11/2026): la rejilla se
            leía como "aplicaciones" y no como el menú de tu cuenta. Es la
            misma flecha que lleva el menú de Producción. */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Popover montado siempre (el botón lo abre por su id); lo de dentro se
          pinta solo abierto. */}
      <div ref={panelRef} id={idPanel} popover="auto" className="glass-pop scroll-thin max-h-[80vh] w-80 overflow-y-auto rounded-xl p-2 text-text">
      {open && (
        // Con todo dentro —nueve técnicos, la sección, el tema, las otras
        // páginas y las novedades— el menú es largo y en una pantalla de
        // portátil se salía por abajo: lo último no se podía ni ver. Con tope y
        // scroll cabe siempre.
        <>
          {/* QUIÉN ERES, lo primero: de esto dependen el reloj, los avisos y a
              nombre de quién se escribe en RPS.
              Se dice en UNA línea y la lista de técnicos vive detrás de
              "Cambiar". Desplegada siempre son nueve filas y dos rótulos que
              empujan hacia abajo todo lo demás, y cambiarse de nombre se hace
              una vez al día como mucho. */}
          <div className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
              style={{ background: yo.color, color: tintaSobre(yo.color) }}
            >
              {yo.iniciales}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-text">{yo.nombre}</span>
              <span className="block text-[10px] leading-tight text-text-muted">
                {/* Dirección no tiene sección: antes caía en la de siempre y
                    a Esteban le ponía "Oficina Técnica". Pero los de OT
                    tampoco la llevan en el catálogo (es la de siempre), así
                    que quien es técnico Y Dirección (Iván) salía como
                    Dirección: con `tecnico`, manda su sección, como en la
                    pantalla de entrar. */}
                {yo.seccion
                  ? SECCIONES[yo.seccion].nombre
                  : roles.includes("direccion") && !roles.includes("tecnico")
                    ? "Dirección"
                    : SECCIONES[SECCION_POR_DEFECTO].nombre}
              </span>
            </span>
            {loginActivo ? (
              <button
                onClick={() => {
                  onSalir();
                  setOpen(false);
                }}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text"
              >
                Salir
              </button>
            ) : (
              <button
                onClick={() => setCambiando((v) => !v)}
                aria-expanded={cambiando}
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-text-muted hover:bg-surface-2 hover:text-text"
              >
                {cambiando ? "Cancelar" : "Cambiar"}
              </button>
            )}
          </div>

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
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-surface-2 ${
                    op.id === yo.id ? "text-brand-800 dark:text-brand-400" : "text-text"
                  }`}
                >
                  <span
                    className="grid size-5 place-items-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: op.color, color: tintaSobre(op.color) }}
                  >
                    {op.iniciales}
                  </span>
                  {op.nombre}
                  {op.id === yo.id && <span className="ml-auto text-[10px]">✓</span>}
                </button>
              ))}
            </div>
          ))}

          {/* LA LISTA DE TRABAJO, solo para quien trabaja en varias secciones
              (Manuel: Impresión y Diseño) y solo con las suyas. Al resto del
              equipo no le hacía falta y ocupaba el sitio de lo diario (Iván,
              26/11/2026); el selector completo vive en Administración. */}
          {misSecciones.length > 1 && (
            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Lista de trabajo
              </p>
              <div className="px-2">
                <SelectorSeccion seccion={seccion} solo={misSecciones} onCambiar={cambiarSeccion} />
              </div>
            </div>
          )}

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
                <p className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
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
                          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text hover:bg-surface-2"
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
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text"
                        title={`${h.descripcion} Todavía no está publicada: aparecerá aquí en cuanto lo esté.`}
                      >
                        {h.nombre}
                        <span className="rounded bg-surface-2 px-1 py-px text-[10px] font-bold uppercase text-text-muted ring-1 ring-border">
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
            <p className="mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              En esta web
            </p>
            <button
              type="button"
              onClick={() => {
                onVerGuiaRevision();
                setOpen(false);
              }}
              title="Qué se mira al revisar y por qué vuelve una OF: lo común y lo de cada familia."
              className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-text hover:bg-surface-2"
            >
              Pasos y causas de revisión
            </button>

            <button
              onClick={() => {
                onVerImpresoras();
                setOpen(false);
              }}
              title="Cómo están las impresoras de Producción y OT, y qué ha mandado la web."
              className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-text hover:bg-surface-2"
            >
              Impresoras
            </button>

            {ULTIMA && (
              <button
                onClick={() => {
                  onVerNovedades();
                  setOpen(false);
                }}
                title="Qué ha cambiado en la web."
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-text hover:bg-surface-2"
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

          {/* APARIENCIA, plegada: el tema y el color se tocan muy de vez en
              cuando. Los once colores estaban arriba del todo y empujaban
              hacia abajo lo que se usa cada día (comité 26/11/2026). */}
          <Plegable titulo="Apariencia" clave="apariencia">
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <span className="text-xs font-semibold text-text">Tema</span>
              <ThemeToggle />
            </div>
            <ElegirColor miId={yo.id} actual={yo.color} />
          </Plegable>

          {/* ADMINISTRACIÓN, lo último y plegado, y solo para quien tenga
              algo dentro: supervisores (Ángel, Iván) y Dirección. Junta lo que
              casi nadie usa: mirar cualquier lista, la pantalla de Producción,
              ver la web como Dirección y el PIN olvidado. */}
          {hayAdministracion && (
            <Plegable titulo="Administración" clave="administracion">
              {(esSupervisor || esDireccion) && (
                <div className="px-2 pb-1.5">
                  <p className="mb-1 text-[11px] font-semibold text-text">Ver la lista de</p>
                  <SelectorSeccion seccion={seccion} onCambiar={cambiarSeccion} />
                </div>
              )}

              {/* La pantalla de Producción, para mirarla sin
                  cambiar de cuenta (Iván, 16/11/2026). Solo Dirección: al resto
                  del equipo no le hace falta y alargaría el menú. En pestaña
                  nueva, porque esa pantalla no tiene vuelta al tablero. */}
              {esDireccion && (
                <a
                  href="/produccion"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  title="La pantalla que ve Producción."
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-text hover:bg-surface-2"
                >
                  Vista de Producción
                  <svg viewBox="0 0 24 24" aria-hidden className="size-3 shrink-0 text-text-muted" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              )}


              {verComoDireccion && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-text hover:bg-surface-2">
                  <span>
                    <span className="block font-semibold">Ver como Dirección</span>
                    <span className="block text-[11px] text-text-muted">La web sin botones de escribir, como la ve Dirección</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={verComoDireccion.activo}
                    onChange={(e) => verComoDireccion.onCambiar(e.target.checked)}
                    className="size-4 accent-brand-500"
                  />
                </label>
              )}

              {/* El PIN olvidado, plegado dentro: resetear un PIN es de un par
                  de veces al año. Solo un supervisor y con el login encendido;
                  la protección de verdad la pone el servidor, que en
                  `PATCH /api/personas` exige el rol `supervisor`. */}
              {loginActivo && esSupervisor && <ResetPin />}
            </Plegable>
          )}
        </>
      )}
      </div>
    </div>
  );
}

/** Un bloque del menú que se pliega, con la cabecera como los rótulos del
 *  resto. Recuerda si se dejó abierto: el menú se monta de cero cada vez que
 *  se abre, y quien usa Administración a diario no tiene que desplegarla cada
 *  vez. */
function Plegable({ titulo, clave, children }: { titulo: string; clave: string; children: ReactNode }) {
  const guardado = `coordina-menu-${clave}`;
  const [abierto, setAbierto] = useState(() => {
    try {
      return localStorage.getItem(guardado) === "1";
    } catch {
      return false;
    }
  });
  const id = `menu-plegable-${clave}`;
  return (
    <div className="mt-2 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => {
          const nuevo = !abierto;
          setAbierto(nuevo);
          try {
            localStorage.setItem(guardado, nuevo ? "1" : "0");
          } catch {}
        }}
        aria-expanded={abierto}
        aria-controls={id}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-text-muted hover:bg-surface-2 hover:text-text"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {titulo}
      </button>
      {abierto && (
        <div id={id} className="mt-1">
          {children}
        </div>
      )}
    </div>
  );
}
