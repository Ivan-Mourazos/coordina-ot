"use client";

import { useEffect, useState } from "react";
import { CAUSA_MAX } from "@/lib/devolucion";
import { familiaMeta } from "@/lib/familia";
import { PASO_MAX, yaExiste } from "@/lib/guia-revision";
import {
  crearCausa,
  crearPaso,
  editarCausa,
  editarPaso,
  leerCausas,
  leerPasos,
  retirarCausa,
  type CausaDevolucion,
  type PasoRevision,
} from "@/lib/causas-cliente";
import { PanelFlotante, BotonCerrarPanel } from "./PanelFlotante";
import { FamiliaIcon } from "./FamiliaTag";
import { Select } from "./Select";
import { useSoloLectura } from "./SoloLectura";

// ─── Pasos y causas de revisión ──────────────────────────────────────────────
// Lo que se mira al revisar (PASOS) y por qué vuelve una OF (CAUSAS), los dos
// en el mismo sitio y con la misma forma: lo común a todos los pedidos y lo
// propio de cada familia. Lo mantienen los técnicos, sin despliegue.
//
// Desde el 11/10/2026 son dos listas y no una: muchos pasos apuntan a una
// misma causa ("salida del toldo" y "frente" fallan los dos como Medidas), así
// que la guía puede crecer tanto como haga falta sin que crezca lo que se
// cuenta al devolver.
//
// NO SE BORRA NADA, se RETIRA: las devoluciones guardan el id de su causa y
// las marcas de revisión el de su paso, y el Historial tiene que poder decir
// de qué fueron.

/** Las familias que se ofrecen como grupo. No están las 28 de RPS: son las del
 *  trabajo que pasa por Oficina Técnica. Si algo cuelga de otra, sale también. */
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

type Pestana = "pasos" | "causas";
/** null = todos los pedidos. */
type Grupo = string | null;

const porOrden = <T extends { orden: number; id: number }>(a: T, b: T) => a.orden - b.orden || a.id - b.id;
const mismaFamilia = (f: string | null, g: Grupo) => (f?.toUpperCase() ?? null) === (g?.toUpperCase() ?? null);

const INPUT =
  "min-w-0 rounded-md bg-surface px-2 py-1 text-xs text-text outline-none border border-borde-campo placeholder:text-text-muted";
const BOTON_SUAVE =
  "rounded-lg px-2 py-0.5 text-[11px] font-semibold text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text disabled:opacity-30 disabled:hover:bg-transparent";

