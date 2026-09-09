"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonaPublica, RolAcceso } from "@/lib/personas";
import { SECCIONES, SECCION_POR_DEFECTO, type SeccionId } from "@/lib/secciones";
import { OPERARIOS } from "@/lib/mock";
import { Logo } from "./Logo";

// ─── La pantalla de entrar ───────────────────────────────────────────────────
// La rejilla de caras se queda: funciona y el equipo la conoce de memoria. Lo
// nuevo es que después de elegirse hay que teclear cuatro dígitos.
//
// Quien todavía no tiene PIN lo elige aquí, tecleándolo DOS veces. Con una
// sola, una errata deja a esa persona fuera de su herramienta de trabajo hasta
// que un supervisor se lo resetee.

export interface Yo {
  id: string;
  nombre: string;
  roles: RolAcceso[];
}

/** El color y las iniciales de cada uno. Se quedan en el código y no en la
 *  base: son presentación, no identidad, y cambiarlos no debería ser una
 *  migración. El que no esté en el mapa sale en gris con su inicial. */
const APARIENCIA = new Map(OPERARIOS.map((o) => [o.id, { iniciales: o.iniciales, color: o.color }]));

const pinta = (p: PersonaPublica) =>
  APARIENCIA.get(p.id) ?? { iniciales: p.nombre.slice(0, 2).toUpperCase(), color: "#5a6472" };

const PIN_LARGO = 4;

