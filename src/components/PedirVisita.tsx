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
const CAMPOS_CON_ERROR = new Set(["ofs", "viene", "cuando", "atienden"]);
const primer = (n: string) => n.trim().split(/\s+/)[0] ?? n;

export function PedirVisita({ pedido, operarios, miId, onPedida }: {
  pedido: Pedido; operarios: Operario[]; miId: string | null; onPedida: () => void;
}) {
  // Los datos van con su pedido: al cambiar de ficha no se usan los del anterior.
  const [cargado, setCargado] = useState<{ codigo: string; datos: DatosVentana | null } | null>(null);
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    let vivo = true;
    const codigo = pedido.codigo;
    fetch(`/api/visitas?pedido=${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DatosVentana | null) => { if (vivo) setCargado({ codigo, datos: d }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [pedido.codigo, abierta]);

  const datos = cargado?.codigo === pedido.codigo ? cargado.datos : null;
  if (!datos?.disponible) return null;
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)}
        className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text hover:bg-[var(--hero-relleno-encima)]">
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
  const vieneRef = useRef<HTMLInputElement>(null);
  // showModal() da el foco al primer control (una casilla de OF); el primer
  // dato que se escribe es quién viene.
  useEffect(() => { ref.current?.showModal(); vieneRef.current?.focus(); }, []);

  const deOT = useMemo(() => operarios.filter((o) => !o.seccion || o.seccion === "ot"), [operarios]);
  const nombre = (id: string) => primer(operarios.find((o) => o.id === id)?.nombre ?? id);

  const [ofs, setOfs] = useState<string[]>(pedido.ofs.length === 1 ? [pedido.ofs[0].id] : []);
  const [viene, setViene] = useState("");
  const [cuando, setCuando] = useState<Cuando>({ tipo: "pronto" });
  const [fechaDia, setFechaDia] = useState("");
  const [motivo, setMotivo] = useState("");
  // Quien pide solo va puesto si es de OT: si no, no tendría chip para quitarlo.
  const [atienden, setAtienden] = useState<string[]>(miId && deOT.some((o) => o.id === miId) ? [miId] : []);
  const [retoques, setRetoques] = useState<Record<string, boolean>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const hoy = hoyIso();
  const dias = useMemo(() => diasLaborables(hoy), [hoy]);
  const ausentes = useMemo(() => ausentesPorDia(dias, datos.ausencias, atienden), [dias, datos.ausencias, atienden]);
  const fueraPor = useMemo(
    () => new Map(diasNoEstamos(dias, ausentes, retoques, atienden).map((f) => [f.fecha, f.quien])),
    [dias, ausentes, retoques, atienden],
  );
  // Al correo solo van los días que quedan: los de esta semana ya pasados no sirven.
  const fuera = useMemo(() => [...fueraPor].filter(([f]) => f >= hoy).map(([fecha, quien]) => ({ fecha, quien })), [fueraPor, hoy]);
  const elegido = cuando.tipo === "dia" ? cuando.fecha : null;
  const quienFalta = elegido ? fueraPor.get(elegido) : undefined;
  const avisoDia = elegido && quienFalta
    ? `El ${diaCorto(elegido)} no ${quienFalta.length === 1 ? "está" : "están"} ${unirNombres(quienFalta.map(nombre))} en OT.`
    : null;

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
    const primero = ["ofs", "viene", "cuando", "atienden"].find((k) => e[k]);
    if (primero) {
      ref.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`)?.focus();
      return;
    }
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
    // Un campo que la ventana no pinta (pedido, motivo…) sale abajo, no se pierde.
    const k = j?.campo && CAMPOS_CON_ERROR.has(j.campo) ? j.campo : "general";
    setErrores({ [k]: j?.error ?? "No se ha podido pedir la visita" });
  }

  const campo = "rounded-[14px] bg-surface-2 px-3 py-2 text-sm shadow-[var(--hero-sombra-campo)]";
  const err = (k: string) => errores[k] && <p id={`visita-err-${k}`} role="alert" className="mt-1 text-xs text-error">{errores[k]}</p>;
  // Cada campo apunta a su error: el lector de pantalla lo lee al llegar a él.
  const ariaErr = (k: string) => (errores[k] ? { "aria-invalid": true, "aria-describedby": `visita-err-${k}` } : {});

  return (
    // Sin clic fuera para cerrar: es un formulario y se perdería lo escrito.
    // Mientras se envía, Escape no cierra (el envío seguiría en marcha).
    <dialog ref={ref} onClose={onCerrar} onCancel={(e) => { if (enviando) e.preventDefault(); }}
      aria-labelledby="pedir-visita-titulo"
      className="m-auto w-[min(720px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[24px] bg-surface p-6 text-text shadow-[var(--hero-sombra-panel)] backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-black/40">
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
          {pedido.ofs.map((o, i) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ofs.includes(o.id)} className="accent-brand-500"
                {...(i === 0 ? { "data-campo": "ofs", ...ariaErr("ofs") } : {})}
                onChange={() => setOfs((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))} />
              <b className="font-mono">{o.codigo}</b> <span>{o.descripcion}</span>
            </label>
          ))}
        </div>
        {err("ofs")}
      </fieldset>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold">Viene
            <input ref={vieneRef} list="visita-nombres" value={viene} onChange={(e) => setViene(e.target.value)} maxLength={80}
              placeholder="Instalador o comercial" data-campo="viene" {...ariaErr("viene")}
              className={`mt-1 block w-full font-normal ${campo}`} />
          </label>
          <datalist id="visita-nombres">{datos.nombres.map((n) => <option key={n} value={n} />)}</datalist>
          {err("viene")}
        </div>
        <div className="text-sm">
          <span id="visita-cuando" className="font-semibold">Cuándo</span>
          {/* PildorasDeslizantes (layout) desliza la píldora hasta el aria-pressed. */}
          <div className="tira-3d mt-1 flex w-fit rounded-full p-1" role="group" aria-labelledby="visita-cuando">
            {([["pronto", "Lo antes posible"], ["dia", "Un día"], ["sinPrisa", "Sin prisa"]] as const).map(([t, txt]) => (
              <button key={t} type="button" aria-pressed={cuando.tipo === t}
                onClick={() => setCuando(t === "dia" ? { tipo: "dia", fecha: fechaDia } : { tipo: t })}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${cuando.tipo === t ? "pestana-activa" : ""}`}>
                {txt}
              </button>
            ))}
          </div>
          {cuando.tipo === "dia" && (
            <input type="date" min={hoy} value={fechaDia} aria-label="Día de la visita" data-campo="cuando" {...ariaErr("cuando")}
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
          {deOT.map((o, i) => (
            <button key={o.id} type="button" aria-pressed={atienden.includes(o.id)}
              {...(i === 0 ? { "data-campo": "atienden", ...ariaErr("atienden") } : {})}
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
            // Elegido: anillo de marca. Solicitada: contorno a trazos (no solo color).
            const esElegido = d === elegido;
            const esSolicitada = d === pedido.fechaEntrega;
            const borde = esElegido ? "ring-2 ring-[var(--hero-anillo)]" : esSolicitada ? "outline-2 outline-dashed outline-amber-500" : "";
            return (
              <button key={d} type="button" disabled={pasado} aria-pressed={!!quien} onClick={() => cambiarDia(d)}
                className={`rounded-[14px] px-2 py-1.5 text-left text-xs ${quien ? "bg-error/10 text-error" : "bg-surface-2 text-text"} ${borde} disabled:opacity-40`}>
                <div className="font-semibold">
                  {diaCorto(d)}
                  {esElegido && <span className="sr-only"> (día de la visita)</span>}
                  {esSolicitada && <span className="sr-only"> (fecha solicitada)</span>}
                </div>
                <div className="truncate">{quien ? etiqueta(quien) : " "}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {avisoDia && <p role="status" className="mt-3 text-sm text-yellow-800 dark:text-yellow-300"><b>Ojo:</b> {avisoDia}</p>}
      {err("general")}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={() => ref.current?.close()} disabled={enviando}
          className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--hero-relleno-encima)] disabled:opacity-50">Cancelar</button>
        <button type="button" onClick={enviar} disabled={enviando}
          className="rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-brand-950 disabled:opacity-50">
          {enviando ? "Enviando…" : "Pedir visita"}
        </button>
      </div>
    </dialog>
  );
}