export function PanelGuiaRevision({ onCerrar }: { onCerrar: () => void }) {
  const [pasos, setPasos] = useState<PasoRevision[] | null>(null);
  const [causas, setCausas] = useState<CausaDevolucion[] | null>(null);
  const [pestana, setPestana] = useState<Pestana>("pasos");
  const [grupo, setGrupo] = useState<Grupo>(null);
  const [editando, setEditando] = useState(false);
  const soloLectura = useSoloLectura();
  const edita = editando && !soloLectura;

  useEffect(() => {
    let vivo = true;
    // Con los retirados: el editor los enseña para poder recuperarlos.
    leerPasos(true).then((ps) => vivo && setPasos(ps));
    leerCausas(true).then((cs) => vivo && setCausas(cs));
    return () => {
      vivo = false;
    };
  }, []);

  if (pasos === null || causas === null)
    return (
      <PanelFlotante titulo="Revisión: pasos y causas" onCerrar={onCerrar}>
        <p className="text-[11px] text-text-muted">Buscando…</p>
      </PanelFlotante>
    );

  const activos = pasos.filter((p) => !p.retirado);
  const activas = causas.filter((c) => !c.retirada);
  const familias = [
    ...new Set([
      ...FAMILIAS_OFRECIDAS,
      ...activos.map((p) => p.familia).filter((f): f is string => !!f),
      ...activas.map((c) => c.familia).filter((f): f is string => !!f),
    ]),
  ];
  const cuantos = (g: Grupo) =>
    pestana === "pasos"
      ? activos.filter((p) => mismaFamilia(p.familia, g)).length
      : activas.filter((c) => mismaFamilia(c.familia, g)).length;

  return (
    <PanelFlotante titulo="Revisión: pasos y causas" onCerrar={onCerrar}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-text">Revisión</h3>
        <div role="tablist" className="flex rounded-lg p-0.5 ring-1 ring-border">
          {(
            [
              ["pasos", "Qué se mira"],
              ["causas", "Por qué vuelve"],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold ${
                pestana === id ? "bg-brand-700 text-white" : "text-text-muted hover:text-text"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>
        {/* Dirección consulta, no cambia: el servidor tampoco la deja. */}
        {!soloLectura && (
          <button
            onClick={() => setEditando((v) => !v)}
            className={`rounded-lg px-2.5 py-0.5 text-[11px] font-semibold ${
              editando
                ? "bg-emerald-700 text-white hover:bg-emerald-800"
                : "text-text-muted ring-1 ring-border hover:text-text"
            }`}
          >
            {editando ? "Hecho" : "Editar"}
          </button>
        )}
        <BotonCerrarPanel className="ml-auto" />
      </div>

      <p className="mb-3 text-[11px] leading-snug text-text-muted">
        {pestana === "pasos"
          ? "Lo que se repasa antes de dar un trabajo por bueno. Al revisar salen los comunes y los de la familia del pedido; si uno falla, su causa llega marcada al cuadro de devolver."
          : "Lo que se marca al devolver una OF. Pocas y amplias: lo que se cuenta luego son estas, y el detalle va en la nota."}
      </p>

      <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
        <nav aria-label="Grupos" className="flex flex-row flex-wrap gap-1 md:flex-col md:flex-nowrap">
          <BotonGrupo activo={grupo === null} onClick={() => setGrupo(null)} cuenta={cuantos(null)}>
            Todos los pedidos
          </BotonGrupo>
          <span className="mt-2 hidden px-2 text-[10px] font-bold uppercase tracking-wide text-text-muted md:block">
            Además, por familia
          </span>
          {familias.map((f) => (
            <BotonGrupo key={f} activo={mismaFamilia(f, grupo)} onClick={() => setGrupo(f)} cuenta={cuantos(f)}>
              <FamiliaIcon familia={f} />
              {familiaMeta(f).label}
            </BotonGrupo>
          ))}
        </nav>

        <section className="min-w-0">
          <h4 className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-text">
            {grupo && <FamiliaIcon familia={grupo} />}
            {grupo ? familiaMeta(grupo).label : "Todos los pedidos"}
          </h4>
          <p className="mb-2 text-[10px] text-text-muted">
            {grupo === null
              ? pestana === "pasos"
                ? "Se repasan en cualquier trabajo, sea lo que sea la OF."
                : "Se ofrecen al devolver cualquier OF."
              : pestana === "pasos"
                ? `Se repasan solo en esta familia, después de los ${activos.filter((p) => p.familia === null).length} comunes.`
                : "Se ofrecen solo en esta familia, junto a las comunes."}
          </p>

          {pestana === "pasos" ? (
            <ListaPasos
              key={`p-${grupo}`}
              grupo={grupo}
              pasos={pasos}
              causas={causas}
              edita={edita}
              onCambio={setPasos}
            />
          ) : (
            <ListaCausas
              key={`c-${grupo}`}
              grupo={grupo}
              causas={causas}
              pasos={pasos}
              edita={edita}
              onCambio={setCausas}
            />
          )}
        </section>
      </div>
    </PanelFlotante>
  );
}

function BotonGrupo({
  activo,
  onClick,
  cuenta,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  cuenta: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={activo || undefined}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] ${
        activo
          ? "bg-[var(--glass-highlight)] font-semibold text-text ring-1 ring-brand-400"
          : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
      }`}
    >
      {children}
      <span className="ml-auto pl-2 tabular-nums">{cuenta}</span>
    </button>
  );
}

// ─── Pasos ───────────────────────────────────────────────────────────────────

function ListaPasos({
  grupo,
  pasos,
  causas,
  edita,
  onCambio,
}: {
  grupo: Grupo;
  pasos: PasoRevision[];
  causas: CausaDevolucion[];
  edita: boolean;
  onCambio: (ps: PasoRevision[]) => void;
}) {
  const delGrupo = pasos.filter((p) => mismaFamilia(p.familia, grupo)).sort(porOrden);
  const vivos = delGrupo.filter((p) => !p.retirado);
  const retirados = delGrupo.filter((p) => p.retirado);
  // Un paso común solo puede apuntar a una causa común: si no, en las demás
  // familias marcaría una causa que ni se ofrece.
  const elegibles = causas
    .filter((c) => !c.retirada && (c.familia === null || mismaFamilia(c.familia, grupo)))
    .sort((a, b) => (a.familia === null ? 0 : 1) - (b.familia === null ? 0 : 1) || porOrden(a, b));
  const nombre = new Map(causas.map((c) => [c.id, c.etiqueta]));

  const [nuevo, setNuevo] = useState("");
  const [causaNueva, setCausaNueva] = useState<number | null>(elegibles[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const reemplazar = (p: PasoRevision) => onCambio(pasos.map((x) => (x.id === p.id ? p : x)));

  async function guardar(paso: PasoRevision, cambios: Parameters<typeof editarPaso>[1]) {
    const r = await editarPaso(paso.id, cambios);
    if ("error" in r) setError(r.error);
    else {
      setError(null);
      reemplazar(r.paso);
    }
  }

  /** Sube o baja un paso. Se renumera el grupo entero (1, 2, 3…) y se guardan
   *  solo los que cambian: así un orden repetido de antes no deja el botón
   *  sin efecto. */
  async function mover(i: number, d: -1 | 1) {
    const lista = [...vivos];
    [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
    const antes = new Map(vivos.map((p) => [p.id, p.orden]));
    const nuevos = new Map(lista.map((p, j) => [p.id, { ...p, orden: j + 1 }]));
    onCambio(pasos.map((x) => nuevos.get(x.id) ?? x));
    await Promise.all(
      [...nuevos.values()].filter((p) => antes.get(p.id) !== p.orden).map((p) => editarPaso(p.id, { orden: p.orden })),
    );
  }

  async function anadir() {
    const texto = nuevo.trim();
    if (texto.length < 3) return setError("Escribe qué se comprueba.");
    if (causaNueva === null) return setError("Elige qué causa se marca si falla.");
    if (yaExiste(texto, vivos.map((p) => ({ id: p.id, etiqueta: p.texto }))))
      return setError("Ese paso ya está en la lista.");
    const r = await crearPaso(texto, causaNueva, grupo, null);
    if ("error" in r) return setError(r.error);
    onCambio([...pasos, r.paso]);
    setNuevo("");
    setError(null);
  }

  return (
    <div>
      {vivos.length === 0 && (
        <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-text-muted">
          {grupo === null
            ? "No hay pasos comunes todavía."
            : "Esta familia no tiene pasos propios: al revisar salen solo los comunes."}
          {!edita && " Con «Editar» se añaden."}
        </p>
      )}

      <ol className="flex flex-col gap-1">
        {vivos.map((p, i) =>
          edita ? (
            <FilaPasoEditable
              key={p.id}
              n={i + 1}
              paso={p}
              elegibles={elegibles}
              nombreCausa={nombre.get(p.causaId)}
              primero={i === 0}
              ultimo={i === vivos.length - 1}
              onTexto={(texto) => guardar(p, { texto })}
              onCausa={(causaId) => guardar(p, { causaId })}
              onMover={(d) => void mover(i, d)}
              onRetirar={() => guardar(p, { retirado: true })}
            />
          ) : (
            <li key={p.id} className="flex items-baseline gap-2 rounded-lg px-2 py-1 hover:bg-[var(--glass-highlight)]">
              <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 text-xs text-text">{p.texto}</span>
              <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-px text-[10px] font-medium text-red-700 dark:text-red-300">
                {nombre.get(p.causaId) ?? "Sin causa"}
              </span>
            </li>
          ),
        )}
      </ol>

      {edita && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void anadir();
          }}
          className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border p-1.5"
        >
          <input
            value={nuevo}
            maxLength={PASO_MAX}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder={grupo ? `Nuevo paso de ${familiaMeta(grupo).label.toLowerCase()}…` : "Nuevo paso para todos…"}
            aria-label="Nuevo paso: qué se comprueba"
            className={`${INPUT} flex-1 basis-56`}
          />
          <span className="text-[10px] text-text-muted">si falla:</span>
          <Select
            value={causaNueva === null ? null : String(causaNueva)}
            onChange={(v) => setCausaNueva(v === null ? null : Number(v))}
            placeholder={null}
            className="w-48 shrink-0"
            options={elegibles.map((c) => ({ value: String(c.id), label: c.etiqueta }))}
          />
          <button type="submit" className="rounded-lg bg-brand-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-800">
            Añadir
          </button>
        </form>
      )}

      {error && <p className="mt-1.5 text-[11px] text-error">{error}</p>}

      {edita && retirados.length > 0 && (
        <Retirados
          items={retirados.map((p) => ({ id: p.id, texto: p.texto }))}
          onRecuperar={(id) => {
            const p = retirados.find((x) => x.id === id)!;
            void guardar(p, { retirado: false, orden: vivos.length + 1 });
          }}
        />
      )}
    </div>
  );
}

function FilaPasoEditable({
  n,
  paso,
  elegibles,
  nombreCausa,
  primero,
  ultimo,
  onTexto,
  onCausa,
  onMover,
  onRetirar,
}: {
  n: number;
  paso: PasoRevision;
  elegibles: CausaDevolucion[];
  nombreCausa: string | undefined;
  primero: boolean;
  ultimo: boolean;
  onTexto: (t: string) => void;
  onCausa: (id: number) => void;
  onMover: (d: -1 | 1) => void;
  onRetirar: () => void;
}) {
  const [texto, setTexto] = useState(paso.texto);
  // Si su causa ya no se ofrece (retirada, o de otra familia), se enseña igual
  // para que el desplegable no la pierda al abrirse.
  const opciones = elegibles.some((c) => c.id === paso.causaId)
    ? elegibles
    : [{ id: paso.causaId, etiqueta: nombreCausa ?? "Sin causa" }, ...elegibles];

  const guardarTexto = () => {
    const t = texto.trim();
    if (t === paso.texto) return;
    if (t.length < 3) return setTexto(paso.texto);
    onTexto(t);
  };

  return (
    <li className="flex flex-wrap items-center gap-1.5 rounded-lg px-1 py-1 ring-1 ring-border">
      <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-text-muted">{n}</span>
      <input
        value={texto}
        maxLength={PASO_MAX}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardarTexto}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTexto(paso.texto);
        }}
        aria-label={`Paso ${n}`}
        className={`${INPUT} flex-1 basis-56`}
      />
      <span className="text-[10px] text-text-muted">si falla:</span>
      <Select
        value={String(paso.causaId)}
        onChange={(v) => v !== null && onCausa(Number(v))}
        placeholder={null}
            className="w-48 shrink-0"
        options={opciones.map((c) => ({ value: String(c.id), label: c.etiqueta }))}
      />
      <span className="flex">
        <button onClick={() => onMover(-1)} disabled={primero} aria-label={`Subir el paso ${n}`} className={BOTON_SUAVE}>
          ↑
        </button>
        <button onClick={() => onMover(1)} disabled={ultimo} aria-label={`Bajar el paso ${n}`} className={BOTON_SUAVE}>
          ↓
        </button>
        <button
          onClick={onRetirar}
          title="Deja de pedirse; lo marcado en revisiones de antes se sigue leyendo"
          className={BOTON_SUAVE}
        >
          Retirar
        </button>
      </span>
    </li>
  );
}

// ─── Causas ──────────────────────────────────────────────────────────────────

function ListaCausas({
  grupo,
  causas,
  pasos,
  edita,
  onCambio,
}: {
  grupo: Grupo;
  causas: CausaDevolucion[];
  pasos: PasoRevision[];
  edita: boolean;
  onCambio: (cs: CausaDevolucion[]) => void;
}) {
  const delGrupo = causas.filter((c) => mismaFamilia(c.familia, grupo)).sort(porOrden);
  const vivas = delGrupo.filter((c) => !c.retirada);
  const retiradas = delGrupo.filter((c) => c.retirada);
  const pasosDe = (id: number) => pasos.filter((p) => !p.retirado && p.causaId === id).length;

  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reemplazar = (c: CausaDevolucion) => onCambio(causas.map((x) => (x.id === c.id ? c : x)));

  async function guardar(c: CausaDevolucion, cambios: Parameters<typeof editarCausa>[1]) {
    if (cambios.etiqueta !== undefined && yaExiste(cambios.etiqueta, causas, c.id))
      return setError("Ya hay otra causa que dice lo mismo.");
    const r = await editarCausa(c.id, cambios);
    if ("error" in r) return setError(r.error);
    setError(null);
    reemplazar(r.causa);
  }

  async function retirar(c: CausaDevolucion, retirada: boolean) {
    if (retirada && pasosDe(c.id) > 0)
      return setError(`«${c.etiqueta}» tiene pasos que la marcan: cámbialos de causa antes de retirarla.`);
    if (await retirarCausa(c.id, retirada)) {
      setError(null);
      onCambio(causas.map((x) => (x.id === c.id ? { ...x, retirada, orden: retirada ? x.orden : vivas.length + 1 } : x)));
      if (!retirada) await editarCausa(c.id, { orden: vivas.length + 1 });
    }
  }

  async function mover(i: number, d: -1 | 1) {
    const lista = [...vivas];
    [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
    const antes = new Map(vivas.map((c) => [c.id, c.orden]));
    const nuevas = new Map(lista.map((c, j) => [c.id, { ...c, orden: j + 1 }]));
    onCambio(causas.map((x) => nuevas.get(x.id) ?? x));
    await Promise.all(
      [...nuevas.values()].filter((c) => antes.get(c.id) !== c.orden).map((c) => editarCausa(c.id, { orden: c.orden })),
    );
  }

  async function anadir() {
    const etiqueta = nueva.trim();
    if (etiqueta.length < 3) return setError("Escribe la causa.");
    if (yaExiste(etiqueta, causas)) return setError("Ya hay una causa que dice lo mismo (puede estar retirada o en otra familia).");
    const c = await crearCausa(etiqueta, null, { familia: grupo });
    if (!c) return setError("No se pudo guardar.");
    onCambio([...causas.filter((x) => x.id !== c.id), c]);
    setNueva("");
    setError(null);
  }

  return (
    <div>
      {vivas.length === 0 && (
        <p className="mb-2 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-text-muted">
          {grupo === null ? "No hay causas comunes." : "Esta familia no tiene causas propias: al devolver salen las comunes."}
        </p>
      )}

      <ol className="flex flex-col gap-1">
        {vivas.map((c, i) => {
          const usos = pasosDe(c.id);
          return edita ? (
            <FilaCausaEditable
              key={c.id}
              n={i + 1}
              causa={c}
              usos={usos}
              primero={i === 0}
              ultimo={i === vivas.length - 1}
              onEtiqueta={(etiqueta) => guardar(c, { etiqueta })}
              onMover={(d) => void mover(i, d)}
              onRetirar={() => void retirar(c, true)}
            />
          ) : (
            <li key={c.id} className="flex items-baseline gap-2 rounded-lg px-2 py-1 hover:bg-[var(--glass-highlight)]">
              <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 text-xs font-medium text-text">{c.etiqueta}</span>
              <span className="shrink-0 text-[10px] text-text-muted">
                {usos === 0 ? "ningún paso" : `${usos} ${usos === 1 ? "paso" : "pasos"}`}
              </span>
            </li>
          );
        })}
      </ol>

      {edita && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void anadir();
          }}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-border p-1.5"
        >
          <input
            value={nueva}
            maxLength={CAUSA_MAX}
            onChange={(e) => setNueva(e.target.value)}
            placeholder={grupo ? `Nueva causa solo de ${familiaMeta(grupo).label.toLowerCase()}…` : "Nueva causa para todos…"}
            aria-label="Nueva causa"
            className={`${INPUT} flex-1`}
          />
          <button type="submit" className="rounded-lg bg-brand-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-800">
            Añadir
          </button>
        </form>
      )}

      {error && <p className="mt-1.5 text-[11px] text-error">{error}</p>}

      {edita && retiradas.length > 0 && (
        <Retirados
          items={retiradas.map((c) => ({ id: c.id, texto: c.etiqueta }))}
          onRecuperar={(id) => void retirar(retiradas.find((x) => x.id === id)!, false)}
        />
      )}
    </div>
  );
}

function FilaCausaEditable({
  n,
  causa,
  usos,
  primero,
  ultimo,
  onEtiqueta,
  onMover,
  onRetirar,
}: {
  n: number;
  causa: CausaDevolucion;
  usos: number;
  primero: boolean;
  ultimo: boolean;
  onEtiqueta: (t: string) => void;
  onMover: (d: -1 | 1) => void;
  onRetirar: () => void;
}) {
  const [etiqueta, setEtiqueta] = useState(causa.etiqueta);
  const guardarTexto = () => {
    const t = etiqueta.trim();
    if (t === causa.etiqueta) return;
    if (t.length < 3) return setEtiqueta(causa.etiqueta);
    onEtiqueta(t);
  };
  return (
    <li className="flex items-center gap-1.5 rounded-lg px-1 py-1 ring-1 ring-border">
      <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-text-muted">{n}</span>
      <input
        value={etiqueta}
        maxLength={CAUSA_MAX}
        onChange={(e) => setEtiqueta(e.target.value)}
        onBlur={guardarTexto}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEtiqueta(causa.etiqueta);
        }}
        aria-label={`Causa ${n}`}
        className={`${INPUT} flex-1 font-medium`}
      />
      <span className="shrink-0 text-[10px] text-text-muted">
        {usos === 0 ? "ningún paso" : `${usos} ${usos === 1 ? "paso" : "pasos"}`}
      </span>
      <span className="flex">
        <button onClick={() => onMover(-1)} disabled={primero} aria-label={`Subir la causa ${n}`} className={BOTON_SUAVE}>
          ↑
        </button>
        <button onClick={() => onMover(1)} disabled={ultimo} aria-label={`Bajar la causa ${n}`} className={BOTON_SUAVE}>
          ↓
        </button>
        <button
          onClick={onRetirar}
          title="Deja de ofrecerse al devolver; las devoluciones que la usaron se siguen leyendo"
          className={BOTON_SUAVE}
        >
          Retirar
        </button>
      </span>
    </li>
  );
}

function Retirados({
  items,
  onRecuperar,
}: {
  items: { id: number; texto: string }[];
  onRecuperar: (id: number) => void;
}) {
  return (
    <details className="mt-3 text-[11px]">
      <summary className="cursor-pointer text-text-muted hover:text-text">Retirados ({items.length})</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 px-2 text-text-muted">
            <span className="min-w-0 flex-1 line-through decoration-text-muted/40">{it.texto}</span>
            <button onClick={() => onRecuperar(it.id)} className={BOTON_SUAVE}>
              Recuperar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
