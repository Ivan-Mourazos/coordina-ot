import { afterEach, beforeEach, expect, test } from "vitest";

// La promesa de docs/despliegue-login.md y .env.example: "con el login
// encendido y sin COORDINA_SESION_SECRET, la app no arranca". Se prueba
// llamando a `register()` de verdad —no un sustituto— porque es exactamente
// lo que corre Next antes de aceptar peticiones.
//
// register() también arranca `arrancarCierrePorInactividad` (un temporizador
// sin `unref`... en realidad CON `unref`, así que no cuelga el proceso) y, si
// DATASOURCE=rps, el resto de workers. Aquí DATASOURCE se borra a propósito
// para que register() vuelva justo después de esa primera pieza, sin tocar
// RPS ni OLANET.

const guardados = {
  NEXT_RUNTIME: process.env.NEXT_RUNTIME,
  COORDINA_LOGIN: process.env.COORDINA_LOGIN,
  COORDINA_SESION_SECRET: process.env.COORDINA_SESION_SECRET,
  DATASOURCE: process.env.DATASOURCE,
};

beforeEach(() => {
  process.env.NEXT_RUNTIME = "nodejs";
  delete process.env.DATASOURCE;
});

afterEach(async () => {
  for (const [k, v] of Object.entries(guardados)) {
    if (v === undefined) delete process.env[k as keyof typeof guardados];
    else process.env[k as keyof typeof guardados] = v;
  }
  // Deja el temporizador de cierre por inactividad limpio para el siguiente
  // fichero de test: idempotente, pero no hay razón para dejarlo corriendo.
  const { pararCierrePorInactividad } = await import("../server/fichaje-worker");
  pararCierrePorInactividad();
});

test("encendido y sin secreto, register() no deja arrancar", async () => {
  process.env.COORDINA_LOGIN = "activo";
  delete process.env.COORDINA_SESION_SECRET;
  const { register } = await import("../../instrumentation");
  await expect(register()).rejects.toThrow(/COORDINA_SESION_SECRET/);
});

test("apagado, register() arranca aunque falte el secreto", async () => {
  process.env.COORDINA_LOGIN = "off";
  delete process.env.COORDINA_SESION_SECRET;
  const { register } = await import("../../instrumentation");
  await expect(register()).resolves.not.toThrow();
});

test("encendido y CON secreto, register() arranca", async () => {
  // Que el corte sea "sin secreto" y no "login encendido" a secas: la
  // comprobación no puede ser una manera encubierta de impedir encenderlo.
  process.env.COORDINA_LOGIN = "activo";
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  const { register } = await import("../../instrumentation");
  await expect(register()).resolves.not.toThrow();
});
