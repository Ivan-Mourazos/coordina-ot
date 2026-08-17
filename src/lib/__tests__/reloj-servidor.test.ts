import { describe, expect, it } from "vitest";
import {
  DESFASE_MINIMO_MS,
  ahoraDelServidor,
  desfaseDeCabecera,
} from "../reloj-servidor";

// El caso real que motivó esto: el 16/08/2026 el servidor de producción iba 60
// segundos por delante del PC de la oficina. Como las horas del fichaje las
// sella el servidor, el contador restaba dos relojes distintos, salía negativo
// y se quedaba clavado en 0:00:00 durante ese minuto.

describe("desfaseDeCabecera", () => {
  it("mide cuánto va el servidor por delante", () => {
    const local = Date.parse("2026-08-16T10:00:00.000Z");
    const cabecera = new Date(local + 60_000).toUTCString();
    // La cabecera Date va al segundo, así que se compara con esa tolerancia.
    expect(desfaseDeCabecera(cabecera, local)).toBeCloseTo(60_000, -3);
  });

  it("y también por detrás, con signo negativo", () => {
    const local = Date.parse("2026-08-16T10:00:00.000Z");
    const cabecera = new Date(local - 45_000).toUTCString();
    expect(desfaseDeCabecera(cabecera, local)).toBeCloseTo(-45_000, -3);
  });

  it("sin cabecera no se inventa un desfase", () => {
    expect(desfaseDeCabecera(null, Date.now())).toBeNull();
  });

  it("una cabecera ilegible tampoco", () => {
    expect(desfaseDeCabecera("ayer por la tarde", Date.now())).toBeNull();
  });
});

describe("ahoraDelServidor", () => {
  const local = Date.parse("2026-08-16T10:00:00.000Z");

  it("corrige el desfase grande", () => {
    expect(ahoraDelServidor(60_000, local)).toBe(local + 60_000);
  });

  it("sin medida, la hora local tal cual", () => {
    expect(ahoraDelServidor(null, local)).toBe(local);
  });

  it("un desfase pequeño no se toca: es medida, no reloj", () => {
    // Por debajo del mínimo lo que se está midiendo es el viaje de ida y vuelta
    // y el redondeo al segundo de la cabecera, no que los relojes difieran.
    expect(ahoraDelServidor(DESFASE_MINIMO_MS - 1, local)).toBe(local);
    expect(ahoraDelServidor(-(DESFASE_MINIMO_MS - 1), local)).toBe(local);
  });

  it("justo por encima del mínimo sí corrige", () => {
    expect(ahoraDelServidor(DESFASE_MINIMO_MS, local)).toBe(local + DESFASE_MINIMO_MS);
  });

  it("el contador deja de salir negativo con el servidor adelantado", () => {
    // Lo que se veía: se ficha, el servidor sella `inicio` con SU hora (60 s por
    // delante) y el navegador calcula inicio - ahoraLocal = -60 s.
    const inicioServidor = local + 60_000;
    expect((local - inicioServidor) / 1000).toBe(-60); // antes: recortado a 0
    const conCorreccion = (ahoraDelServidor(60_000, local) - inicioServidor) / 1000;
    expect(conCorreccion).toBe(0); // ahora arranca en cero y sube de verdad
  });
});
