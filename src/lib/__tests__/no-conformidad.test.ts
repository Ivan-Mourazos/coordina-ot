import { describe, expect, it } from "vitest";
import { deLaSeccion, esMia, papelDiseno, partirCausa, quienesEn, resumenNc, seccionesDe, sinClasificar, textoProcesos, totalesNc, type CausaNc, type NoConformidad } from "../no-conformidad";

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
  causas: [], tareasDe: [], ...p,
});
const causa = (tipo: string, linea: string, contribucion: number | null = null): CausaNc => {
  const { responsable, texto } = partirCausa(`${linea}\n\nlo que pasó`);
  return { tipo, responsable, quien: quienesEn(responsable), contribucion, texto };
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
    expect(t.porSeccion.ot).toEqual({ n: 2, rectificadas: 2 });
    expect(t.porSeccion.diseno).toEqual({ n: 1, rectificadas: 1 });
    expect(t.porSeccion.impresion).toEqual({ n: 0, rectificadas: 0 });
  });
});
