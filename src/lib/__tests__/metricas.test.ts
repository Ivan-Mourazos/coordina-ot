import { describe, expect, it } from "vitest";
import {
  calcularMetricas,
  proporcionDevueltas,
  type MovimientoRegistrado,
} from "../metricas";

const mov = (
  at: string,
  motivo: string,
  ofId: string,
  observacion: string | null = null,
): MovimientoRegistrado => ({ at, motivo, ofId, observacion });

describe("cuántas vuelven", () => {
  it("cuenta cada devolución, aunque sea la misma OF otra vez", () => {
    // El motivo de contar desde el REGISTRO y no desde el estado de la OF:
    // `observacion` guarda solo la última, así que una OF que vuelve dos veces
    // se contaría una sola. Aquí son dos, que es lo que pasó.
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1] la cota"),
      mov("2026-08-05T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-05T11:00:00.000Z", "devolver", "of1", "[1] otra vez la cota"),
    ]);
    expect(m.devoluciones).toBe(2);
    // Y dos repasos: el segundo también podía haber acabado bien.
    expect(m.revisiones).toBe(2);
  });

  it("lo que no es revisar ni devolver no entra", () => {
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "aprobar", "of1"),
      mov("2026-08-03T10:00:00.000Z", "asignar", "of1"),
    ]);
    expect(m).toMatchObject({ revisiones: 0, devoluciones: 0, porCausa: [], porMes: [] });
  });
});

describe("por qué vuelven", () => {
  it("una devolución con tres causas cuenta en las tres", () => {
    // Es el caso real: el revisor repasa entera y apunta todo lo que ve. Por
    // eso las causas suman MÁS que las devoluciones, y así se lee.
    const m = calcularMetricas([
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1,2,4] cota, largo y color"),
    ]);
    expect(m.devoluciones).toBe(1);
    expect(m.porCausa).toEqual([
      { id: 1, n: 1 },
      { id: 2, n: 1 },
      { id: 4, n: 1 },
    ]);
  });

  it("ordena de más frecuente a menos", () => {
    const m = calcularMetricas([
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1,2] a"),
      mov("2026-08-04T11:00:00.000Z", "devolver", "of2", "[2] b"),
      mov("2026-08-05T11:00:00.000Z", "devolver", "of3", "[2] c"),
    ]);
    expect(m.porCausa).toEqual([
      { id: 2, n: 3 },
      { id: 1, n: 1 },
    ]);
  });

  it("las de antes de las causas se cuentan aparte, no se esconden", () => {
    // Esconderlas haría que los porcentajes no cuadraran con el total sin
    // decir por qué. Van con `id: null`, y a igualdad de cuenta las últimas:
    // ese cajón no dice nada y no puede encabezar la lista.
    const m = calcularMetricas([
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "Faltan las medidas"),
      mov("2026-08-04T11:00:00.000Z", "devolver", "of2", "[3] material"),
    ]);
    expect(m.porCausa).toEqual([
      { id: 3, n: 1 },
      { id: null, n: 1 },
    ]);
  });

  it("la misma causa repetida en una devolución cuenta una vez", () => {
    const m = calcularMetricas([mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[2,2] x")]);
    expect(m.porCausa).toEqual([{ id: 2, n: 1 }]);
  });
});

