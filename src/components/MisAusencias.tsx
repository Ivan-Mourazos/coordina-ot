"use client";

import { useEffect, useRef, useState } from "react";
import type { Rango } from "@/lib/visita";

// «Mis ausencias» (spec 2026-11-19): teletrabajo fijo y días sueltos. Sirven
// para rellenar «No estamos en OT» al pedir una visita. La nota es solo tuya.

const DIAS = [
  { n: 1, letra: "L" }, { n: 2, letra: "M" }, { n: 3, letra: "X" }, { n: 4, letra: "J" }, { n: 5, letra: "V" },
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
    <dialog
      ref={ref}
      onClose={onCerrar}
      aria-labelledby="mis-ausencias-titulo"
      className="w-[min(560px,calc(100vw-2rem))] rounded-[24px] bg-surface p-6 text-text backdrop:bg-black/40"
    >
      <h2 id="mis-ausencias-titulo" className="text-lg font-semibold">Mis ausencias</h2>
      <p className="mt-1 text-sm text-text-muted">Salen en el calendario de Visitas y en el correo al pedir una visita, como «no está en OT». La nota solo la ves tú.</p>

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Teletrabajo fijo</h3>
        <div className="mt-2 flex gap-2" role="group" aria-label="Días de teletrabajo">
          {DIAS.map((d) => (
            <button
              key={d.n}
              type="button"
              aria-pressed={dias.includes(d.n)}
              onClick={() => cambiarDia(d.n)}
              className={`h-9 w-9 rounded-full text-sm font-semibold ${dias.includes(d.n) ? "bg-brand-400 text-brand-950" : "bg-surface-2 text-text"}`}
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
              <input type="date" aria-label="Desde" value={r.desde} onChange={(e) => cambiarRango(i, { desde: e.target.value, hasta: r.hasta || e.target.value })}
                className="rounded-[14px] bg-surface-2 px-3 py-1.5 text-sm shadow-[var(--hero-sombra-campo)]" />
              <span className="text-sm text-text-muted">al</span>
              <input type="date" aria-label="Hasta" value={r.hasta} min={r.desde} onChange={(e) => cambiarRango(i, { hasta: e.target.value })}
                className="rounded-[14px] bg-surface-2 px-3 py-1.5 text-sm shadow-[var(--hero-sombra-campo)]" />
              <input type="text" aria-label="Nota (solo la ves tú)" placeholder="Nota (solo tú)" maxLength={200} value={r.nota ?? ""}
                onChange={(e) => cambiarRango(i, { nota: e.target.value })}
                className="min-w-0 flex-1 rounded-[14px] bg-surface-2 px-3 py-1.5 text-sm shadow-[var(--hero-sombra-campo)]" />
              <button type="button" onClick={() => setRangos((rs) => rs.filter((_, j) => j !== i))}
                className="rounded-full px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2" aria-label="Quitar estos días">Quitar</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setRangos((rs) => [...rs, { desde: "", hasta: "" }])}
          className="mt-2 rounded-full bg-surface-2 px-4 py-1.5 text-sm font-semibold">+ Añadir días</button>
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-error">{error}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-2">Cancelar</button>
        <button type="button" onClick={guardar} disabled={estado !== "listo"}
          className="rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-brand-950 disabled:opacity-50">
          {estado === "guardando" ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </dialog>
  );
}
