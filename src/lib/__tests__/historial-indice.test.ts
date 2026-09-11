import { describe, expect, it } from "vitest";
import { filtrarIndice, normalizaBusqueda, type BaseHistorial, type IndiceHistorial, type InfoPedidoHistorial } from "../historial-indice";
import { PAGE_SIZE } from "../historial";

// El Historial en memoria tiene que dar lo MISMO que la consulta SQL de
// siempre: qué pedido está cerrado, qué fecha ordena y cómo busca. Si no, ir
// más rápido sería enseñar otra lista.

const dia = (d: number, h = 10) => new Date(2026, 8, d, h).getTime();

const base = (pedido: string, extra: Partial<BaseHistorial> = {}): BaseHistorial => ({
  pedido,
  fechaPedido: dia(1),
  nOf: 1,
  tieneSeccion: true,
  pendienteSeccion: false,
  pendienteTotal: false,
  finalizada: dia(10),
  ...extra,
});

const info = (extra: Partial<InfoPedidoHistorial> = {}): InfoPedidoHistorial => ({
  cliente: "MAHOU, S.A.",
  negocio: null,
  familias: ["TOLDO"],
  ordenes: "0230001",
  textos: [normalizaBusqueda("MAHOU, S.A."), normalizaBusqueda("TOLDO DE FACHADA MANUAL")].join("\n"),
  ...extra,
});

const indice = (filas: BaseHistorial[], infos: Record<string, Partial<InfoPedidoHistorial>> = {}, personas: Record<string, string[]> = {}): IndiceHistorial => ({
  at: 0,
  base: { ot: filas, diseno: [] },
  info: new Map(filas.map((b) => [b.pedido, info(infos[b.pedido])])),
  personas: new Map(Object.entries(personas).map(([p, e]) => [p, new Set(e)])),
});

const sinPasados = () => null;
const pedidos = (r: { filas: BaseHistorial[] }) => r.filas.map((b) => b.pedido);

describe("qué cuenta como cerrado", () => {
  it("con tareas de la sección pendientes no sale; pasado desde CoordinaOT, sí", () => {
    const i = indice([base("A", { pendienteSeccion: true }), base("B")]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot" }, sinPasados))).toEqual(["B"]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot" }, (p) => (p === "A" ? dia(11) : null)))).toEqual(["A", "B"]);
  });

  it("sin tareas de la sección, hace falta que todo lo demás esté terminado", () => {
    const i = indice([base("A", { tieneSeccion: false, pendienteTotal: true }), base("B", { tieneSeccion: false })]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot" }, sinPasados))).toEqual(["B"]);
  });

  it("lo que sigue vivo en el tablero no sale, aunque RPS lo dé por cerrado", () => {
    const i = indice([base("A"), base("B")]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot", pendientes: ["A"] }, sinPasados))).toEqual(["B"]);
  });
});

