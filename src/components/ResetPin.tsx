"use client";

import { useEffect, useState } from "react";
import type { PersonaPublica } from "@/lib/personas";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── PIN olvidado ────────────────────────────────────────────────────────────
// Sin esto, cada olvido acaba en un UPDATE a mano en la base — y va a pasar:
// son cuatro dígitos que se teclean una vez al día y hay quien vuelve de dos
// semanas de vacaciones.
//
// Solo lo ve un supervisor. Resetearle el PIN a alguien y entrar en su nombre
// son la misma cosa, así que no es algo que pueda hacer un compañero.
//
// La lista se pide al MONTAR este bloque, que es cuando el supervisor ya abrió
// el menú: traerla con el tablero sería una vuelta más por algo que casi nadie
// mira.

export function ResetPin() {
  const [personas, setPersonas] = useState<PersonaPublica[]>([]);
  const [confirmando, setConfirmando] = useState<PersonaPublica | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = () =>
    fetch("/api/personas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { personas: PersonaPublica[] }) => setPersonas(j.personas))
      .catch(() => setAviso("No se pudo cargar la lista"));

  useEffect(() => {
    void cargar();
    // Una sola vez: la lista de la casa no cambia mientras el menú está abierto.
  }, []);

  async function resetear(p: PersonaPublica) {
    setConfirmando(null);
    try {
      const r = await fetch("/api/personas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      if (!r.ok) {
        setAviso("No se pudo reiniciar");
        return;
      }
      setAviso(`${p.nombre} elegirá un PIN nuevo al entrar`);
      await cargar();
    } catch {
      setAviso("No se pudo conectar");
    }
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        PIN olvidado
      </p>
      <p className="mb-1.5 px-1 text-[10px] leading-tight text-text-muted">
        Se queda sin PIN y elige uno nuevo la próxima vez que entre.
      </p>
      {aviso && (
        <p role="status" className="mb-1.5 px-1 text-[10px] text-brand-600">
          {aviso}
        </p>
      )}
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => setConfirmando(p)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-text hover:bg-[var(--glass-highlight)]"
        >
          {p.nombre}
          {p.sinPin && <span className="ml-auto text-[10px] text-text-muted">sin PIN</span>}
        </button>
      ))}

      {/* Se confirma porque un clic sin querer deja a esa persona fuera de su
          herramienta de trabajo hasta que se dé cuenta y venga a decirlo. */}
      <ConfirmDialog
        abierto={confirmando !== null}
        titulo="Reiniciar el PIN"
        mensaje={
          `${confirmando?.nombre ?? ""} se queda sin PIN y tendrá que elegir uno nuevo ` +
          `la próxima vez que entre.\n\nSi está dentro ahora mismo, no se le echa: ` +
          `sigue trabajando hasta que salga.`
        }
        onConfirmar={() => confirmando && void resetear(confirmando)}
        onCancelar={() => setConfirmando(null)}
      />
    </div>
  );
}
