"use client";

// ─── Una pestaña abierta cuando se despliega ─────────────────────────────────
// Una pestaña que lleva abierta desde antes del despliegue sigue con el código
// viejo, y aquí la web se deja abierta toda la jornada. Con Next hay además un
// efecto peor que quedarse sin lo nuevo: los trozos de JavaScript de la
// versión anterior dejan de existir en el servidor, así que al abrir una
// pantalla que no estaba cargada todavía puede salir un error.
//
// SE ARREGLA SOLA (Iván, 25/11/2026). Antes salía siempre un aviso para
// recargar, también por un arreglo de rendimiento, y un aviso que sale siempre
// se deja de leer. Ahora:
//   · la pestaña recarga por su cuenta cuando lleva un rato quieta, sin nada
//     abierto ni a medio escribir (`puedeRecargarSola`), y nadie se entera;
//   · si al abrir una pantalla falla por el código viejo, recarga en el acto
//     (la pantalla no había llegado a abrirse, no se pierde nada);
//   · el aviso de abajo SOLO sale si la versión nueva trae novedades que le
//     tocan a quien mira, y dice cuáles. Al recargar, el panel de novedades
//     se abre solo como siempre.
//
// Pregunta a `/api/version` cada minuto con la marca de la última novedad que
// trae este código; el servidor contesta su versión y lo publicado después.

import { useEffect, useRef, useState } from "react";
import { MARCA_ULTIMA, type Cambio, type PerfilNovedades } from "@/lib/novedades";
import { cambiosParaAvisar, esTrozoPerdido, puedeRecargarSola } from "@/lib/version-nueva";

/** Cada cuánto se pregunta si ha cambiado la versión. La petición es de nada
 *  (no toca la base de datos). */
const SONDEO_VERSION_MS = 60_000;
/** Cada cuánto se mira si ya se puede recargar sola. */
const MIRAR_RECARGA_MS = 15_000;
/** Para no entrar en un bucle si el error de trozos no lo arregla recargar. */
const CLAVE_ULTIMA_RECARGA = "coordina-recarga-por-trozo";

function hayVentanaAbierta(): boolean {
  return document.querySelector('[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog[open]') !== null;
}

function estaEscribiendo(): boolean {
  const a = document.activeElement;
  return a instanceof HTMLElement && (a.isContentEditable || a.matches("input,textarea,select"));
}

function hayBorrador(): boolean {
  for (const t of document.querySelectorAll("textarea")) if (t.value.trim()) return true;
  return false;
}

/** Recarga al momento si una pantalla no se abre porque su código ya no está
 *  en el servidor. Una vez por minuto como mucho, por si no era eso. */
function useRecargaSiFaltaCodigo() {
  useEffect(() => {
    const revisar = (mensaje: string) => {
      if (!esTrozoPerdido(mensaje)) return;
      try {
        const ultima = Number(sessionStorage.getItem(CLAVE_ULTIMA_RECARGA) ?? 0);
        if (Date.now() - ultima < 60_000) return;
        sessionStorage.setItem(CLAVE_ULTIMA_RECARGA, String(Date.now()));
      } catch { /* Sin almacenamiento se recarga igual. */ }
      window.location.reload();
    };
    const alError = (e: ErrorEvent) => revisar(`${e.message} ${e.error?.name ?? ""}`);
    const alRechazo = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | undefined;
      revisar(`${r?.name ?? ""} ${r?.message ?? String(e.reason)}`);
    };
    window.addEventListener("error", alError);
    window.addEventListener("unhandledrejection", alRechazo);
    return () => {
      window.removeEventListener("error", alError);
      window.removeEventListener("unhandledrejection", alRechazo);
    };
  }, []);
}

/** `null` mientras el servidor sirve la misma versión que esta pestaña. Si
 *  hay otra: las novedades que traen y le tocan a `perfil` (vacío si no
 *  trae nada importante). Mientras tanto, recarga sola en cuanto puede. */
export function useVersionNueva(perfil: PerfilNovedades): readonly Cambio[] | null {
  const cargada = useRef<string | null>(null);
  const [nueva, setNueva] = useState<Cambio[] | null>(null);
  useRecargaSiFaltaCodigo();

  // ¿Ha cambiado la versión? Se apunta la primera que llega y luego se compara.
  useEffect(() => {
    if (nueva) return;
    let vivo = true;
    const mirar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const q = new URLSearchParams({ desde: MARCA_ULTIMA ?? "" });
        const r = await fetch(`/api/version?${q}`, { cache: "no-store" });
        if (!r.ok) return;
        const { version, novedades } = (await r.json()) as { version?: string; novedades?: Cambio[] };
        if (!vivo || !version || version === "dev") return;
        if (!cargada.current) cargada.current = version;
        else if (cargada.current !== version) setNueva(novedades ?? []);
      } catch {
        // Sin red no hay nada que decir; ya preguntará la próxima vez.
      }
    };
    void mirar();
    const reloj = window.setInterval(mirar, SONDEO_VERSION_MS);
    document.addEventListener("visibilitychange", mirar);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", mirar);
    };
  }, [nueva]);

  // Con versión nueva, recargar sola en cuanto la pestaña esté quieta.
  useEffect(() => {
    if (!nueva) return;
    let tocada = Date.now();
    const tocar = () => { tocada = Date.now(); };
    const eventos = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const e of eventos) window.addEventListener(e, tocar, { passive: true });
    const reloj = window.setInterval(() => {
      const quieta = puedeRecargarSola({
        inactivaMs: Date.now() - tocada,
        hayVentana: hayVentanaAbierta(),
        escribiendo: estaEscribiendo(),
        hayBorrador: hayBorrador(),
      });
      if (quieta) window.location.reload();
    }, MIRAR_RECARGA_MS);
    return () => {
      for (const e of eventos) window.removeEventListener(e, tocar);
      window.clearInterval(reloj);
    };
  }, [nueva]);

  return nueva ? cambiosParaAvisar(nueva, perfil) : null;
}

/** El aviso, solo para versiones con novedades. `cambios` no vacío. */
export function VersionNueva({ cambios }: { cambios: readonly Cambio[] }) {
  const [primero, ...resto] = cambios;
  if (!primero) return null;
  return (
    // Abajo en el centro, como los avisos de Planteamientos: tarjeta sin borde,
    // icono y título en el color del aviso y la explicación en gris. El estilo
    // HeroUI lo remata en hero.css (`.aviso-version`).
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex justify-center p-3">
      <div role="status" className="aviso-version glass-pop pointer-events-auto flex max-w-2xl items-center gap-3 rounded-xl px-3 py-2 shadow-lg">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="aviso-version-icono size-5 shrink-0 text-brand-700 dark:text-brand-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        <span className="flex min-w-0 flex-col text-sm">
          <span className="font-semibold text-brand-700 dark:text-brand-300">
            {resto.length > 0 ? `Novedades en CoordinaOT (${cambios.length})` : "Novedad en CoordinaOT"}
          </span>
          <span className="text-text-muted">
            {primero.titulo}
            {resto.length > 0 && ` y ${resto.length === 1 ? "una más" : `${resto.length} más`}`}
          </span>
        </span>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