describe("orden y fechas", () => {
  it("ordena por cuándo se pasó en CoordinaOT o, si no, por el cierre de RPS", () => {
    const i = indice([base("A", { finalizada: dia(5) }), base("B", { finalizada: dia(8) }), base("C", { finalizada: dia(2) })]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot" }, (p) => (p === "C" ? dia(9) : null)))).toEqual(["C", "B", "A"]);
  });

  it("las fechas filtran por esa misma fecha, con 'hasta' exclusivo", () => {
    const i = indice([base("A", { finalizada: dia(4, 23) }), base("B", { finalizada: dia(5, 1) }), base("C", { finalizada: dia(6, 0) })]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot", desde: "2026-09-05", hasta: "2026-09-06" }, sinPasados))).toEqual(["B"]);
  });

  it("al buscar, manda la fecha del pedido", () => {
    const i = indice([base("AR.26.00001", { fechaPedido: dia(1), finalizada: dia(9) }), base("AR.26.00002", { fechaPedido: dia(3), finalizada: dia(2) })]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot", q: "mahou" }, sinPasados))).toEqual(["AR.26.00002", "AR.26.00001"]);
  });

  it("pagina de PAGE_SIZE en PAGE_SIZE, con una fila de más para saber si hay otra", () => {
    const filas = Array.from({ length: PAGE_SIZE + 5 }, (_, n) => base(`P${String(n).padStart(3, "0")}`, { finalizada: dia(10) - n }));
    const i = indice(filas);
    expect(filtrarIndice(i, { page: 0, seccion: "ot" }, sinPasados).filas).toHaveLength(PAGE_SIZE + 1);
    expect(filtrarIndice(i, { page: 1, seccion: "ot" }, sinPasados).filas).toHaveLength(5);
  });
});

describe("filtros", () => {
  it("solo con trabajo de la sección", () => {
    const i = indice([base("A", { tieneSeccion: false }), base("B")]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot", soloSeccion: true }, sinPasados))).toEqual(["B"]);
  });

  it("por persona, con el código de RPS; alguien de fuera no trae nada", () => {
    const i = indice([base("A"), base("B")], {}, { A: ["195"], B: ["187"] });
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot", operario: "ivan", empleado: "195" }, sinPasados))).toEqual(["A"]);
    expect(pedidos(filtrarIndice(i, { page: 0, seccion: "ot", operario: "nadie" }, sinPasados))).toEqual([]);
  });

  it("por familia del panel, y las opciones son las presentes con los demás filtros", () => {
    const i = indice([base("A"), base("B"), base("C")], { A: { familias: ["REMOLQUE"] }, B: { familias: ["REMOLQUE", "LONA"] }, C: { familias: ["TOLDO"] } }, { A: ["195"], B: ["195"] });
    const r = filtrarIndice(i, { page: 0, seccion: "ot", familia: "REMOLQUE", operario: "ivan", empleado: "195" }, sinPasados);
    expect(pedidos(r).sort()).toEqual(["A", "B"]);
    expect(r.familias).toEqual(["REMOLQUE", "LONA"]);
  });
});

describe("búsqueda, igual que la consulta", () => {
  const i = indice(
    [base("AR.26.04488"), base("AR.26.04489"), base("AR.26.04490")],
    {
      "AR.26.04488": { cliente: "ALUMAN SISTEMAS S.L.U.", textos: [normalizaBusqueda("ALUMAN SISTEMAS S.L.U."), normalizaBusqueda("TOLDO MODELO ANTICA NUEVO")].join("\n"), ordenes: "0232070" },
      "AR.26.04489": { cliente: "TOLDOS RÍOS", textos: [normalizaBusqueda("TOLDOS RÍOS"), normalizaBusqueda("CAMBIO DE TELA FACHADA")].join("\n"), ordenes: "0232086" },
      "AR.26.04490": { cliente: "PAMILAKAN SAS", textos: [normalizaBusqueda("PAMILAKAN SAS"), normalizaBusqueda("Lona de remolque")].join("\n"), ordenes: "0232100" },
    },
  );
  const busca = (q: string) => pedidos(filtrarIndice(i, { page: 0, seccion: "ot", q }, sinPasados)).sort();

  it("por código de pedido, con o sin puntos, y por OF", () => {
    expect(busca("AR.26.04488")).toEqual(["AR.26.04488"]);
    expect(busca("2604489")).toEqual(["AR.26.04489"]);
    expect(busca("0232100")).toEqual(["AR.26.04490"]);
  });

  it("sin acentos ni mayúsculas, por cliente o descripción", () => {
    expect(busca("rios")).toEqual(["AR.26.04489"]);
    expect(busca("REMOLQUE")).toEqual(["AR.26.04490"]);
  });

  it("todas las palabras en el mismo campo, no repartidas entre cliente y OF", () => {
    expect(busca("toldo antica")).toEqual(["AR.26.04488"]);
    expect(busca("rios fachada")).toEqual([]);
  });
});
