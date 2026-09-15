import { beforeAll, expect, test } from "vitest";

// Documenta la regla que usa `app/page.tsx` para repartir entre la consulta y
// el tablero: no reimplementa sesion.ts, solo fija su contrato para que un
// cambio ahí que rompa el reparto falle aquí primero.

let sesion: typeof import("../server/sesion");

beforeAll(async () => {
  process.env.COORDINA_SESION_SECRET = "secreto-de-pruebas";
  sesion = await import("../server/sesion");
});

test("apagado, nadie es invitado: la web es la de siempre", () => {
  process.env.COORDINA_LOGIN = "off";
  expect(sesion.loginActivo()).toBe(false);
});

test("encendido y sin cookie, quienEs no da nadie: eso es un invitado", () => {
  process.env.COORDINA_LOGIN = "activo";
  expect(sesion.quienEs(new Request("http://x/"))).toBeNull();
});
