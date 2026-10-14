"use client";

import { useEffect, useMemo, useState } from "react";
import type { Operario, Pedido } from "@/lib/types";
import { faseEnUnaPalabra } from "@/lib/fases-tablero";
import { SECCIONES, type SeccionId } from "@/lib/secciones";
import { BloquePlegable } from "./Bandeja";
import { ListaView } from "./ListaView";

// ─── «En curso»: el trabajo que tiene ahora la oficina ──────────────────────
// Pedido por Esteban (09/10/2026): ver qué está planteando OT, quién, en qué
// punto va y para cuándo. Es la vista Pendientes del equipo, en solo lectura
// (ListaView sin `onOpen`: aquí nada se abre), con los pedidos ya limpiados en
// el servidor (`/api/publico/en-curso`).
//
// Cada pedido lleva su fase en una palabra junto al código, y lo que
// Producción tiene parado va en un bloque aparte, plegado, como en la bandeja
// del equipo (Iván, 13/10/2026).
//
// Por sección, con su selector, como la web del equipo: a quien pregunta por
// una rotulación le sirve Diseño Gráfico. Sin sondeo: se carga al entrar y al
// cambiar de sección («Actualizar» es recargar la pestaña).

const SECCIONES_EN_CURSO: SeccionId[] = ["ot", "diseno"];

/** Sin devoluciones: quien mira desde fuera no las ve. */
const faseParaInvitado = (p: Pedido) => faseEnUnaPalabra(p, { invitado: true });

type Datos = { operarios: Operario[]; pedidos: Pedido[]; detenidos: Pedido[] };

export function ConsultaEnCurso({
  busqueda,
}: {
  /** El buscador de arriba: recorta por pedido, cliente u obra. */
  busqueda: string;
}) {
  const [seccion, setSeccion] = useState<SeccionId>("ot");
  // Lo cargado va con la sección a la que pertenece: al cambiar de sección,
  // lo de la anterior deja de valer solo, sin vaciarlo a mano en el efecto.
  const [cargado, setCargado] = useState<
    ({ seccion: SeccionId } & Datos) | { seccion: SeccionId; error: true } | null
  >(null);
  const datos = cargado?.seccion === seccion && !("error" in cargado) ? cargado : null;
  const error = cargado?.seccion === seccion && "error" in cargado;

  useEffect(() => {
    let vivo = true;
    fetch(`/api/publico/en-curso?seccion=${seccion}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Datos) => vivo && setCargado({ seccion, ...d, detenidos: d.detenidos ?? [] }))
      .catch(() => vivo && setCargado({ seccion, error: true }));
    return () => {
      vivo = false;
    };
  }, [seccion]);

  const q = busqueda.trim().toLowerCase();
  const filtrar = useMemo(
    () => (lista: Pedido[]) =>
      !q
        ? lista
        : lista.filter((p) =>
            [p.codigo, p.cliente, p.negocio ?? "", ...p.ofs.map((o) => o.codigo)].some((t) =>
              t.toLowerCase().includes(q),
            ),
          ),
    [q],
  );
  const pedidos = datos ? filtrar(datos.pedidos) : [];
  const detenidos = datos ? filtrar(datos.detenidos) : [];

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
          {/* «Plantea» solo vale para OT (David, 14/10/2026): en Diseño no se plantea. */}
          {`Lo que tiene ahora ${SECCIONES[seccion].nombre}: ${seccion === "ot" ? "quién lo plantea" : "quién lo lleva"}, en qué punto va y para cuándo.`}
          {datos && ` ${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"}.`}
        </p>
      </div>
      {error && <p className="py-6 text-center text-sm text-red-600">No se pudo cargar el trabajo en curso. Recarga la página.</p>}
      {!error && !datos && <p className="py-6 text-center text-sm text-text-muted">Cargando lo que tiene la oficina…</p>}
      {datos && (
        <ListaView
          pedidos={pedidos}
          operarios={datos.operarios}
          orden="planificacion"
          ordenDesc={false}
          hayFiltrosActivos={q !== ""}
          sinMaterial
          fase={faseParaInvitado}
          unoAbierto
          conNombres
        />
      )}
      {/* Parados por Producción: la oficina no puede hacer nada con ellos hasta
          que los liberen. Aparte y plegados, para que no se lean como retrasos
          de la oficina; el navegador recuerda si se dejaron abiertos. */}
      {datos && detenidos.length > 0 && (
        <BloquePlegable
          clave="coordina-consulta-detenidos-plegado"
          abiertoDeSalida={false}
          bajarAlAbrir
          className="mt-5 border-t border-[var(--glass-border)] pb-6 pt-3"
          cabecera={
            <>
              <span className="size-2 rounded-full bg-amber-500" />
              <h2 className="text-base font-bold text-text">Detenidos por Producción</h2>
              <span
                className="rounded-full bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-600/25 dark:text-amber-300"
                title="Producción los tiene detenidos: la oficina no puede seguir con ellos hasta que los libere."
              >
                {detenidos.length} ped
              </span>
            </>
          }
        >
          <ListaView
            pedidos={detenidos}
            operarios={datos.operarios}
            orden="planificacion"
            ordenDesc={false}
            hayFiltrosActivos={q !== ""}
            sinMaterial
            fase={faseParaInvitado}
            unoAbierto
            conNombres
          />
        </BloquePlegable>
      )}
    </div>
  );
}
