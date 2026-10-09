"use client";

import { useEffect, useMemo, useState } from "react";
import type { Operario, Pedido } from "@/lib/types";
import { SECCIONES, type SeccionId } from "@/lib/secciones";
import { ListaView } from "./ListaView";

// ─── «En curso»: el trabajo que tiene ahora la oficina ──────────────────────
// Pedido por Esteban (09/10/2026): ver qué está planteando OT, quién, en qué
// punto va y para cuándo. Es la vista Pendientes del equipo, en solo lectura
// (ListaView no tiene acciones), con los pedidos ya limpiados en el servidor
// (`/api/publico/en-curso`).
//
// Por sección, con su selector, como la web del equipo: a quien pregunta por
// una rotulación le sirve Diseño Gráfico. Sin sondeo: se carga al entrar y al
// cambiar de sección, igual que el resto de la consulta («Actualizar» es
// recargar la pestaña).

const SECCIONES_EN_CURSO: SeccionId[] = ["ot", "diseno"];

export function ConsultaEnCurso({
  busqueda,
  onAbrirPedido,
}: {
  /** El buscador de arriba: recorta por pedido, cliente u obra. */
  busqueda: string;
  /** Pulsar un pedido lo abre en la pestaña de pedidos, con su ficha. */
  onAbrirPedido: (codigo: string) => void;
}) {
  const [seccion, setSeccion] = useState<SeccionId>("ot");
  const [datos, setDatos] = useState<{ operarios: Operario[]; pedidos: Pedido[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(false);
    fetch(`/api/publico/en-curso?seccion=${seccion}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { operarios: Operario[]; pedidos: Pedido[] }) => vivo && setDatos(d))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [seccion]);

  const q = busqueda.trim().toLowerCase();
  const pedidos = useMemo(() => {
    if (!datos) return [];
    if (!q) return datos.pedidos;
    return datos.pedidos.filter((p) =>
      [p.codigo, p.cliente, p.negocio ?? "", ...p.ofs.map((o) => o.codigo)].some((t) => t.toLowerCase().includes(q)),
    );
  }, [datos, q]);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="tira-3d glass-chip inline-flex rounded-lg p-[3px]" role="group" aria-label="Sección">
          {SECCIONES_EN_CURSO.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={seccion === id}
              onClick={() => setSeccion(id)}
              className={`h-8 rounded-md px-3.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                seccion === id ? "pestana-activa" : "text-text-muted hover:bg-[var(--glass-highlight)] hover:text-text"
              }`}
            >
              {SECCIONES[id].nombre}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-text-muted">
          Lo que tiene ahora la oficina: quién lo plantea, en qué punto va y para cuándo.
          {datos && ` ${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"}.`}
        </p>
      </div>
      {error && <p className="py-6 text-center text-sm text-red-600">No se pudo cargar el trabajo en curso. Recarga la página.</p>}
      {!error && !datos && <p className="py-6 text-center text-sm text-text-muted">Cargando lo que tiene la oficina…</p>}
      {datos && (
        <ListaView
          pedidos={pedidos}
          operarios={datos.operarios}
          onOpen={(p) => onAbrirPedido(p.codigo)}
          orden="planificacion"
          ordenDesc={false}
          hayFiltrosActivos={q !== ""}
          sinMaterial
        />
      )}
    </div>
  );
}
