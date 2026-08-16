import { describe, expect, it } from "vitest";
import { BONO_FIJO, MAQUINA_OT, type FilaBono } from "../bonos";
import { COBERTURA_OBJETIVO, contrastar, veredicto, type FilaOlanet } from "../contraste";

// Las horas van en segundos desde medianoche, como en la tabla: 36000 = 10:00.
const H = (hora: number) => hora * 3600;

const bono = (
  of: string,
  operario: string,
  ini: string,
  horaini: number,
  horafin: number,
  numope = "5",
): FilaBono => ({
  ...BONO_FIJO,
  of,
  numope,
  operario,
  maquina: MAQUINA_OT,
  ini,
  horaini,
  fin: ini,
  horafin,
  traspasado: 0,
});

/** La misma fila, tal como se lee de OLANET. */
const enTabla = (b: FilaBono): FilaOlanet => ({
  of: b.of,
  numope: b.numope,
  operario: b.operario,
  ini: b.ini,
  horaini: b.horaini,
  horafin: b.horafin,
});

describe("contrastar: quién escribió cada fila", () => {
  it("separa las nuestras de las de la herramienta vieja por la clave del bono", () => {
    const nuestro = bono("0230001", "195", "2026-08-13", H(10), H(11));
    // Mismo trabajo apuntado en la vieja: empieza unos minutos después, así que
    // su clave es otra aunque hable de la misma OF.
    const viejo = bono("0230001", "195", "2026-08-13", H(10) + 180, H(11));
    const c = contrastar([nuestro], [enTabla(nuestro), enTabla(viejo)]);
    expect(c.dias).toEqual([
      { dia: "2026-08-13", web: 60, vieja: 57, cobertura: 60 / 57 },
    ]);
  });

  // El fallo que tuvo esto al escribirlo: la cobertura era `web / (web+vieja)`,
  // así que un día en que las dos herramientas cuentan EXACTAMENTE lo mismo
  // —que es el objetivo— salía al 50 % y nunca se habría podido pasar a activo.
  it("dos cuentas iguales del mismo rato son cobertura 1, no 0,5", () => {
    const nuestro = bono("0230001", "195", "2026-08-13", H(10), H(12));
    const viejo = bono("0230001", "195", "2026-08-13", H(10) + 60, H(12) + 60);
    const c = contrastar([nuestro], [enTabla(nuestro), enTabla(viejo)]);
    expect(c.dias[0].cobertura).toBe(1);
  });

  it("si la vieja ya no se usa, la cobertura es 1: no queda nada que recoger", () => {
    const nuestro = bono("0230001", "195", "2026-08-13", H(10), H(12));
    expect(contrastar([nuestro], [enTabla(nuestro)]).dias[0].cobertura).toBe(1);
  });

  it("la web por encima de la vieja pasa de 1, y no se recorta", () => {
    const nuestro = bono("0230001", "195", "2026-08-13", H(8), H(12));
    const viejo = bono("0230001", "195", "2026-08-13", H(10), H(12));
    const c = contrastar([nuestro], [enTabla(nuestro), enTabla(viejo)]);
    expect(c.dias[0].cobertura).toBe(2);
  });

  it("un bono de la cola que no está en la tabla es un fallo de escritura", () => {
    const escrito = bono("0230001", "195", "2026-08-13", H(10), H(11));
    const perdido = bono("0230002", "195", "2026-08-13", H(12), H(13));
    const c = contrastar([escrito, perdido], [enTabla(escrito)]);
    expect(c.noEscritos).toEqual(["0230002|5|195|2026-08-13|43200"]);
  });

  it("sin nada en la tabla no hay cobertura que calcular, y no se inventa un 0 %", () => {
    expect(contrastar([], []).dias).toEqual([]);
  });
});

describe("contrastar: descuadres por OF", () => {
  it("deja pasar las diferencias por debajo del margen", () => {
    const nuestro = bono("0230001", "195", "2026-08-13", H(10), H(11));
    const viejo = bono("0230001", "195", "2026-08-13", H(10) + 60, H(11) - 240);
    const c = contrastar([nuestro], [enTabla(nuestro), enTabla(viejo)]);
    expect(c.descuadres).toEqual([]);
    expect({ cuadran: c.cuadran, total: c.total }).toEqual({ cuadran: 1, total: 1 });
  });

  it("saca la OF fichada en un sitio y no en el otro, la peor primero", () => {
    const soloWeb = bono("0230001", "195", "2026-08-13", H(8), H(9));
    const soloVieja = bono("0230002", "195", "2026-08-13", H(9), H(12));
    const c = contrastar([soloWeb], [enTabla(soloWeb), enTabla(soloVieja)]);
    expect(c.descuadres).toEqual([
      { of: "0230002", numope: "5", operario: "195", dia: "2026-08-13", web: 0, vieja: 180 },
      { of: "0230001", numope: "5", operario: "195", dia: "2026-08-13", web: 60, vieja: 0 },
    ]);
  });

  it("la misma OF de dos operarios son dos casos, no uno", () => {
    const a = bono("0230001", "195", "2026-08-13", H(8), H(9));
    const b = bono("0230001", "120", "2026-08-13", H(8), H(9));
    const c = contrastar([a, b], [enTabla(a), enTabla(b)]);
    expect(c.total).toBe(2);
  });
});

describe("veredicto", () => {
  /** Monta un contraste con la cobertura pedida por día: la vieja apunta
   *  siempre una hora y la web la fracción que se diga. */
  const conDias = (coberturas: number[]) => {
    const nuestros: FilaBono[] = [];
    const tabla: FilaOlanet[] = [];
    coberturas.forEach((cob, i) => {
      const d = `2026-08-${String(10 + i).padStart(2, "0")}`;
      const propio = bono("0230001", "195", d, H(8), H(8) + Math.round(cob * 3600));
      nuestros.push(propio);
      tabla.push(enTabla(propio));
      tabla.push(enTabla(bono("0230001", "195", d, H(12), H(13))));
    });
    return contrastar(nuestros, tabla);
  };

  it("un fallo de escritura manda sobre cualquier cobertura", () => {
    const bueno = bono("0230001", "195", "2026-08-13", H(8), H(9));
    const perdido = bono("0230002", "195", "2026-08-13", H(9), H(10));
    const c = contrastar([bueno, perdido], [enTabla(bueno)]);
    expect(veredicto(c).listo).toBe(false);
    expect(veredicto(c).motivo).toContain("no llegaron a OLANET");
  });

  it("con menos días de los pedidos no se decide", () => {
    expect(veredicto(conDias([1, 1]), 3).listo).toBe(false);
    expect(veredicto(conDias([1, 1]), 3).motivo).toContain("2 días");
  });

  it("un día flojo entre los últimos bloquea el paso a activo", () => {
    const v = veredicto(conDias([1, 0.4, 1]), 3);
    expect(v.listo).toBe(false);
    expect(v.motivo).toContain("40 %");
  });

  it("los días flojos del principio no cuentan si los últimos cuadran", () => {
    expect(veredicto(conDias([0.1, 0.3, 1, 1, 1]), 3).listo).toBe(true);
  });

  it("el objetivo no es el 100 %: un día justo por encima vale", () => {
    expect(veredicto(conDias(Array(3).fill(COBERTURA_OBJETIVO + 0.01)), 3).listo).toBe(true);
  });

  it("justo por debajo del objetivo, no", () => {
    expect(veredicto(conDias(Array(3).fill(COBERTURA_OBJETIVO - 0.05)), 3).listo).toBe(false);
  });
});
