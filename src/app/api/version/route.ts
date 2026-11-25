import { NextResponse, type NextRequest } from "next/server";
import { versionDelServidor } from "@/lib/server/version";
import { cambiosDesde } from "@/lib/version-nueva";

// GET /api/version?desde=<marca> — qué compilación está sirviendo el servidor,
// y las novedades publicadas después de `desde` (la marca de la última que
// traía el código de la pestaña que pregunta). Con eso la pestaña decide si
// se pone al día sin decir nada o avisa de lo nuevo. Ver `VersionNueva`.
// No toca la base de datos: todo está ya en memoria.
export function GET(req: NextRequest) {
  return NextResponse.json(
    {
      version: versionDelServidor(),
      novedades: cambiosDesde(req.nextUrl.searchParams.get("desde")),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
