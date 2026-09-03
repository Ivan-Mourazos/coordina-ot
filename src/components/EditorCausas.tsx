"use client";

import { useState } from "react";
import { CAUSA_MAX } from "@/lib/devolucion";
import { yaExiste } from "@/lib/guia-revision";
import { familiaMeta } from "@/lib/familia";
import {
  crearCausa,
  editarCausa,
  retirarCausa,
  type CausaDevolucion,
} from "@/lib/causas-cliente";
import { Select } from "./Select";

// ─── Cambiar la lista de causas y la guía ────────────────────────────────────
// Hasta ahora una causa solo se podía crear desde una devolución, o sea que
// para arreglar una frase había que tener una OF que devolver. Ángel es quien
// sabe qué hay que mirar en cada trabajo y no es quien devuelve, así que la
// lista se quedaba como estuviera.
//
// SE EDITA LA MISMA FILA, no se crea otra: las devoluciones guardan el id de su
// causa, y duplicarla partiría en dos el histórico de un mismo fallo. Corregir
// una tilde o afinar la frase no puede costar lo contado hasta hoy.
//
// NO SE BORRA NADA, se RETIRA. Una causa retirada deja de ofrecerse pero sigue
// existiendo, porque las devoluciones de hace meses la nombran y el Historial
// tiene que poder decir de qué fueron.

/** Las familias que se ofrecen para colgar un punto.
 *
 *  No están las 28 de RPS: son las del trabajo que pasa por Oficina Técnica, y
 *  una lista de treinta convierte elegir en buscar. Las demás siguen valiendo
 *  —se pueden escribir desde una devolución— y quien necesite una que no esté
 *  aquí lo dirá. */
const FAMILIAS_OFRECIDAS = [
  "TOLDO",
  "LONA",
  "CAMION",
  "REMOLQUE",
  "PUERTA",
  "FUNDA",
  "CARPA",
  "TAPIZADO",
  "ASSAABLOY",
];

