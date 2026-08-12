"use client";

import { useEffect, useState } from "react";
import type { OF, Operario, Pedido, Rol } from "@/lib/types";
import { tiempoTotalOF } from "@/lib/types";
import { ESTADO, ROL, fmtMin } from "@/lib/estado";
import { abierto, esFichable, minutosOF, motivoNoFichable, rolFichajeDe, type Fichaje } from "@/lib/fichaje";
import { LiveDot } from "./LiveBadge";

/** Minutos con trabajo mío a medias y NINGÚN fichaje corriendo antes de sacar
 *  la píldora en ámbar.
 *
 *  El aviso NO dice "te has puesto a plantear y no fichas": eso el navegador
 *  no lo sabe y casi siempre era falso — lo normal es tener un pedido
 *  interrumpido, empezado y sin terminar, con el reloj parado a propósito.
 *  Dice lo único comprobable: hay trabajo empezado y el reloj no cuenta. Los
 *  10 minutos evitan dar la tabarra justo después de pausar (ir a comer,
 *  una reunión). */
const AVISO_SIN_FICHAR_MIN = 10;

/** Minutos de un intervalo corriendo antes de avisar de que lleva mucho
 *  rato. Es un AVISO, no un corte: el cierre automático por inactividad
 *  (latido, ver lib/fichaje.ts) es cosa del servidor y depende de si la
 *  pestaña sigue viva, no de cuánto lleva fichando. Este aviso es lo
 *  contrario — la pestaña SIGUE viva y el fichaje puede ser real (una pieza
 *  larga, una revisión a fondo) — así que no bloquea, no exige respuesta y
 *  si se ignora no pasa nada: solo ofrece el atajo de pausar por si a la
 *  persona se le olvidó. Nunca debe convertirse en un corte automático. */
const AVISO_FICHAJE_LARGO_MIN = 180;

/** Cuánto panel se enseña. Es preferencia de quien mira, no estado del
 *  fichaje, así que vive en el navegador —igual que la identidad de operario—
 *  y no en el servidor.
 *
 *  · completo → lo que corre Y lo que quedó a medias.
 *  · compacto → solo el pedido que corre, con sus tiempos.
 *  · pildora  → el resumen mínimo en una esquina. */
type ModoPanel = "completo" | "compacto" | "pildora";
const PANEL_MODO_KEY = "coordina-mi-fichaje-modo";

/** Se lee al construir el estado, no en un efecto: el tablero no se pinta hasta
 *  estar hidratado, así que aquí `window` ya existe. Mismo patrón que la
 *  identidad de operario (ver `leerIdentidadGuardada` en Board). */
function leerModoGuardado(): ModoPanel {
  if (typeof window === "undefined") return "pildora";
  try {
    const v = localStorage.getItem(PANEL_MODO_KEY);
    return v === "completo" || v === "compacto" || v === "pildora" ? v : "pildora";
  } catch {
    return "pildora";
  }
}

/** Reloj del fichaje que corre AHORA, en h:mm:ss (p.ej. "1:05:42").
 *
 *  Con segundos, no solo minutos: es la señal de que el fichaje está vivo. Un
 *  "0:03" quieto no distingue "va contando" de "se ha colgado", y el fichaje
 *  es justo lo que nadie quiere dar por hecho. Los tiempos por OF siguen en
 *  minutos (`fmtMin`, "1h 5m"): ahí lo que importa es el acumulado del día. */
