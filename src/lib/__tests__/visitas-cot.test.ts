import { expect, test } from "vitest";
import {
  agruparVisitasPorFecha,
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
