import Image, { type StaticImageData } from "next/image";
import type { SiglasLogo } from "@/lib/secciones";
import soloClaro from "../../public/coordina-solo-claro.png";
import soloOscuro from "../../public/coordina-solo-oscuro.png";
import otClaro from "../../public/coordina-ot-claro.png";
import otOscuro from "../../public/coordina-ot-oscuro.png";
import dgClaro from "../../public/coordina-dg-claro.png";
import dgOscuro from "../../public/coordina-dg-oscuro.png";
import idClaro from "../../public/coordina-id-claro.png";
import idOscuro from "../../public/coordina-id-oscuro.png";
import opClaro from "../../public/coordina-op-claro.png";
import opOscuro from "../../public/coordina-op-oscuro.png";

const IMAGENES: Record<SiglasLogo | "solo", { claro: StaticImageData; oscuro: StaticImageData }> = {
  solo: { claro: soloClaro, oscuro: soloOscuro },
  OT: { claro: otClaro, oscuro: otOscuro },
  DG: { claro: dgClaro, oscuro: dgOscuro },
  ID: { claro: idClaro, oscuro: idOscuro },
  OP: { claro: opClaro, oscuro: opOscuro },
};

/** Con siglas el logo es más ancho que el de antes (1672 px de ancho en el
 *  original; DG llega a 2140). Se encoge un poco, igual en todas las
 *  secciones para que «Coordina» no cambie de tamaño al pasar de una a otra:
 *  así ocupa más o menos lo mismo que el logo de antes (Iván, 14/10/2026). */
const ESCALA_CON_SIGLAS = 0.85;

/** Logotipo (public/coordina-*.png, generados con scripts/genera-logos.mjs):
 *  variante por tema vía CSS, sin JS. Sin `siglas`, solo «Coordina» (entrar).
 *  Los imports estáticos dejan que Next optimice y evitan errores de ruta en
 *  el servidor Linux (case-sensitive). */
export function Logo({
  className = "",
  height = 52,
  siglas,
}: {
  className?: string;
  height?: number;
  siglas?: SiglasLogo | null;
}) {
  const { claro, oscuro } = IMAGENES[siglas ?? "solo"];
  const alto = siglas ? Math.round(height * ESCALA_CON_SIGLAS) : height;
  const width = Math.round(alto * (claro.width / claro.height));
  const alt = siglas ? `Coordina ${siglas}` : "Coordina";
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ height: alto, width }}>
      <Image
        src={claro}
        alt={alt}
        height={alto}
        className="block h-full w-auto dark:hidden"
        priority
      />
      <Image
        src={oscuro}
        alt={alt}
        height={alto}
        className="hidden h-full w-auto dark:block"
        priority
      />
    </span>
  );
}
