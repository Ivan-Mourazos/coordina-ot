import { describe, expect, it } from "vitest";
import { textoAntesDePasar, textoCorreo, textoCorreoAntesDePasar, textoImpresion, yaSePasoAntes } from "../planteamiento-textos";

const base = { modo: "activo" as const, aviso: null, impresiones: [] };

describe("lo que dice el diálogo de pasar", () => {
  it("todo A4", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [{ nombre: "AR2605016-10.pdf", paginas: 1, todoA4: true }] }))
      .toBe("Se imprimirá en Producción: AR2605016-10.pdf (1 pág.)");
  });
  it("alguna página no A4", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [{ nombre: "AR2605099-10.pdf", paginas: 2, todoA4: false }] }))
      .toBe("AR2605099-10.pdf lleva una página que no es A4: al pasar se abrirá el cuadro de imprimir");
  });
  it("sin planteamiento", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [] })).toBe("No encuentro el planteamiento en Planteamientos: se pasará sin imprimir");
  });
  it("carpeta ilegible", () => {
    expect(textoAntesDePasar({ ...base, ficheros: [], aviso: "No puedo leer la carpeta Planteamientos" }))
      .toBe("No puedo leer la carpeta Planteamientos: se pasará sin imprimir");
  });
  it("en ensayo lo dice", () => {
    expect(textoAntesDePasar({ ...base, modo: "ensayo", ficheros: [{ nombre: "A-10.pdf", paginas: 3, todoA4: true }] }))
      .toBe("Se imprimirá en la impresora de OT (ensayo): A-10.pdf (3 págs.)");
  });
  it("apagado: no dice nada", () => {
    expect(textoAntesDePasar({ ...base, modo: "off", ficheros: [] })).toBeNull();
  });
});

describe("lo que cuenta el Historial", () => {
  const fila = { id: 1, pedidoId: "AR.26.05016", fichero: "AR2605016-10.pdf", paginas: 1, intentos: 0, error: null, impresora: "ipp://192.168.4.245/ipp", modo: "activo" as const, pasadoPor: "ivan", creadoAt: "2026-10-13T11:05:00Z", enviadoAt: "2026-10-13T11:05:30Z" };
  it("enviado", () => {
    expect(textoImpresion({ ...fila, estado: "enviado" })).toBe("Impreso en Producción el 13/10 a las 13:05 · AR2605016-10.pdf");
  });
  it("enviado en ensayo lo dice (por el modo, no por la IP)", () => {
    expect(textoImpresion({ ...fila, estado: "enviado", modo: "ensayo" }))
      .toBe("Impreso en la impresora de OT (ensayo) el 13/10 a las 13:05 · AR2605016-10.pdf");
  });
  it("pendiente con error", () => {
    expect(textoImpresion({ ...fila, estado: "pendiente", intentos: 3, error: "La impresora no responde", enviadoAt: null }))
      .toBe("Pendiente de imprimir: La impresora no responde (3 intentos)");
  });
  it("manual y sin planteamiento", () => {
    expect(textoImpresion({ ...fila, estado: "manual" })).toBe("Impresión a mano: AR2605016-10.pdf lleva páginas que no son A4");
    expect(textoImpresion({ ...fila, estado: "sin_planteamiento", fichero: null })).toBe("Se pasó sin planteamiento en Planteamientos");
  });
});

describe("lo que se dice del correo", () => {
  const vista = (modo: "off" | "ensayo" | "activo", ficheros: Array<{ nombre: string; paginas: number; todoA4: boolean; adjunto?: boolean }> = [{ nombre: "A-10.pdf", paginas: 1, todoA4: true, adjunto: true }]) => ({
    modo: "activo" as const, aviso: null, impresiones: [], ficheros,
    correo: { modo, envios: [] },
  });
  const envio = {
    id: 1, pedidoId: "AR.26.05016", ficheros: ["A-10.pdf"], asunto: "Planteamiento AR.26.05016",
    para: ["of.tecnica@toldosgomez.com", "produccion@toldosgomez.com"], intentos: 0, error: null,
    modo: "activo" as const, pasadoPor: "ivan", creadoAt: "2026-10-13T11:05:00Z", enviadoAt: "2026-10-13T11:05:30Z",
  };

  it("antes de pasar", () => {
    expect(textoCorreoAntesDePasar(vista("activo"))).toBe("Se mandará el correo a Oficina Técnica y Producción con A-10.pdf adjunto");
    expect(textoCorreoAntesDePasar(vista("ensayo"))).toBe("Se mandará el correo solo a ti (prueba) con A-10.pdf adjunto");
    // Toldos: solo se imprime, el correo avisa.
    expect(textoCorreoAntesDePasar(vista("activo", [{ nombre: "A-1.pdf", paginas: 1, todoA4: true, adjunto: false }])))
      .toBe("Se mandará el correo a Oficina Técnica y Producción avisando de que está impreso");
    expect(textoCorreoAntesDePasar(vista("activo", [
      { nombre: "A-10.pdf", paginas: 1, todoA4: true, adjunto: true },
      { nombre: "A-11.pdf", paginas: 1, todoA4: true, adjunto: true },
    ]))).toBe("Se mandará el correo a Oficina Técnica y Producción con A-10.pdf, A-11.pdf adjuntos");
    expect(textoCorreoAntesDePasar(vista("activo", []))).toBeNull();
    expect(textoCorreoAntesDePasar(vista("off"))).toBeNull();
    expect(textoCorreoAntesDePasar({ ...vista("activo"), correo: undefined })).toBeNull();
  });

  it("en el Historial", () => {
    expect(textoCorreo({ ...envio, estado: "enviado" }))
      .toBe("Correo enviado el 13/10 a las 13:05 a of.tecnica@toldosgomez.com, produccion@toldosgomez.com");
    expect(textoCorreo({ ...envio, estado: "enviado", modo: "ensayo", para: ["ivan.sanchez@toldosgomez.com"] }))
      .toBe("Correo enviado el 13/10 a las 13:05 a ivan.sanchez@toldosgomez.com (prueba)");
    expect(textoCorreo({ ...envio, estado: "pendiente", enviadoAt: null, intentos: 2, error: "Microsoft no responde" }))
      .toBe("Correo pendiente: Microsoft no responde (2 intentos)");
    expect(textoCorreo({ ...envio, estado: "pendiente", enviadoAt: null })).toBe("Correo pendiente");
    expect(textoCorreo({ ...envio, estado: "sin_planteamiento", enviadoAt: null })).toBe("Sin correo: no había planteamiento");
    expect(textoCorreo({ ...envio, estado: "descartado", enviadoAt: null, error: "Access is denied" }))
      .toBe("Correo no enviado: Access is denied");
  });
});

describe("¿el pedido ya se pasó antes?", () => {
  const base = { modo: "activo" as const, aviso: null, ficheros: [], impresiones: [], correo: { modo: "activo" as const, envios: [] } };
  it("primera vez: no", () => {
    expect(yaSePasoAntes(base)).toBe(false);
    expect(yaSePasoAntes({ ...base, correo: undefined })).toBe(false);
  });
  it("con alguna impresión o algún correo de antes: sí", () => {
    expect(yaSePasoAntes({ ...base, impresiones: [{ id: 1 } as never] })).toBe(true);
    expect(yaSePasoAntes({ ...base, correo: { modo: "activo", envios: [{ id: 1 } as never] } })).toBe(true);
  });
});
