import { describe, expect, it } from "vitest";
import { causaMayor, deLaSeccion, esMia, rectificadosPorFamilia, repartoNc, soyCausaMayor, papelDiseno, partirCausa, quienesEn, resumenNc, seccionesDe, sinClasificar, textoProcesos, totalesNc, type CausaNc, type NoConformidad } from "../no-conformidad";
import type { SeccionId } from "../secciones";

const nc = (proceso1: string | null, proceso2: string | null) => ({ proceso1, proceso2 });

describe("papelDiseno", () => {
  it("DISEÑO en el primer hueco es el principal", () => {
    expect(papelDiseno(nc("DISEÑO", "COMERCIAL"))).toBe("principal");
  });

  it("DISEÑO en el segundo hueco es el secundario", () => {
    expect(papelDiseno(nc("COMERCIAL", "DISEÑO"))).toBe("secundario");
  });

  it("en los dos huecos cuenta como principal, no dos veces", () => {
    expect(papelDiseno(nc("DISEÑO", "DISEÑO"))).toBe("principal");
  });

  it("sin ningún proceso es «sin clasificar», y con otros procesos no es nuestra", () => {
    expect(papelDiseno(nc(null, null))).toBe("sinClasificar");
    expect(sinClasificar(nc(null, null))).toBe(true);
    expect(papelDiseno(nc("PRODUCCIÓN", null))).toBe("otro");
  });
});

describe("textoProcesos", () => {
  it("dice cuál es el principal y cuál el secundario", () => {
    expect(textoProcesos(nc("COMERCIAL", "DISEÑO"))).toBe("COMERCIAL (principal) · DISEÑO (secundario)");
  });

  it("sin procesos lo dice", () => {
    expect(textoProcesos(nc(null, null))).toBe("sin proceso todavía");
  });
});

describe("resumenNc", () => {
  it("pone en una línea lo que Calidad escribió en varias", () => {
    expect(resumenNc("RECTIFICAR MEDIDAS DE TOLDO UMIA.\r\n\r\nPor la información recopilada")).toBe(
      "RECTIFICAR MEDIDAS DE TOLDO UMIA. Por la información recopilada",
    );
  });

  it("recorta lo largo con puntos suspensivos, sin pasarse del máximo", () => {
    const r = resumenNc("a ".repeat(200), 20);
    expect(r.length).toBeLessThanOrEqual(20);
    expect(r.endsWith("…")).toBe(true);
  });

  it("lo corto se queda tal cual", () => {
    expect(resumenNc("POR RECTIFICAR LONA.")).toBe("POR RECTIFICAR LONA.");
  });
});

// Una NC de prueba: lo que no se diga, vacío.
const ncCon = (p: Partial<NoConformidad>): NoConformidad => ({
  codigo: "NC000001", fecha: "2026-10-01", pedido: "AR.26.00001", rectificativo: null,
  proceso1: null, proceso2: null, origen: null, descripcion: "", comentarios: "", cerrada: false,
  causas: [], defectos: [], tareasDe: [], familias: [], ...p,
});
const causa = (tipo: string, linea: string, contribucion: number | null = null, defecto = 1): CausaNc => {
  const { responsable, texto } = partirCausa(`${linea}\n\nlo que pasó`);
  return { tipo, responsable, quien: quienesEn(responsable), contribucion, defecto, texto };
};
const PLANTEO = "ERROR EN PLANTEAMIENDO O DISEÑO GRAFICO";

describe("quienesEn: a quién nombra la primera línea de una causa", () => {
  it("reconoce el nombre suelto, con tildes o sin ellas", () => {
    expect(quienesEn("TAMARA")).toEqual(["tamara"]);
    expect(quienesEn("Adrián Quinteiro Vaamonde")).toEqual(["adrian"]);
    expect(quienesEn("ADRIAN- Falta de formación.")).toEqual(["adrian"]);
  });

  it("saca a los nuestros de una línea con varios", () => {
    expect(quienesEn("Juan Castro y Adrián Quinteiro Vaamonde,")).toEqual(["adrian"]);
    expect(quienesEn("Manuel Gómez y Ángel,")).toEqual(["angel", "manuel"]);
  });

  it("no confunde a otro Manuel de fábrica con Manuel Gómez", () => {
    expect(quienesEn("Manuel Rivadulla")).toEqual([]);
  });

  it("Lucía Guillín cuenta como de OT", () => {
    expect(quienesEn("LUCIA GUILLIN")).toEqual(["lucia"]);
  });

  it("solo palabras enteras: «SEBASTIAN» no es Iván", () => {
    expect(quienesEn("SEBASTIAN")).toEqual([]);
  });
});

describe("partirCausa", () => {
  it("separa a la persona del resto y le quita la puntuación del final", () => {
    expect(partirCausa("TAMARA,\r\n\r\nPlanteó la inclinación al revés.")).toEqual({
      responsable: "TAMARA",
      texto: "Planteó la inclinación al revés.",
    });
  });
});

