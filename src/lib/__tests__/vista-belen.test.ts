import { describe, expect, test } from "vitest";
import {
  estadoOperacion,
  unaFilaPorTarea,
  fechaCorta,
  fechaDeTexto,
  puntoBultos,
  resumenAvisos,
  resumenPedido,
  enFrase,
  type AvisoOF,
  type OFBelen,
  agruparTiempos,
  type FilaTiempo,
} from "../vista-belen";
import { vistaAMedida } from "../personas";
import { enTitulo, esFinalizada, agruparPaquetes } from "../vista-belen";

describe("nombres de sección, finalizada y paquetes", () => {
  test("sección en nombre propio; códigos tal cual", () => {
    expect(enTitulo("DISEÑO GRAFICO ARZUA")).toBe("Diseño Grafico Arzua");
    expect(enTitulo("MONTAJE DE TOLDOS")).toBe("Montaje de Toldos");
    expect(enTitulo("OTEC-A")).toBe("OTEC-A");
  });
  test("finalizada con espacios y en minúscula", () => {
    expect(esFinalizada(" finalizada ")).toBe(true);
    expect(esFinalizada("DETENIDA")).toBe(false);
    expect(esFinalizada(null)).toBe(false);
  });
  test("paquetes juntos por persona y día, sumando unidades", () => {
    expect(agruparPaquetes([
      { quien: "Ignacio Penas", fecha: "2026-11-10T08:00:00.000Z", unidades: 1 },
      { quien: "Ignacio Penas", fecha: "2026-11-10T12:00:00.000Z", unidades: 2 },
      { quien: "Teresa Vázquez", fecha: "2026-11-10T12:00:00.000Z", unidades: 1 },
    ])).toEqual([
      { quien: "Ignacio Penas", dia: "2026-11-10", paquetes: 2, unidades: 3 },
      { quien: "Teresa Vázquez", dia: "2026-11-10", paquetes: 1, unidades: 1 },
    ]);
  });
});

describe("punto de los bultos", () => {
  test("nada subido: rojo", () => expect(puntoBultos(3, 0)).toBe("rojo"));
  test("subidas las de la OF: verde", () => expect(puntoBultos(3, 3)).toBe("verde"));
  // 0233680 (AR.26.05381): OF de 1 unidad con 2 subidas.
  test("subidas de más: azul", () => expect(puntoBultos(1, 2)).toBe("azul"));
  test("subidas de menos: azul", () => expect(puntoBultos(3, 1)).toBe("azul"));
});

describe("estado de una operación", () => {
  test("OLANET finalizada", () => expect(estadoOperacion({ olanet: 3, porcentaje: 0, imputaciones: 0 })).toBe("finalizado"));
  test("RPS al 100 % aunque OLANET no diga nada", () =>
    expect(estadoOperacion({ olanet: null, porcentaje: 100, imputaciones: 0 })).toBe("finalizado"));
  test("OLANET interrumpida", () =>
    expect(estadoOperacion({ olanet: 2, porcentaje: 5, imputaciones: 2 })).toBe("interrumpido"));
  test("con tiempo imputado y sin acabar", () =>
    expect(estadoOperacion({ olanet: null, porcentaje: 0, imputaciones: 1 })).toBe("interrumpido"));
  test("sin tocar", () => expect(estadoOperacion({ olanet: null, porcentaje: 0, imputaciones: 0 })).toBe("sin_empezar"));
});

describe("fecha comprometida en texto", () => {
  // RPS la guarda a la americana: mes/día/año.
  test("mm/dd/aaaa", () => expect(fechaDeTexto("11/13/2026")).toBe("2026-11-13"));
  test("6 de noviembre, no 11 de junio", () => expect(fechaDeTexto("11/06/2026")).toBe("2026-11-06"));
  test("con un dígito y año corto", () => expect(fechaDeTexto("2/3/26")).toBe("2026-02-03"));
  test("basura", () => expect(fechaDeTexto("BELEN")).toBeNull());
  test("mes imposible", () => expect(fechaDeTexto("13/10/2026")).toBeNull());
  test("día que no existe", () => expect(fechaDeTexto("02/31/2026")).toBeNull());
  test("29 de febrero solo en bisiesto", () => {
    expect(fechaDeTexto("02/29/2026")).toBeNull();
    expect(fechaDeTexto("02/29/2028")).toBe("2028-02-29");
  });
  test("vacía", () => expect(fechaDeTexto(null)).toBeNull());
});

test("fecha corta sin zona horaria", () => {
  expect(fechaCorta("2026-11-16")).toBe("16/11/26");
  expect(fechaCorta("2026-10-05T14:36:43.193Z")).toBe("05/10/26");
  expect(fechaCorta(null)).toBe("");
});

