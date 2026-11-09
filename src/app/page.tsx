import { headers } from "next/headers";
import dynamicImport from "next/dynamic";
import { Consulta } from "@/components/Consulta";
import { getTablero } from "@/lib/data";
import { loginActivo, quienEs } from "@/lib/server/sesion";
import { vistaAMedida } from "@/lib/personas";

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
// La de Belén, igual: ni el equipo se la baja ni ella se baja el tablero.
const VistaBelen = dynamicImport(() =>
  import("@/components/vista-belen/VistaBelen").then((m) => m.VistaBelen),
);

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
    // Producción no trabaja en el tablero de OT: aterriza en su pantalla a
    // medida, o en la consulta si todavía no tiene una (ver lib/personas.ts).
    const soloProduccion =
      yo.roles.includes("produccion") && !yo.roles.includes("tecnico") && !yo.roles.includes("direccion");
    if (soloProduccion) {
      return vistaAMedida(yo) === "belen" ? <VistaBelen nombre={yo.nombre} /> : <Consulta />;
    }
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
