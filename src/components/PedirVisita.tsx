"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Operario, Pedido } from "@/lib/types";
import {
  ausentesPorDia, diaCorto, diasLaborables, diasNoEstamos, unirNombres, type Ausencias, type Cuando,
} from "@/lib/visita";

// «Pedir visita» (spec 2026-11-19): un instalador o comercial viene a OT. Manda
// el correo a Instalaciones con los días que no estamos y deja nota en el
// pedido. La fecha de verdad la pone RPS; aquí no se guarda ninguna.

interface DatosVentana {
  disponible: boolean;
  nombres: string[];
  ausencias: Ausencias[];
  ultimaNota: { texto: string; creadoAt: string } | null;
}

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const primer = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function PedirVisita({ pedido, operarios, miId, onPedida }: {
  pedido: Pedido; operarios: Operario[]; miId: string | null; onPedida: () => void;
}) {
  const [datos, setDatos] = useState<DatosVentana | null>(null);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/visitas?pedido=${encodeURIComponent(pedido.codigo)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DatosVentana | null) => { if (vivo) setDatos(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pedido.codigo, abierta]);

  if (!datos?.disponible) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)}
        className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:brightness-95">
        Pedir visita
      </button>
      {abierta && (
        <VentanaVisita pedido={pedido} operarios={operarios} miId={miId} datos={datos}
          onCerrar={() => setAbierta(false)} onPedida={() => { setAbierta(false); onPedida(); }} />
      )}
    </>
  );
}