describe("TP / COT", () => {
  const av = (tipo: AvisoOF["tipo"], cerrado: string | null): AvisoOF => ({ tipo, codigo: "I1", descripcion: "", cerrado });
  test("sin avisos de ese tipo", () => expect(resumenAvisos([av("TP", "2026-10-20")], "COT")).toBeNull());
  test("todos cerrados: la última fecha", () => {
    const r = resumenAvisos([av("TP", "2026-10-20"), av("TP", "2026-10-27")], "TP");
    expect(r).toMatchObject({ pendiente: false, fecha: "2026-10-27" });
  });
  test("uno abierto: pendiente", () => {
    const r = resumenAvisos([av("COT", "2026-10-15"), av("COT", null)], "COT");
    expect(r?.pendiente).toBe(true);
  });
});

test("una fila por tarea aunque tenga varias máquinas", () => {
  const filas = unaFilaPorTarea([
    { idTarea: "t1", maq: "A-CFAC" },
    { idTarea: "t1", maq: "A-CONF" },
    { idTarea: "t2", maq: null },
    { idTarea: "t1", maq: "A-CFAC" },
  ]);
  expect(filas).toEqual([
    { idTarea: "t1", maq: "A-CFAC, A-CONF" },
    { idTarea: "t2", maq: null },
  ]);
});

describe("pantalla a medida", () => {
  test("Belén, solo con produccion, va a la suya", () =>
    expect(vistaAMedida({ id: "belen-alamancos", roles: ["produccion"] })).toBe("belen"));
  test("otra persona de Producción no hereda la de Belén", () =>
    expect(vistaAMedida({ id: "otra", roles: ["produccion"] })).toBeNull());
  test("con tecnico sigue en el tablero", () =>
    expect(vistaAMedida({ id: "belen-alamancos", roles: ["produccion", "tecnico"] })).toBeNull());
});

describe("resumen del pedido", () => {
  const of = (o: Partial<OFBelen>): OFBelen => ({
    of: "0000001", pedido: "AR.26.00001", linea: 1, cliente: "X", prioridad: 2, descripcion: "", situacion: "CON IMPUTACIONES",
    cantidad: 1, subidas: 0, fechaSolicitada: "2026-11-16", fechaComprometida: null, fechaCompras: null,
    formaEntrega: "INSTALAR", rotulacion: "MAHOU", notas: null, operaciones: [], avisos: [], paquetes: [], compras: [],
    logistica: null, ...o,
  });
  test("lo común se dice una vez; lo que difiere, no", () => {
    const r = resumenPedido({ codigo: "AR.26.00001", cliente: "X", ofs: [of({}), of({ of: "2", rotulacion: null })] });
    expect(r.comunes).toEqual({ formaEntrega: "INSTALAR", rotulacion: null, fechaSolicitada: "2026-11-16" });
    expect(r.igual.rotulacion).toBe(false);
  });
  test("cuenta bultos, avisos pendientes y material", () => {
    const r = resumenPedido({
      codigo: "AR.26.00001", cliente: "X",
      ofs: [
        of({ subidas: 1 }),
        of({ of: "2", cantidad: 3, subidas: 2, avisos: [{ tipo: "COT", codigo: "I1", descripcion: "", cerrado: null }] }),
        of({ of: "3", compras: [{ articulo: "LONA", pedida: 1, recibida: 0, prevista: null, proveedor: null }] }),
      ],
    });
    expect(r.bultos).toEqual({ verde: 1, azul: 1, rojo: 1 });
    expect(r.cotPendiente).toBe(1);
    expect(r.tpPendiente).toBe(0);
    expect(r.conMaterialPendiente).toBe(1);
  });
  test("la comprometida más temprana de las OF sin finalizar", () => {
    const r = resumenPedido({
      codigo: "AR.26.00001", cliente: "X",
      ofs: [
        of({ fechaComprometida: "2026-11-20" }),
        of({ of: "2", fechaComprometida: "2026-11-11" }),
        of({ of: "3", fechaComprometida: "2026-11-01", situacion: "FINALIZADA" }),
      ],
    });
    expect(r.comprometida).toBe("2026-11-11");
  });
});

test("en frase", () => {
  expect(enFrase("FALDON LATERAL O FRONTAL NUEVO")).toBe("Faldon lateral o frontal nuevo");
  expect(enFrase("  plantear archivos PVC  ")).toBe("Plantear archivos PVC");
  expect(enFrase(null)).toBe("");
});

