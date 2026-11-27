import type { Familia } from "@/lib/types";
import { familiaMeta } from "@/lib/familia";

export function FamiliaIcon({
  familia,
  className = "size-3.5",
}: {
  familia: Familia | string;
  className?: string;
}) {
  const meta = familiaMeta(familia);
  return (
    <svg
      viewBox="0 0 24 24"
      className={`familia-icon shrink-0 ${className}`}
      style={{ "--fam": meta.color } as React.CSSProperties}
      fill="none"
      stroke={meta.color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={meta.icon} />
      {/* Puntos mínimos rellenos (ollaos, eje de rueda, botones de capitoné…):
          se pintan como subtrazo `h.01` con `strokeWidth = r * 2` en vez de
          `<circle fill=...>` para que hereden `stroke` de `.familia-icon` y se
          aclaren igual que el resto del icono en modo oscuro (`globals.css`). */}
      {meta.iconDots?.map(([cx, cy, r = 1], i) => (
        <path key={i} d={`M${cx} ${cy}h0.01`} strokeWidth={r * 2} />
      ))}
    </svg>
  );
}

/** Etiqueta de familia: icono con el color propio + nombre en chip neutro.
 *  `soloIcono` para sitios estrechos (el icono lleva title con el nombre).
 *  `labelClassName` permite esconder solo el texto por container query
 *  conservando el chip tintado y el `title` completo. */
export function FamiliaTag({
  familia,
  soloIcono = false,
  labelClassName = "",
}: {
  familia: Familia | string;
  soloIcono?: boolean;
  labelClassName?: string;
}) {
  const meta = familiaMeta(familia);
  if (soloIcono) {
    return (
      <span title={meta.label} className="inline-flex">
        <FamiliaIcon familia={familia} />
      </span>
    );
  }
  return (
    <span
      // `whitespace-nowrap`: "Assa Abloy" se partía en dos líneas dentro de su
      // chip y engordaba la fila del panel entera.
      //
      // `min-w-0 max-w-full` y el nombre con «…»: en las columnas de ancho
      // fijo de las filas del panel, «Acabados · Confección» se salía de la
      // suya y pisaba el avatar y el cliente (Iván, 28/10/2026). Ahora se
      // corta dentro de su hueco; entero, al pasar el ratón.
      className="familia-tag inline-flex min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
      style={{ "--fam": meta.color } as React.CSSProperties}
      title={meta.label}
    >
      <FamiliaIcon familia={familia} className="size-3 shrink-0" />
      <span className={`truncate ${labelClassName}`}>{meta.label}</span>
    </span>
  );
}