describe("de qué sección es una NC", () => {
  it("la causa de planteamiento de Tamara es de OT, y no de Diseño aunque el pedido tenga tareas suyas", () => {
    const nc = ncCon({ causas: [causa(PLANTEO, "TAMARA", 50)], tareasDe: ["ot", "diseno"] });
    expect(deLaSeccion(nc, "ot")).toBe("causa");
    expect(deLaSeccion(nc, "diseno")).toBe(null);
  });

  it("una causa de fábrica que nombra a alguien nuestro NO la hace nuestra", () => {
    const nc = ncCon({ causas: [causa("ERROR AL CONFECCIONAR O PRODUCIR", "IVAN")], tareasDe: ["ot"] });
    expect(deLaSeccion(nc, "ot")).toBe(null);
    expect(esMia(nc, "ivan")).toBe(false);
  });

  it("la de Carrón es de Diseño y la de Manuel Gómez de Impresión", () => {
    expect(seccionesDe(ncCon({ causas: [causa(PLANTEO, "CARRON")] }))).toEqual(["diseno"]);
    expect(seccionesDe(ncCon({ causas: [causa(PLANTEO, "MANUEL GOMEZ")] }))).toEqual(["impresion"]);
  });

  it("una causa de planteamiento sin nadie reconocido va a la sección de las tareas", () => {
    expect(seccionesDe(ncCon({ causas: [causa(PLANTEO, "FALLO INFORMATICO")], tareasDe: ["diseno"] }))).toEqual(["diseno"]);
  });

  it("sin causas, pendiente de investigar en la sección de las tareas, si el proceso no la descarta", () => {
    expect(deLaSeccion(ncCon({ tareasDe: ["ot"] }), "ot")).toBe("pendiente");
    expect(deLaSeccion(ncCon({ tareasDe: ["ot"], proceso1: "DISEÑO" }), "ot")).toBe("pendiente");
    expect(deLaSeccion(ncCon({ tareasDe: ["ot"], proceso1: "COMPRAS" }), "ot")).toBe(null);
    expect(deLaSeccion(ncCon({ tareasDe: ["diseno"] }), "ot")).toBe(null);
  });

  it("es mía si una causa de planteamiento me nombra", () => {
    expect(esMia(ncCon({ causas: [causa(PLANTEO, "ADRIAN")] }), "adrian")).toBe(true);
    expect(esMia(ncCon({ causas: [causa(PLANTEO, "ADRIAN")] }), "tamara")).toBe(false);
  });
});

describe("totalesNc", () => {
  it("cuenta la empresa, lo nuestro por sección y lo que falta por investigar", () => {
    const t = totalesNc([
      ncCon({ rectificativo: "AR.26.1", causas: [causa(PLANTEO, "TAMARA")], proceso1: "DISEÑO" }),
      ncCon({ rectificativo: "AR.26.2", causas: [causa(PLANTEO, "TAMARA"), causa(PLANTEO, "CARRON")], proceso2: "DISEÑO" }),
      ncCon({ rectificativo: "AR.26.3", causas: [causa("ERROR AL CONFECCIONAR O PRODUCIR", "JOSE")], proceso1: "PRODUCCIÓN" }),
      ncCon({}),
    ]);
    expect(t).toMatchObject({
      total: 4, rectificadas: 3, nuestras: 2, nuestrasRectificadas: 2, sinInvestigar: 1,
      disenoPrincipal: 1, disenoSecundario: 1,
    });
    expect(t.porSeccion.ot).toMatchObject({ n: 2, rectificadas: 2 });
    expect(t.porSeccion.diseno).toMatchObject({ n: 1, rectificadas: 1 });
    expect(t.porSeccion.impresion).toMatchObject({ n: 0, rectificadas: 0 });
  });
});

