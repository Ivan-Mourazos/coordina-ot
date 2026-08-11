import { describe, expect, it } from "vitest";
import type { HistorialItem } from "../historial";
import type { OF, Pedido } from "../types";
import { buscar, normaliza, ubicacionDe } from "../buscador";

const NOMBRES: Record<string, string> = { ivan: "Iván", jaime: "Jaime", tamara: "Tamara" };
const nombre = (id: string) => NOMBRES[id] ?? id;

const of = (p: Partial<OF> = {}): OF => ({
  id: "of-1",
  codigo: "0230697",
  descripcion: "TOLDO DE FACHADA",
  familia: "TOLDO",
  piezas: 1,
  autorId: null,
  revisorId: null,
  estado: "pendiente",
  fichandoRol: null,
  tiempoEstimadoMin: 0,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
  reservasMaterial: 0,
  ...p,
});

const pedido = (p: Partial<Pedido> = {}): Pedido => ({
  id: "AR.26.03948",
  codigo: "AR.26.03948",
  cliente: "MAHOU, S.A.",
  situacion: "procesado",
  fechaSolicitud: "2026-08-24",
  fechaPlanificacion: "2026-08-11",
  fechaEntrega: "2026-08-24",
  prioridad: 2,
  ofs: [of()],
  accent: "ninguno",
  lineas: 0,
  croquis: false,
  ...p,
});

const hist = (p: Partial<HistorialItem> = {}): HistorialItem => ({
  pedido: "AR.26.03100",
  cliente: "ESTRELLA GALICIA",
  finalizada: "2026-07-01T09:00:00.000Z",
  nOf: 2,
  ...p,
});

const fuentes = (pedidos: Pedido[], historial: HistorialItem[] = []) => ({
  pedidos,
  historial,
  nombre,
});

describe("normaliza", () => {
  it("borra puntuación y acentos: el mismo pedido escrito de tres maneras es uno", () => {
    expect(normaliza("AR.26.03948")).toBe("AR2603948");
    expect(normaliza("ar 26 03948")).toBe("AR2603948");
    expect(normaliza("Mahou, S.A.")).toBe("MAHOUSA");
    expect(normaliza("Perucho ñ á")).toBe("PERUCHONA");
  });
});

describe("buscar", () => {
  it("con el número corto, que es como se llaman los pedidos hablando", () => {
    const r = buscar("03948", fuentes([pedido()]));
    expect(r.map((x) => x.codigo)).toEqual(["AR.26.03948"]);
  });

  it("y sin los ceros de delante: nadie dice 'el cero tres nueve cuatro ocho'", () => {
    expect(buscar("3948", fuentes([pedido()]))).toHaveLength(1);
  });

  it("con pocas letras basta", () => {
    expect(buscar("39", fuentes([pedido()]))).toHaveLength(1);
    expect(buscar("mah", fuentes([pedido()]))).toHaveLength(1);
  });

  it("con una sola letra no busca: encajaría media oficina", () => {
    expect(buscar("3", fuentes([pedido()]))).toEqual([]);
    expect(buscar("", fuentes([pedido()]))).toEqual([]);
  });

  it("por palabras sueltas y en cualquier orden", () => {
    // "TOLDO DE FACHADA" tiene un "DE" en medio que nadie escribe al buscar, y
    // el orden tampoco se recuerda.
    const p = pedido({ ofs: [of({ descripcion: "TOLDO DE FACHADA" })] });
    expect(buscar("toldo fachada", fuentes([p]))).toHaveLength(1);
    expect(buscar("fachada toldo", fuentes([p]))).toHaveLength(1);
  });

  it("pero TODAS las palabras: no vale traer los toldos por un lado y las fachadas por otro", () => {
    const p = pedido({ ofs: [of({ descripcion: "TOLDO DE FACHADA" })] });
    expect(buscar("toldo capota", fuentes([p]))).toEqual([]);
  });

  it("la descripción no engancha con dos letras", () => {
    // "TO" está en TOLDO, MOTOR y AUTOMÁTICO: con dos letras saldría media
    // lista y la primera respuesta del buscador no diría nada.
    const p = pedido({ codigo: "AR.26.01111", cliente: "X", ofs: [of({ descripcion: "TOLDO" })] });
    expect(buscar("to", fuentes([p]))).toEqual([]);
  });

  it("encuentra por el nº de OF, que es lo que tienes delante en papel", () => {
    const r = buscar("0230697", fuentes([pedido()]));
    expect(r).toHaveLength(1);
  });

  it("el número del pedido gana al cliente que casualmente lo contenga", () => {
    const buscado = pedido({ id: "a", codigo: "AR.26.03948" });
    const otro = pedido({ id: "b", codigo: "AR.26.01111", cliente: "TALLERES 3948" });
    const r = buscar("3948", fuentes([otro, buscado]));
    expect(r.map((x) => x.codigo)).toEqual(["AR.26.03948", "AR.26.01111"]);
  });

  it("busca también en el historial, y lo vivo va delante de lo archivado", () => {
    const r = buscar(
      "estrella",
      fuentes([pedido({ cliente: "ESTRELLA GALICIA" })], [hist()]),
    );
    expect(r.map((x) => x.fuente)).toEqual(["tablero", "historial"]);
  });

  it("un pedido que está en los dos sitios sale una vez, la del tablero", () => {
    // Pasa de verdad mientras RPS cierra la fase: el pedido sigue en el
    // tablero y ya asoma por el historial. Manda el del tablero, que es el que
    // se puede abrir y tocar.
    const r = buscar("3948", fuentes([pedido()], [hist({ pedido: "AR.26.03948" })]));
    expect(r).toHaveLength(1);
    expect(r[0].fuente).toBe("tablero");
  });

  it("no devuelve una lista infinita: si no está arriba, escribe otra letra", () => {
    const muchos = Array.from({ length: 30 }, (_, i) =>
      pedido({ id: `p${i}`, codigo: `AR.26.0${3000 + i}` }),
    );
    expect(buscar("AR26", fuentes(muchos))).toHaveLength(10);
  });
});

