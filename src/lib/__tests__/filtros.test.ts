import { describe, expect, it } from "vitest";
import {
  FILTROS_INICIALES,
  aplicarFiltros,
  contarCategorias,
  contarCategoriasVisibles,
  filtrosAParams,
  hayFiltrosActivos,
  ofEnCategoria,
  paramsAFiltros,
  type Filtros,
} from "../filtros";
import type { OF, Pedido } from "../types";

const HOY = "2026-08-09";

const of = (extra: Partial<OF> = {}): OF => ({
  id: "of1",
  codigo: "OF-01",
  descripcion: "x",
  familia: "TOLDO",
  piezas: 1,
  autorId: null,
  revisorId: null,
  estado: "pendiente",
  fichandoRol: null,
  tiempoEstimadoMin: 0,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
  ...extra,
});

const pedido = (extra: Partial<Pedido> = {}): Pedido => ({
  id: "p1",
  codigo: "AR.26.00001",
  cliente: "MAHOU",
  situacion: "procesado",
  fechaSolicitud: "2026-09-01",
  fechaPlanificacion: "2026-08-20",
  fechaEntrega: "2026-09-01",
  prioridad: 2,
  ofs: [of()],
  accent: "ninguno",
  lineas: 0,
  croquis: false,
  ...extra,
});

const con = (f: Partial<Filtros>): Filtros => ({ ...FILTROS_INICIALES, ...f });

describe("ofEnCategoria", () => {
  it("normal es no ser de ninguna de las otras", () => {
    expect(ofEnCategoria(of(), false, "normal")).toBe(true);
    expect(ofEnCategoria(of({ detenida: true }), false, "normal")).toBe(false);
    expect(ofEnCategoria(of({ estado: "anulada" }), false, "normal")).toBe(false);
    expect(ofEnCategoria(of({ ajenaOT: true }), false, "normal")).toBe(false);
    expect(ofEnCategoria(of(), true, "normal")).toBe(false);
  });
  it("una OF de taller rescatada (con autor) deja de ser de taller", () => {
    expect(ofEnCategoria(of({ ajenaOT: true }), false, "taller")).toBe(true);
    expect(ofEnCategoria(of({ ajenaOT: true, autorId: "ivan" }), false, "taller")).toBe(false);
    expect(ofEnCategoria(of({ ajenaOT: true, autorId: "ivan" }), false, "normal")).toBe(true);
  });
  it("las categorías se solapan: una anulada puede estar además detenida", () => {
    const o = of({ estado: "anulada", detenida: true });
    expect(ofEnCategoria(o, false, "anuladas")).toBe(true);
    expect(ofEnCategoria(o, false, "detenidas")).toBe(true);
  });
});

describe("aplicarFiltros", () => {
  it("por defecto enseña el trabajo normal y esconde el resto", () => {
    const ps = [
      pedido({ id: "a", ofs: [of({ id: "a1" })] }),
      pedido({ id: "b", ofs: [of({ id: "b1", estado: "anulada" })] }),
      pedido({ id: "c", ofs: [of({ id: "c1", detenida: true })] }),
      pedido({ id: "d", interno: true, ofs: [of({ id: "d1" })] }),
    ];
    expect(aplicarFiltros(ps, FILTROS_INICIALES, HOY).map((p) => p.id)).toEqual(["a"]);
  });

  it("una categoría enseña SOLO esa", () => {
    const ps = [
      pedido({ id: "a", ofs: [of({ id: "a1" })] }),
      pedido({ id: "b", ofs: [of({ id: "b1", estado: "anulada" })] }),
    ];
    const r = aplicarFiltros(ps, con({ categoria: "anuladas" }), HOY);
    expect(r.map((p) => p.id)).toEqual(["b"]);
  });

  it("los filtros de OF ESTRECHAN el pedido en vez de aceptarlo entero", () => {
    const p = pedido({
      ofs: [of({ id: "t", familia: "TOLDO" }), of({ id: "l", familia: "LONA" })],
    });
    const r = aplicarFiltros([p], con({ familia: "TOLDO" }), HOY);
    expect(r).toHaveLength(1);
    expect(r[0].ofs.map((o) => o.id)).toEqual(["t"]);
  });

  it("el pedido desaparece si ninguna de sus OF pasa", () => {
    const p = pedido({ ofs: [of({ familia: "LONA" })] });
    expect(aplicarFiltros([p], con({ familia: "CARPA" }), HOY)).toEqual([]);
  });

  it("sin recorte devuelve el MISMO objeto, para no repintar de balde", () => {
    const p = pedido();
    expect(aplicarFiltros([p], FILTROS_INICIALES, HOY)[0]).toBe(p);
  });

  it("la búsqueda mira código, cliente y negocio", () => {
    const p = pedido({ negocio: "NOVA CAMELIAS" });
    expect(aplicarFiltros([p], con({ query: "camelias" }), HOY)).toHaveLength(1);
    expect(aplicarFiltros([p], con({ query: "AR.26.00001" }), HOY)).toHaveLength(1);
    expect(aplicarFiltros([p], con({ query: "estrella" }), HOY)).toEqual([]);
  });

  it("autor y revisor admiten 'sin asignar'", () => {
    const p = pedido({
      ofs: [of({ id: "libre" }), of({ id: "mia", autorId: "ivan", revisorId: "tamara" })],
    });
    expect(aplicarFiltros([p], con({ autor: "sin" }), HOY)[0].ofs.map((o) => o.id)).toEqual([
      "libre",
    ]);
    expect(aplicarFiltros([p], con({ autor: "ivan" }), HOY)[0].ofs.map((o) => o.id)).toEqual([
      "mia",
    ]);
    expect(aplicarFiltros([p], con({ revisor: "tamara" }), HOY)[0].ofs.map((o) => o.id)).toEqual([
      "mia",
    ]);
  });

  it("la ventana de fechas va sobre la planificación y 'hasta' es inclusivo", () => {
    const p = pedido({ fechaPlanificacion: "2026-08-20" });
    expect(aplicarFiltros([p], con({ desde: "2026-08-20" }), HOY)).toHaveLength(1);
    expect(aplicarFiltros([p], con({ hasta: "2026-08-20" }), HOY)).toHaveLength(1);
    expect(aplicarFiltros([p], con({ desde: "2026-08-21" }), HOY)).toEqual([]);
    expect(aplicarFiltros([p], con({ hasta: "2026-08-19" }), HOY)).toEqual([]);
  });

  it("solo atrasados: pasada la planificación y sin terminar", () => {
    const tarde = pedido({ id: "tarde", fechaPlanificacion: "2026-08-01" });
    const aTiempo = pedido({ id: "aTiempo", fechaPlanificacion: "2026-08-30" });
    const hecho = pedido({
      id: "hecho",
      fechaPlanificacion: "2026-08-01",
      ofs: [of({ estado: "aprobada" })],
    });
    const r = aplicarFiltros([tarde, aTiempo, hecho], con({ soloAtrasados: true }), HOY);
    expect(r.map((p) => p.id)).toEqual(["tarde"]);
  });

  it("esperando material mira las OF, no el pedido", () => {
    const p = pedido({
      ofs: [of({ id: "espera", materialPendienteHasta: "2026-08-25" }), of({ id: "lista" })],
    });
    const r = aplicarFiltros([p], con({ soloMaterialPendiente: true }), HOY);
    expect(r[0].ofs.map((o) => o.id)).toEqual(["espera"]);
  });

  it("los pasados a Producción se esconden salvo que se pidan", () => {
    const ps = [
      pedido({ id: "proc", situacion: "procesado" }),
      pedido({ id: "pasado", situacion: "completado" }),
    ];
    expect(aplicarFiltros(ps, FILTROS_INICIALES, HOY).map((p) => p.id)).toEqual(["proc"]);
    expect(aplicarFiltros(ps, con({ incluirPasados: true }), HOY)).toHaveLength(2);
  });
});

