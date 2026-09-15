"use client";

import { useState } from "react";
import {
  ESTADOS_CONSULTA,
  PASOS_CONSULTA,
  type EstadoConsulta,
  type FiltrosConsulta,
  type PasoConsulta,
} from "@/lib/consulta";
import { familiaMeta } from "@/lib/familia";
import { FAMILIAS_FILTRABLES } from "@/lib/historial";
import type { Familia } from "@/lib/types";
import { ConsultaPedidos } from "./ConsultaPedidos";
import { FamiliaIcon } from "./FamiliaTag";
import { Logo } from "./Logo";
import { Select } from "./Select";
import { SelectorFecha } from "./SelectorFecha";
import { ThemeToggle } from "./ThemeToggle";
import { VisitasCotView } from "./VisitasCotView";

// ─── La web para quien no ha entrado ─────────────────────────────────────────
// Comerciales, administración y taller llegan con un nombre o un número y una
// pregunta: ¿cómo va?, ¿ya salió?, ¿quién lo tiene? Por eso se entra buscando:
// un solo buscador arriba, que vale para las dos pestañas. Todo de solo
// lectura y ni un botón que guarde — no es el tablero con cosas escondidas, es
// otra pantalla, para que el día que se olvide tapar algo no sea un botón de
// escribir delante de quien no debe.

type Pestana = "pedidos" | "consultas";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "pedidos", label: "Pedidos" },
  { id: "consultas", label: "Consultas con OT" },
];

