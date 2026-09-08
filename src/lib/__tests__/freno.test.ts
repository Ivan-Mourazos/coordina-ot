import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { apuntarFallo, olvidarFallos, tamanoDelFreno } from "../server/freno";

// ─── Purga del freno ─────────────────────────────────────────────────────────
// `apuntarFallo` se llama también con ids inventados (no hace falta sesión ni
// que la persona exista), así que sin purgar, el mapa crecería sin techo. Este
// test comprueba que SÍ se purga, sin medir milisegundos reales: usa el reloj
// falso de vitest para "esperar" el minuto de golpe.

beforeEach(() => {
  olvidarFallos();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  olvidarFallos();
});

test("por debajo del techo no se purga nada: no vale la pena recorrer el mapa", () => {
  for (let i = 0; i < 100; i++) apuntarFallo(`id-${i}`);
  expect(tamanoDelFreno()).toBe(100);
});

test("pasado el techo, las entradas caducadas desaparecen solas", () => {
  // 500 ids que ya no frenan a nadie (su minuto pasó hace rato)...
  for (let i = 0; i < 500; i++) apuntarFallo(`id-${i}`);
  vi.advanceTimersByTime(61_000);

  // ...y uno más fresco, que es el que hace que el mapa pase del techo y se
  // pare a mirar qué puede tirar.
  apuntarFallo("recien-llegado");

  // Las 500 caducadas se han ido; solo queda la que sigue viva.
  expect(tamanoDelFreno()).toBe(1);
});

test("una entrada que SÍ sigue frenando sobrevive a la purga", () => {
  for (let i = 0; i < 500; i++) apuntarFallo(`id-${i}`);
  // "tamara" falla justo antes de que las otras 500 caduquen: a ella todavía
  // le queda minuto cuando llega la 501.
  vi.advanceTimersByTime(30_000);
  apuntarFallo("tamara");
  vi.advanceTimersByTime(31_000);

  apuntarFallo("recien-llegado");

  expect(tamanoDelFreno()).toBe(2);
});
