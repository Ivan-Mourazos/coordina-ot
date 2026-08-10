import { expect, test } from "vitest";
import { construirFiltros, filaAItem, CODIGO_PEDIDO_RE, cabeceraADetalle } from "../historial";
import { FAMILIA_KEYWORDS, archivoDeRuta, claseDeDocumento, comoServir, segmentosEnShare } from "../historial";
import { aMaterialOF, repartirMateriales } from "../historial";

test("sin filtros no genera cláusulas ni params", () => {
  const r = construirFiltros({ page: 0 });
  expect(r.clausulas).toEqual([]);
  expect(r.params).toEqual([]);
});

test("q genera cláusula LIKE parametrizada sobre pedido y cliente", () => {
  const r = construirFiltros({ page: 0, q: "MAHOU" });
  expect(r.clausulas).toHaveLength(1);
  expect(r.clausulas[0]).toMatch(/p\.pedido LIKE @q OR cli\.Description LIKE @q/);
  expect(r.params).toContainEqual({ nombre: "q", valor: "%MAHOU%" });
});

test("desde/hasta generan cláusulas de rango parametrizadas", () => {
  const r = construirFiltros({ page: 0, desde: "2026-01-01", hasta: "2026-02-01" });
  expect(r.params).toContainEqual({ nombre: "desde", valor: "2026-01-01" });
  expect(r.params).toContainEqual({ nombre: "hasta", valor: "2026-02-01" });
  expect(r.clausulas.some((c) => c.includes("p.finalizada >= @desde"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("p.finalizada < @hasta"))).toBe(true);
});

test("q vacío o solo espacios se ignora", () => {
  expect(construirFiltros({ page: 0, q: "   " }).clausulas).toEqual([]);
});

test("filaAItem normaliza fecha a ISO y recorta el pedido", () => {
  const item = filaAItem({
    pedido: " AR.26.03453 ", finalizada: new Date("2026-07-22T13:04:06.887Z"),
    cliente: "MAHOU, S.A.", n_of: 13,
  });
  expect(item).toEqual({
    pedido: "AR.26.03453", cliente: "MAHOU, S.A.",
    finalizada: "2026-07-22T13:04:06.887Z", nOf: 13,
  });
});

test("CODIGO_PEDIDO_RE acepta AR/BE/SA y rechaza basura", () => {
  expect(CODIGO_PEDIDO_RE.test("AR.26.03453")).toBe(true);
  expect(CODIGO_PEDIDO_RE.test("BE.25.01165")).toBe(true);
  expect(CODIGO_PEDIDO_RE.test("'; DROP TABLE x --")).toBe(false);
});

test("cabeceraADetalle arma el detalle con fechas ISO, scanUrl y prioridad saneada", () => {
  const d = cabeceraADetalle(
    {
      pedido: " AR.26.03365 ", cliente: "MAHOU, S.A.", negocio: "NOVA",
      ciudad: "Coruña", comentario: "sin prisa",
      solicitada: new Date("2026-06-01T00:00:00.000Z"), prioridad: 9, piezas: 4,
    },
    [{ codigo: "0230262", descripcion: "TOLDO", tiempoImputadoMin: 12, quien: ["Alberto"] }],
    "2026-07-22T13:00:00.000Z",
    ["TOLDO"],
  );
  expect(d.codigo).toBe("AR.26.03365");
  expect(d.scanUrl).toBe("/api/pedidos/AR.26.03365.pdf");
  expect(d.prioridad).toBe(1); // 9 fuera de rango → 1
  expect(d.fechaSolicitud).toBe("2026-06-01");
  expect(d.fechaFinalizacion).toBe("2026-07-22T13:00:00.000Z");
  expect(d.piezas).toBe(4);
  expect(d.familias).toEqual(["TOLDO"]);
  expect(d.ofs).toHaveLength(1);
});

test("cabeceraADetalle tolera nulos (fecha, piezas, cliente)", () => {
  const d = cabeceraADetalle(
    { pedido: "AR.26.00001", cliente: null, negocio: null, ciudad: null, comentario: null, solicitada: null, prioridad: null, piezas: null },
    [], null, [],
  );
  expect(d.cliente).toBeNull();
  expect(d.fechaSolicitud).toBeNull();
  expect(d.fechaFinalizacion).toBeNull();
  expect(d.piezas).toBe(0);
  expect(d.prioridad).toBe(1);
});

test("FAMILIA_KEYWORDS tiene las 7 familias con sus keywords", () => {
  expect(Object.keys(FAMILIA_KEYWORDS).sort()).toEqual(
    ["CARPA", "LONA", "REMOLQUE", "REPARACION", "SUMINISTRO", "TAPIZADO", "TOLDO"],
  );
  expect(FAMILIA_KEYWORDS.LONA).toEqual(["LONA", "ROLLO"]);
});

test("filtro familia genera EXISTS parametrizado con las keywords de esa familia", () => {
  const r = construirFiltros({ page: 0, familia: "LONA" });
  expect(r.clausulas.some((c) => c.includes("EXISTS"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("mo2.Description LIKE @fam0"))).toBe(true);
  expect(r.clausulas.some((c) => c.includes("mo2.Description LIKE @fam1"))).toBe(true);
  expect(r.params).toContainEqual({ nombre: "fam0", valor: "%LONA%" });
  expect(r.params).toContainEqual({ nombre: "fam1", valor: "%ROLLO%" });
});

test("filtro familia desconocida se ignora", () => {
  expect(construirFiltros({ page: 0, familia: "XXX" }).clausulas).toEqual([]);
});

test("filtro cliente genera igualdad exacta parametrizada", () => {
  const r = construirFiltros({ page: 0, cliente: "MAHOU, S.A." });
  expect(r.clausulas).toContain("cli.Description = @cliente");
  expect(r.params).toContainEqual({ nombre: "cliente", valor: "MAHOU, S.A." });
});

// ── Documentos de RPS ──
// Las rutas de estos tests están copiadas TAL CUAL de GENEntityDocument
// (consultada el 08/2026): son las formas reales que hay que saber distinguir.

test("cabeceraADetalle deja vacíos los extras que no le pasan", () => {
  const d = cabeceraADetalle(
    { pedido: "AR.26.00001", cliente: null, negocio: null, ciudad: null, comentario: null, solicitada: null, prioridad: null, piezas: null },
    [], null, [],
  );
  expect(d.documentos).toEqual([]);
  expect(d.comentariosLinea).toEqual([]);
  expect(d.comentarioEnvio).toBeNull();
});

test("cabeceraADetalle propaga los extras cuando vienen", () => {
  const d = cabeceraADetalle(
    { pedido: "AR.26.00001", cliente: null, negocio: null, ciudad: null, comentario: null, solicitada: null, prioridad: null, piezas: null },
    [], null, [],
    {
      documentos: [{ descripcion: "Planteamiento", archivo: "x.pdf", clase: "Planteamiento", url: "/api/historial/AR.26.00001/documento/0" }],
      comentariosLinea: ["CAMBIO DE TELA A TOLDO"],
      comentarioEnvio: "FECHA SOLICITADA 07/09",
    },
  );
  expect(d.documentos).toHaveLength(1);
  expect(d.comentariosLinea).toEqual(["CAMBIO DE TELA A TOLDO"]);
  expect(d.comentarioEnvio).toBe("FECHA SOLICITADA 07/09");
});

test("claseDeDocumento deduce la clase de la carpeta del share", () => {
  const clase = (r: string) => claseDeDocumento(`file://\\\\192.168.0.128\\RPS\\${r}`);
  expect(clase("VENTAS\\PLANTEAMIENTOS\\2026\\AR.26.03453_v1.pdf")).toBe("Planteamiento");
  expect(clase("VENTAS\\PRESUPUESTOS\\2026\\DIGITALIZADOS\\x.pdf")).toBe("Presupuesto escaneado");
  expect(clase("VENTAS\\PRESUPUESTOS\\2026\\PT2600110\\x.pdf")).toBe("Presupuesto");
  expect(clase("VENTAS\\PEDIDOS\\2026\\AR.26.03453.pdf")).toBe("Pedido escaneado");
  expect(clase("VENTAS\\FOTOS TRABAJOS\\2026\\AR.26.001.jpg")).toBe("Foto del trabajo");
  // La carpeta se llama "OF\OF": la anida dos veces y hay que casarlas las dos.
  expect(clase("OF\\OF\\0230370_29-07-2026.pdf")).toBe("Adjunto de la OF");
  // Lo que no encaja en ninguna carpeta conocida no se pierde, se rotula genérico.
  expect(claseDeDocumento("gdoc://a54cf5fe-be85-49c0-b5e6-4e01e7040947")).toBe("Documento");
});

test("archivoDeRuta se queda con el nombre del fichero", () => {
  expect(archivoDeRuta("file://\\\\192.168.0.128\\RPS\\OF\\OF\\0230370_29-07-2026.pdf")).toBe(
    "0230370_29-07-2026.pdf",
  );
});

test("segmentosEnShare trocea lo que cuelga del share de RPS", () => {
  expect(segmentosEnShare("file://\\\\192.168.0.128\\RPS\\OF\\OF\\0230370.pdf")).toEqual([
    "OF", "OF", "0230370.pdf",
  ]);
  expect(segmentosEnShare("file://\\\\192.168.0.128\\RPS\\VENTAS\\PEDIDOS\\2026\\AR.26.03453.pdf")).toEqual([
    "VENTAS", "PEDIDOS", "2026", "AR.26.03453.pdf",
  ]);
  // Sin distinguir mayúsculas: RPS mezcla "OF\pl..." con "VENTAS\...".
  expect(segmentosEnShare("FILE://\\\\192.168.0.128\\rps\\of\\of\\x.pdf")).toEqual([
    "of", "of", "x.pdf",
  ]);
});

test("segmentosEnShare rechaza todo lo que no sea el share de RPS", () => {
  // Casos REALES de la tabla: el gestor documental de RPS, otros servidores y
  // —lo que de verdad importa— rutas locales, que resolverían contra el disco
  // del servidor web. Son 153 339 de los 607 190 enlaces de la BD.
  expect(segmentosEnShare("gdoc://a54cf5fe-be85-49c0-b5e6-4e01e7040947")).toBeNull();
  expect(segmentosEnShare("file://C:\\Users\\BELEN.ALAMANCOS\\Desktop\\x.pdf")).toBeNull();
  expect(segmentosEnShare("file://\\\\192.168.0.114\\Documentacion\\x.pdf")).toBeNull();
  expect(segmentosEnShare("file://\\\\Megabeast\\dusuarios\\x.pdf")).toBeNull();
  expect(segmentosEnShare("file://")).toBeNull();
  expect(segmentosEnShare("")).toBeNull();
  // Otro share del mismo host tampoco: la raíz es \\192.168.0.128\RPS, no el host.
  expect(segmentosEnShare("file://\\\\192.168.0.128\\OTRO\\x.pdf")).toBeNull();
});

test("segmentosEnShare no deja salir de la raíz", () => {
  expect(segmentosEnShare("file://\\\\192.168.0.128\\RPS\\..\\..\\Windows\\win.ini")).toBeNull();
  expect(segmentosEnShare("file://\\\\192.168.0.128\\RPS\\OF\\..\\..\\secreto.pdf")).toBeNull();
  expect(segmentosEnShare("file://\\\\192.168.0.128\\RPS\\.\\x.pdf")).toBeNull();
  expect(segmentosEnShare("file://\\\\192.168.0.128\\RPS\\C:\\x.pdf")).toBeNull();
  // Solo la raíz, sin fichero debajo: no hay nada que servir.
  expect(segmentosEnShare("file://\\\\192.168.0.128\\RPS\\")).toBeNull();
});

// ── Material de la OF: lo apartado y lo apuntado ──
// Los materiales y las cantidades de estos tests están copiados TAL CUAL de RPS
// (consultada el 08/2026): son los casos reales que hay que saber distinguir.

test("sin reserva viva se enseña lo apuntado en la OF", () => {
  expect(
    aMaterialOF({
      material: "LONA PLASTEL 8800 TE62 620 2L MATE :NEGRO :204 AN",
      cantidad: 49,
      reservado: null,
    }),
  ).toEqual({
    texto: "LONA PLASTEL 8800 TE62 620 2L MATE :NEGRO :204 AN · 49",
    apartado: false,
  });
});

test("con reserva viva manda la reserva y la línea queda marcada", () => {
  expect(
    aMaterialOF({ material: "MACARRON PVC :NEGRO :6MM", cantidad: 289, reservado: 289 }),
  ).toEqual({ texto: "MACARRON PVC :NEGRO :6MM · 289", apartado: true });
});

test("si se apartó menos de lo que hacía falta se enseñan las dos cantidades", () => {
  // OF 0230710: se apuntó lona para 6 y solo queda 1 apartado.
  expect(
    aMaterialOF({
      material: "LONA PLASTEL 8800 TE62 620 2L MATE :NEGRO :204 AN",
      cantidad: 6,
      reservado: 1,
    }).texto,
  ).toBe("LONA PLASTEL 8800 TE62 620 2L MATE :NEGRO :204 AN · 1 de 6");
  // Y al revés, que también pasa (OF 0230746: 4 apartados para 3,25 apuntados).
  expect(
    aMaterialOF({ material: "LONA ACRILICA MASACRIL 300", cantidad: 3.25, reservado: 4 }).texto,
  ).toBe("LONA ACRILICA MASACRIL 300 · 4 de 3.25");
});

test("el redondeo de RPS al reservar no cuenta como cantidad distinta", () => {
  // OF 0231176: material 6,725484 → reserva 6,72. Es la misma cantidad.
  expect(
    aMaterialOF({
      material: "LONA ACRILICA MASACRIL 300 :GRANATE 2101 :120 AN",
      cantidad: 6.725484,
      reservado: 6.72,
    }).texto,
  ).toBe("LONA ACRILICA MASACRIL 300 :GRANATE 2101 :120 AN · 6.72");
});

test("una reserva de cero es una reserva, no la ausencia de una", () => {
  // null y 0 no son lo mismo: con 0 la línea sigue estando apartada.
  expect(aMaterialOF({ material: "VELCRO", cantidad: 5, reservado: 0 })).toEqual({
    texto: "VELCRO · 0 de 5",
    apartado: true,
  });
});

test("el material sin nombre no se pierde y los espacios de más se comen", () => {
  // La OF 0230370 lleva un material con cantidad 2,6 y descripción vacía.
  expect(aMaterialOF({ material: "   ", cantidad: 2.6, reservado: null }).texto).toBe(
    "(material sin nombre) · 2.6",
  );
  expect(aMaterialOF({ material: null, cantidad: null, reservado: null }).texto).toBe(
    "(material sin nombre)",
  );
  expect(
    aMaterialOF({ material: " KIT REMACHE   POLIAMIDA  NEGRO ", cantidad: 20, reservado: 20 })
      .texto,
  ).toBe("KIT REMACHE POLIAMIDA NEGRO · 20");
});

test("repartirMateriales separa lo apartado de lo apuntado sin perder nada", () => {
  // OF 0230713 real: 5 materiales, 3 con reserva viva y 2 sin ella.
  const materiales = [
    { material: "KIT REMACHE POLIAMIDA NEGRO", cantidad: 160, reservado: 160 },
    { material: "LONA MUELLE CARGA 780-3800 (G.3MM) :NEGRO :160 AN", cantidad: 25, reservado: 25 },
    { material: "LONA PLASTEL 8800 TE62 620 2L MATE :NEGRO :204 AN", cantidad: 71, reservado: 71 },
    { material: "MACARRON PVC :NEGRO :6MM", cantidad: 281, reservado: null },
    { material: "SOLAPA PLASTEL DE 200MM X 170MM (430125)", cantidad: 80, reservado: null },
  ].map(aMaterialOF);

  const { apartados, apuntados } = repartirMateriales(materiales);
  expect(apartados).toHaveLength(3);
  expect(apuntados).toHaveLength(2);
  expect(apartados.length + apuntados.length).toBe(materiales.length);
  expect(apartados.every((m) => m.apartado)).toBe(true);
  expect(apuntados.some((m) => m.apartado)).toBe(false);
  // El apuntado NO se esconde por que la OF tenga alguna reserva: es lo que
  // pasaría si la preferencia fuera por OF en vez de por línea, y son 2 de 5.
  expect(apuntados.map((m) => m.texto)).toEqual([
    "MACARRON PVC :NEGRO :6MM · 281",
    "SOLAPA PLASTEL DE 200MM X 170MM (430125) · 80",
  ]);
});

test("repartirMateriales aguanta la OF sin material", () => {
  expect(repartirMateriales(undefined)).toEqual({ apartados: [], apuntados: [] });
  expect(repartirMateriales([])).toEqual({ apartados: [], apuntados: [] });
});

test("comoServir incrusta PDF e imágenes y baja el resto", () => {
  expect(comoServir("AR.26.03453.pdf")).toEqual({ tipo: "application/pdf", incrustable: true });
  expect(comoServir("foto.JPG")).toEqual({ tipo: "image/jpeg", incrustable: true });
  expect(comoServir("croquis.png")).toEqual({ tipo: "image/png", incrustable: true });
  // Un .html propio serviría HTML ajeno desde nuestro origen: fuera de la tabla
  // y, por tanto, descarga opaca.
  expect(comoServir("correo.html")).toEqual({ tipo: "application/octet-stream", incrustable: false });
  expect(comoServir("correo.msg")).toEqual({ tipo: "application/octet-stream", incrustable: false });
  expect(comoServir("sinextension")).toEqual({ tipo: "application/octet-stream", incrustable: false });
});