describe("tareas y tiempos", () => {
  const fila = (o: Partial<FilaTiempo>): FilaTiempo => ({
    of: "0232470", ofDescripcion: "FALDON", tarea: "5", descripcion: "CORTAR", maquina: "A-COAC",
    estado: "finalizado", persona: null, dia: null, hora: null, minutos: 0, ...o,
  });
  const t = agruparTiempos([
    fila({ tarea: "10", descripcion: "EMPATAR", persona: "Teresa Vázquez", dia: "2026-11-03", hora: "10:38", minutos: 0 }),
    fila({ persona: "Pilar Santos", dia: "2026-11-03", hora: "10:00", minutos: 14 }),
    fila({ persona: "Teresa Vázquez", dia: "2026-11-04", hora: "09:00", minutos: 20 }),
    fila({ persona: "Teresa Vázquez", dia: "2026-11-03", hora: "10:00", minutos: 14 }),
    fila({ tarea: "31", descripcion: "TUBO", estado: "sin_empezar" }),
    fila({ of: "0232466", tarea: "02", descripcion: "PLANTEAR", persona: "Pilar Santos", dia: "2026-10-01", hora: "08:00", minutos: 30 }),
  ]);

  test("suma por pedido, OF y tarea", () => {
    expect(t.minutos).toBe(78);
    expect(t.ofs.map((o) => [o.of, o.minutos])).toEqual([["0232466", 30], ["0232470", 48]]);
  });
  test("salen también las tareas sin fichajes, en orden numérico", () => {
    expect(t.ofs[1].tareas.map((x) => x.codigo)).toEqual(["5", "10", "31"]);
    expect(t.ofs[1].tareas[2]).toMatchObject({ minutos: 0, personas: [] });
  });
  test("en la tarea, personas de más a menos y fichajes por fecha", () => {
    const corte = t.ofs[1].tareas[0];
    expect(corte.personas.map((p) => [p.persona, p.minutos])).toEqual([["Teresa Vázquez", 34], ["Pilar Santos", 14]]);
    expect(corte.personas[0].fichajes.map((f) => f.dia)).toEqual(["2026-11-03", "2026-11-04"]);
  });
  test("por persona: total, días y rango, con el fichaje de 0 minutos contado", () => {
    const teresa = t.personas.find((p) => p.persona === "Teresa Vázquez")!;
    expect(teresa).toMatchObject({ minutos: 34, dias: 2, primerDia: "2026-11-03", ultimoDia: "2026-11-04" });
    expect(teresa.fichajes).toHaveLength(3);
    expect(t.personas[0].persona).toBe("Pilar Santos");
  });
});

describe("tiempos exactos de RPS", () => {
  test("duración sin redondear: horas, minutos y segundos", async () => {
    const { fmtDuracion } = await import("../vista-belen");
    expect(fmtDuracion(336 / 60)).toBe("5m 36s");
    expect(fmtDuracion(1)).toBe("1m");
    expect(fmtDuracion(20592 / 60)).toBe("5h 43m 12s");
    expect(fmtDuracion(3600 / 60)).toBe("1h 0m");
    expect(fmtDuracion(0)).toBe("0s");
  });
  test("hora de inicio desde los segundos de RPS", async () => {
    const { horaDeSegundos } = await import("../server/rps-belen-comun");
    expect(horaDeSegundos(27227)).toBe("07:33");
    expect(horaDeSegundos(0)).toBe("00:00");
    expect(horaDeSegundos(null)).toBeNull();
  });
});

describe("OF en amarillo", () => {
  test("solo con las visitas hechas y todas las tareas finalizadas", async () => {
    const { ofEnAmarillo } = await import("../vista-belen");
    const tp = (cerrado: string | null) => ({ tipo: "TP" as const, codigo: "I1", descripcion: "", cerrado });
    const op = (estado: "finalizado" | "interrumpido") => ({ codigo: "5", descripcion: "", maquina: null, estado });
    expect(ofEnAmarillo({ avisos: [tp("2026-11-01")], operaciones: [op("finalizado")] })).toBe(true);
    expect(ofEnAmarillo({ avisos: [tp("2026-11-01")], operaciones: [op("finalizado"), op("interrumpido")] })).toBe(false);
    expect(ofEnAmarillo({ avisos: [tp(null)], operaciones: [op("finalizado")] })).toBe(false);
    expect(ofEnAmarillo({ avisos: [], operaciones: [op("finalizado")] })).toBe(false);
  });
});

describe("personas de una OF", () => {
  test("suma por persona entre tareas, días distintos y de más a menos tiempo", async () => {
    const { agruparTiempos, personasDeOF } = await import("../vista-belen");
    const base = { of: "0001", ofDescripcion: "", maquina: null, estado: "finalizado" as const, hora: "08:00" };
    const t = agruparTiempos([
      { ...base, tarea: "5", descripcion: "Cortar", persona: "Ana", dia: "2026-11-03", minutos: 10 },
      { ...base, tarea: "10", descripcion: "Coser", persona: "Ana", dia: "2026-11-04", minutos: 20 },
      { ...base, tarea: "10", descripcion: "Coser", persona: "Luis", dia: "2026-11-04", minutos: 50 },
    ]);
    const ps = personasDeOF(t.ofs[0]);
    expect(ps.map((p) => [p.persona, p.minutos, p.dias])).toEqual([["Luis", 50, 1], ["Ana", 30, 2]]);
    expect(ps[1].fichajes.map((f) => f.tarea)).toEqual(["5", "10"]);
  });
});
