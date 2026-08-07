import { describe, expect, it } from "vitest";
import type { AccionLog } from "../server/estado-db";
import { avisosPara, MOTIVO_CAMBIO_REVISOR } from "../avisos";

const accion = (parcial: Partial<AccionLog>): AccionLog => ({
  id: 1,
  ts: "2026-08-05T09:00:00.000Z",
  operarioId: "ivan",
  motivo: "traspaso",
  cambiosOF: [],
  previos: [],
  ...parcial,
});

const of = (ofId: string, autorId: string | null, revisorId: string | null) => ({
  ofId,
  autorId,
  revisorId,
  estado: "en_curso" as const,
  observacion: null,
});

describe("avisosPara", () => {
  const traspaso = accion({
    id: 7,
    operarioId: "ivan",
    previos: [of("of-1", "ivan", null)],
    cambiosOF: [of("of-1", "tamara", null)],
  });

  it("avisa al que recibe el trabajo", () => {
    const r = avisosPara([traspaso], "tamara", new Set());
    expect(r).toEqual([
      {
        clave: "7:recibida:of-1",
        logId: 7,
        ts: traspaso.ts,
        tipo: "recibida",
        ofId: "of-1",
        quien: "ivan",
        otro: "ivan",
      },
    ]);
  });

  it("distingue quien hace el cambio de quien pierde el trabajo, al avisar de que se recibe", () => {
    // En el test de arriba, quien hace el cambio (operarioId: "ivan") y el
    // autor previo (previos: [of("of-1", "ivan", ...)]) son la misma
    // persona: si `otro` se calculara mal (reutilizando el actor en vez del
    // autor previo), ese test seguiría en verde. Aquí actor, autor previo y
    // destinatario son tres personas distintas, así que el error se nota.
    const traspasoDeTresPersonas = accion({
      id: 30,
      operarioId: "coord",
      previos: [of("of-20", "ivan", null)],
      cambiosOF: [of("of-20", "tamara", null)],
    });
    const r = avisosPara([traspasoDeTresPersonas], "tamara", new Set());
    expect(r).toEqual([
      {
        clave: "30:recibida:of-20",
        logId: 30,
        ts: traspasoDeTresPersonas.ts,
        tipo: "recibida",
        ofId: "of-20",
        quien: "coord",
        otro: "ivan",
      },
    ]);
  });

  it("avisa también al que lo pierde: si no, ve desaparecer algo sin saber por qué", () => {
    const deAngel = accion({ ...traspaso, id: 8, operarioId: "angel" });
    const r = avisosPara([deAngel], "ivan", new Set());
    expect(r[0]).toMatchObject({ tipo: "cedida", quien: "angel", otro: "tamara" });
  });

  it("no se avisa a sí mismo de lo que acaba de hacer", () => {
    expect(avisosPara([traspaso], "ivan", new Set())).toEqual([]);
  });

  it("no avisa de asignar trabajo que no tenía dueño", () => {
    const asignar = accion({
      id: 9,
      motivo: "asignar",
      previos: [of("of-2", null, null)],
      cambiosOF: [of("of-2", "tamara", null)],
    });
    // Una OF que sale de la bandeja ya se anuncia sola en la campana como
    // "sin empezar": repetirlo aquí sería el mismo aviso dos veces.
    expect(avisosPara([asignar], "tamara", new Set())).toEqual([]);
  });

  it("avisa del cambio de revisor en las dos direcciones", () => {
    const cambio = accion({
      id: 10,
      motivo: MOTIVO_CAMBIO_REVISOR,
      operarioId: "ivan",
      previos: [of("of-3", "ivan", "tamara")],
      cambiosOF: [of("of-3", "ivan", "jaime")],
    });
    expect(avisosPara([cambio], "jaime", new Set())[0]).toMatchObject({
      tipo: "revisarNueva",
      otro: "tamara",
    });
    expect(avisosPara([cambio], "tamara", new Set())[0]).toMatchObject({
      tipo: "revisarQuitada",
      otro: "jaime",
    });
  });

  it("los ya vistos no vuelven a salir", () => {
    // `vistos` ahora es un conjunto de claves de aviso, no de ids de acción.
    expect(avisosPara([traspaso], "tamara", new Set(["7:recibida:of-1"]))).toEqual([]);
  });

  it("un aviso no visto sigue saliendo aunque otro aviso de la misma acción sí se haya visto", () => {
    // Traspasar un pedido entero manda todas sus OF en una sola llamada: dos
    // OF que van al mismo destinatario generan, en la misma acción, dos
    // avisos con el mismo logId. Si el filtro de "vistos" siguiera
    // comparando por logId (o si `clave` no existiera), marcar uno como
    // visto apagaría también el otro, que nadie ha abierto.
    const traspasoPedido = accion({
      id: 20,
      operarioId: "coord",
      previos: [of("of-10", "ivan", null), of("of-11", "angel", null)],
      cambiosOF: [of("of-10", "tamara", null), of("of-11", "tamara", null)],
    });
    const sinVistos = avisosPara([traspasoPedido], "tamara", new Set());
    expect(sinVistos).toHaveLength(2);

    const avisoDeOf10 = sinVistos.find((av) => av.ofId === "of-10")!;
    expect(avisoDeOf10.clave).toBe("20:recibida:of-10");

    // Marcamos como vista solo la clave del aviso de of-10.
    const r = avisosPara([traspasoPedido], "tamara", new Set([avisoDeOf10.clave]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ofId: "of-11", tipo: "recibida", otro: "angel" });
  });

  it("avisa cuando te devuelven el trabajo a la bandeja sin reasignarlo a nadie", () => {
    // Que te quiten una OF y quede sin autor (vuelve a la bandeja) es un
    // caso de "cedida" más: es intencional que se avise con otro: null,
    // porque perder el trabajo es justo lo que este aviso existe para
    // contar, tenga o no ya dueño nuevo. Este test fija ese comportamiento
    // para que un cambio futuro no lo rompa sin darse cuenta.
    const devueltaABandeja = accion({
      id: 40,
      operarioId: "angel",
      previos: [of("of-30", "ivan", null)],
      cambiosOF: [of("of-30", null, null)],
    });
    const r = avisosPara([devueltaABandeja], "ivan", new Set());
    expect(r).toEqual([
      {
        clave: "40:cedida:of-30",
        logId: 40,
        ts: devueltaABandeja.ts,
        tipo: "cedida",
        ofId: "of-30",
        quien: "angel",
        otro: null,
      },
    ]);
  });

  it("ignora los cambios que no mueven a nadie de sitio", () => {
    const soloEstado = accion({
      id: 11,
      motivo: "accion",
      previos: [of("of-4", "ivan", null)],
      cambiosOF: [{ ...of("of-4", "ivan", null), estado: "por_revisar" }],
    });
    expect(avisosPara([soloEstado], "ivan", new Set())).toEqual([]);
  });
});

