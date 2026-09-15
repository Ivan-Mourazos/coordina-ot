"use client";

import { useEffect, useState } from "react";
import { esFaseDe, type Seccion } from "@/lib/secciones";
import { finalizables, situacionDe, type FaseDeOF } from "@/lib/fase-pendiente";
import type { OF } from "@/lib/types";
import { avisosTrasCerrarEnRps, type RespuestaCierreRps } from "@/lib/cerrar-of-avisos";
import { ConfirmDialog } from "./ConfirmDialog";

interface FaseConBoletin extends FaseDeOF {
  idBoletin: string;
}

const SIN_RPS = "No se puede hablar con RPS ahora mismo. No se ha cerrado nada.";
const SIN_ESCRIBIR = "No se ha podido escribir en RPS. No se ha cerrado nada; el reloj sí se ha parado.";
const RETIRADA = "RPS ya retiró esta operación; no hay nada que cerrar.";

/** «Dar por terminada en RPS», con su confirmación DINÁMICA: antes de
 *  enseñarla se piden a OLANET las operaciones de la OF (`GET /api/fases?ofs=`,
 *  la misma ruta que usa `FasesSinFinalizar`), porque el texto depende de lo
 *  que haya de verdad — una operación, la trampa 2/02, o que ya esté
 *  terminada. Sección 2 de la spec del 15/09/2026, "La confirmación".
 *
 *  La OF solo cambia en pantalla cuando la ruta contesta bien (`onCerrado`):
 *  un cambio optimista que luego falla dejaría apartada una OF sin cerrar.
 *
 *  Mismo patrón CONTROLADO que `AnularInline`: sin `abierto`, trae su propio
 *  botón (para cuando es la única opción del cajón y `AccionesOF` la saca a
 *  la fila); con `abierto`/`onAbrirCambio`, la dispara el menú de "⋯". */