describe("si va a mejor", () => {
  it("agrupa por mes, del más antiguo al más reciente", () => {
    const m = calcularMetricas([
      mov("2026-09-02T10:00:00.000Z", "empezar_revision", "of3"),
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T11:00:00.000Z", "devolver", "of1", "[1] x"),
      mov("2026-08-10T10:00:00.000Z", "empezar_revision", "of2"),
    ]);
    expect(m.porMes).toEqual([
      { mes: "2026-08", revisiones: 2, devoluciones: 1 },
      { mes: "2026-09", revisiones: 1, devoluciones: 0 },
    ]);
  });

  it("una devolución cuenta en el mes de SU revisión, no en el que se devuelve", () => {
    // El caso real que sacó un 150 %: la revisión se empezó el 31 de agosto y
    // la devolución llegó el 1 de septiembre. Contando cada movimiento en su
    // propio mes, septiembre se quedaba con la devolución y agosto con la
    // revisión: numerador y denominador de meses distintos, y un porcentaje
    // que puede pasar del 100 % sin que nada esté mal.
    const m = calcularMetricas([
      mov("2026-08-31T16:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-09-01T08:00:00.000Z", "devolver", "of1", "[1] la cota"),
    ]);
    expect(m.porMes).toEqual([{ mes: "2026-08", revisiones: 1, devoluciones: 1 }]);
  });

  it("ningún mes puede pasar del 100 %", () => {
    // La garantía que da contar por cohorte: cada devolución tiene detrás una
    // revisión del mismo mes, así que el numerador nunca supera al denominador.
    const m = calcularMetricas([
      mov("2026-08-30T10:00:00.000Z", "empezar_revision", "ofA"),
      mov("2026-09-01T10:00:00.000Z", "devolver", "ofA", "[1] x"),
      mov("2026-08-30T11:00:00.000Z", "empezar_revision", "ofB"),
      mov("2026-09-01T11:00:00.000Z", "devolver", "ofB", "[1] x"),
      mov("2026-09-02T10:00:00.000Z", "empezar_revision", "ofC"),
    ]);
    for (const mes of m.porMes) {
      expect(mes.devoluciones).toBeLessThanOrEqual(mes.revisiones);
    }
  });

  it("una devolución sin revisión registrada trae su revisión con ella", () => {
    // Las de antes de que existiera `empezar_revision`, y las que empezó
    // alguien de la otra sección (el filtro es por operario, no por OF). Se
    // cuentan donde pasaron, y cuentan TAMBIÉN como revisión: si la OF volvió,
    // alguien la revisó. Sumando solo la devolución, el mes pasaba del 100 %.
    const m = calcularMetricas([mov("2026-09-01T08:00:00.000Z", "devolver", "of1", "[1] x")]);
    expect(m.porMes).toEqual([{ mes: "2026-09", revisiones: 1, devoluciones: 1 }]);
    expect(m.revisiones).toBe(1);
  });

  it("el 117 % de septiembre: seis revisiones y siete devoluciones", () => {
    // El caso tal cual salió en pantalla. Seis revisiones de septiembre que
    // acaban volviendo, más una devolución cuya revisión no está en el
    // registro: 7 sobre 6. Con la revisión implícita son 7 de 7.
    const movs = [];
    for (let i = 1; i <= 6; i++) {
      movs.push(mov(`2026-09-0${i}T09:00:00.000Z`, "empezar_revision", `of${i}`));
      movs.push(mov(`2026-09-0${i}T10:00:00.000Z`, "devolver", `of${i}`, "[1] x"));
    }
    movs.push(mov("2026-09-02T11:00:00.000Z", "devolver", "huerfana", "[1] x"));

    const septiembre = calcularMetricas(movs).porMes.find((m) => m.mes === "2026-09")!;
    expect(septiembre).toEqual({ mes: "2026-09", revisiones: 7, devoluciones: 7 });
    expect(septiembre.devoluciones).toBeLessThanOrEqual(septiembre.revisiones);
  });

  it("dar por corregida cierra la revisión, como aprobar", () => {
    // Solo se miraba "aprobar", así que una OF dada por corregida dejaba su
    // revisión abierta para siempre y la siguiente devolución —meses después—
    // se colgaba de ella, engordando un mes viejo.
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T12:00:00.000Z", "aprobar_corregida", "of1"),
      mov("2026-09-10T10:00:00.000Z", "devolver", "of1", "[1] otra cosa"),
    ]);
    expect(m.porMes).toEqual([
      { mes: "2026-08", revisiones: 1, devoluciones: 0 },
      // La de septiembre no se cuelga de la revisión de agosto: se cuenta en
      // septiembre, con su revisión implícita.
      { mes: "2026-09", revisiones: 1, devoluciones: 1 },
    ]);
  });

  it("dar por buena sin revisión también la cierra", () => {
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T12:00:00.000Z", "aprobar_sin_revision", "of1"),
      mov("2026-09-10T10:00:00.000Z", "devolver", "of1", "[1] x"),
    ]);
    expect(m.porMes.find((x) => x.mes === "2026-09")).toEqual({
      mes: "2026-09",
      revisiones: 1,
      devoluciones: 1,
    });
  });
});

describe("la proporción", () => {
  it("es devoluciones entre revisiones", () => {
    expect(proporcionDevueltas({ revisiones: 20, devoluciones: 4 })).toBe(0.2);
  });

  it("sin revisiones no hay proporción, y no es cero", () => {
    // Un 0 % diria que todo va bien; lo que pasa es que no se ha revisado nada.
    expect(proporcionDevueltas({ revisiones: 0, devoluciones: 0 })).toBeNull();
  });
});

