import { NextResponse } from "next/server";
import { versionDelServidor } from "@/lib/server/version";

// GET /api/version — qué compilación está sirviendo el servidor.
// El Board ya la recibe dentro del tablero; esto es para las pantallas que no
// piden el tablero (la vista de Producción de Belén) y aun así tienen que
// enterarse de un despliegue. No toca la base de datos: lee un fichero que ya
// está en memoria. Ver `VersionNueva`.
export function GET() {
  return NextResponse.json(
    { version: versionDelServidor() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
