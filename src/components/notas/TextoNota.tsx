import { claveDestino, trocearTexto } from "@/lib/nota-pedido";
import type { PersonaPublica } from "@/lib/personas";
import { claseMencion } from "./CampoMencion";
import { nombreDestino } from "./SelectorPara";

/** El texto de una nota con las menciones como etiquetas. Resaltada la que va
 *  contigo (a ti o a una sección tuya). Lo comparten el hilo del pedido y la
 *  campana de Producción, para que una mención se vea igual en los dos. */
export function TextoNota({
  texto,
  personas,
  misDestinos,
}: {
  texto: string;
  personas: readonly PersonaPublica[];
  misDestinos: readonly string[];
}) {
  return (
    <>
      {trocearTexto(texto).map((t, i) =>
        t.tipo === "texto" ? (
          <span key={i}>{t.texto}</span>
        ) : (
          <span
            key={i}
            className={`rounded-full px-1.5 py-px text-[12px] font-semibold ${claseMencion(
              t.destino.tipo,
              misDestinos.includes(claveDestino(t.destino)) ? "mia" : "otra",
            )}`}
          >
            @{nombreDestino(t.destino, personas)}
          </span>
        ),
      )}
    </>
  );
}
