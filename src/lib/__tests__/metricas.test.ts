import { describe, expect, it } from "vitest";
import {
  calcularMetricas,
  proporcionDevueltas,
  type MovimientoRegistrado,
} from "../metricas";
import type { Intervalo } from "../fichaje";

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

  it("lo que no es del ciclo no entra", () => {
    // Asignar, soltar o restaurar pasan por el registro y no son ni un repaso
    // ni un cierre: no pueden crear un mes donde no hubo trabajo medible.
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "asignar", "of1"),
      mov("2026-08-03T11:00:00.000Z", "restaurar", "of1"),
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
      { mes: "2026-08", revisiones: 2, devoluciones: 1, planteos: 0, terminadas: 0 },
      { mes: "2026-09", revisiones: 1, devoluciones: 0, planteos: 0, terminadas: 0 },
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
    expect(m.porMes).toEqual([
      { mes: "2026-08", revisiones: 1, devoluciones: 1, planteos: 0, terminadas: 0 },
    ]);
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
    expect(m.porMes).toEqual([
      { mes: "2026-09", revisiones: 1, devoluciones: 1, planteos: 0, terminadas: 0 },
    ]);
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
    expect(septiembre).toEqual({
      mes: "2026-09",
      revisiones: 7,
      devoluciones: 7,
      planteos: 0,
      terminadas: 0,
    });
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
      { mes: "2026-08", revisiones: 1, devoluciones: 0, planteos: 0, terminadas: 1 },
      // La de septiembre no se cuelga de la revisión de agosto: se cuenta en
      // septiembre, con su revisión implícita.
      { mes: "2026-09", revisiones: 1, devoluciones: 1, planteos: 0, terminadas: 0 },
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
      planteos: 0,
      terminadas: 0,
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
    expect(m.tiempos.esperaCola).toEqual({ n: 1, medianaMin: 120, trabajo: { n: 0, medianaMin: null } });
    expect(m.tiempos.repaso).toEqual({ n: 1, medianaMin: 30, trabajo: { n: 0, medianaMin: null } });
    expect(m.tiempos.correccion).toEqual({ n: 1, medianaMin: 120, trabajo: { n: 0, medianaMin: null } });
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
    expect(m.tiempos.esperaCola).toEqual({ n: 2, medianaMin: 120, trabajo: { n: 0, medianaMin: null } });
  });

  it("lo que sigue esperando NO cuenta", () => {
    // Contarlo como si hubiera acabado ahora haría que los números bajaran
    // solos según pasa el tiempo, que es justo al revés de la verdad.
    const m = calcularMetricas([mov("2026-08-03T08:00:00.000Z", "terminar_planteo", "of1")]);
    expect(m.tiempos.esperaCola).toEqual({ n: 0, medianaMin: null, trabajo: { n: 0, medianaMin: null } });
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

describe("cuánto trabajo sale", () => {
  it("cuenta como terminado las TRES formas de dar por buena una OF", () => {
    // Las tres dejan la OF lista para que el pedido pase a Producción, así que
    // las tres son trabajo que sale. Contando solo "aprobar" se perdería todo
    // el trabajo que no lleva revisión, que es real y es de OT.
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "aprobar", "of1"),
      mov("2026-08-04T10:00:00.000Z", "aprobar_corregida", "of2"),
      mov("2026-08-05T10:00:00.000Z", "aprobar_sin_revision", "of3"),
    ]);
    expect(m.volumen.terminadas).toBe(3);
    expect(m.volumen.ofTerminadas).toBe(3);
  });

  it("una OF reabierta y vuelta a aprobar es UNA OF, aunque sean dos cierres", () => {
    // Los dos números dicen cosas distintas y hacen falta los dos: `terminadas`
    // es cuántas veces se cerró trabajo (dos, y la segunda costó), `ofTerminadas`
    // es cuánto trabajo distinto salió (una).
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "aprobar", "of1"),
      mov("2026-08-10T10:00:00.000Z", "reabrir", "of1"),
      mov("2026-08-11T10:00:00.000Z", "aprobar", "of1"),
    ]);
    expect(m.volumen.terminadas).toBe(2);
    expect(m.volumen.ofTerminadas).toBe(1);
  });

  it("los planteos entregados incluyen la segunda vuelta de una devuelta", () => {
    // Volver a entregar un planteo corregido es trabajo hecho otra vez, no el
    // mismo de antes. Si no contara, un mes lleno de correcciones parecería un
    // mes vacío.
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "terminar_planteo", "of1"),
      mov("2026-08-03T11:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T12:00:00.000Z", "devolver", "of1", "[1] la cota"),
      mov("2026-08-04T10:00:00.000Z", "terminar_planteo", "of1"),
    ]);
    expect(m.volumen.planteos).toBe(2);
  });

  it("reparte el volumen por mes, cada movimiento en el suyo", () => {
    const m = calcularMetricas([
      mov("2026-07-30T10:00:00.000Z", "terminar_planteo", "of1"),
      mov("2026-08-01T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-01T11:00:00.000Z", "aprobar", "of1"),
    ]);
    expect(m.porMes).toEqual([
      { mes: "2026-07", revisiones: 0, devoluciones: 0, planteos: 1, terminadas: 0 },
      { mes: "2026-08", revisiones: 1, devoluciones: 0, planteos: 0, terminadas: 1 },
    ]);
  });
});

