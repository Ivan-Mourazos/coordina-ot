import Image from "next/image";
import claro from "../../public/coordina-claro.png";
import oscuro from "../../public/coordina-oscuro.png";

/** Logotipo real (public/coordina-*.png): variante por tema vía CSS, sin JS.
 *  Los imports estáticos dejan que Next optimice y evitan errores de ruta en
 *  el servidor Linux (case-sensitive). */
export function Logo({
  className = "",
  height = 52,
}: {
  className?: string;
  height?: number;
}) {
  const width = Math.round(height * (claro.width / claro.height));
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ height, width }}>
      <Image
        src={claro}
        alt="CoordinaOT"
        height={height}
        className="block h-full w-auto dark:hidden"
        priority
      />
      <Image
        src={oscuro}
        alt="CoordinaOT"
        height={height}
        className="hidden h-full w-auto dark:block"
        priority
      />
    </span>
  );
}
