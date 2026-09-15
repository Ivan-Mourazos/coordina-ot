import { headers } from "next/headers";
import dynamicImport from "next/dynamic";
import { Consulta } from "@/components/Consulta";
import { getTablero } from "@/lib/data";
import { loginActivo, quienEs } from "@/lib/server/sesion";

// El tablero se carga APARTE, y no con un import normal, para que el invitado
// no se lo descargue. Importando los dos aquí arriba, Next mete `Board` y
// `Consulta` en el mismo grupo de paquetes de esta página: medido sobre el
// build, quien entra sin sesión se bajaba 368 KB de fichaje, arrastre y
// acciones de escritura que no va a usar nunca. Para el equipo no cambia
// nada: el paquete se pide igual, solo que por su cuenta.
//
// Se renombra el import porque en esta misma página hay un `export const
// dynamic` de Next, que es otra cosa y no tiene nada que ver.
const Board = dynamicImport(() => import("@/components/Board").then((m) => m.Board));

// Tablero en vivo: datos frescos en cada carga (imprescindible con DATASOURCE=rps;
// sin esto el build congelaría los datos como HTML estático).
export const dynamic = "force-dynamic";

export default async function Home() {
  // QUIÉN PREGUNTA decide qué web es esta. Con el login encendido, quien no ha
  // entrado ve la consulta: dos pestañas de solo lectura para toda la casa.
  // Apagado no hay invitados y la web es exactamente la de siempre.
  if (loginActivo()) {
    const cabeceras = await headers();
    const yo = quienEs(new Request("http://interno/", { headers: cabeceras }));
    if (!yo) return <Consulta />;
  }

  const { operarios, pedidos, dobleFichaje } = await getTablero();
  return (
    <Board
      operarios={operarios}
      pedidos={pedidos}
      dobleFichaje={dobleFichaje ?? true}
      loginActivo={loginActivo()}
    />
  );
}