export function CerrarEnRpsInline({
  of,
  seccion,
  miId,
  onCerrado,
  abierto: abiertoFuera,
  onAbrirCambio,
}: {
  of: OF;
  seccion: Seccion;
  miId: string;
  /** La OF ya se cerró en el servidor: el Board actualiza su estado local.
   *  `avisos`: lo que el autor tiene que saber aunque haya ido bien (ya estaba
   *  terminada, o una gemela 2/02 no entró). Se pasan hacia arriba porque este
   *  componente se desmonta en cuanto la OF queda marcada. */
  onCerrado: (ofId: string, cerradaRps: NonNullable<OF["cerradaRps"]>, avisos?: string[]) => void;
  abierto?: boolean;
  onAbrirCambio?: (v: boolean) => void;
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const controlado = abiertoFuera !== undefined;
  const abierto = controlado ? abiertoFuera : abiertoPropio;
  // Cerrar SIEMPRE que se acaba un intento, también con error: en modo
  // controlado, si `abierto` se quedara en true, volver a elegir la opción del
  // menú no cambiaría nada y el efecto de abajo no se dispararía otra vez.
  const cerrarPanel = () => (controlado ? onAbrirCambio?.(false) : setAbiertoPropio(false));

  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pendientes, setPendientes] = useState<FaseConBoletin[]>([]);

  async function cargarYConfirmar() {
    setError(null);
    setCargando(true);
    try {
      const r = await fetch(`/api/fases?ofs=${encodeURIComponent(of.codigo)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { fases: FaseConBoletin[] };
      const deMiSeccion = d.fases.filter((f) => esFaseDe(f.maquina, seccion));
      const abiertas = finalizables(d.fases, seccion);
      // Sin nada abierto Y sin ninguna terminada: lo que queda está eliminado
      // (4) o en un estado que no conocemos. Decir "ya está terminada" sería
      // mentir; la ruta contestaría 409 con este mismo texto, así que se dice
      // ya, sin preguntar algo que no va a pasar.
      if (abiertas.length === 0 && !deMiSeccion.some((f) => situacionDe(f.estado) === "finalizada")) {
        setError(RETIRADA);
        cerrarPanel();
        return;
      }
      setPendientes(abiertas);
      setConfirmar(true);
    } catch {
      setError(SIN_RPS);
      cerrarPanel();
    } finally {
      setCargando(false);
    }
  }

  // Modo controlado: el disparo es el propio `abierto` (lo pone el menú de
  // "⋯"), no un clic aquí dentro. Diferido con setTimeout(0), mismo patrón
  // que FasesSinFinalizar/HistorialDrawer: un efecto no puede llamar a
  // setState de forma síncrona.
  useEffect(() => {
    if (!controlado || !abiertoFuera) return;
    const id = setTimeout(() => void cargarYConfirmar(), 0);
    return () => clearTimeout(id);
    // El resto de dependencias (of.codigo, seccion) no cambian mientras el
    // panel está abierto; recalcular solo cuando se abre es lo correcto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlado, abiertoFuera]);

  async function confirmarCierre() {
    setConfirmar(false);
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/fases/cerrar-of", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ofId: of.id, seccion: seccion.id, operarioId: miId }),
      });
      const d = (await r.json().catch(() => null)) as
        | ({ ok: true; modo: "sombra" | "ensayo" | "activo" } & RespuestaCierreRps)
        | { error: string }
        | null;
      if (!r.ok || !d || !("ok" in d)) {
        // Los textos de error los pone la ruta, ya en el idioma del taller
        // ("Queda tiempo de esta OF por subir…", "RPS ya retiró…").
        setError((d as { error?: string } | null)?.error ?? SIN_ESCRIBIR);
        cerrarPanel();
        return;
      }
      onCerrado(of.id, { at: new Date().toISOString(), por: miId, modo: d.modo }, avisosTrasCerrarEnRps(d));
      cerrarPanel();
    } catch {
      setError(SIN_ESCRIBIR);
      cerrarPanel();
    } finally {
      setEnviando(false);
    }
  }

  const trampa = pendientes.length === 2;
  const yaEstaba = confirmar && pendientes.length === 0;
  const mensaje = yaEstaba
    ? "En RPS ya está terminada. Aquí la OF queda aprobada y se aparta del pedido."
    : trampa
      ? `En RPS esta OF tiene dos operaciones de ${seccion.nombre} abiertas, la ${pendientes[0].fase} y la ${pendientes[1].fase}. Se dan por terminadas las dos.\n\nProducción las verá terminadas, con la fecha de hoy y a tu nombre. Antes se para el reloj de quien la esté fichando.\n\nAquí la OF queda aprobada y se aparta del pedido; lo demás sigue en el panel.`
      : `Producción verá la operación ${pendientes[0]?.fase ?? ""} de la OF ${of.codigo} como terminada, con la fecha de hoy y a tu nombre. Antes se para el reloj de quien la esté fichando.\n\nAquí la OF queda aprobada y se aparta del pedido; lo demás sigue en el panel.`;

  return (
    <>
      {!controlado && (
        <button
          type="button"
          onClick={() => { setAbiertoPropio(true); void cargarYConfirmar(); }}
          disabled={cargando || enviando}
          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-text-muted ring-1 ring-border hover:bg-[var(--glass-highlight)] disabled:opacity-50"
        >
          {cargando ? "Consultando RPS…" : "Dar por terminada en RPS"}
        </button>
      )}
      {controlado && (cargando || enviando) && (
        <p className="w-full text-[11px] text-text-muted" role="status">
          {cargando ? "Consultando RPS…" : "Dando por terminada en RPS…"}
        </p>
      )}
      {error && (
        <p className="w-full text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
      {abierto && (
        <ConfirmDialog
          abierto={confirmar}
          titulo="Dar por terminada en RPS"
          mensaje={mensaje}
          tono="neutra"
          textoConfirmar="Dar por terminada"
          onConfirmar={() => void confirmarCierre()}
          onCancelar={() => {
            setConfirmar(false);
            cerrarPanel();
          }}
        />
      )}
    </>
  );
}
