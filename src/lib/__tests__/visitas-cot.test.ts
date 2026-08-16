import { describe, expect, it, test } from "vitest";
import {
  agruparVisitasPorFecha,
  desglosarTexto,
  filaAVisitaCot,
  normalizarFiltrosVisitasCot,
  type FilaVisitaCot,
} from "../visitas-cot";

test("normaliza ámbito, página, búsqueda y fechas válidas", () => {
  const params = new URLSearchParams({
    ambito: "historial",
    page: "2",
    q: "  AR.26  ",
    desde: "2026-03-30",
    hasta: "2026-07-30",
  });
  expect(normalizarFiltrosVisitasCot(params)).toEqual({
    ambito: "historial",
    page: 2,
    q: "AR.26",
    desde: "2026-03-30",
    hasta: "2026-07-30",
  });
});

test("parámetros inválidos caen a pendientes y página cero", () => {
  const params = new URLSearchParams({
    ambito: "otra",
    page: "-4",
    desde: "2026-02-31",
    hasta: "ayer",
  });
  expect(normalizarFiltrosVisitasCot(params)).toEqual({
    ambito: "pendientes",
    page: 0,
    q: undefined,
    desde: undefined,
    hasta: undefined,
  });
});

test("mapea una fila RPS a campos separados y tipados", () => {
  const fila: FilaVisitaCot = {
    id: " OM-1 ",
    incidencia: " I129576 ",
    pedido: " AR.26.02490 ",
    fechaAviso: new Date("2026-06-22T09:30:00.000Z"),
    fechaVisita: new Date(2026, 6, 31),
    texto: " Visita con OT ",
    responsable: " Juan Castro ",
    idEstado: "001-0",
    estado: "Creado",
    solucion: null,
    notas: " ",
  };

  expect(filaAVisitaCot(fila)).toEqual({
    idOrden: "OM-1",
    incidencia: "I129576",
    pedido: "AR.26.02490",
    fechaAviso: "2026-06-22T09:30:00.000Z",
    fechaVisita: "2026-07-31",
    texto: "Visita con OT",
    // El texto no trae encabezado ni línea de OF, así que el motivo es él
    // entero y no hay cliente que sacar (ver desglosarTexto).
    motivo: "Visita con OT",
    cliente: null,
    responsable: "Juan Castro",
    estado: "pendiente",
    estadoRps: "Creado",
    solucion: null,
    notas: null,
  });
});

test("dos órdenes del mismo aviso se conservan como visitas independientes", () => {
  const base: FilaVisitaCot = {
    id: "OM-1",
    incidencia: "I1",
    pedido: null,
    fechaAviso: null,
    fechaVisita: new Date(2026, 7, 1),
    texto: "",
    responsable: null,
    idEstado: "001-9",
    estado: "Cerrado",
    solucion: "Medición realizada",
    notas: null,
  };
  const visitas = [
    filaAVisitaCot(base),
    filaAVisitaCot({ ...base, id: "OM-2" }),
  ];
  expect(visitas.map((visita) => visita.idOrden)).toEqual(["OM-1", "OM-2"]);
  expect(visitas.every((visita) => visita.estado === "cerrada")).toBe(true);
});

test("agrupa fechas contiguas manteniendo el orden de la consulta", () => {
  const base = filaAVisitaCot({
    id: "1",
    incidencia: "I1",
    pedido: null,
    fechaAviso: null,
    fechaVisita: new Date(2026, 7, 1),
    texto: "",
    responsable: "OT",
    idEstado: "001-0",
    estado: "Creado",
    solucion: null,
    notas: null,
  });
  const visitas = [
    base,
    { ...base, idOrden: "2" },
    { ...base, idOrden: "3", fechaVisita: "2026-08-02" },
  ];
  expect(agruparVisitasPorFecha(visitas)).toEqual([
    { fecha: "2026-08-01", visitas: visitas.slice(0, 2) },
    { fecha: "2026-08-02", visitas: visitas.slice(2) },
  ]);
});

// ─── El texto del aviso, desmontado ──────────────────────────────────────────
// Los ejemplos son literales de RPS (consulta del 14/08/2026): la forma del
// campo no es cosa nuestra y cambiarla no está en nuestra mano, así que lo que
// se prueba es que la sabemos leer.

describe("desglosarTexto", () => {
  it("quita el encabezado de fecha, comercial e incidencia", () => {
    const crudo =
      "10/08/2026 - CASTRO MOURIÑO, JUAN JOSE - I129976\r\n\r\nEL CORTE INGLES\r\nlonas cupulas";
    expect(desglosarTexto(crudo)).toEqual({
      motivo: "EL CORTE INGLES\nlonas cupulas",
      cliente: null,
    });
  });

  it("saca el cliente de la línea de OF y la quita del motivo", () => {
    const crudo =
      "11/08 VISITA PARA OSCAR CON JAIME \r\n\r\n" +
      "OF 0231158 - PEDIDO AR.26.03914 - PROMOTORA EDUCATIVA CORUÑESA, S. L.";
    // Sin más cuerpo, el encabezado ES lo único que dice el aviso.
    expect(desglosarTexto(crudo)).toEqual({
      motivo: "11/08 VISITA PARA OSCAR CON JAIME",
      cliente: "PROMOTORA EDUCATIVA CORUÑESA, S. L.",
    });
  });

  it("con encabezado, cuerpo y línea de OF se queda solo con el cuerpo", () => {
    const crudo =
      "14/08 SOLICITA ADRIÁN Q. VISITA CON JUAN CASTRO\r\n\r\n" +
      "Confirmar cotas en obra.\r\n" +
      "OF 0231034 - PEDIDO AR.26.03852 - COLLAZO CANCELA, JOSE LUIS";
    expect(desglosarTexto(crudo)).toEqual({
      motivo: "Confirmar cotas en obra.",
      cliente: "COLLAZO CANCELA, JOSE LUIS",
    });
  });

  it("una fecha a mitad del cuerpo es motivo, no encabezado", () => {
    const crudo = "19/06/2026 - DURO VILA, CARLOS JAVIER - I129179\r\n\r\n12/09 confirmar medidas";
    expect(desglosarTexto(crudo).motivo).toBe("12/09 confirmar medidas");
  });

  it("un texto normal se deja como está", () => {
    expect(desglosarTexto("Explicar detalles.")).toEqual({
      motivo: "Explicar detalles.",
      cliente: null,
    });
  });

  it("vacío no revienta", () => {
    expect(desglosarTexto("")).toEqual({ motivo: "", cliente: null });
  });
});

describe("filaAVisitaCot", () => {
  it("pone el nombre del comercial como se dice, no como lo guarda RPS", () => {
    const v = filaAVisitaCot({
      id: "1", incidencia: "I1", pedido: null, fechaAviso: null, fechaVisita: null,
      texto: "x", responsable: "CASTRO MOURIÑO, JUAN JOSE", idEstado: "001-0",
      estado: null, solucion: null, notas: null,
    });
    expect(v.responsable).toBe("Juan José Castro Mouriño");
  });

  it("sin responsable lo dice, no deja el hueco en blanco", () => {
    const v = filaAVisitaCot({
      id: "1", incidencia: "I1", pedido: null, fechaAviso: null, fechaVisita: null,
      texto: "x", responsable: null, idEstado: "001-0",
      estado: null, solucion: null, notas: null,
    });
    expect(v.responsable).toBe("Sin asignar");
  });
});
