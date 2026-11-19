"use client";

import { useEffect, useRef, useState } from "react";
import type { Rango } from "@/lib/visita";
import { SelectorFecha } from "./SelectorFecha";

// «Mis ausencias» (spec 2026-11-19): teletrabajo fijo y días sueltos. Sirven
// para rellenar «No estamos en OT» al pedir una visita. La nota es solo tuya.

const DIAS = [
  { n: 1, letra: "L", nombre: "Lunes" }, { n: 2, letra: "M", nombre: "Martes" }, { n: 3, letra: "X", nombre: "Miércoles" },
  { n: 4, letra: "J", nombre: "Jueves" }, { n: 5, letra: "V", nombre: "Viernes" },
];

export function MisAusencias({ miId, onCerrar, onGuardado }: {
  miId: string | null; onCerrar: () => void; onGuardado?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [dias, setDias] = useState<number[]>([]);
  const [rangos, setRangos] = useState<Rango[]>([]);
  const [estado, setEstado] = useState<"cargando" | "listo" | "guardando" | "error">("cargando");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    const q = miId ? `?operarioId=${encodeURIComponent(miId)}` : "";
    fetch(`/api/ausencias${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((a: { dias: number[]; rangos: Rango[] }) => { setDias(a.dias); setRangos(a.rangos); setEstado("listo"); })
      .catch(() => { setEstado("error"); setError("No he podido cargar tus ausencias"); });
  }, [miId]);

  const cambiarDia = (n: number) => setDias((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));
  const cambiarRango = (i: number, cambio: Partial<Rango>) =>
    setRangos((rs) => rs.map((r, j) => (j === i ? { ...r, ...cambio } : r)));

  async function guardar() {
    setEstado("guardando");
    setError(null);
    const r = await fetch("/api/ausencias", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operarioId: miId, dias, rangos: rangos.filter((x) => x.desde && x.hasta) }),
    }).catch(() => null);
    if (r?.ok) {
      onGuardado?.();
      return onCerrar();
    }
    setEstado("listo");
    setError(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se ha podido guardar");
  }

  return (
    // Centrado con m-auto: el reset de Tailwind quita el margin:auto del dialog.
    // Mientras guarda, Escape no cierra (el guardado seguiría en marcha).
    <dialog
      ref={ref}
      onClose={onCerrar}
      onCancel={(e) => { if (estado === "guardando") e.preventDefault(); }}
      aria-labelledby="mis-ausencias-titulo"
      aria-busy={estado === "cargando"}
      className="m-auto w-[min(560px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[24px] bg-surface p-6 text-text shadow-[var(--hero-sombra-panel)] backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-black/40"
    >
      <h2 id="mis-ausencias-titulo" className="text-lg font-semibold">Mis ausencias</h2>
      <p className="mt-1 text-sm text-text-muted">Salen en el calendario de Visitas y en el correo al pedir una visita, como «no está en OT». La nota solo la ves tú.</p>
      {estado === "cargando" && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}

      <section className="mt-5">
        <h3 id="mis-ausencias-teletrabajo" className="text-sm font-semibold">Teletrabajo fijo</h3>
        <div className="mt-2 flex gap-2" role="group" aria-labelledby="mis-ausencias-teletrabajo">
          {DIAS.map((d) => (
            <button
              key={d.n}
              type="button"
              aria-pressed={dias.includes(d.n)}
              aria-label={d.nombre}
              title={d.nombre}
              onClick={() => cambiarDia(d.n)}
              className={`h-9 w-9 rounded-full text-sm font-semibold ${dias.includes(d.n) ? "bg-brand-400 text-brand-950" : "bg-surface-2 text-text hover:bg-[var(--hero-relleno-encima)]"}`}
            >
              {d.letra}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Días sueltos (vacaciones, libres…)</h3>
        <ul className="mt-2 space-y-2">
          {rangos.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              {/* El calendario de los filtros (Iván, 19/11): un día suelto o un
                  tramo, sin dos campos de fecha del navegador. */}
              <SelectorFecha
                desde={r.desde}
                hasta={r.hasta}
                onCambiar={(desde, hasta) => cambiarRango(i, { desde, hasta })}
                modoVacio="rango"
                vacio="Elegir días"
                ayuda="Días que no estás: uno suelto o un tramo"
                claseBoton="flex h-9 min-w-44 max-w-full items-center gap-2 rounded-[14px] bg-surface-2 px-3 text-sm font-medium shadow-[var(--hero-sombra-campo)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hero-anillo)]"
              />
              <input type="text" aria-label="Nota (solo la ves tú)" placeholder="Nota (solo tú)" maxLength={200} value={r.nota ?? ""}
                onChange={(e) => cambiarRango(i, { nota: e.target.value })}
                className="h-9 min-w-0 flex-1 rounded-[14px] bg-surface-2 px-3 text-sm shadow-[var(--hero-sombra-campo)]" />
              <button type="button" onClick={() => setRangos((rs) => rs.filter((_, j) => j !== i))}
                className="rounded-full px-3 py-1.5 text-sm text-text-muted hover:bg-[var(--hero-relleno-encima)]" aria-label="Quitar estos días">Quitar</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setRangos((rs) => [...rs, { desde: "", hasta: "" }])}
          className="mt-2 rounded-full bg-surface-2 px-4 py-1.5 text-sm font-semibold hover:bg-[var(--hero-relleno-encima)]">+ Añadir días</button>
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-error">{error}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} disabled={estado === "guardando"}
          className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--hero-relleno-encima)] disabled:opacity-50">Cancelar</button>
        <button type="button" onClick={guardar} disabled={estado !== "listo"}
          className="rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-brand-950 disabled:opacity-50">
          {estado === "guardando" ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </dialog>
  );
}