export function EditorCausas({
  causas,
  onCambio,
}: {
  causas: CausaDevolucion[];
  onCambio: (causas: CausaDevolucion[]) => void;
}) {
  const [nueva, setNueva] = useState<{ mira: string; etiqueta: string; familia: string | null }>({
    mira: "",
    etiqueta: "",
    familia: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const reemplazar = (c: CausaDevolucion) =>
    onCambio(causas.map((x) => (x.id === c.id ? c : x)));

  async function guardarNueva() {
    const etiqueta = nueva.etiqueta.trim();
    const mira = nueva.mira.trim();
    if (etiqueta.length < 3) {
      setError("Escribe qué se marca cuando ese punto falla.");
      return;
    }
    if (yaExiste(etiqueta, causas)) {
      setError("Ya hay una causa que dice lo mismo.");
      return;
    }
    setGuardando(true);
    const c = await crearCausa(etiqueta, null, { familia: nueva.familia, mira: mira || null });
    setGuardando(false);
    if (!c) {
      setError("No se pudo guardar.");
      return;
    }
    onCambio([...causas.filter((x) => x.id !== c.id), c]);
    setNueva({ mira: "", etiqueta: "", familia: nueva.familia });
    setError(null);
  }

  return (
    <div>
      <p className="mb-3 text-[11px] leading-snug text-text-muted">
        Cada línea es un punto de la guía por sus dos caras: lo que se comprueba
        al revisar y lo que se marca si falla. Sin la primera, la causa se puede
        marcar al devolver pero no sale en la guía.
      </p>

      <ul className="mb-4 flex flex-col gap-2">
        {causas.map((c) => (
          <Fila
            key={c.id}
            causa={c}
            otras={causas}
            onGuardada={reemplazar}
            onRetirar={async (retirada) => {
              if (await retirarCausa(c.id, retirada)) reemplazar({ ...c, retirada });
            }}
          />
        ))}
      </ul>

      <div className="rounded-lg border border-dashed border-border p-2">
        <p className="mb-1.5 text-[11px] font-semibold text-text">Añadir un punto</p>
        <div className="flex flex-col gap-1.5">
          <input
            value={nueva.mira}
            maxLength={CAUSA_MAX}
            onChange={(e) => setNueva((n) => ({ ...n, mira: e.target.value }))}
            placeholder="Al revisar: qué se comprueba"
            aria-label="Qué se comprueba al revisar"
            className="rounded-md bg-surface px-2 py-1 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-brand-400"
          />
          <input
            value={nueva.etiqueta}
            maxLength={CAUSA_MAX}
            onChange={(e) => setNueva((n) => ({ ...n, etiqueta: e.target.value }))}
            placeholder="Si falla: qué se marca al devolver"
            aria-label="Qué se marca si falla"
            className="rounded-md bg-surface px-2 py-1 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-brand-400"
          />
          <div className="flex items-center gap-2">
            <SelectorFamilia
              familia={nueva.familia}
              onCambiar={(f) => setNueva((n) => ({ ...n, familia: f }))}
            />
            <button
              onClick={() => void guardarNueva()}
              disabled={guardando}
              className="ml-auto rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Añadir
            </button>
          </div>
        </div>
        {error && <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function Fila({
  causa,
  otras,
  onGuardada,
  onRetirar,
}: {
  causa: CausaDevolucion;
  otras: CausaDevolucion[];
  onGuardada: (c: CausaDevolucion) => void;
  onRetirar: (retirada: boolean) => void;
}) {
  const [mira, setMira] = useState(causa.mira ?? "");
  const [etiqueta, setEtiqueta] = useState(causa.etiqueta);
  const [error, setError] = useState<string | null>(null);
  const sucia = mira !== (causa.mira ?? "") || etiqueta !== causa.etiqueta;

  async function guardar() {
    if (etiqueta.trim().length < 3) {
      setError("La causa no puede quedarse vacía.");
      return;
    }
    if (yaExiste(etiqueta, otras, causa.id)) {
      setError("Ya hay otra causa que dice lo mismo.");
      return;
    }
    const r = await editarCausa(causa.id, { etiqueta, mira: mira.trim() || null });
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setError(null);
    onGuardada(r.causa);
  }

  return (
    <li
      className={`rounded-lg p-2 ring-1 ring-border ${causa.retirada ? "opacity-50" : ""}`}
    >
      <div className="flex flex-col gap-1">
        <input
          value={mira}
          maxLength={CAUSA_MAX}
          onChange={(e) => setMira(e.target.value)}
          placeholder="Al revisar: qué se comprueba (vacío = no sale en la guía)"
          aria-label={`Qué se comprueba, en ${causa.etiqueta}`}
          className="rounded-md bg-surface px-2 py-1 text-xs text-text outline-none ring-1 ring-border placeholder:text-text-muted focus:ring-brand-400"
        />
        <input
          value={etiqueta}
          maxLength={CAUSA_MAX}
          onChange={(e) => setEtiqueta(e.target.value)}
          aria-label={`Qué se marca si falla ${causa.etiqueta}`}
          className="rounded-md bg-surface px-2 py-1 text-xs font-medium text-text outline-none ring-1 ring-border focus:ring-brand-400"
        />
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <SelectorFamilia
          familia={causa.familia}
          onCambiar={async (f) => {
            const r = await editarCausa(causa.id, { familia: f });
            if ("causa" in r) onGuardada(r.causa);
          }}
        />
        {sucia && (
          <button
            onClick={() => void guardar()}
            className="rounded-lg bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-brand-700"
          >
            Guardar
          </button>
        )}
        <button
          onClick={() => onRetirar(!causa.retirada)}
          title={
            causa.retirada
              ? "Volver a ofrecerla al devolver"
              : "Deja de ofrecerse, pero las devoluciones que la usaron se siguen leyendo"
          }
          className="ml-auto rounded-lg px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
        >
          {causa.retirada ? "Recuperar" : "Retirar"}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}

function SelectorFamilia({
  familia,
  onCambiar,
}: {
  familia: string | null;
  onCambiar: (f: string | null) => void;
}) {
  return (
    <Select
      value={familia ?? "__todas"}
      onChange={(v) => onCambiar(v === "__todas" ? null : v)}
      options={[
        { value: "__todas", label: "En todos los trabajos" },
        // Si la causa cuelga de una familia que no está en la lista corta, se
        // añade para no perderla al abrir el desplegable.
        ...(familia && !FAMILIAS_OFRECIDAS.includes(familia) ? [familia] : []).map((f) => ({
          value: f,
          label: `Solo en ${familiaMeta(f).label}`,
        })),
        ...FAMILIAS_OFRECIDAS.map((f) => ({
          value: f,
          label: `Solo en ${familiaMeta(f).label}`,
        })),
      ]}
    />
  );
}
