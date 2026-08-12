import { describe, expect, it } from "vitest";
import { pedidoListoParaPasar } from "../fases-tablero";
import type { EstadoOF, OF, Pedido } from "../types";
import { estaAtrasado, estaFinalizado } from "../types";

const of = (estado: EstadoOF, id: string = estado): OF => ({
  id,
  codigo: id,
  descripcion: "LONA",
  familia: "LONA",
  piezas: 1,
  autorId: null,
  revisorId: null,
  estado,
  fichandoRol: null,
  tiempoEstimadoMin: 0,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
});

/** Planificación vencida: así `estaAtrasado` solo depende de si está finalizado. */
const PLANIFICACION = "2026-07-01";
const HOY = "2026-08-08";

const pedido = (ofs: OF[]): Pedido => ({
  id: "AR.26.03873",
  codigo: "AR.26.03873",
  cliente: "C",
  situacion: "procesado",
  fechaSolicitud: PLANIFICACION,
  fechaPlanificacion: PLANIFICACION,
  fechaEntrega: PLANIFICACION,
  prioridad: 2,
  ofs,
  accent: "ninguno",
  lineas: 0,
  croquis: false,
});

describe("estaFinalizado", () => {
  it("todas aprobadas → finalizado", () => {
    expect(estaFinalizado(pedido([of("aprobada", "a"), of("aprobada", "b")]))).toBe(true);
  });

  it("con alguna sin aprobar no está finalizado", () => {
    expect(estaFinalizado(pedido([of("aprobada", "a"), of("pendiente", "b")]))).toBe(false);
    expect(estaFinalizado(pedido([of("aprobada", "a"), of("en_curso", "b")]))).toBe(false);
    expect(estaFinalizado(pedido([of("aprobada", "a"), of("por_revisar", "b")]))).toBe(false);
    expect(estaFinalizado(pedido([of("aprobada", "a"), of("devuelta", "b")]))).toBe(false);
  });

  it("una anulada y el resto aprobadas → finalizado", () => {
    // El bug: anular es "esto no lo hace OT", y una anulada nunca llega a
    // aprobada, así que exigir "todas aprobadas" dejaba el pedido sin finalizar
    // para siempre por trabajo que ya estaba hecho.
    expect(estaFinalizado(pedido([of("aprobada", "a"), of("anulada", "b")]))).toBe(true);
  });

  it("la anulada no tapa el trabajo que sí queda", () => {
    expect(estaFinalizado(pedido([of("anulada", "a"), of("pendiente", "b")]))).toBe(false);
  });

  it("el tiempo fichado antes de anularse no la devuelve al trabajo pendiente", () => {
    // Se empezó a plantear y luego se decidió anularla: el tiempo se conserva,
    // pero la OF sigue sin ser trabajo de OT.
    const anuladaConTiempo = { ...of("anulada", "b"), tiempoPlanteoMin: 30 };
    expect(estaFinalizado(pedido([of("aprobada", "a"), anuladaConTiempo]))).toBe(true);
  });

  it("todas anuladas → finalizado: a OT no le queda nada que hacer", () => {
    expect(estaFinalizado(pedido([of("anulada", "a"), of("anulada", "b")]))).toBe(true);
  });

  it("todas anuladas: finalizado y además se puede pasar, que es como se suelta", () => {
    // Las dos preguntas ("¿queda trabajo?" y "¿se puede mandar?") contestan lo
    // mismo cuando en OT no queda nada. Tenerlo por finalizado pero con el
    // botón apagado dejaba el pedido dando vueltas sin salida.
    const p = pedido([of("anulada", "a"), of("anulada", "b")]);
    expect(estaFinalizado(p)).toBe(true);
    expect(pedidoListoParaPasar(p)).toBe(true);
  });

  it("un pedido sin OFs no está finalizado: aún no ha llegado", () => {
    expect(estaFinalizado(pedido([]))).toBe(false);
  });
});

describe("estaAtrasado", () => {
  it("planificación vencida y trabajo pendiente → atrasado", () => {
    expect(estaAtrasado(pedido([of("aprobada", "a"), of("pendiente", "b")]), HOY)).toBe(true);
  });

  it("una anulada y el resto aprobadas ya no sale en rojo de por vida", () => {
    // Era el síntoma visible del bug: rojo y el primero en toda la app para
    // siempre, en cuanto pasaba la fecha de planificación.
    expect(estaAtrasado(pedido([of("aprobada", "a"), of("anulada", "b")]), HOY)).toBe(false);
  });

  it("todas anuladas tampoco está atrasado", () => {
    expect(estaAtrasado(pedido([of("anulada", "a"), of("anulada", "b")]), HOY)).toBe(false);
  });

  it("finalizado del todo no está atrasado aunque venciera la fecha", () => {
    expect(estaAtrasado(pedido([of("aprobada", "a")]), HOY)).toBe(false);
  });

  it("antes de la fecha de planificación no hay atraso aunque quede trabajo", () => {
    const p = { ...pedido([of("pendiente", "a")]), fechaPlanificacion: "2026-09-01" };
    expect(estaAtrasado(p, HOY)).toBe(false);
  });
});