describe("repartoNc: cuánto de la NC es de quién", () => {
  // NC010178 tal cual: defecto 1 (medidas) y defecto 2 (polea), cada uno 100 %.
  const nc010178 = ncCon({
    tareasDe: ["ot"],
    causas: [
      causa("DOCUMENTAR MAL", "OSCAR", 80, 1),
      causa(PLANTEO, "TAMARA", 10, 1),
      causa("ERROR O DEFECTO AL INSTALAR O ENTREGAR", "LOIS", 10, 1),
      causa("ERROR AL CONFECCIONAR O PRODUCIR", "Las poleas", 50, 2),
      causa("ERROR O DEFECTO AL INSTALAR O ENTREGAR", "LOIS", 50, 2),
    ],
  });

  it("cada defecto vale la mitad, y dentro manda el % de Calidad: Tamara se queda en un 5 %", () => {
    const r = repartoNc(nc010178);
    expect(r.nuestro).toBeCloseTo(0.05);
    expect(r.secciones.ot).toBeCloseTo(0.05);
    expect(r.personas.tamara).toBeCloseTo(0.05);
    expect(r.otros["DOCUMENTAR MAL"]).toBeCloseTo(0.4);
    expect(r.otros["ERROR O DEFECTO AL INSTALAR O ENTREGAR"]).toBeCloseTo(0.3);
  });

  it("y por eso OT no es la causa mayor de NC010178, ni Tamara", () => {
    expect(causaMayor(nc010178, "ot")).toBe("menor");
    expect(soyCausaMayor(nc010178, "tamara")).toBe(false);
  });

  it("una sola causa con el % a 0 se lleva todo su defecto", () => {
    const r = repartoNc(ncCon({ causas: [causa(PLANTEO, "ADRIAN", 0)] }));
    expect(r.nuestro).toBeCloseTo(1);
    expect(causaMayor(ncCon({ causas: [causa(PLANTEO, "ADRIAN", 0)] }), "ot")).toBe("mayor");
  });

  it("dos personas en la misma causa se la reparten, cada una en su sección", () => {
    const r = repartoNc(ncCon({ causas: [causa(PLANTEO, "Manuel Gómez y Ángel", 100)] }));
    expect(r.secciones.impresion).toBeCloseTo(0.5);
    expect(r.secciones.ot).toBeCloseTo(0.5);
  });

  it("un empate con otra causa cuenta como causa mayor", () => {
    const nc = ncCon({ causas: [causa(PLANTEO, "JAIME", 50), causa("DOCUMENTAR MAL", "JESUS", 50)] });
    expect(causaMayor(nc, "ot")).toBe("mayor");
  });

  it("sin parte de la sección, ni mayor ni menor", () => {
    expect(causaMayor(nc010178, "diseno")).toBe(null);
  });

  it("los totales pesan: NC010178 suma 0,05 a OT y no es causa mayor", () => {
    const t = totalesNc([{ ...nc010178, rectificativo: "AR.26.05101" }]);
    expect(t.nuestras).toBe(1);
    expect(t.nuestrasPeso).toBeCloseTo(0.05);
    expect(t.nuestrasRectificadasPeso).toBeCloseTo(0.05);
    expect(t.nuestrasMayor).toBe(0);
    expect(t.porSeccion.ot).toMatchObject({ n: 1, mayor: 0 });
    expect(t.porSeccion.ot.peso).toBeCloseTo(0.05);
  });
});

describe("rectificadosPorFamilia", () => {
  const toldo = { familia: "TOLDO", secciones: ["ot"] as SeccionId[] };
  const lona = { familia: "LONA", secciones: ["ot"] as SeccionId[] };
  const rotulo = { familia: "ROTULO", secciones: ["diseno"] as SeccionId[] };

  it("cuenta rectificados por familia y la culpa media solo entre los investigados", () => {
    const filas = rectificadosPorFamilia([
      ncCon({ rectificativo: "R1", tareasDe: ["ot"], familias: [toldo], causas: [causa(PLANTEO, "TAMARA", 100)] }),
      ncCon({ rectificativo: "R2", tareasDe: ["ot"], familias: [toldo], causas: [causa(PLANTEO, "JAIME", 50), causa("DOCUMENTAR MAL", "JESUS", 50)] }),
      // Sin investigar: suma al rectificado, no a la culpa media.
      ncCon({ rectificativo: "R3", tareasDe: ["ot"], familias: [toldo] }),
      ncCon({ rectificativo: "R4", tareasDe: ["ot"], familias: [lona], causas: [causa("ERROR AL CONFECCIONAR O PRODUCIR", "JOSE", 100)] }),
    ], "ot");
    expect(filas.map((f) => f.familia)).toEqual(["TOLDO", "LONA"]);
    expect(filas[0]).toMatchObject({ rectificados: 3, conCausa: 2, investigados: 2 });
    expect(filas[0].culpaMedia).toBeCloseTo(0.75);
    expect(filas[1]).toMatchObject({ rectificados: 1, conCausa: 0, investigados: 1, culpaMedia: 0 });
  });

  it("sin rectificativo no entra, ni pedidos sin tareas de la sección", () => {
    expect(rectificadosPorFamilia([
      ncCon({ tareasDe: ["ot"], familias: [toldo] }),
      ncCon({ rectificativo: "R1", tareasDe: ["diseno"], familias: [rotulo] }),
    ], "ot")).toEqual([]);
  });

  it("solo las familias de las OF donde la sección tiene tareas", () => {
    const filas = rectificadosPorFamilia([
      ncCon({ rectificativo: "R1", tareasDe: ["ot", "diseno"], familias: [toldo, rotulo] }),
    ], "diseno");
    expect(filas.map((f) => f.familia)).toEqual(["ROTULO"]);
    expect(filas[0].culpaMedia).toBeNull();
  });
});
