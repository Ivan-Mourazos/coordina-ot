import { Board } from "@/components/Board";
import { getTableroInicial } from "@/lib/data";

export default function Home() {
  const { operarios, pedidos } = getTableroInicial();
  return <Board operarios={operarios} pedidos={pedidos} />;
}
