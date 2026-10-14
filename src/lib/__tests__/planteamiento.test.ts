import { describe, expect, it } from "vitest";
import { anioPedido, conAnio, esA4, nombreArchivoRps, nombreCompacto, partesPedido, sufijoDe, vaAdjunto, leerEleccion, NOTA_MAX } from "../planteamiento";

describe("nombres del planteamiento", () => {
  it("parte el código de pedido", () => {
    expect(partesPedido("AR.26.05016")).toEqual({ serie: "AR", yy: "26", numero: "05016" });
    expect(partesPedido("SA.26.00498")).toEqual({ serie: "SA", yy: "26", numero: "00498" });
    expect(partesPedido("sin-pedido:3")).toBeNull();
  });

  it("el nombre compacto es el de la carpeta Planteamientos", () => {
    expect(nombreCompacto("AR.26.05016")).toBe("AR2605016");
    expect(nombreCompacto("nada")).toBeNull();
  });

  it("el año sale de las dos cifras tras la serie", () => {
    expect(anioPedido("AR.26.05016")).toBe(2026);
    expect(anioPedido("BE.25.00001")).toBe(2025);
  });

  it("el sufijo sale tanto del nombre compacto como del de RPS", () => {
    expect(sufijoDe("AR2605016-10.pdf", "AR.26.05016")).toBe("-10");
    expect(sufijoDe("AR.26.05016-1.PDF", "AR.26.05016")).toBe("-1");
    // Otro pedido, sin sufijo o con añadidos: no es su planteamiento.
    expect(sufijoDe("AR2605017-10.pdf", "AR.26.05016")).toBeNull();
    expect(sufijoDe("AR2605016.pdf", "AR.26.05016")).toBeNull();
    expect(sufijoDe("AR2605016-10 copia.pdf", "AR.26.05016")).toBeNull();
  });

  it("el nombre en el archivo de RPS lleva puntos", () => {
    expect(nombreArchivoRps("AR.26.05016", "-10")).toBe("AR.26.05016-10.pdf");
  });

  it("la plantilla de carpeta admite el año", () => {
    expect(conAnio("/mnt/rps/VENTAS/PLANTEAMIENTOS/{YYYY}", 2026)).toBe("/mnt/rps/VENTAS/PLANTEAMIENTOS/2026");
    expect(conAnio("/mnt/escaner/Planteamientos", 2026)).toBe("/mnt/escaner/Planteamientos");
  });

  it("A4 en vertical y apaisado, con margen; A5 y A3 no", () => {
    expect(esA4(595.28, 841.89)).toBe(true);
    expect(esA4(841.89, 595.28)).toBe(true);
    expect(esA4(596, 842)).toBe(true);
    expect(esA4(419.53, 595.28)).toBe(false); // A5
    expect(esA4(841.89, 1190.55)).toBe(false); // A3
  });
});

describe("qué planteamiento va adjunto al correo", () => {
  it("del -10 en adelante (PVC) sí; del -1 al -9 (toldos, acrílico) no", () => {
    expect(vaAdjunto("AR2605023-10.pdf", "AR.26.05023")).toBe(true);
    expect(vaAdjunto("AR.26.05023-12.pdf", "AR.26.05023")).toBe(true);
    expect(vaAdjunto("AR2605023-1.pdf", "AR.26.05023")).toBe(false);
    expect(vaAdjunto("AR2605023-9.pdf", "AR.26.05023")).toBe(false);
    expect(vaAdjunto("otro.pdf", "AR.26.05023")).toBe(false);
  });
});

describe("lo elegido a mano al pasar", () => {
  it("se acepta con su forma, y la nota se recorta y se limita", () => {
    expect(leerEleccion({ imprimir: ["a.pdf"], adjuntar: [], ofs: ["0232963"], nota: "  hola  " }))
      .toEqual({ imprimir: ["a.pdf"], adjuntar: [], ofs: ["0232963"], nota: "hola" });
    expect(leerEleccion({ imprimir: [], adjuntar: [], ofs: [], nota: "x".repeat(NOTA_MAX + 50) })?.nota).toHaveLength(NOTA_MAX);
  });

  it("si falta algo o no es de la forma esperada, null (vale la norma)", () => {
    expect(leerEleccion(undefined)).toBeNull();
    expect(leerEleccion({ imprimir: "todo", adjuntar: [], ofs: [], nota: "" })).toBeNull();
    expect(leerEleccion({ imprimir: [1], adjuntar: [], ofs: [], nota: "" })).toBeNull();
    expect(leerEleccion({ imprimir: [], adjuntar: [], ofs: [] })).toBeNull();
  });
});
