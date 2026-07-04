import { Board } from "@/components/Board";
import { getTablero } from "@/lib/data";

// Tablero en vivo: datos frescos en cada carga (imprescindible con DATASOURCE=rps;
// sin esto el build congelaría los datos como HTML estático).
export const dynamic = "force-dynamic";

export default async function Home() {
  const { operarios, pedidos } = await getTablero();
  return <Board operarios={operarios} pedidos={pedidos} />;
}