describe("ubicacionDe", () => {
  it("sin autor en ninguna OF → sin asignar", () => {
    expect(ubicacionDe(pedido(), nombre)).toMatchObject({
      donde: "Sin asignar",
      ubicacion: "sinAsignar",
    });
  });

  it("con autor, dice quién", () => {
    expect(ubicacionDe(pedido({ ofs: [of({ autorId: "ivan" })] }), nombre)).toMatchObject({
      donde: "Iván",
      ubicacion: "conAutor",
    });
  });

  it("repartido entre varios, los nombra a todos", () => {
    const p = pedido({
      ofs: [of({ id: "1", autorId: "ivan" }), of({ id: "2", autorId: "jaime" })],
    });
    expect(ubicacionDe(p, nombre).donde).toBe("Iván y Jaime");
  });

  it("a medio repartir lo dice: es la diferencia entre 'ya está' y 'falta gente'", () => {
    const p = pedido({
      ofs: [of({ id: "1", autorId: "ivan" }), of({ id: "2" })],
    });
    expect(ubicacionDe(p, nombre).donde).toBe("Iván · 1 sin asignar");
  });

  it("pasado a Producción: no está en ninguna lista y hay que decirlo", () => {
    expect(ubicacionDe(pedido({ situacion: "completado" }), nombre)).toMatchObject({
      donde: "Pasado a Producción",
      ubicacion: "fuera",
    });
  });

  it("todas anuladas → anulada", () => {
    expect(ubicacionDe(pedido({ ofs: [of({ estado: "anulada" })] }), nombre)).toMatchObject({
      donde: "Anulada",
    });
  });

  it("todo de taller: el buscador lo encuentra, pero avisa de que no es nuestro", () => {
    const p = pedido({ ofs: [of({ ajenaOT: true })] });
    expect(ubicacionDe(p, nombre)).toMatchObject({ donde: "De taller", ubicacion: "taller" });
  });

  it("una OF de taller rescatada con autor ya cuenta como trabajo de OT", () => {
    const p = pedido({ ofs: [of({ ajenaOT: true, autorId: "tamara" })] });
    expect(ubicacionDe(p, nombre)).toMatchObject({ donde: "Tamara", ubicacion: "conAutor" });
  });

  it("las detenidas y las de taller salen como matiz, no como ubicación", () => {
    const p = pedido({
      ofs: [
        of({ id: "1", autorId: "ivan" }),
        of({ id: "2", autorId: "ivan", detenida: true }),
        of({ id: "3", ajenaOT: true }),
      ],
    });
    expect(ubicacionDe(p, nombre)).toMatchObject({
      donde: "Iván",
      extra: "1 detenida · 1 de taller",
    });
  });

  it("las anuladas no cuentan para decidir si falta gente", () => {
    // Si contaran, un pedido tuyo con una OF anulada diría "Iván · 1 sin
    // asignar" y te mandaría a buscar trabajo que nadie tiene que hacer.
    const p = pedido({
      ofs: [of({ id: "1", autorId: "ivan" }), of({ id: "2", estado: "anulada" })],
    });
    expect(ubicacionDe(p, nombre).donde).toBe("Iván");
  });
});

describe("tercera fuente: cualquier pedido de RPS", () => {
  const suelto = {
    codigo: "AR.26.03649",
    cliente: "FORMOSO PICO, S.L.",
    negocio: null,
    fecha: "2026-07-22T00:00:00.000Z",
  };

  it("encuentra pedidos que no están ni en el tablero ni en el historial", () => {
    // El caso real: AR.26.03577 y AR.26.03649 no salían por ningún lado porque
    // RPS daba su tarea de OT por terminada y no había registro de fin de fase.
    const r = buscar("3649", { pedidos: [], historial: [], otros: [suelto], nombre });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ codigo: "AR.26.03649", donde: "Fuera de Oficina Técnica" });
  });

  it("dice de cuándo es, que es lo único que se sabe de ellos", () => {
    const r = buscar("formoso", { pedidos: [], historial: [], otros: [suelto], nombre });
    expect(r[0].extra).toBe("pedido de 22/07/2026");
  });

  it("no pisa al mismo pedido si ya salió por el tablero", () => {
    const enTablero = pedido({ codigo: "AR.26.03649", cliente: "FORMOSO PICO, S.L." });
    const r = buscar("3649", { pedidos: [enTablero], historial: [], otros: [suelto], nombre });
    expect(r).toHaveLength(1);
    expect(r[0].fuente).toBe("tablero");
  });

  it("y va detrás de lo vivo y de lo archivado, no delante", () => {
    // A igualdad de puntos manda lo que se puede abrir y tocar.
    const r = buscar("AR26", {
      pedidos: [pedido({ id: "p", codigo: "AR.26.00001" })],
      historial: [hist({ pedido: "AR.26.00002" })],
      otros: [{ ...suelto, codigo: "AR.26.00003" }],
      nombre,
    });
    expect(r.map((x) => x.fuente)).toEqual(["tablero", "historial", "rps"]);
  });
});
