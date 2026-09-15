import { expect, test } from "vitest";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import {
  filtrarConsulta,
  normalizarFiltrosConsulta,
  PAGE_CONSULTA,
  situacionDe,
  textoFecha,
  type FiltrosConsulta,
} from "../consulta";

// ─── Qué pedidos ve quien no tiene sesión ────────────────────────────────────
// Una sola lista: se entra buscando, y sin buscar salen las próximas entregas.
// Lo que decide si un pedido está pendiente es la ENTREGA, no las tareas.

const HOY = "2026-09-15";
const dia = (iso: string) =>
  Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

const base = (pedido: string, p: Partial<BaseHistorial> = {}): BaseHistorial => ({
  pedido,
  fechaPedido: dia("2026-09-01"),
  nOf: 1,
  tieneSeccion: false,
  pendienteSeccion: false,
  pendienteTotal: false,
  fechaEntrega: dia("2026-09-20"),
  pendienteEntrega: true,
  trabajoAbierto: true,
  fechaEntregado: null,
  finalizada: null,
  ...p,
});

const indice = (ot: BaseHistorial[], diseno: BaseHistorial[] = ot): IndiceHistorial => ({
  at: Date.now(),
  base: { ot, diseno },
  info: new Map(ot.map((b) => [b.pedido, {
    cliente: "MAHOU, S.A.", negocio: null, ciudadEntrega: "ARZUA",
    familias: b.pedido.endsWith("R") ? ["REMOLQUE"] : ["TOLDO"],
    ordenes: "0230001", textos: "MAHOU, S.A.\nTOLDO DE FACHADA",
  }])),
  personas: new Map(),
});

const f = (p: Partial<FiltrosConsulta> = {}): FiltrosConsulta => ({ estado: "proximas", page: 0, ...p });
const codigos = (i: IndiceHistorial, p: Partial<FiltrosConsulta>) =>
  filtrarConsulta(i, f(p), HOY).filas.map((b) => b.pedido);

test("entregado manda sobre las tareas; sin entregar, el trabajo decide fábrica o esperando salir", () => {
  expect(situacionDe(base("A", { pendienteEntrega: false, trabajoAbierto: true }))).toBe("entregado");
  expect(situacionDe(base("B", { trabajoAbierto: true }))).toBe("fabrica");
  expect(situacionDe(base("C", { trabajoAbierto: false }))).toBe("salir");
});

test("próximas entregas: de hoy a hoy+14 incluidos, sin entregados ni sin fecha, lo antes primero", () => {
  const i = indice([
    base("MANANA", { fechaEntrega: dia("2026-09-16") }),
    base("HOY", { fechaEntrega: dia("2026-09-15") }),
    base("LIMITE", { fechaEntrega: dia("2026-09-29"), trabajoAbierto: false }),
    base("PASADO", { fechaEntrega: dia("2026-09-30") }),
    base("AYER", { fechaEntrega: dia("2026-09-14") }),
    base("SINFECHA", { fechaEntrega: null }),
    base("YASALIO", { fechaEntrega: dia("2026-09-16"), pendienteEntrega: false }),
  ]);
  expect(codigos(i, {})).toEqual(["HOY", "MANANA", "LIMITE"]);
});

test("fuera de plazo: sin entregar y con la entrega antes de hoy", () => {
  const i = indice([
    base("AYER", { fechaEntrega: dia("2026-09-14") }),
    base("HOY", { fechaEntrega: dia("2026-09-15") }),
    base("VIEJO_ENTREGADO", { fechaEntrega: dia("2026-01-01"), pendienteEntrega: false }),
    base("SINFECHA", { fechaEntrega: null }),
  ]);
  expect(codigos(i, { estado: "fuera" })).toEqual(["AYER"]);
});

test("en fábrica y esperando salir incluyen los que no tienen fecha, al final", () => {
  const i = indice([
    base("SINFECHA", { fechaEntrega: null }),
    base("CONFECHA", { fechaEntrega: dia("2026-12-01") }),
    base("SALIR", { trabajoAbierto: false }),
  ]);
  expect(codigos(i, { estado: "fabrica" })).toEqual(["CONFECHA", "SINFECHA"]);
  expect(codigos(i, { estado: "salir" })).toEqual(["SALIR"]);
});

test("buscar sin elegir estado encuentra un pedido de 2019 ya entregado", () => {
  const i = indice([
    base("AR.19.05555", { fechaPedido: dia("2019-06-01"), fechaEntrega: dia("2019-07-01"), pendienteEntrega: false }),
    base("AR.26.00001"),
  ]);
  const r = filtrarConsulta(i, f({ q: "AR.19.05555" }), HOY);
  expect(r.filas.map((b) => b.pedido)).toEqual(["AR.19.05555"]);
  expect(r.estado).toBe("todos");
  expect(r.porDia).toBeNull();
});

test("con un estado elegido a mano, buscar respeta el estado", () => {
  const i = indice([
    base("AR.26.00001", { pendienteEntrega: false }),
    base("AR.26.00002"),
  ]);
  expect(codigos(i, { estado: "entregados", q: "MAHOU" })).toEqual(["AR.26.00001"]);
});