export function LoginGate({ onEntrado }: { onEntrado: (yo: Yo) => void }) {
  const [personas, setPersonas] = useState<PersonaPublica[] | null>(null);
  const [quien, setQuien] = useState<PersonaPublica | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/personas", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { personas: PersonaPublica[] }) => {
        if (vivo) setPersonas(j.personas);
      })
      .catch(() => {
        if (vivo) setPersonas([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="grid min-h-full place-items-center p-6">
      <div className="w-full max-w-xl text-center">
        <div className="mb-6 flex justify-center">
          <Logo height={110} />
        </div>
        {quien ? (
          <TecladoPin
            persona={quien}
            onVolver={() => setQuien(null)}
            onEntrado={onEntrado}
          />
        ) : (
          <Rejilla personas={personas} onElegir={setQuien} />
        )}
      </div>
    </div>
  );
}

function Rejilla({
  personas,
  onElegir,
}: {
  personas: PersonaPublica[] | null;
  onElegir: (p: PersonaPublica) => void;
}) {
  if (personas === null)
    return <p className="text-sm text-text-muted">Cargando…</p>;
  if (personas.length === 0)
    return (
      <p className="text-sm text-text-muted">
        No se pudo cargar la lista. Recarga la página.
      </p>
    );

  // OJO: esta rejilla es la del login CON PIN. La de siempre —sin PIN, con la
  // identidad en localStorage— sigue viva en IdentityGate.tsx y es la que se ve
  // mientras COORDINA_LOGIN esté apagado. Las dos existen a propósito.
  //
  // Solo los TÉCNICOS salen en la rejilla: son las caras del tablero, y un
  // supervisor puro ahí sobra.
  //
  // La spec preveía un enlace discreto ("Entrar con otro usuario") para que
  // ellos entrasen con nombre y PIN escritos. NO se construye todavía: hoy los
  // tres supervisores puros están desactivados —sus pantallas son las fases 2
  // y 3, aplazadas— y Ángel, que es el único con ese rol en activo, entra por
  // la rejilla como el técnico que también es. Un enlace a una pantalla donde
  // nadie puede entrar es una puerta a un cuarto vacío. Se añade el día que se
  // activen, junto a lo que van a mirar.
  const tecnicos = personas.filter((p) => p.roles.includes("tecnico"));
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold text-text">¿Quién eres?</h1>
      <p className="mb-6 text-sm text-text-muted">
        Elige tu nombre y teclea tu PIN.
      </p>
      <div className="flex flex-col gap-5">
        {agrupar(tecnicos).map(([seccion, suyos]) => (
          <section key={seccion}>
            <h2 className="mb-2 border-b border-border pb-1 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
              {SECCIONES[seccion].nombre}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {suyos.map((p) => {
                const cara = pinta(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => onElegir(p)}
                    className="glass-panel flex flex-col items-center gap-2 rounded-2xl p-4 transition-all hover:scale-[1.03] hover:border-brand-400"
                  >
                    <span
                      className="grid size-14 place-items-center rounded-full text-lg font-bold text-white shadow"
                      style={{ background: cara.color }}
                    >
                      {cara.iniciales}
                    </span>
                    <span className="text-sm font-semibold text-text">{p.nombre}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** Agrupa por sección conservando el orden de SECCIONES y dejando fuera las
 *  que no tengan a nadie: un rótulo sobre una rejilla vacía solo hace pensar que
 *  falta gente por cargar.
 *
 *  Es el criterio que traía la pantalla anterior, ahora sobre PersonaPublica:
 *  quién puede entrar sale de la base, no del catálogo del tablero. */
function agrupar(personas: PersonaPublica[]): [SeccionId, PersonaPublica[]][] {
  return (Object.keys(SECCIONES) as SeccionId[])
    .map((id) => [id, personas.filter((p) => (p.seccion ?? SECCION_POR_DEFECTO) === id)] as [SeccionId, PersonaPublica[]])
    .filter(([, suyos]) => suyos.length > 0);
}

function TecladoPin({
  persona,
  onVolver,
  onEntrado,
}: {
  persona: PersonaPublica;
  onVolver: () => void;
  onEntrado: (yo: Yo) => void;
}) {
  const [pin, setPin] = useState("");
  const [repetido, setRepetido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cara = pinta(persona);
  const primerDigitoRef = useRef<HTMLButtonElement>(null);

  // Al elegir persona el foco se quedaba en el botón de la rejilla que ya no
  // está: quien navega con teclado tenía que ir a buscar el teclado a mano.
  // Este componente se remonta entero cada vez que cambia `persona` (el padre
  // lo condiciona con `quien ? <TecladoPin .../> : <Rejilla .../>`), así que
  // un efecto en el montaje es "cada vez que se elige a alguien".
  useEffect(() => {
    primerDigitoRef.current?.focus();
  }, []);

  // Con PIN puesto se teclea uno; sin PIN, dos (lo está eligiendo).
  const segundoPaso = persona.sinPin && pin.length === PIN_LARGO;
  const actual = segundoPaso ? repetido : pin;
  const ponActual = segundoPaso ? setRepetido : setPin;

  async function entrar(pinFinal: string, repetidoFinal: string) {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: persona.id,
          pin: pinFinal,
          ...(persona.sinPin ? { pinRepetido: repetidoFinal } : {}),
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { yo: Yo };
        onEntrado(j.yo);
        return;
      }
      // Un 500 no es "PIN equivocado": es el servidor, no la persona. Se
      // distingue por el estado y no por el cuerpo porque un 500 de verdad
      // —uno que no venga de este `catch` a propósito de la ruta— puede no
      // traer JSON que parsear, y con el mensaje genérico de abajo alguien
      // pensaría que se equivocó tecleando y lo seguiría intentando en bucle.
      if (r.status >= 500) {
        setError("Algo va mal en el servidor. Avisa a Iván.");
      } else {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "No se pudo entrar");
      }
    } catch {
      setError("No se pudo conectar");
    }
    // Se vacía SIEMPRE tras un fallo: dejar los dígitos puestos invita a
    // pulsar Entrar otra vez con lo mismo.
    setPin("");
    setRepetido("");
    setEnviando(false);
  }

  function pulsar(d: string) {
    if (enviando || actual.length >= PIN_LARGO) return;
    const nuevo = actual + d;
    ponActual(nuevo);
    if (nuevo.length < PIN_LARGO) return;
    // Al cuarto dígito se entra solo, sin pulsar nada más. Salvo en el alta,
    // donde falta la segunda vuelta.
    if (persona.sinPin && !segundoPaso) return;
    void entrar(segundoPaso ? pin : nuevo, segundoPaso ? nuevo : "");
  }

  return (
    <>
      <div className="mb-4 flex flex-col items-center gap-2">
        <span
          className="grid size-14 place-items-center rounded-full text-lg font-bold text-white shadow"
          style={{ background: cara.color }}
        >
          {cara.iniciales}
        </span>
        <p className="text-lg font-semibold text-text">{persona.nombre}</p>
        <p className="text-sm text-text-muted">
          {!persona.sinPin
            ? "Teclea tu PIN"
            : segundoPaso
              ? "Repítelo para confirmar"
              : "Elige tu PIN: los cuatro números de tu extensión"}
        </p>
      </div>

      {/* Los cuatro huecos. Se ven puntos, nunca los números: por encima del
          hombro se lee un PIN de cuatro cifras sin esfuerzo.
          Los `<span>` son puramente visuales y no dicen nada por sí solos:
          el `aria-live` sin texto no tenía nada que anunciar. El texto que de
          verdad se lee va aparte, en `sr-only`, y cuenta dígitos sin decir
          cuáles —de lo contrario un lector de pantalla iría dictando el PIN. */}
      <div className="mb-4 flex justify-center gap-3">
        {Array.from({ length: PIN_LARGO }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={`size-4 rounded-full border-2 ${
              i < actual.length ? "border-brand-400 bg-brand-400" : "border-border"
            }`}
          />
        ))}
        <span role="status" aria-live="polite" className="sr-only">
          {actual.length} de {PIN_LARGO} números
        </span>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-red-500">
          {error}
        </p>
      )}

      <div className="mx-auto grid w-56 grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            // El "1" es donde aterriza el foco al elegir persona: es el
            // primer botón del propio teclado numérico, así que el foco entra
            // justo donde hay que teclear y no en un punto arbitrario.
            ref={d === "1" ? primerDigitoRef : undefined}
            onClick={() => pulsar(d)}
            disabled={enviando}
            className="glass-panel rounded-xl py-3 text-lg font-semibold text-text hover:border-brand-400 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          onClick={onVolver}
          className="rounded-xl py-3 text-xs font-semibold text-text-muted hover:text-text"
        >
          No soy yo
        </button>
        <button
          onClick={() => pulsar("0")}
          disabled={enviando}
          className="glass-panel rounded-xl py-3 text-lg font-semibold text-text hover:border-brand-400 disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={() => ponActual(actual.slice(0, -1))}
          disabled={enviando}
          className="rounded-xl py-3 text-lg font-semibold text-text-muted hover:text-text disabled:opacity-50"
          aria-label="Borrar el último número"
        >
          ⌫
        </button>
      </div>
    </>
  );
}
