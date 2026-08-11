import { describe, expect, it } from "vitest";
import type { CompraOF } from "../types";
import { estadoMaterial, margenReserva } from "../types";

// El recorrido del material tiene tres manos —OT asigna, Almacén reserva,
// Compras pide— y lo que se pregunta mirando un pedido es siempre lo mismo:
// ¿está el material?, y si hay que comprarlo, ¿llega a tiempo?
//
// La lógica de "en qué punto está una compra" vive en MaterialChip. Aquí se fija
// su comportamiento con una copia mínima, para que no cambie sin querer.

function estado(c: CompraOF, hoy: string): string {
  if (c.recibida >= c.pedida && c.pedida > 0) return "recibido";
  const parcial = c.recibida > 0 ? ` (${c.recibida} de ${c.pedida})` : "";
  if (!c.estimada) return `pedido${parcial}`;
  const dm = `${c.estimada.slice(8, 10)}/${c.estimada.slice(5, 7)}`;
  return `${c.estimada < hoy ? "debía llegar" : "llega"} ${dm}${parcial}`;
}

const compra = (p: Partial<CompraOF> = {}): CompraOF => ({
  articulo: "TUBO 6M GALVANIZADO :30MM",
  pedida: 4,
  recibida: 0,
  fechaPedido: "2026-08-11",
  estimada: "2026-08-20",
  ...p,
});

describe("en qué punto está una compra", () => {
  const hoy = "2026-08-15";

  it("lo que ya llegó entero se da por recibido", () => {
    expect(estado(compra({ recibida: 4 }), hoy)).toBe("recibido");
  });

  it("lo que no ha llegado dice cuándo se espera", () => {
    expect(estado(compra(), hoy)).toBe("llega 20/08");
  });

  it("y si la fecha ya pasó, lo dice en pasado: eso es lo que para el trabajo", () => {
    expect(estado(compra({ estimada: "2026-08-10" }), hoy)).toBe("debía llegar 10/08");
  });

  it("una entrega a medias no es ni una cosa ni la otra, y se cuenta", () => {
    // Producción puede empezar con parte del material, así que "pedido" a secas
    // escondería que ya hay algo.
    expect(estado(compra({ recibida: 1 }), hoy)).toBe("llega 20/08 (1 de 4)");
  });

  it("sin fecha estimada no se inventa ninguna", () => {
    expect(estado(compra({ estimada: undefined }), hoy)).toBe("pedido");
  });

  it("la fecha se corta del ISO, no se pasa por new Date", () => {
    // `new Date("2026-08-20")` se interpreta en UTC y en España puede
    // devolver el día 19 al formatear.
    expect(estado(compra({ estimada: "2026-01-01" }), hoy)).toContain("01/01");
  });
});

describe("comparar lo reservado con lo asignado", () => {
  const m = (cantidad: number, reservada: number) => ({
    descripcion: "LONA ACRILICA MASACRIL 300",
    cantidad,
    reservada,
  });

  it("sin reservar es sin reservar", () => {
    expect(estadoMaterial(m(15, 0))).toBe("sinReservar");
  });

  it("cuadrado exacto: reservado (95,8 % de los casos reales)", () => {
    expect(estadoMaterial(m(15, 15))).toBe("reservado");
  });

  it("el redondeo de Almacén no cuenta como que falte material", () => {
    // Casos REALES de RPS: Almacén reserva con lo que hay en el rollo, no con
    // el decimal del escandallo.
    expect(estadoMaterial(m(3.9627416998, 3.97))).toBe("reservado"); // hacia arriba
    expect(estadoMaterial(m(7.3997979746, 7.4))).toBe("reservado");
    expect(estadoMaterial(m(6.725484, 6.72))).toBe("reservado"); // hacia abajo
    expect(estadoMaterial(m(18.5, 19))).toBe("reservado"); // al metro entero
    expect(estadoMaterial(m(3.25, 4))).toBe("reservado");
  });

  it("pero una falta de verdad sí se ve", () => {
    // También casos reales, y son otra cosa: aquí no hay material.
    expect(estadoMaterial(m(31, 6))).toBe("aMedias");
    expect(estadoMaterial(m(21, 19))).toBe("aMedias");
    expect(estadoMaterial(m(6.6, 5))).toBe("aMedias");
    expect(estadoMaterial(m(6, 1))).toBe("aMedias");
  });

  it("reservar de más es cubrir: sobra material, no falta", () => {
    expect(estadoMaterial(m(10, 12))).toBe("reservado");
  });

  it("el margen crece con la cantidad, pero nunca baja de 5 centésimas", () => {
    // Con 4 m, el 1 % serían 4 cm y eso es menos que el redondeo habitual.
    expect(margenReserva(4)).toBe(0.05);
    expect(margenReserva(300)).toBe(3);
  });
});
