import { redirect } from "next/navigation";

// Dirección antigua de imprimir: se pasa a /produccion/imprimir con lo mismo.
export default async function ImprimirAntiguo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) p.append(k, x);
  const q = p.toString();
  redirect(`/produccion/imprimir${q ? `?${q}` : ""}`);
}
