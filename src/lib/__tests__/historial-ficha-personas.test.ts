import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OFsDeLaFicha } from "../../components/HistorialCentros";
import type { HistorialOF } from "../historial";

const veces = (html: string, texto: string) => html.split(texto).length - 1;
const pinta = (ofs: HistorialOF[], sinMaterial = false) =>
  renderToStaticMarkup(createElement(OFsDeLaFicha, { ofs, seccion: "ot", sinMaterial }));

/** Una OF con el desglose de tareas que trae el detalle del Historial. */
const conTareas = (
  codigo: string,
  centro: HistorialOF["centro"],
  tareas: { codigo: string; descripcion: string; personas: { nombre: string; min: number }[] }[],
): HistorialOF => {
  const total = tareas.reduce((n, t) => n + t.personas.reduce((m, p) => m + p.min, 0), 0);
  return {
    codigo,
    descripcion: `OF ${codigo}`,
    centro,
    tiempoImputadoMin: total,
    quien: [...new Set(tareas.flatMap((t) => t.personas.map((p) => p.nombre)))],
    tareas: tareas.map((t) => ({
      codigo: t.codigo,
      descripcion: t.descripcion,
      tiempoImputadoMin: t.personas.reduce((m, p) => m + p.min, 0),
      personas: t.personas,
    })),
  };
};


