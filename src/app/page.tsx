import { headers } from "next/headers";
import { Board } from "@/components/Board";
import { Consulta } from "@/components/Consulta";
import { getTablero } from "@/lib/data";
import { loginActivo, quienEs } from "@/lib/server/sesion";

// Tablero en vivo: datos frescos en cada carga (imprescindible con DATASOURCE=rps;
// sin esto el build congelaría los datos como HTML estático).
export const dynamic = "force-dynamic";

export default async function Home() {
  // QUIÉN PREGUNTA decide qué web es esta. Con el login encendido, quien no ha
  // entrado ve la consulta: tres pestañas de solo lectura para toda la casa.
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
