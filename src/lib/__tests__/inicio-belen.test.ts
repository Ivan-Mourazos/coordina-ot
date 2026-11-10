import { expect, test } from "vitest";
import { comprometidasDeLaSemana } from "../../components/vista-belen/InicioBelen";
import type { FilaLista } from "../vista-belen-listas";

const fila = (clave: string, fechaComprometida: string, bultosSubidos: "SI" | "NO"): FilaLista => ({
  clave,
  of: clave,
  pedido: "AR.26.00001",
  fechaComprometida,
  bultosSubidos,
});

test("esta semana: las próximas 7 días, las vencidas de la última semana sin subir y las antiguas contadas", () => {
  const r = comprometidasDeLaSemana(
    [
      fila("marzo", "2026-03-06", "NO"),
      fila("antigua-subida", "2026-03-01", "SI"),
      fila("ayer-sin", "2026-11-09", "NO"),
      fila("ayer-subida", "2026-11-09", "SI"),
      fila("hoy", "2026-11-10", "NO"),
      fila("en7", "2026-11-17", "SI"),
      fila("en8", "2026-11-18", "NO"),
    ],
    "2026-11-10",
  );
  expect(r.proximas.map((f) => f.clave)).toEqual(["hoy", "en7"]);
  expect(r.vencidas.map((f) => f.clave)).toEqual(["ayer-sin"]);
  expect(r.antiguas).toBe(1);
});
