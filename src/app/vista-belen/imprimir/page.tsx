import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PaginasInforme } from "@/components/vista-belen/InformeRps";
import { BotonImprimir } from "@/components/vista-belen/BotonImprimir";
import { maquetar, type Pagina } from "@/lib/informes-rps/maquetar";
import { PLANTILLA_HOJA_RUTA, PLANTILLA_VALE } from "@/lib/informes-rps/plantillas";
import { puedeVerVistaBelen } from "@/lib/personas";
import { leerDatosImpresion, ofsAImprimir } from "@/lib/server/informes-rps-db";
import { loginActivo, quienEs } from "@/lib/server/sesion";

// ─── Imprimir la hoja de ruta y el vale de material de una o varias OF ──────
// Lo que Belén imprimía en RPS (Fabricación → Imprimir Documentación, «Hoja de
// Ruta» y «Vale de Material»), calcado de las plantillas de RPS y con los
// mismos códigos de barras. Por cada OF, su hoja de ruta y detrás su vale,
// como si se imprimieran de una en una: así salen grapables.
//
//   /vista-belen/imprimir?ofs=0233881,0233882&que=ruta|vale|todo
//
// Solo lectura: lee RPS y no escribe nada.

export const dynamic = "force-dynamic";

export default async function PaginaImprimir({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  if (loginActivo()) {
    const yo = quienEs(new Request("http://interno/", { headers: await headers() }));
    if (!yo || !puedeVerVistaBelen(yo)) redirect("/");
  }
  const p = await searchParams;
  // Sin repetidas ni basura, y con tope: lo mismo que acepta la consulta.
  const ofs = ofsAImprimir(String(p.ofs ?? ""));
  const que = p.que === "ruta" || p.que === "vale" ? p.que : "todo";

  let error = "";
  const bloques: Array<{ of: string; titulo: string; paginas: Pagina[] }> = [];
  try {
    const datos = await leerDatosImpresion(ofs);
    const hoy = new Date();
    const hoyCalendario = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
    for (const of of ofs) {
      const ruta = datos.hojaRuta.filter((f) => f.ManufacturingOrder_CodManufacturingOrder === of);
      const vale = datos.vale.filter((f) => f.ManufacturingOrder_CodManufacturingOrder === of);
      if (que !== "vale" && ruta.length) bloques.push({ of, titulo: `Hoja de ruta ${of}`, paginas: maquetar(PLANTILLA_HOJA_RUTA, ruta, hoyCalendario) });
      if (que !== "ruta" && vale.length) bloques.push({ of, titulo: `Vale de material ${of}`, paginas: maquetar(PLANTILLA_VALE, vale, hoyCalendario) });
    }
  } catch (e) {
    error = (e as Error).message;
  }
  const hojas = bloques.reduce((n, b) => n + b.paginas.length, 0);

  return (
    <div className="imprimir-rps">
      <style>{`
        @page { size: A4; margin: 0; }
        .imprimir-rps { background: #e4e4e7; min-height: 100vh; padding: 16px 0 40px; color: black; }
        .imprimir-rps .barra { position: sticky; top: 0; z-index: 10; display: flex; gap: 12px; align-items: center;
          justify-content: center; padding: 10px 16px; margin-bottom: 16px; background: #fff; font: 14px system-ui, sans-serif;
          box-shadow: 0 1px 2px rgba(0,0,0,.06); }
        .hoja-a4 { position: relative; width: 21cm; height: 29.7cm; margin: 0 auto 16px; background: white; overflow: hidden;
          box-shadow: 0 2px 12px rgba(0,0,0,.15); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          html, body, .imprimir-rps { background: white !important; padding: 0 !important; }
          .imprimir-rps .barra { display: none; }
          .hoja-a4 { margin: 0; box-shadow: none; break-after: page; }
          .hoja-a4:last-child { break-after: auto; }
        }
      `}</style>
      <div className="barra">
        {error ? (
          <span style={{ color: "#b91c1c", fontWeight: 600 }}>No se pudo leer RPS: {error}</span>
        ) : ofs.length === 0 ? (
          <span>No se ha elegido ninguna OF.</span>
        ) : hojas === 0 ? (
          <span>RPS no tiene esas OF ({ofs.join(", ")}).</span>
        ) : (
          <>
            <span>
              {que === "ruta" ? "Hoja de ruta" : que === "vale" ? "Vale de material" : "Hoja de ruta y vale de material"} ·{" "}
              {ofs.length === 1 ? `OF ${ofs[0]}` : `${ofs.length} OF`} · {hojas} {hojas === 1 ? "hoja" : "hojas"}
            </span>
            <BotonImprimir />
          </>
        )}
      </div>
      {bloques.map((b) => (
        <PaginasInforme key={b.titulo} titulo={b.titulo} paginas={b.paginas} />
      ))}
    </div>
  );
}