describe("por qué se anulan", () => {
  it("cuenta las causas de anulación, que llevan guardadas desde agosto", () => {
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "anular", "of1", "taller"),
      mov("2026-08-04T10:00:00.000Z", "anular", "of2", "taller"),
      mov("2026-08-05T10:00:00.000Z", "anular", "of3", "otro: se cayó todo"),
    ]);
    expect(m.anulaciones).toBe(3);
    expect(m.porCausaAnulacion).toEqual([
      { causa: "taller", n: 2 },
      { causa: "otro", n: 1 },
    ]);
  });

  it("las anuladas antes de que se pidiera causa van aparte, no se pierden", () => {
    const m = calcularMetricas([mov("2026-07-01T10:00:00.000Z", "anular", "of1", null)]);
    expect(m.porCausaAnulacion).toEqual([{ causa: null, n: 1 }]);
  });
});

describe("dónde se para el trabajo", () => {
  it("mide la espera en la cola, el repaso y la corrección", () => {
    const m = calcularMetricas([
      mov("2026-08-03T08:00:00.000Z", "terminar_planteo", "of1"),
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"), // 120m de espera
      mov("2026-08-03T10:30:00.000Z", "devolver", "of1", "[1] x"), // 30m de repaso
      mov("2026-08-03T12:30:00.000Z", "aprobar_corregida", "of1"), // 120m de corrección
    ]);
    expect(m.tiempos.esperaCola).toEqual({ n: 1, medianaMin: 120 });
    expect(m.tiempos.repaso).toEqual({ n: 1, medianaMin: 30 });
    expect(m.tiempos.correccion).toEqual({ n: 1, medianaMin: 120 });
  });

  it("una OF que da dos vueltas mide dos veces", () => {
    const m = calcularMetricas([
      mov("2026-08-03T08:00:00.000Z", "terminar_planteo", "of1"),
      mov("2026-08-03T09:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T09:10:00.000Z", "devolver", "of1", "[1] x"),
      mov("2026-08-03T10:00:00.000Z", "terminar_planteo", "of1"),
      mov("2026-08-03T13:00:00.000Z", "empezar_revision", "of1"),
    ]);
    // Dos esperas: 60m y 180m. La mediana de dos es su media.
    expect(m.tiempos.esperaCola).toEqual({ n: 2, medianaMin: 120 });
  });

  it("lo que sigue esperando NO cuenta", () => {
    // Contarlo como si hubiera acabado ahora haría que los números bajaran
    // solos según pasa el tiempo, que es justo al revés de la verdad.
    const m = calcularMetricas([mov("2026-08-03T08:00:00.000Z", "terminar_planteo", "of1")]);
    expect(m.tiempos.esperaCola).toEqual({ n: 0, medianaMin: null });
  });

  it("recuperar una OF de la cola cancela su espera", () => {
    // Salió de la cola sin que nadie la mirara: no hay espera de revisión que
    // medir, y contarla inflaría el número con tiempo que no esperó a nadie.
    const m = calcularMetricas([
      mov("2026-08-03T08:00:00.000Z", "terminar_planteo", "of1"),
      mov("2026-08-03T09:00:00.000Z", "recuperar_planteo", "of1"),
      mov("2026-08-04T09:00:00.000Z", "empezar_revision", "of1"),
    ]);
    expect(m.tiempos.esperaCola.n).toBe(0);
  });

  it("la mediana aguanta un caso raro sin desviarse", () => {
    // Una OF que se quedó un mes en la cola por unas vacaciones desplaza la
    // MEDIA y hace pensar que todo va lento. La mediana dice cómo es lo normal.
    const dia = (d: number, h: number) =>
      `2026-08-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00.000Z`;
    const movs = [];
    for (let i = 1; i <= 5; i++) {
      movs.push(mov(dia(i, 8), "terminar_planteo", `of${i}`));
      movs.push(mov(dia(i, 9), "empezar_revision", `of${i}`)); // 60m cada una
    }
    movs.push(mov(dia(1, 8), "terminar_planteo", "of-raro"));
    movs.push(mov(dia(28, 8), "empezar_revision", "of-raro")); // 27 días
    const m = calcularMetricas(movs);
    expect(m.tiempos.esperaCola.n).toBe(6);
    // Con media saldría más de un día; la mediana se queda donde está lo normal.
    expect(m.tiempos.esperaCola.medianaMin).toBe(60);
  });
});