describe("las fichas comparten el desglose por centro de Pendientes", () => {
  it("agrupa primero por centro, con sus OF y los tiempos por persona", () => {
    const html = pinta([
      conTareas("1", "taller", [{ codigo: "7", descripcion: "CORTAR", personas: [{ nombre: "María", min: 38 }, { nombre: "Teresa", min: 38 }] }]),
      conTareas("2", "taller", [{ codigo: "8", descripcion: "SOLDAR", personas: [{ nombre: "Teresa", min: 60 }] }]),
    ]);
    expect(veces(html, ">Taller<")).toBe(1);
    expect(html.indexOf(">Taller<")).toBeLessThan(html.indexOf("OF 1"));
    expect(html.indexOf("OF 1")).toBeLessThan(html.indexOf("OF 2"));
    expect(html).toContain("2h 16m");
    expect(html).toContain("María 38m · Teresa 38m");
    expect(html).toContain("Teresa 1h");
    expect(html).not.toContain("Abrir todas");
  });

  it("sin rayas (27/10/2026): cada tarea con su tiempo, y «—» en la que no tiene", () => {
    const html = pinta([conTareas("1", "taller", [
      { codigo: "7", descripcion: "CORTAR", personas: [{ nombre: "María", min: 30 }] },
      { codigo: "8", descripcion: "SOLDAR", personas: [{ nombre: "Teresa", min: 10 }] },
      { codigo: "9", descripcion: "EMBALAR", personas: [] },
    ])]);
    expect(html).not.toContain("absolute bottom-0");
    expect(html).toContain("EMBALAR");
    expect(html).toContain("—");
    expect(html).not.toContain(">0m<");
  });

  it("enseña también quién trabajó en Taller aunque tenga tareas de OT", () => {
    const html = pinta([
      conTareas("1", "ot", [{ codigo: "1", descripcion: "PLANTEAR", personas: [{ nombre: "Iván", min: 20 }] }]),
      conTareas("1", "taller", [{ codigo: "7", descripcion: "CORTAR", personas: [{ nombre: "María", min: 30 }] }]),
    ]);
    expect(html).toContain("Iván 20m");
    expect(html).toContain("María 30m");
    // Lo que se ve, sin la pista al pasar el ratón (`title`), que la repite.
    expect(veces(html.replace(/ title="[^"]*"/g, ""), "María")).toBe(1);
  });

  it("conserva las personas de las OF antiguas sin tareas", () => {
    const html = pinta([{ codigo: "1", descripcion: "OF antigua", centro: "ot", tiempoImputadoMin: 20, quien: ["Iván"], personas: [{ nombre: "Iván", min: 20 }] }]);
    expect(html).toContain("Esta OF no tiene tareas en RPS");
    expect(html).toContain("Iván");
    expect(html).toContain("20m");
  });

  it("la ficha pública no pinta material ni notas de Producción", () => {
    const entrada = { ...conTareas("1", "taller", [{ codigo: "7", descripcion: "CORTAR", personas: [{ nombre: "María", min: 30 }] }]), materiales: [{ texto: "MATERIAL PRIVADO", apartado: true }], notasProduccion: "NOTA PRIVADA" };
    const html = pinta([entrada], true);
    expect(html).toContain("María 30m");
    expect(html).not.toContain("MATERIAL PRIVADO");
    expect(html).not.toContain("NOTA PRIVADA");
    expect(html).not.toContain("Gastado");
  });

  it("conserva un revisor deducido sin minutos ni tareas, sin inventarle tiempo", () => {
    const html = pinta([{ codigo: "1", descripcion: "OF antigua", centro: "ot", tiempoImputadoMin: 20, quien: [], personas: [{ nombre: "Iván", min: 20 }], rolDeducido: { quienPlanteo: ["Iván"], quienReviso: ["Jaime"] } }]);
    expect(veces(html, "Jaime")).toBe(1);
    expect(html).toContain("Revisor");
    expect(html).toContain("Deducido de las horas de RPS");
    expect(html).toContain("&lt;1m");
  });
});

describe("los papeles de la web, también en las tareas", () => {
  it("cada nombre de la tarea lleva Autor o Revisor según lo registrado", () => {
    const base = conTareas("0232926", "ot", [
      {
        codigo: "5",
        descripcion: "PLANTEAR Y PREPARAR ARCHIVOS MAQ. DE CORTE",
        personas: [
          { nombre: "Iván Sánchez", min: 33 },
          { nombre: "Jaime Vázquez", min: 4 },
        ],
      },
    ]);
    const html = pinta([{
      ...base,
      personas: [{ nombre: "Iván Sánchez", min: 33 }, { nombre: "Jaime Vázquez", min: 4 }],
      autorRegistrado: "Iván Sánchez",
      revisorRegistrado: "Jaime Vázquez",
    }]);
    // Desplegada, quién y cuánto lo dice la tarea; la fila de la OF no lo
    // repite (Iván, 09/10/2026: «que no se dupliquen»).
    expect(veces(html, ">Autor<")).toBe(1);
    expect(veces(html, ">Revisor<")).toBe(1);
    expect(veces(html, "Jaime Vázquez")).toBe(1);
    expect(html).toContain("33m");
    expect(html).toContain("4m");
  });

  it("sin registro, el rol deducido de las horas sale en gris y avisando", () => {
    const base = conTareas("0232902", "ot", [
      { codigo: "5", descripcion: "PLANTEAR", personas: [{ nombre: "Tamara Villar", min: 13 }, { nombre: "Jaime Vázquez", min: 4 }] },
    ]);
    const html = pinta([{
      ...base,
      personas: [{ nombre: "Tamara Villar", min: 13 }, { nombre: "Jaime Vázquez", min: 4 }],
      rolDeducido: { quienPlanteo: ["Tamara Villar"], quienReviso: ["Jaime Vázquez"] },
    }]);
    expect(html).toContain("Deducido de las horas de RPS");
    expect(veces(html, ">Autor<")).toBe(1);
  });
});

describe("el revisor de menos de un minuto, dentro de su tarea", () => {
  it("sale en la tarea con <1m y no se repite en la fila", () => {
    // AR.26.04928: RPS guarda a Iván en PLANTEAR con 0 minutos.
    const base = conTareas("0232832", "ot", [
      { codigo: "1", descripcion: "PLANTEAR", personas: [{ nombre: "Tamara Villar", min: 6 }, { nombre: "Iván Sánchez", min: 0 }] },
    ]);
    const html = pinta([{
      ...base,
      personas: [{ nombre: "Tamara Villar", min: 6 }, { nombre: "Iván Sánchez", min: 0 }],
      rolDeducido: { quienPlanteo: ["Tamara Villar"], quienReviso: ["Iván Sánchez"] },
    }]);
    expect(veces(html, "Iván Sánchez")).toBe(1);
    expect(html).toContain("&lt;1m");
    expect(veces(html, ">Revisor<")).toBe(1);
  });
});

describe("cada centro con su propio papel", () => {
  it("una OF con Diseño y OT rotula las tareas de los dos centros", () => {
    // AR.26.04906: se tomaba el papel del primer centro (Diseño, Carrón) para
    // todos y las tareas de OT salían sin Autor ni Revisor.
    const diseno = conTareas("0232827", "diseno", [
      { codigo: "9", descripcion: "DISEÑAR ROTULACION", personas: [{ nombre: "José Luis Carrón", min: 10 }] },
    ]);
    const ot = conTareas("0232827", "ot", [
      {
        codigo: "5",
        descripcion: "PLANTEAR Y PREPARAR ARCHIVO MAQ. DE CORTE",
        personas: [{ nombre: "Iván Sánchez", min: 24 }, { nombre: "Jaime Vázquez", min: 3 }],
      },
    ]);
    const html = pinta([
      { ...diseno, rolDeducido: { quienPlanteo: ["José Luis Carrón"], quienReviso: [] } },
      { ...ot, rolDeducido: { quienPlanteo: ["Iván Sánchez"], quienReviso: ["Jaime Vázquez"] } },
    ]);
    expect(veces(html, ">Autor<")).toBe(2); // Carrón en Diseño, Iván en OT
    expect(veces(html, ">Revisor<")).toBe(1); // Jaime en OT
  });
});