export function Consulta() {
  const [pestana, setPestana] = useState<Pestana>("pedidos");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoConsulta>("proximas");
  const [paso, setPaso] = useState<PasoConsulta | null>(null);
  const [familia, setFamilia] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [familias, setFamilias] = useState<string[] | null>(null);

  // «Esperando salir» y «Entregados» ya no están en fábrica: ahí el paso no
  // filtra nada, y se apaga en vez de dejar la lista vacía sin decir por qué.
  const sinPaso = estado === "salir" || estado === "entregados";
  const filtros: Omit<FiltrosConsulta, "page"> = {
    estado,
    ...(paso && !sinPaso ? { paso } : {}),
    ...(familia ? { familia } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
  };
  const hayFiltros = estado !== "proximas" || paso !== null || familia !== null || desde !== "" || hasta !== "";

  return (
    <div className="min-h-full">
      <header className="glass-panel sticky top-0 z-10 flex flex-wrap items-center gap-3 px-4 py-2">
        <Logo height={36} />
        {/* Las flechas mueven entre pestañas y el tabulador entra y sale de la
            tira entera: es como se recorre un tablist, y es lo que espera
            quien navega con teclado. */}
        <div
          role="tablist"
          aria-label="Secciones"
          className="glass-chip inline-flex flex-wrap rounded-lg p-[3px]"
          onKeyDown={(e) => {
            const i = PESTANAS.findIndex((p) => p.id === pestana);
            // Flechas para moverse una a una; Inicio y Fin a los extremos, como
            // pide el patrón de tablist.
            let destino: number | null = null;
            if (e.key === "ArrowRight") destino = (i + 1) % PESTANAS.length;
            else if (e.key === "ArrowLeft") destino = (i - 1 + PESTANAS.length) % PESTANAS.length;
            else if (e.key === "Home") destino = 0;
            else if (e.key === "End") destino = PESTANAS.length - 1;
            if (destino === null) return;
            e.preventDefault();
            const siguiente = PESTANAS[destino];
            setPestana(siguiente.id);
            document.getElementById(`pestana-${siguiente.id}`)?.focus();
          }}
        >
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={p.id === pestana}
              aria-controls={`panel-${p.id}`}
              tabIndex={p.id === pestana ? 0 : -1}
              onClick={() => setPestana(p.id)}
              /* La pestaña activa con el color de marca, como el selector de
                 ámbito de la agenda: quien entra de fuera tiene que ver de un
                 vistazo en cuál de las dos está. */
              className={`h-9 rounded-md px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                p.id === pestana
                  ? "bg-brand-400 text-[#231903] shadow-sm"
                  : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Un solo buscador para las dos pestañas: dos de tres visitas empiezan
            buscando, y quien llega con un código no tiene por qué mirar antes
            en qué pestaña está. */}
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">{pestana === "pedidos" ? "Buscar pedidos" : "Buscar visitas"}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              pestana === "pedidos" ? "Pedido, cliente, obra u OF…" : "Comercial, cliente, pedido o incidencia…"
            }
            className="h-10 w-full rounded-xl border border-border bg-surface px-3 pr-9 text-sm text-text outline-none focus:border-brand-400"
          />
          {q && (
            <button
              type="button"
              aria-label="Vaciar la búsqueda"
              onClick={() => setQ("")}
              className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-text-muted hover:bg-surface-2"
            >
              ✕
            </button>
          )}
        </label>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="/entrar" className="glass-chip flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-text">
            Entrar
          </a>
        </div>
      </header>

      {pestana === "pedidos" && (
        <div role="tabpanel" id="panel-pedidos" aria-labelledby="pestana-pedidos">
          <div className="mx-auto w-full max-w-[1100px] px-4 pt-4">
            {/* Panel de vidrio, como la cabecera: sobre el fondo gris de la
                web, una caja con solo un borde fino se perdía. */}
            <div className="glass-panel flex flex-wrap items-end gap-3 rounded-xl px-3 py-2.5">
              {/* Rótulos con `aria-labelledby` y no con `<label>`: el Select
                  es un `<button>`, y un label alrededor gana al contenido del
                  botón al calcular el nombre accesible — un lector de pantalla
                  decía «Estado, botón» sin llegar a decir «En fábrica». */}
              <div className="flex flex-col text-xs font-semibold text-text">
                <span id="filtro-estado">Estado</span>
                <span className="mt-1">
                  <Select
                    value={estado}
                    onChange={(v) => setEstado((v as EstadoConsulta | null) ?? "proximas")}
                    placeholder={null}
                    ariaLabelledBy="filtro-estado"
                    options={ESTADOS_CONSULTA.map((e) => ({ value: e.id, label: e.label }))}
                  />
                </span>
              </div>
              <div className="flex flex-col text-xs font-semibold text-text">
                <span id="filtro-paso">Paso</span>
                {/* El motivo, en texto y no solo en un `title`, que no se lee
                    ni al tacto ni con lector de pantalla. */}
                {sinPaso && (
                  <span id="filtro-paso-nota" className="sr-only">
                    Solo filtra lo que está en fábrica
                  </span>
                )}
                <span className="mt-1">
                  <Select
                    value={sinPaso ? null : paso}
                    onChange={(v) => setPaso(v as PasoConsulta | null)}
                    placeholder={sinPaso ? "Solo en fábrica" : "Todos los pasos"}
                    etiquetaVaciar="Todos los pasos"
                    acentuarActivo
                    ariaLabelledBy={sinPaso ? "filtro-paso filtro-paso-nota" : "filtro-paso"}
                    options={sinPaso ? [] : PASOS_CONSULTA.map((p) => ({ value: p.id, label: p.label }))}
                  />
                </span>
              </div>
              <div className="flex flex-col text-xs font-semibold text-text">
                <span id="filtro-familia">Familia</span>
                <span className="mt-1">
                  <Select
                    value={familia}
                    onChange={setFamilia}
                    placeholder="Todas"
                    etiquetaVaciar="Todas las familias"
                    acentuarActivo
                    ariaLabelledBy="filtro-familia"
                    // Solo las que hay con los demás filtros puestos; la
                    // elegida se conserva aunque ya no esté, para poder
                    // quitarla.
                    options={[...new Set([...(familias ?? FAMILIAS_FILTRABLES), ...(familia ? [familia] : [])])].map(
                      (fam) => ({
                        value: fam,
                        label: familiaMeta(fam as Familia).label ?? fam,
                        icon: <FamiliaIcon familia={fam as Familia} className="size-3.5" />,
                      }),
                    )}
                  />
                </span>
              </div>
              <div className="flex flex-col text-xs font-semibold text-text">
                Fechas
                <span className="mt-1 flex items-center">
                  <SelectorFecha
                    desde={desde}
                    hasta={hasta}
                    onCambiar={(d, h) => {
                      setDesde(d);
                      setHasta(h);
                    }}
                  />
                </span>
              </div>
              {/* Siempre puesto, apagado cuando no hay nada que limpiar: si
                  aparece y desaparece, los botones de al lado bailan de sitio
                  justo mientras los estás usando. */}
              <button
                type="button"
                disabled={!hayFiltros}
                onClick={() => {
                  setEstado("proximas");
                  setPaso(null);
                  setFamilia(null);
                  setDesde("");
                  setHasta("");
                }}
                className="self-end rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors enabled:hover:border-border-strong enabled:hover:text-text disabled:opacity-40"
              >
                Limpiar filtros
              </button>
            </div>
            {/* Buscar salta «Próximas entregas» (ver estadoEfectivo): se dice,
                para que nadie crea que el filtro de arriba sigue mandando. */}
            {q.trim() && estado === "proximas" && (
              <p className="mt-2 px-1 text-[11px] text-text">
                Buscando en todos los pedidos, estén como estén y sean del año que sean.
              </p>
            )}
          </div>
          <ConsultaPedidos filtros={filtros} onFamilias={setFamilias} />
        </div>
      )}
      {pestana === "consultas" && (
        <main role="tabpanel" id="panel-consultas" aria-labelledby="pestana-consultas" className="p-4">
          <VisitasCotView base="/api/publico/visitas" sondeo={false} busqueda={q} />
        </main>
      )}
    </div>
  );
}
