import type { Encaje } from "@/lib/visor-pdf";

const AJUSTES = [
  { id: "FitH", icono: "↔", nombre: "Ajustar al ancho" },
  { id: "FitV", icono: "↕", nombre: "Ajustar al alto" },
] as const;

/** ↔ y ↕, los mismos en el parte y en el visor de documentos. El aspecto lo
 *  pone quien los usa: chips del carril en el parte, botones claros sobre
 *  fondo negro en el visor de documentos. */
export function BotonesEncaje({
  encaje,
  onPulsar,
  clase,
  clasePuesto,
}: {
  encaje: Encaje;
  onPulsar: (pulsado: "FitH" | "FitV") => void;
  clase: string;
  clasePuesto: string;
}) {
  return (
    <>
      {AJUSTES.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPulsar(a.id);
          }}
          aria-pressed={encaje === a.id}
          title={`${encaje === a.id ? "Volver a la página entera" : a.nombre} · se recuerda para la próxima vez`}
          aria-label={a.nombre}
          className={`${clase} ${encaje === a.id ? clasePuesto : ""}`}
        >
          {a.icono}
        </button>
      ))}
    </>
  );
}
