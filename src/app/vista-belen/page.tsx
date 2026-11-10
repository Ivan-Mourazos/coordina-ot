import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { VistaBelen } from "@/components/vista-belen/VistaBelen";
import { vistaAMedida } from "@/lib/personas";
import { loginActivo, quienEs } from "@/lib/server/sesion";

// La pantalla de Belén por su dirección, para que Iván (técnico y Dirección)
// la mire sin cambiar de cuenta. Belén no la necesita: aterriza en ella al
// entrar (app/page.tsx). Solo lectura: lo que enseña es de RPS.

export const dynamic = "force-dynamic";

export default async function PaginaVistaBelen() {
  if (!loginActivo()) return <VistaBelen nombre="" />;
  const yo = quienEs(new Request("http://interno/", { headers: await headers() }));
  const puede =
    yo && (vistaAMedida(yo) === "belen" || yo.roles.includes("tecnico") || yo.roles.includes("direccion"));
  if (!puede) redirect("/");
  return <VistaBelen nombre={yo.nombre} miId={yo.id} direccion={yo.roles.includes("direccion")} />;
}
