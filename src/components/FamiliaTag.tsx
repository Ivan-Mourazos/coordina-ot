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
      className={`shrink-0 ${className}`}
      fill="none"
      stroke={meta.color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={meta.icon} />
    </svg>
  );
}

/** Etiqueta de familia: icono con el color propio + nombre en chip neutro.
 *  `soloIcono` para sitios estrechos (el icono lleva title con el nombre). */
export function FamiliaTag({
  familia,
  soloIcono = false,
}: {
  familia: Familia | string;
  soloIcono?: boolean;
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
      className="familia-tag inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
      style={{ "--fam": meta.color } as React.CSSProperties}
    >
      <FamiliaIcon familia={familia} className="size-3" />
      {meta.label}
    </span>
  );
}