function fmtHMS(seg: number): string {
  const total = Math.max(0, Math.floor(seg));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Cuándo se paró el reloj, en corto: la hora si fue hoy ("las 11:40") y con
 *  la fecha si fue otro día ("el 6/8 a las 18:20"). Sin la fecha, un "parado
 *  desde las 18:20" de la semana pasada se lee como de esta tarde. */
function fmtDesde(iso: string, ahora: string): string {
  const d = new Date(iso);
  const hora = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mismoDia = d.toDateString() === new Date(ahora).toDateString();
  return mismoDia ? `las ${hora}` : `el ${d.getDate()}/${d.getMonth() + 1} a las ${hora}`;
}

/** Un día suelto en corto ("10/10/2025"). Para `fichadaDesde`, que viene de
 *  RPS y es un DÍA, no un instante: pasarlo por `fmtDesde` sacaría una hora
 *  inventada. Se parte el ISO en vez de construir un Date para no arrastrar el
 *  desfase de zona horaria, que en una fecha sin hora corre el día entero. */
function fmtDia(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${a}`;
}

/** "1 OF empezada" / "3 OFs empezadas". El rótulo se repite en la píldora, en
 *  su título y en el panel; hacer la concordancia a mano en cada sitio acaba
 *  descuadrando en alguno. */
function nOF(n: number, adjetivo?: string): string {
  const s = n === 1 ? "" : "s";
  return `${n} OF${s}${adjetivo ? ` ${adjetivo}${s}` : ""}`;
}

/** Instante en que dejó de correr el reloj de esta OF: el `fin` de su último
 *  tramo. Se busca desde el final porque los intervalos se añaden en orden.
 *  Mira el fichaje ENTERO, no el de hoy: lo que se dejó a medias ayer sigue
 *  a medias esta mañana, y "parado desde ayer a las 18:20" es justo el dato
 *  que se busca. null = nunca se fichó. */
function paradoDesdeDe(f: Fichaje, ofId: string): string | null {
  for (let i = f.intervalos.length - 1; i >= 0; i--) {
    const iv = f.intervalos[i];
    if (iv.fin && iv.ofIds.includes(ofId)) return iv.fin;
  }
  return null;
}

/** ¿Es esta OF trabajo MÍO empezado y sin terminar? El estado dice quién la
 *  tiene a medias: `en_revision` es del revisor (el autor ya acabó lo suyo);
 *  `en_curso` y `devuelta` son del autor. Fuera `pendiente` (nadie la ha
 *  tocado) y `por_revisar` (el planteo está terminado y solo espera revisor:
 *  no es trabajo interrumpido de nadie). Las detenidas SÍ entran: están
 *  paradas y eso es exactamente lo que hay que enseñar. */
function esMiTrabajoAMedias(of: OF, miId: string): boolean {
  if (of.estado === "en_revision") return of.revisorId === miId;
  return (of.estado === "en_curso" || of.estado === "devuelta") && of.autorId === miId;
}

/** Minutos fichados HOY, en total y por rol. El tramo abierto cuenta hasta
 *  `ahora`: el resumen del día tiene que cuadrar con el reloj que se está
 *  viendo subir, no quedarse en el último tramo cerrado. */
function resumenDelDia(
  f: Fichaje,
  ahora: string,
): { plantear: number; revisar: number; total: number } {
  let plantear = 0;
  let revisar = 0;
  for (const iv of f.intervalos) {
    const min = (Date.parse(iv.fin ?? ahora) - Date.parse(iv.inicio)) / 60000;
    if (iv.rol === "plantear") plantear += min;
    else revisar += min;
  }
  return { plantear, revisar, total: plantear + revisar };
}

/** OFs donde soy autor o revisor, en estados que todavía tienen sentido
 *  fichar/consultar (fuera anuladas y ya aprobadas). Las detenidas SÍ se
 *  incluyen: se ven en el panel pero con el toggle deshabilitado. */
function ofsMiasDe(p: Pedido, miId: string): OF[] {
  return p.ofs.filter(
    (of) =>
      (of.autorId === miId || of.revisorId === miId) &&
      of.estado !== "anulada" &&
      of.estado !== "aprobada",
  );
}

/** Panel flotante "Mi fichaje". Píldora colapsada en la esquina inferior
 *  derecha que se expande a un panel con DOS caras, según el reloj:
 *
 *  · Corriendo → qué estoy fichando AHORA: el pedido en marcha con sus OF, el
 *    tiempo de cada una y el total del día.
 *  · Parado → qué tengo empezado y sin terminar, con el estado de cada OF y
 *    desde cuándo está parada. Antes esta cara no enseñaba nada ("no estás
 *    fichando"), que es justo cuando hace falta saber qué quedó a medias.
 *
 *  Un solo fichaje corre a la vez (un intervalo = un rol). Desde aquí se para
 *  OF a OF o el pedido entero, se retoma lo interrumpido y se pausa/reanuda el
 *  fichaje completo. Asignar trabajo nuevo sigue siendo cosa del tablero: este
 *  panel responde a "¿qué estoy contando?" y a "¿qué dejé a medias?". */
export function MiFichaje({
  miId,
  operarios,
  pedidos,
  fichaje,
  onFichar,
  onDesfichar,
  onPausarTodo,
}: {
  miId: string;
  operarios: Operario[];
  pedidos: Pedido[];
  fichaje: Fichaje;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
  onPausarTodo: () => void;
}) {
  // Cuánto panel se quiere ver, y se recuerda. Quien trabaja con el reloj
  // delante lo quiere abierto toda la jornada; quien no, en la píldora. Que se
  // cerrara solo en cada recarga obligaba a volver a abrirlo cada vez.
  //
  // En el server no se lee localStorage: arranca en píldora y se ajusta al
  // montar, igual que hace la identidad de operario.
  const [modo, setModo] = useState<ModoPanel>(leerModoGuardado);
  const cambiarModo = (v: ModoPanel) => {
    setModo(v);
    try {
      localStorage.setItem(PANEL_MODO_KEY, v);
    } catch {}
  };
  const expandido = modo !== "pildora";
  // Al que abre desde la píldora se le devuelve el tamaño que tenía; la primera
  // vez, el cuadrito con lo que corre, que es lo que se quiere a la vista.
  const [ultimoAbierto, setUltimoAbierto] = useState<Exclude<ModoPanel, "pildora">>(() => {
    const guardado = leerModoGuardado();
    return guardado === "pildora" ? "compacto" : guardado;
  });
  if (modo !== "pildora" && modo !== ultimoAbierto) setUltimoAbierto(modo);

  const ab = abierto(fichaje);

  // Reloj: la proyección avanza aunque nadie toque nada. Los intervalos
  // guardados no cambian; solo se recalcula con este `ahora`.
  //
  // Con un fichaje corriendo va al segundo, que es lo que hace que el
  // contador se vea subir; parado basta con medio minuto (ahí solo sirve para
  // el aviso de trabajo a medias sin fichar, que se mide en minutos) y no
  // tiene sentido repintar 60 veces más a cambio de nada.
  const [ahora, setAhora] = useState(() => new Date().toISOString());
  const corriendo = ab !== null;
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date().toISOString()), corriendo ? 1_000 : 30_000);
    return () => clearInterval(id);
  }, [corriendo]);

  const nOFs = ab?.ofIds.length ?? 0;
  const totalSeg = ab ? (Date.parse(ahora) - Date.parse(ab.inicio)) / 1000 : 0;
  const totalMin = totalSeg / 60;

  // Aviso de fichaje largo (ver AVISO_FICHAJE_LARGO_MIN): solo el rótulo, una
  // OF cualquiera de las que están corriendo basta para identificarlo.
  const ofLargo =
    ab && totalMin >= AVISO_FICHAJE_LARGO_MIN
      ? (pedidos.flatMap((p) => p.ofs).find((of) => ab.ofIds.includes(of.id)) ?? null)
      : null;

  // Mi trabajo empezado y sin terminar, agrupado por pedido. Se calcula
  // siempre (no solo al desplegar) porque de aquí salen las dos cosas: la
  // lista que enseña el panel con el reloj parado y el aviso ámbar.
  const aMedias = pedidos
    .map((p) => ({ pedido: p, ofs: p.ofs.filter((of) => esMiTrabajoAMedias(of, miId)) }))
    .filter((g) => g.ofs.length > 0);
  // De lo que hay a medias, lo que además se podría estar fichando: una OF
  // detenida por Producción sale en la lista (para que se vea POR QUÉ está
  // parada) pero no cuenta como olvido, porque regañar por no fichar algo que
  // la web no deja fichar sería absurdo. Igual con las que RPS no admite.
  const sinFichar = aMedias.flatMap((g) => g.ofs).filter(esFichable);
  // Lo que DISPARA el aviso es más estrecho que lo que el panel enseña: una OF
  // `en_curso` es la que se está planteando ahora mismo, y esa es la que uno se
  // olvida de fichar. Una `devuelta` puede llevar días esperando sin que nadie
  // la toque: avisar por ella dejaría la píldora ámbar encendida para siempre,
  // que es como no avisar. Una vez encendida sí cuenta todo lo que hay a
  // medias, para que el número cuadre con la lista del panel.
  const enCursoSinFichar = sinFichar.some((of) => of.estado === "en_curso");

  // Aviso ámbar: tengo trabajo a medias y ningún fichaje corriendo desde hace
  // más de AVISO_SIN_FICHAR_MIN. Se recuerda el instante en que empezó la
  // situación en estado (no en un ref: leer un ref durante el render está
  // prohibido). El contador va etiquetado con el operario: es por identidad y
  // no debe heredarse al cambiar de técnico (si A llevaba 8 min sin fichar y
  // cambio a B, B arranca de cero).
  const [sinFicharDesde, setSinFicharDesde] = useState<{ opId: string; desde: number } | null>(
    null,
  );
  // Ajuste durante el render, no en un efecto: el efecto provocaba un segundo
  // render en cascada (y el lint lo rechaza). React descarta este render y
  // vuelve a empezar con el valor nuevo, sin pintar el estado intermedio.
  const enSituacion = enCursoSinFichar && !ab;
  if (enSituacion && sinFicharDesde?.opId !== miId) {
    // `ahora` en vez de Date.now(): el reloj del render ya viene de fuera y
    // leerlo aquí es puro, además de usar la misma escala que la comparación.
    setSinFicharDesde({ opId: miId, desde: Date.parse(ahora) });
  } else if (!enSituacion && sinFicharDesde !== null) {
    setSinFicharDesde(null);
  }
  const aviso =
    sinFicharDesde !== null &&
    sinFicharDesde.opId === miId &&
    Date.parse(ahora) - sinFicharDesde.desde >= AVISO_SIN_FICHAR_MIN * 60_000;

  const yo = operarios.find((o) => o.id === miId) ?? null;

  // Escape colapsa el panel expandido (mismo patrón que el Drawer).
  useEffect(() => {
    if (!expandido) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cambiarModo("pildora");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandido]);

  if (!yo) return null;

  // El widget solo aparece cuando aporta algo: hay un fichaje corriendo (para
  // saber qué se está fichando), hay trabajo a medias con el reloj parado
  // desde hace rato (el aviso ámbar), o lo tengo abierto a mano. Esto último
  // importa: al pulsar "Pausar todo" el fichaje deja de correr y sin ello el
  // panel se desvanecía bajo el dedo, llevándose el botón de reanudar. Si no,
  // no molesta: el fichaje se inicia desde las tarjetas del tablero.
  // La píldora se queda SIEMPRE. Antes el widget entero desaparecía con el
  // reloj parado y sin avisos, así que en la pantalla no había ni rastro de que
  // existiera un panel de fichaje: para encontrarlo había que ponerse a fichar.
  // Ocupa una píldora en una esquina; el precio de que se vea es barato.

  // Los minutos del panel son de HOY; el histórico completo se conserva para
  // Olanet (solo se filtra la proyección que ve el técnico, no el fichaje).
  const inicioHoy = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const fichajeHoy: Fichaje = {
    intervalos: fichaje.intervalos.filter((iv) => iv.inicio >= inicioHoy),
  };

  // Con el reloj corriendo: SOLO lo que corre ahora mismo. El panel es el
  // reloj de este fichaje, no la lista de todo lo que tengo asignado: eso ya
  // es el tablero, y repetirlo aquí obligaba a buscar entre veinte pedidos
  // cuál era el que estaba contando. Si fiché el pedido entero salen todas sus
  // OF; si fiché una sola, sale esa sola — el panel refleja lo que se decidió
  // al fichar.
  const enMarcha = new Set(ab?.ofIds ?? []);
  const grupos = pedidos
    .map((p) => ({ pedido: p, ofs: ofsMiasDe(p, miId).filter((of) => enMarcha.has(of.id)) }))
    .filter((g) => g.ofs.length > 0);

  // Con el reloj parado: lo que dejé a medias, de lo último a lo más viejo.
  // Ese orden es el que se busca al abrir el panel ("¿qué estaba haciendo
  // antes de comer?"); el del tablero manda por fecha de planificación, que
  // aquí no dice nada. Lo que nunca se fichó queda al final (cadena vacía).
  const paradoDe = (of: OF) => paradoDesdeDe(fichaje, of.id);
  const aMediasOrden = aMedias
    .map((g) => ({
      ...g,
      paro: g.ofs.reduce((max, of) => {
        const p = paradoDe(of) ?? "";
        return p > max ? p : max;
      }, ""),
    }))
    .sort((a, b) => (a.paro < b.paro ? 1 : a.paro > b.paro ? -1 : 0));

  // Una sola lista para las dos caras del panel: los grupos tienen la misma
  // forma y GrupoPedido sabe en qué modo está por `enMarchaModo`.
  //
  // En "todo" se ven las dos cosas a la vez: lo que corre y lo que quedó a
  // medias, sin repetir el pedido que ya sale arriba. En "compacto" solo lo que
  // corre — el cuadrito con el pedido y sus tiempos, que es lo que se quiere
  // tener a la vista mientras se trabaja.
  const aMediasSinRepetir = aMediasOrden.filter(
    (g) => !grupos.some((x) => x.pedido.id === g.pedido.id),
  );
  const mostrados =
    modo === "completo"
      ? [...grupos, ...aMediasSinRepetir]
      : ab
        ? grupos
        : // Compacto y sin reloj: el último que se dejó a medias, que es lo que
          // se retoma. La lista entera es justo lo que distingue a "Todo".
          aMediasOrden.slice(0, 1);
  // Con varios pedidos a la vez el cuadrito deja de ser un cuadrito: las filas
  // se aprietan y se quedan solo el código, el estado, el tiempo y el botón.
  const denso = modo === "compacto" && mostrados.length > 1;
  const hoy = resumenDelDia(fichajeHoy, ahora);

  // Frase larga para el ratón (y para quien no pilla el rótulo corto de la
  // píldora). No se pone como aria-label: sustituiría al texto visible en el
  // nombre accesible y el control por voz dejaría de responder a lo que se lee
  // en pantalla; como `title` acompaña, que es lo que se quiere.
  const tituloPildora = ab
    ? `${ROL[ab.rol].label} en ${nOF(nOFs)} · llevas ${fmtHMS(totalSeg)}`
    : aviso
      ? `Tienes ${nOF(sinFichar.length, "empezada")} y el reloj parado`
      : "El reloj está parado";

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {expandido && (
        <div className="panel-solido relative flex max-h-[75vh] w-[22rem] flex-col rounded-2xl p-3 pt-4 shadow-2xl">
          {/* Cabecera: lo primero que se mira al abrir es si algo está
              corriendo y cuánto llevo, no cómo me llamo — eso ya está en la
              barra de arriba. Antes había además dos formas de cerrar (un
              tirador y la ✕), una encima de la otra: se queda la ✕, que es la
              que usan el Drawer y el resto de paneles. */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Mi fichaje
            </span>
            {ab ? (
              <span
                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${ROL[ab.rol].chip}`}
              >
                <LiveDot rol={ab.rol} className="size-1.5" />
                {/* tabular-nums: sin ancho fijo de cifra, el reloj tiembla
                    cada segundo y arrastra lo que tiene al lado. */}
                {ROL[ab.rol].label} · <span className="tabular-nums">{fmtHMS(totalSeg)}</span>
              </span>
            ) : (
              // "Reloj parado", no "Parado" a secas: lo que está parado es el
              // contador, no el trabajo (que puede estar empezado y esperando).
              <span className="text-xs font-semibold text-text-muted">⏸ Reloj parado</span>
            )}
            {/* Cuánto panel se quiere: el cuadrito con lo que corre, o todo lo
                que hay a medias. La elección se recuerda — cada uno trabaja de
                una manera y no es cosa de volver a decidirlo en cada recarga. */}
            <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5 ring-1 ring-border">
              {(
                [
                  ["compacto", "Pedido", "Solo el pedido que corre, con sus tiempos"],
                  ["completo", "Todo", "Lo que corre y además lo que dejaste a medias"],
                ] as const
              ).map(([id, texto, ayuda]) => (
                <button
                  key={id}
                  onClick={() => cambiarModo(id)}
                  aria-pressed={modo === id}
                  title={ayuda}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    modo === id ? "bg-surface text-text ring-1 ring-border" : "text-text-muted hover:text-text"
                  }`}
                >
                  {texto}
                </button>
              ))}
            </span>
            <button
              onClick={() => cambiarModo("pildora")}
              // "Minimizar" y no "Cerrar": el panel no se va, se queda en la
              // píldora con el resumen — y así se queda hasta que se vuelva a
              // abrir, también entre recargas.
              aria-label="Minimizar el panel"
              title="Minimizar: el reloj sigue corriendo en la píldora"
              className="grid size-6 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
            >
              ✕
            </button>
          </div>

          {/* ── AVISO TEMPORAL DEL PERIODO DE PRUEBAS ────────────────────────
              Mientras el fichaje de CoordinaOT se contrasta con el de siempre,
              hay que fichar en los DOS: aquí y en la herramienta antigua. Es lo
              único que garantiza que no se pierdan horas si algo no cuadra.
              Va en el panel del reloj, y no en un diálogo de una vez, porque el
              riesgo se repite en cada fichaje: un aviso que se cierra y no
              vuelve se olvida al tercer día.
              QUITAR cuando el fichaje pase a "activo" y OT deje de usar la
              herramienta antigua (ver FICHAJE_OLANET en .env.example). */}
          <p className="mb-2 rounded-lg bg-amber-500/12 px-2 py-1.5 text-[11px] leading-snug text-amber-800 ring-1 ring-amber-500/30 dark:bg-amber-400/12 dark:text-amber-200">
            <span className="font-bold">Periodo de pruebas:</span> de momento hay que fichar
            también en la herramienta antigua, hasta nuevo aviso.
          </p>

          {/* Con el reloj parado hay que decir QUÉ es esta lista: no es lo que
              se está fichando (nada lo está), es lo que quedó a medias. */}
          {!ab && mostrados.length > 0 && (
            <p className="mb-1.5 text-[11px] leading-snug text-text-muted">
              Tienes esto empezado y sin terminar:
            </p>
          )}

          {/* mis OFs agrupadas por pedido */}
          <ul className={`scroll-thin -mx-1 flex-1 overflow-y-auto px-1 ${denso ? "space-y-1" : "space-y-2"}`}>
            {mostrados.length === 0 && (
              <li className="px-1 py-6 text-center text-xs text-text-muted">
                {ab ? "No estás fichando nada ahora." : "No tienes nada empezado a medias."}
              </li>
            )}
            {mostrados.map((g) => (
              <GrupoPedido
                key={g.pedido.id}
                pedido={g.pedido}
                ofs={g.ofs}
                miId={miId}
                fichaje={fichajeHoy}
                ahora={ahora}
                enMarchaModo={ab !== null}
                paradoDesde={paradoDe}
                denso={denso}
                onFichar={onFichar}
                onDesfichar={onDesfichar}
              />
            ))}
          </ul>

          {/* Lo fichado HOY, y nada más.
              Aquí abajo había un "Pausar todo" y un "Reanudar" que valían para
              el fichaje entero, y no se sabía sobre qué actuaban: cada OF y
              cada pedido tienen ya su propio botón, arriba y con nombre. El
              reloj de la cabecera es el del tramo que corre AHORA; esto es el
              acumulado del día, que es la pregunta del final de la jornada y la
              única que sigue teniendo respuesta con el reloj parado. El
              desglose por rol solo sale si hoy hubo de los dos: con uno solo
              repetiría el total. */}
          <div className="mt-3 flex items-baseline gap-2 border-t border-[var(--glass-border)] pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Hoy
            </span>
            <span className="text-xs font-bold tabular-nums text-text">{fmtMin(hoy.total)}</span>
            {hoy.plantear > 0 && hoy.revisar > 0 && (
              <span className="ml-auto text-[10px] text-text-muted">
                {ROL.plantear.label} {fmtMin(hoy.plantear)} · {ROL.revisar.label}{" "}
                {fmtMin(hoy.revisar)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Aviso de fichaje largo: discreto, junto al contador. NO corta el
          fichaje, no exige respuesta — si se ignora, sigue corriendo igual.
          El botón de pausar es solo un atajo por si a la persona se le
          olvidó, nunca un cierre automático (ese lo hace el servidor por
          falta de latido, algo completamente distinto). */}
      {ofLargo && (
        <div className="glass-chip flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          <span>
            ⏳ Llevas {Math.floor(totalMin / 60)}h en {ofLargo.codigo}
          </span>
          <button
            onClick={onPausarTodo}
            className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-600"
          >
            ⏸ Pausar
          </button>
        </div>
      )}

      {/* píldora colapsada/cabecera del panel */}
      <button
        // Al abrir desde la pildora se vuelve al ultimo tamano elegido; la
        // primera vez, al cuadrito con lo que corre.
        onClick={() => cambiarModo(expandido ? "pildora" : ultimoAbierto)}
        aria-expanded={expandido}
        title={tituloPildora}
        // Con color, SIN `glass-chip`: el fondo del vidrio gana a las
        // utilidades de Tailwind (ver globals.css), así que la píldora se
        // quedaba en gris tanto fichando como avisando — el color que dice de
        // un vistazo si algo corre no llegaba a pantalla. Sin color sí lleva
        // vidrio, que es cuando no tiene nada que destacar.
        // Fondo SÓLIDO también en reposo: con el vidrio, la píldora se
        // transparentaba sobre lo que hubiera debajo y no se leía como un
        // control. Es la puerta del panel; tiene que verse que está ahí.
        className={`flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-bold shadow-lg ring-1 ring-border transition-colors ${
          ab
            ? ROL[ab.rol].chip
            : aviso
              ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
              : "panel-solido text-text-muted"
        }`}
      >
        {ab ? (
          <>
            <LiveDot rol={ab.rol} className="size-2" />
            <span>
              ⏱ {nOF(nOFs)} · <span className="tabular-nums">{fmtHMS(totalSeg)}</span>
            </span>
          </>
        ) : aviso ? (
          // Lo que de verdad pasa: hay trabajo empezado y el reloj no cuenta.
          // Sigue en ámbar (es un toque de atención, no un error) pero con ⏸ en
          // vez de ⚠: no se ha roto nada, hay algo pausado. Cuenta solo las
          // fichables, que son de las que uno se puede olvidar; las detenidas
          // salen igual en el panel, con su chip.
          <span>⏸ {nOF(sinFichar.length, "empezada")} sin fichar</span>
        ) : (
          <span>⏸ Reloj parado</span>
        )}
      </button>
    </div>
  );
}

function GrupoPedido({
  pedido,
  ofs,
  miId,
  fichaje,
  ahora,
  enMarchaModo,
  paradoDesde,
  denso,
  onFichar,
  onDesfichar,
}: {
  pedido: Pedido;
  ofs: OF[];
  miId: string;
  fichaje: Fichaje;
  ahora: string;
  /** true = el panel enseña lo que corre AHORA; false = lo que quedó a medias.
   *  Cambia los rótulos, no las reglas: lo que se puede fichar es lo mismo. */
  enMarchaModo: boolean;
  paradoDesde: (of: OF) => string | null;
  /** Varios pedidos a la vez: filas apretadas y sin las líneas de contexto. */
  denso?: boolean;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
}) {
  // Con el reloj en marcha aquí solo llegan OF que se están fichando (ver
  // `enMarcha` arriba), así que manda la rama de "Parar pedido"; con el reloj
  // parado llegan las que tengo a medias y manda la de fichar. Las dos ramas
  // se quedan en los dos modos: la regla de qué se puede arrancar es de este
  // componente, y quien la lea no debería tener que fiarse de un filtro que
  // está en otro sitio.
  //
  // "Fichar pedido" solo ficha lo que me toca PLANTEAR (autor): un fichaje
  // corriendo es un único rol, así que mezclar plantear+revisar en un solo
  // botón no tendría un rol claro que pasarle a onFichar.
  const misPlantear = ofs.filter((of) => of.autorId === miId && rolFichajeDe(of) === "plantear");
  const fichablesPlantear = misPlantear.filter(esFichable);
  const detenidas = misPlantear.length - fichablesPlantear.length;
  // Lo que queda POR arrancar. Antes el botón salía igual con todas las OFs
  // ya corriendo: ofrecía fichar lo que ya se estaba fichando, y ocupaba el
  // sitio donde lo útil es lo contrario, pararlas todas de una vez.
  const porArrancar = fichablesPlantear.filter((of) => of.fichandoRol === null);
  const corriendo = misPlantear.filter((of) => of.fichandoRol !== null);

  return (
    <li className={`rounded-xl bg-surface-2/50 ${denso ? "p-1.5" : "p-2"}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-xs font-semibold text-text">
          {pedido.codigo} <span className="font-normal text-text-muted">· {pedido.cliente}</span>
        </span>
        {porArrancar.length > 0 ? (
          <button
            onClick={() => onFichar(porArrancar.map((o) => o.id), "plantear")}
            className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${ROL.plantear.solido}`}
          >
            {/* Con el reloj parado no se "empieza" nada: se retoma lo que ya
                estaba empezado, y así se llama el botón. */}
            {!enMarchaModo
              ? "Retomar pedido"
              : corriendo.length > 0
                ? "Fichar el resto"
                : "Fichar pedido"}
          </button>
        ) : corriendo.length > 1 ? (
          <button
            onClick={() => corriendo.forEach((o) => onDesfichar(o.id))}
            className="ml-auto shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-text-muted hover:border-border-strong hover:text-text"
          >
            Parar pedido
          </button>
        ) : null}
      </div>
      {detenidas > 0 && fichablesPlantear.length > 0 && (
        <p className="mt-0.5 text-[10px] text-text-muted">
          {/* "fichando X de Y" sería mentira con el reloj parado: ahí lo que
              cuenta es cuántas se PODRÍAN retomar. */}
          {enMarchaModo
            ? `fichando ${fichablesPlantear.length} de ${misPlantear.length}`
            : `${fichablesPlantear.length} de ${misPlantear.length} se pueden fichar`}{" "}
          — {detenidas} detenida{detenidas === 1 ? "" : "s"}
        </p>
      )}
      <ul className={denso ? "mt-1 space-y-0.5" : "mt-1.5 space-y-1"}>
        {ofs.map((of) => (
          <OFItem
            key={of.id}
            of={of}
            fichaje={fichaje}
            ahora={ahora}
            paradoDesde={enMarchaModo || denso ? undefined : paradoDesde(of)}
            denso={denso}
            onFichar={onFichar}
            onDesfichar={onDesfichar}
          />
        ))}
      </ul>
    </li>
  );
}

function OFItem({
  of,
  fichaje,
  ahora,
  paradoDesde,
  denso,
  onFichar,
  onDesfichar,
}: {
  of: OF;
  fichaje: Fichaje;
  ahora: string;
  /** Cuándo dejó de correr el reloj de esta OF. `undefined` = no procede
   *  enseñarlo (el panel está en modo "lo que corre AHORA"); `null` = está a
   *  medias pero nunca se llegó a fichar. */
  paradoDesde?: string | null;
  /** Fila apretada: sin las líneas de contexto de debajo. */
  denso?: boolean;
  onFichar: (ofIds: string[], rol: Rol) => void;
  onDesfichar: (ofId: string) => void;
}) {
  const meta = ESTADO[of.estado];
  const fichando = of.fichandoRol !== null;
  // Sin redondear a minutos: `fmtMin` ya sabe enseñar segundos, y redondear
  // dejaba en «0m» un fichaje de 40 s recién pausado.
  const minutos = minutosOF(fichaje, of.id, { ahora });
  // Qué se va a fichar aquí: una OF en revisión ficha REVISIÓN. El botón decía
  // "empieza el planteo" también sobre una OF que estaba revisando.
  const rol = rolFichajeDe(of);
  // "Reanudar" en cuanto la OF tenga tiempo, venga de donde venga: se miraba
  // solo MI tiempo de hoy y encima redondeado, así que al pausar una revisión
  // de menos de medio minuto el botón volvía a decir "Fichar" — y una OF con
  // horas fichadas en el terminal de RPS también.
  const yaEmpezada = tiempoTotalOF(of) > 0 || minutos > 0;

  return (
    <li className={`rounded-lg bg-surface-2/70 px-2 text-[11px] ${denso ? "py-1" : "py-1.5"}`}>
      <div className="flex items-center gap-2">
        <span className="truncate font-mono font-semibold text-text">{of.codigo}</span>
        {/* Etiqueta entera, no la abreviatura: "REVIS." y "POR REV." se
            parecen demasiado, y en este panel sobra ancho para distinguirlas.
            El chip sale de ESTADO: es el mismo color que en el tablero, así que
            "devuelta" o "en revisión" se reconocen sin leer. */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.chip}`}
        >
          {meta.label}
        </span>
        <span className="ml-auto shrink-0 text-text-muted" title="Tiempo que llevas hoy en esta OF">
          {fmtMin(minutos)}
        </span>
        {!fichando && motivoNoFichable(of) ? (
          <span
            title={motivoNoFichable(of)!}
            className="shrink-0 cursor-help rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-text-muted/60"
          >
            {of.detenida ? "Detenida" : "No fichable"}
          </span>
        ) : fichando ? (
          // Las mismas palabras y el mismo verde que en el tablero y en el
          // detalle: "Parar" aquí y "Pausar" allí eran dos nombres para el
          // mismo botón. Y en tono fantasma no se veía que fuera la acción.
          <button
            onClick={() => onDesfichar(of.id)}
            title="Para el reloj y deja la OF como está: sigue siendo tuya y en curso"
            // Del color de SU rol: el verde es el del planteo en toda la app, y
            // sobre una OF que se está revisando decía el rol equivocado.
            className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold ${ROL[of.fichandoRol!].solido}`}
          >
            ⏸ Pausar
          </button>
        ) : (
          <button
            onClick={() => onFichar([of.id], rol)}
            title={`${yaEmpezada ? "Vuelve a poner el reloj en marcha" : "Pone el reloj en marcha"} en ${
              rol === "revisar" ? "la revisión" : "el planteo"
            } de esta OF`}
            className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold ${ROL[rol].solido}`}
          >
            {yaEmpezada ? "▶ Reanudar" : "⏱ Fichar"}
          </button>
        )}
      </div>
      {/* Desde cuándo está parada: "está a medias" sin más no sirve para
          decidir qué retomar; "parado desde las 11:40" sí. No se pinta si la OF
          está fichándose (el tablero puede decir que corre aunque mi reloj
          local esté parado: ahí la línea se contradiría con el botón). */}
      {paradoDesde !== undefined && !fichando && (
        <p className="mt-1 text-[10px] text-text-muted">
          {paradoDesde
            ? `Parado desde ${fmtDesde(paradoDesde, ahora)}`
            : of.fichadaDesde
              ? // Sin tramos MÍOS pero con imputaciones en RPS: el trabajo se
                // empezó fuera de la web (o lo empezó otro). Antes esto decía
                // "Aún sin fichar", que era mentira y de las que escuecen: la
                // OF 0217537 lleva 23 horas encima desde el 10/10/2025.
                //
                // Aquí NO vale `fmtDesde`: RPS guarda el día, no el instante
                // (0 de 12 763 imputaciones de 2026 llevan hora), y formatearlo
                // con horas se inventaría un "a las 2:00".
                `Empezada el ${fmtDia(of.fichadaDesde)}, fuera de la web`
              : "Aún sin fichar"}
        </p>
      )}
    </li>
  );
}