function VentanaVisita({ pedido, operarios, miId, datos, onCerrar, onPedida }: {
  pedido: Pedido; operarios: Operario[]; miId: string | null; datos: DatosVentana; onCerrar: () => void; onPedida: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const deOT = useMemo(() => operarios.filter((o) => !o.seccion || o.seccion === "ot"), [operarios]);
  const nombre = (id: string) => primer(operarios.find((o) => o.id === id)?.nombre ?? id);

  const [ofs, setOfs] = useState<string[]>(pedido.ofs.length === 1 ? [pedido.ofs[0].id] : []);
  const [viene, setViene] = useState("");
  const [cuando, setCuando] = useState<Cuando>({ tipo: "pronto" });
  const [fechaDia, setFechaDia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [atienden, setAtienden] = useState<string[]>(miId ? [miId] : []);
  const [retoques, setRetoques] = useState<Record<string, boolean>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const hoy = hoyIso();
  const dias = useMemo(() => diasLaborables(hoy), [hoy]);
  const ausentes = useMemo(() => ausentesPorDia(dias, datos.ausencias, atienden), [dias, datos.ausencias, atienden]);
  const fuera = useMemo(() => diasNoEstamos(dias, ausentes, retoques, atienden), [dias, ausentes, retoques, atienden]);
  const fueraPor = new Map(fuera.map((f) => [f.fecha, f.quien]));
  const elegido = cuando.tipo === "dia" ? cuando.fecha : null;
  const avisoDia = elegido && fueraPor.has(elegido) ? `El ${diaCorto(elegido)} no estáis todos en OT.` : null;

  const etiqueta = (quien: string[]) =>
    quien.length === atienden.length && atienden.length > 1 ? (atienden.length === 2 ? "Ambos" : "Todos") : unirNombres(quien.map(nombre));

  const cambiarDia = (fecha: string) =>
    setRetoques((r) => {
      const n = { ...r };
      if (fecha in n) delete n[fecha];
      else n[fecha] = !((ausentes[fecha] ?? []).length > 0);
      return n;
    });

  async function enviar() {
    const e: Record<string, string> = {};
    if (ofs.length === 0) e.ofs = "Marca al menos una OF";
    if (!viene.trim()) e.viene = "Escribe quién tiene que venir";
    if (atienden.length === 0) e.atienden = "Tiene que atenderle alguien";
    if (cuando.tipo === "dia" && !cuando.fecha) e.cuando = "Elige el día";
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    const r = await fetch("/api/visitas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operarioId: miId,
        pedido: pedido.codigo,
        cliente: pedido.cliente,
        solicitada: pedido.fechaEntrega || null,
        prioridad: pedido.prioridad,
        ofs: pedido.ofs.filter((o) => ofs.includes(o.id)).map((o) => ({ codigo: o.codigo, descripcion: o.descripcion })),
        viene: viene.trim(),
        cuando,
        motivo: motivo.trim(),
        atienden,
        noEstamos: fuera,
      }),
    }).catch(() => null);
    setEnviando(false);
    if (r?.ok) return onPedida();
    const j = (await r?.json().catch(() => null)) as { error?: string; campo?: string } | null;
    setErrores({ [j?.campo ?? "general"]: j?.error ?? "No se ha podido pedir la visita" });
  }

  const campo = "rounded-[14px] bg-surface-2 px-3 py-2 text-sm shadow-[var(--hero-sombra-campo)]";
  const err = (k: string) => errores[k] && <p role="alert" className="mt-1 text-xs text-error">{errores[k]}</p>;

  return (
    <dialog ref={ref} onClose={onCerrar} aria-labelledby="pedir-visita-titulo"
      className="w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[24px] bg-surface p-6 text-text backdrop:bg-black/40">
      <h2 id="pedir-visita-titulo" className="text-lg font-semibold">Pedir visita a Oficina Técnica</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <b className="font-mono">{pedido.codigo}</b><span>{pedido.cliente}</span>
        {pedido.fechaEntrega && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs"><b>Solicitada</b> {diaCorto(pedido.fechaEntrega)}</span>}
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs"><b>Prioridad</b> {pedido.prioridad}</span>
        <span className="text-xs text-text-muted">{pedido.ofs.length} OF</span>
      </div>
      {datos.ultimaNota && (
        <p className="mt-3 rounded-[14px] bg-surface-2 px-3 py-2 text-xs text-text-muted">Última pedida: {datos.ultimaNota.texto}</p>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">OF</legend>
        <div className="mt-1 space-y-1">
          {pedido.ofs.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ofs.includes(o.id)}
                onChange={() => setOfs((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))} />
              <b className="font-mono">{o.codigo}</b> <span>{o.descripcion}</span>
            </label>
          ))}
        </div>
        {err("ofs")}
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Viene
          <input list="visita-nombres" value={viene} onChange={(e) => setViene(e.target.value)} maxLength={80}
            placeholder="Instalador o comercial" className={`mt-1 block w-full font-normal ${campo}`} />
          <datalist id="visita-nombres">{datos.nombres.map((n) => <option key={n} value={n} />)}</datalist>
          {err("viene")}
        </label>
        <div className="text-sm">
          <span className="font-semibold">Cuándo</span>
          <div className="tira-3d mt-1 flex w-fit rounded-full p-1" role="radiogroup" aria-label="Cuándo">
            {([["pronto", "Lo antes posible"], ["dia", "Un día"], ["sinPrisa", "Sin prisa"]] as const).map(([t, txt]) => (
              <button key={t} type="button" role="radio" aria-checked={cuando.tipo === t}
                onClick={() => setCuando(t === "dia" ? { tipo: "dia", fecha: fechaDia } : { tipo: t })}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${cuando.tipo === t ? "pestana-activa" : ""}`}>
                {txt}
              </button>
            ))}
          </div>
          {cuando.tipo === "dia" && (
            <input type="date" min={hoy} value={fechaDia} aria-label="Día de la visita"
              onChange={(e) => { setFechaDia(e.target.value); setCuando({ tipo: "dia", fecha: e.target.value }); }}
              className={`mt-2 ${campo}`} />
          )}
          {err("cuando")}
        </div>
      </div>

      <label className="mt-4 block text-sm font-semibold">Motivo <span className="font-normal text-text-muted">(opcional)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2}
          className={`mt-1 block w-full font-normal ${campo}`} />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Le atiende</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {deOT.map((o) => (
            <button key={o.id} type="button" aria-pressed={atienden.includes(o.id)}
              onClick={() => setAtienden((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${atienden.includes(o.id) ? "bg-brand-400 text-brand-950" : "bg-surface-2"}`}>
              {primer(o.nombre)}
            </button>
          ))}
        </div>
        {err("atienden")}
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">No estamos en OT</legend>
        <p className="text-xs text-text-muted">Sale de «Mis ausencias». Pincha un día para quitarlo o añadirlo solo en esta visita.</p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {dias.map((d) => {
            const quien = fueraPor.get(d);
            const pasado = d < hoy;
            const borde = d === elegido ? "ring-2 ring-emerald-500" : d === pedido.fechaEntrega ? "ring-2 ring-amber-500" : "";
            return (
              <button key={d} type="button" disabled={pasado} aria-pressed={!!quien} onClick={() => cambiarDia(d)}
                className={`rounded-[14px] px-2 py-1.5 text-left text-xs ${quien ? "bg-red-500/12 text-red-700 dark:text-red-300" : "bg-surface-2"} ${borde} disabled:opacity-40`}>
                <div className="font-semibold">{diaCorto(d)}</div>
                <div className="truncate">{quien ? etiqueta(quien) : " "}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {avisoDia && <p className="mt-3 text-sm text-yellow-800 dark:text-yellow-300">{avisoDia}</p>}
      {err("general")}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-surface-2">Cancelar</button>
        <button type="button" onClick={enviar} disabled={enviando}
          className="rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-brand-950 disabled:opacity-50">
          {enviando ? "Enviando…" : "Pedir visita"}
        </button>
      </div>
    </dialog>
  );
}