test("paso: Oficina Técnica, Diseño Gráfico y Taller por descarte, solo en fábrica", () => {
  const ot = [
    base("OT", { pendienteSeccion: true }),
    base("DIS"),
    base("TALLER"),
    base("SALIR_OT", { pendienteSeccion: true, trabajoAbierto: false }),
  ];
  const diseno = [
    base("OT"),
    base("DIS", { pendienteSeccion: true }),
    base("TALLER"),
    base("SALIR_OT"),
  ];
  const i = indice(ot, diseno);
  expect(codigos(i, { estado: "todos", paso: "ot" })).toEqual(["OT"]);
  expect(codigos(i, { estado: "todos", paso: "diseno" })).toEqual(["DIS"]);
  expect(codigos(i, { estado: "todos", paso: "taller" })).toEqual(["TALLER"]);
});

test("entregados: lo último que salió primero, sin albarán al final, y totales por día", () => {
  const i = indice([
    base("A", { pendienteEntrega: false, fechaEntregado: dia("2026-09-09") }),
    base("B", { pendienteEntrega: false, fechaEntregado: dia("2026-09-14") }),
    base("SINALBARAN", { pendienteEntrega: false, fechaEntregado: null }),
    base("C", { pendienteEntrega: false, fechaEntregado: dia("2026-09-14") }),
  ]);
  const r = filtrarConsulta(i, f({ estado: "entregados" }), HOY);
  expect(r.filas.map((b) => b.pedido)).toEqual(["C", "B", "A", "SINALBARAN"]);
  expect(r.porDia).toEqual({ "2026-09-14": 2, "2026-09-09": 1, "sin-fecha": 1 });
});

test("las familias salen de lo filtrado ANTES de elegir familia", () => {
  const i = indice([base("T1"), base("R1R")]);
  const r = filtrarConsulta(i, f({ estado: "todos", familia: "REMOLQUE" }), HOY);
  expect(r.filas.map((b) => b.pedido)).toEqual(["R1R"]);
  expect(r.familias.slice().sort()).toEqual(["REMOLQUE", "TOLDO"]);
});

test("desde y hasta, inclusive, sobre la fecha de la fila", () => {
  const i = indice([
    base("E9", { fechaEntrega: dia("2026-10-09") }),
    base("E10", { fechaEntrega: dia("2026-10-10") }),
    base("E11", { fechaEntrega: dia("2026-10-11") }),
    base("ENT10", { pendienteEntrega: false, fechaEntregado: dia("2026-10-10") }),
  ]);
  expect(codigos(i, { estado: "fabrica", desde: "2026-10-10", hasta: "2026-10-10" })).toEqual(["E10"]);
  expect(codigos(i, { estado: "entregados", desde: "2026-10-10", hasta: "2026-10-10" })).toEqual(["ENT10"]);
});

test("hasMore avisa de otra página sin devolver la fila de más", () => {
  const filas = Array.from({ length: PAGE_CONSULTA + 3 }, (_, n) => base(`P${String(n).padStart(3, "0")}`));
  const r = filtrarConsulta(indice(filas), f({ estado: "fabrica" }), HOY);
  expect(r.filas).toHaveLength(PAGE_CONSULTA);
  expect(r.hasMore).toBe(true);
  expect(filtrarConsulta(indice(filas), f({ estado: "fabrica", page: 1 }), HOY).filas).toHaveLength(3);
});

test("los filtros de la URL nunca revientan", () => {
  expect(normalizarFiltrosConsulta(new URLSearchParams("estado=raro&page=-2&desde=ayer&paso=nada")))
    .toEqual({ estado: "proximas", page: 0 });
  expect(normalizarFiltrosConsulta(new URLSearchParams("estado=fabrica&paso=ot&q=%20mahou%20&familia=TOLDO&desde=2026-01-01&hasta=2026-02-01&page=2")))
    .toEqual({ estado: "fabrica", paso: "ot", q: "mahou", familia: "TOLDO", desde: "2026-01-01", hasta: "2026-02-01", page: 2 });
  // El paso solo tiene sentido en lo que está en fábrica.
  expect(normalizarFiltrosConsulta(new URLSearchParams("estado=entregados&paso=ot")).paso).toBeUndefined();
});

test("la fecha de la fila: nunca la solicitada haciéndose pasar por la de salida", () => {
  expect(textoFecha({ situacion: "entregado", fechaEntrega: "2026-09-11", fechaEntregado: "2026-09-14" }))
    .toBe("Entregado el 14/09/26");
  expect(textoFecha({ situacion: "entregado", fechaEntrega: "2026-09-11", fechaEntregado: null })).toBe("Entregado");
  expect(textoFecha({ situacion: "fabrica", fechaEntrega: "2026-09-18", fechaEntregado: null })).toBe("Entrega 18/09/26");
  expect(textoFecha({ situacion: "salir", fechaEntrega: null, fechaEntregado: null })).toBe("Sin fecha de entrega");
});