describe("nombrar revisor por primera vez", () => {
  // Pasa al mandar una OF a revisión, que es el flujo más frecuente de la app.
  // De eso ya avisa la campana por su cuenta ("Me toca revisar", derivado del
  // estado de la OF): si además saliera de aquí, el revisor vería el mismo
  // hecho contado dos veces.
  const nombrar = {
    id: 30,
    ts: "2026-08-05T09:00:00.000Z",
    operarioId: "ivan",
    motivo: "revisor",
    previos: [
      {
        ofId: "of-30",
        autorId: "ivan",
        revisorId: null,
        estado: "en_curso" as const,
        observacion: null,
      },
    ],
    cambiosOF: [
      {
        ofId: "of-30",
        autorId: "ivan",
        revisorId: "tamara",
        estado: "por_revisar" as const,
        observacion: null,
      },
    ],
  };

  it("no genera aviso de movimiento", () => {
    expect(avisosPara([nombrar], "tamara", new Set())).toEqual([]);
  });

  it("pero corregir un revisor ya nombrado sí lo genera", () => {
    const corregir = { ...nombrar, id: 31, motivo: MOTIVO_CAMBIO_REVISOR };
    expect(avisosPara([corregir], "tamara", new Set())[0]).toMatchObject({
      tipo: "revisarNueva",
    });
  });
});