describe("cuánto de ese tiempo se trabajó de verdad", () => {
  // El reloj de pared y el trabajo son dos cosas, y confundirlas lleva a la
  // decisión contraria: "corregir tarda dos días" hace pensar en poner más
  // gente, cuando lo que pasa es que son veinte minutos de trabajo repartidos
  // en dos días de espera.
  const iv = (
    inicio: string,
    fin: string | null,
    ofIds: string[],
    rol: "plantear" | "revisar" = "revisar",
  ): Intervalo => ({ inicio, fin, ofIds, rol, operarioId: "jaime" });

  it("cuenta solo el fichaje que cae DENTRO del tramo", () => {
    const m = calcularMetricas(
      [
        mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
        mov("2026-08-03T12:00:00.000Z", "aprobar", "of1"),
      ],
      [
        iv("2026-08-03T09:00:00.000Z", "2026-08-03T09:30:00.000Z", ["of1"]), // antes
        iv("2026-08-03T10:15:00.000Z", "2026-08-03T10:45:00.000Z", ["of1"]), // dentro
      ],
    );
    expect(m.tiempos.repaso.medianaMin).toBe(120);
    expect(m.tiempos.repaso.trabajo).toEqual({ n: 1, medianaMin: 30 });
  });

  it("un fichaje a caballo del final cuenta solo su parte de dentro", () => {
    const m = calcularMetricas(
      [
        mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
        mov("2026-08-03T12:00:00.000Z", "aprobar", "of1"),
      ],
      [iv("2026-08-03T11:45:00.000Z", "2026-08-03T12:30:00.000Z", ["of1"])],
    );
    expect(m.tiempos.repaso.trabajo.medianaMin).toBe(15);
  });

  it("un fichaje de varias OF reparte sus minutos, como en el resto de la app", () => {
    const m = calcularMetricas(
      [
        mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
        mov("2026-08-03T12:00:00.000Z", "aprobar", "of1"),
      ],
      [iv("2026-08-03T10:00:00.000Z", "2026-08-03T11:00:00.000Z", ["of1", "of2"])],
    );
    expect(m.tiempos.repaso.trabajo.medianaMin).toBe(30);
  });

  it("el fichaje de OTRA OF no se cuela", () => {
    const m = calcularMetricas(
      [
        mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
        mov("2026-08-03T12:00:00.000Z", "aprobar", "of1"),
      ],
      [iv("2026-08-03T10:15:00.000Z", "2026-08-03T10:45:00.000Z", ["of9"])],
    );
    expect(m.tiempos.repaso.trabajo).toEqual({ n: 0, medianaMin: null });
  });

  it("un tramo sin fichaje no cuenta como cero: no se midió", () => {
    // Si contara, los meses en los que el equipo fichaba en el terminal viejo
    // y no aquí arrastrarían la mediana a cero y la pantalla diría que el
    // trabajo no cuesta nada. `n` dice sobre cuántos se pudo mirar.
    const m = calcularMetricas(
      [
        mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
        mov("2026-08-03T12:00:00.000Z", "aprobar", "of1"),
        mov("2026-08-04T10:00:00.000Z", "empezar_revision", "of2"),
        mov("2026-08-04T11:00:00.000Z", "aprobar", "of2"),
      ],
      [iv("2026-08-03T10:00:00.000Z", "2026-08-03T10:20:00.000Z", ["of1"])],
    );
    expect(m.tiempos.repaso.n).toBe(2);
    expect(m.tiempos.repaso.trabajo).toEqual({ n: 1, medianaMin: 20 });
  });

  it("sin fichaje que mirar, no hay trabajo que enseñar", () => {
    const m = calcularMetricas([
      mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
      mov("2026-08-03T12:00:00.000Z", "aprobar", "of1"),
    ]);
    expect(m.tiempos.repaso.trabajo).toEqual({ n: 0, medianaMin: null });
  });

  it("un fichaje abierto no cierra nada: todavía no se sabe cuánto durará", () => {
    const m = calcularMetricas(
      [
        mov("2026-08-03T10:00:00.000Z", "empezar_revision", "of1"),
        mov("2026-08-03T12:00:00.000Z", "aprobar", "of1"),
      ],
      [iv("2026-08-03T10:15:00.000Z", null, ["of1"])],
    );
    expect(m.tiempos.repaso.trabajo).toEqual({ n: 0, medianaMin: null });
  });
});
