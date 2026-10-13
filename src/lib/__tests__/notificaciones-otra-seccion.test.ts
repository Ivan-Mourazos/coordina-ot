import { describe, expect, it } from "vitest";
import {
  agruparAvisos,
  aplicarDescartes,
  avisosDeOtraSeccion,
  identidadAviso,
  seccionesVecinas,
} from "../notificaciones";
import type { AvisoMovimiento } from "../avisos";
import type { OF, Pedido } from "../types";

// Manuel entra en Impresión pero Carrón y Smith le pasan trabajo en Diseño. Su
// campana solo miraba la lista que tenía delante, así que lo de Diseño no le
// sonaba hasta que cambiaba de lista. Ahora le suena, marcado como de Diseño.

const of = (id: string, extra: Partial<OF> = {}): OF => ({
  id,
  codigo: `OF-${id}`,
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

const pedido = (id: string, ofs: OF[]): Pedido => ({
  id,
  codigo: `AR.26.0000${id}`,
  cliente: "MAHOU",
  situacion: "procesado",
  fechaSolicitud: "2026-09-01",
  fechaPlanificacion: "2026-08-20",
  fechaEntrega: "2026-09-01",
  prioridad: 2,
  ofs,
  accent: "ninguno",
  lineas: 0,
  croquis: false,
});

const mov = (ofId: string, tipo: AvisoMovimiento["tipo"], quien = "carron"): AvisoMovimiento => ({
  clave: `1:${tipo}:${ofId}`,
  logId: 1,
  ts: "2026-10-13T09:00:00.000Z",
  tipo,
  ofId,
  quien,
  otro: null,
});

const nombre = (id: string | null) => (id === "carron" ? "Carrón" : undefined);

describe("qué otras secciones mira la campana", () => {
  it("quien está en una sola no mira ninguna: ni un fetch más", () => {
    expect(seccionesVecinas({ seccion: "ot" }, "ot")).toEqual([]);
    expect(seccionesVecinas({ seccion: "diseno", tambienEn: [] }, "diseno")).toEqual([]);
    expect(seccionesVecinas(undefined, "ot")).toEqual([]);
  });

  it("Manuel en Impresión mira Diseño; en Diseño, Impresión", () => {
    const manuel = { seccion: "impresion" as const, tambienEn: ["diseno" as const] };
    expect(seccionesVecinas(manuel, "impresion")).toEqual(["diseno"]);
    expect(seccionesVecinas(manuel, "diseno")).toEqual(["impresion"]);
  });
});

describe("avisosDeOtraSeccion", () => {
  it("te piden revisar y te han pasado una OF suenan, marcados con su sección", () => {
    const p = pedido("1", [
      of("a", { revisorId: "manuel", estado: "por_revisar" }),
      of("b", { autorId: "manuel" }),
    ]);
    const r = avisosDeOtraSeccion([p], "diseno", "manuel", [mov("b", "recibida")], nombre);
    expect(r.map((a) => [a.tipo, a.of?.id, a.seccion])).toEqual([
      ["revisar", "a", "diseno"],
      ["recibida", "b", "diseno"],
    ]);
    expect(r[1].quien).toBe("Carrón");
  });

  it("lo que no es suyo, o ya está revisando, no suena", () => {
    const p = pedido("1", [
      of("a", { revisorId: "smith", estado: "por_revisar" }),
      of("b", { revisorId: "manuel", estado: "en_revision" }),
    ]);
    expect(avisosDeOtraSeccion([p], "diseno", "manuel", [], nombre)).toEqual([]);
  });

  it("un movimiento de una OF que no está en esa lista no se inventa", () => {
    const p = pedido("1", [of("a")]);
    expect(avisosDeOtraSeccion([p], "diseno", "manuel", [mov("zz", "recibida")], nombre)).toEqual([]);
  });

  it("un pedido ya pasado a Producción (completado) no suena aunque la OF siga por revisar", () => {
    const vivo = pedido("1", [of("a", { revisorId: "manuel", estado: "por_revisar" })]);
    const hecho = {
      ...pedido("2", [of("b", { revisorId: "manuel", estado: "por_revisar" }), of("c", { autorId: "manuel" })]),
      situacion: "completado" as const,
    };
    const r = avisosDeOtraSeccion([vivo, hecho], "diseno", "manuel", [mov("c", "recibida")], nombre);
    expect(r.map((a) => a.pedido.id)).toEqual(["1"]);
  });

  it("devuelta también es suya", () => {
    const p = pedido("1", [of("a", { autorId: "manuel", estado: "devuelta" })]);
    expect(avisosDeOtraSeccion([p], "diseno", "manuel", [], nombre).map((a) => a.tipo)).toEqual([
      "devuelta",
    ]);
  });
});

describe("un aviso de otra sección en la campana", () => {
  it("se agrupa aparte y conserva su sección", () => {
    const p = pedido("1", [of("a", { revisorId: "manuel", estado: "por_revisar" })]);
    const [item] = agruparAvisos(avisosDeOtraSeccion([p], "diseno", "manuel", [], nombre));
    expect(item.seccion).toBe("diseno");
  });

  it("su descarte es de SU sección: mirar Impresión no lo poda", () => {
    const p = pedido("1", [of("a", { revisorId: "manuel", estado: "por_revisar" })]);
    const items = agruparAvisos(avisosDeOtraSeccion([p], "diseno", "manuel", [], nombre));
    const clave = identidadAviso(items[0], "impresion");
    expect(clave.startsWith("diseno:")).toBe(true);
    const r = aplicarDescartes(items, [clave], "impresion");
    expect(r.visibles).toEqual([]);
    expect(r.vigentes).toEqual([clave]);
    // Y al ir a Diseño, el mismo aviso (ya sin marca, es de la lista que se
    // mira) sigue apagado.
    const enDiseno = agruparAvisos([{ tipo: "revisar", pedido: p, of: p.ofs[0] }]);
    expect(aplicarDescartes(enDiseno, [clave], "diseno").visibles).toEqual([]);
  });
});
