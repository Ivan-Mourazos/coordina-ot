"use client";

import { useState } from "react";
import { ConsultaPendientes } from "./ConsultaPendientes";
import { VisitasCotView } from "./VisitasCotView";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

// ─── La web para quien no ha entrado ─────────────────────────────────────────
// Comerciales, administración y taller: gente que no usa CoordinaOT a diario y
// llega con una sola pregunta ("¿por dónde va mi pedido?") que hoy hace por
// teléfono. Tres pestañas, todo de solo lectura y ni un botón que guarde — no
// es el tablero con cosas escondidas, es otra pantalla, para que el día que se
// olvide tapar algo no sea un botón de escribir delante de quien no debe.

type Pestana = "pendientes" | "realizados" | "consultas";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "pendientes", label: "Pedidos Pendientes" },
  { id: "realizados", label: "Pedidos Realizados" },
  { id: "consultas", label: "Consultas con OT" },
];

export function Consulta() {
  const [pestana, setPestana] = useState<Pestana>("pendientes");

  return (
    <div className="min-h-full">
      <header className="glass-panel sticky top-0 z-10 flex flex-wrap items-center gap-3 px-4 py-2">
        <Logo height={36} />
        <div role="tablist" aria-label="Secciones" className="glass-chip inline-flex flex-wrap rounded-lg p-[3px]">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`pestana-${p.id}`}
              aria-selected={p.id === pestana}
              aria-controls={`panel-${p.id}`}
              onClick={() => setPestana(p.id)}
              className={`h-8 rounded-md px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                p.id === pestana
                  ? "bg-[var(--glass-highlight)] text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <a
            href="/entrar"
            className="glass-chip flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-text"
          >
            Entrar
          </a>
        </div>
      </header>

      {/* Cada pestaña se pide de nuevo al volver a ella: no hay sondeo
          automático (toda la casa preguntando cada 30 s es carga de RPS a
          cambio de nada), así que no hay nada que perder desmontando la que
          no se mira. */}
      {pestana === "pendientes" && (
        <div role="tabpanel" id="panel-pendientes" aria-labelledby="pestana-pendientes">
          <ConsultaPendientes lista="pendientes" />
        </div>
      )}
      {pestana === "realizados" && (
        <div role="tabpanel" id="panel-realizados" aria-labelledby="pestana-realizados">
          <ConsultaPendientes lista="realizados" />
        </div>
      )}
      {pestana === "consultas" && (
        <main role="tabpanel" id="panel-consultas" aria-labelledby="pestana-consultas" className="p-4">
          <VisitasCotView base="/api/publico/visitas" />
        </main>
      )}
    </div>
  );
}
