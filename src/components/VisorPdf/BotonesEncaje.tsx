import type { Encaje } from "@/lib/visor-pdf";
import { Pista } from "../Pista";

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
  lado,
}: {
  encaje: Encaje;
  onPulsar: (pulsado: "FitH" | "FitV") => void;
  clase: string;
  clasePuesto: string;
  /** Hacia dónde sale la pista: a la derecha en el carril, debajo en la barra. */
  lado: "derecha" | "abajo";
}) {
  return (
    <>
      {AJUSTES.map((a) => (
        <Pista
          key={a.id}
          lado={lado}
          texto={encaje === a.id ? "Volver a la página entera" : a.nombre}
          detalle="Se recuerda para la próxima vez"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPulsar(a.id);
            }}
            aria-pressed={encaje === a.id}
            aria-label={a.nombre}
            className={`${clase} ${encaje === a.id ? clasePuesto : ""}`}
          >
            {a.icono}
          </button>
        </Pista>
      ))}
    </>
  );
}