describe("contarCategorias", () => {
  it("cuenta OF, no pedidos, y una OF puede sumar en dos categorías", () => {
    const ps = [
      pedido({ ofs: [of({ id: "1" }), of({ id: "2", estado: "anulada", detenida: true })] }),
    ];
    const c = contarCategorias(ps);
    expect(c.normal).toBe(1);
    expect(c.anuladas).toBe(1);
    expect(c.detenidas).toBe(1);
    expect(c.taller).toBe(0);
  });
});

describe("contarCategoriasVisibles", () => {
  it("cuenta lo que saldría al elegir cada categoría, con el resto de la barra puesta", () => {
    const ps = [
      pedido({ id: "a", cliente: "MAHOU", ofs: [of({ id: "a1", estado: "anulada" })] }),
      pedido({ id: "b", cliente: "ESTRELLA", ofs: [of({ id: "b1", estado: "anulada" })] }),
    ];
    // Sin más filtros hay dos anuladas; buscando "mahou", solo una — y eso es
    // lo que tiene que decir el desplegable antes de pulsarlo.
    expect(contarCategoriasVisibles(ps, FILTROS_INICIALES, HOY).anuladas).toBe(2);
    expect(contarCategoriasVisibles(ps, con({ query: "mahou" }), HOY).anuladas).toBe(1);
  });

  it("elegir una categoría no pone a cero las demás", () => {
    const ps = [
      pedido({ ofs: [of({ id: "1" }), of({ id: "2", estado: "anulada" })] }),
    ];
    const c = contarCategoriasVisibles(ps, con({ categoria: "anuladas" }), HOY);
    expect(c.anuladas).toBe(1);
    expect(c.normal).toBe(1);
  });
});

describe("hayFiltrosActivos", () => {
  it("la barra en reposo no cuenta como filtrada", () => {
    expect(hayFiltrosActivos(FILTROS_INICIALES)).toBe(false);
    expect(hayFiltrosActivos(con({ query: "  " }))).toBe(false);
  });
  it("una categoría distinta de 'normal' sí cuenta", () => {
    expect(hayFiltrosActivos(con({ categoria: "anuladas" }))).toBe(true);
    expect(hayFiltrosActivos(con({ soloAtrasados: true }))).toBe(true);
  });
});

describe("ida y vuelta a la URL", () => {
  it("la barra en reposo no ensucia la URL", () => {
    expect(filtrosAParams(FILTROS_INICIALES).toString()).toBe("");
  });

  it("lo que se escribe se vuelve a leer igual", () => {
    const f = con({
      query: "mahou",
      familia: "LONA",
      estado: "por_revisar",
      prioridad: 3,
      autor: "ivan",
      revisor: "sin",
      desde: "2026-08-01",
      hasta: "2026-08-31",
      soloAtrasados: true,
      soloMaterialPendiente: true,
      categoria: "detenidas",
      incluirPasados: true,
    });
    expect(paramsAFiltros(filtrosAParams(f))).toEqual(f);
  });

  it("una URL a mano con valores imposibles no rompe: cae a los de por defecto", () => {
    const sp = new URLSearchParams("pri=9&ver=marcianos&cli=loquesea&desde=ayer");
    expect(paramsAFiltros(sp)).toEqual(FILTROS_INICIALES);
  });
});
