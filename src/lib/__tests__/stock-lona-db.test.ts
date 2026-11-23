import { expect, test, vi } from "vitest";
import { guardarStockLona, leerStockLona, validarStockLona } from "../server/stock-lona-db";
import { getDb } from "../server/estado-db";
import { correosParaEnviar, leerCorreosDe, reenviarUltimo } from "../server/correo-cola";

vi.hoisted(() => { process.env.COORDINA_DB_PATH = ":memory:"; });
const entrada = { pedido: " ar2605016 ", cliente: "Bar", ofs: ["123"], consultadoPor: "Iván",
  consultado: "2026-11-23T11:40:00.000Z",
  lonas: [{ codigo: "LV1", descripcion: "PVC", ml: 42.3, porOf: { "123": 42.3 } }],
  faltas: [{ codigo: "LV1", descripcion: "PVC", necesita: 42.3, disponible: 18.75 }] };

test("normaliza el pedido y reemplaza la comprobación incluidas las faltas resueltas", () => {
  const s = validarStockLona(entrada)!;
  expect(s.pedido).toBe("AR.26.05016");
  guardarStockLona(s);
  expect(leerStockLona(s.pedido)).toMatchObject(s);
  guardarStockLona({ ...s, faltas: [] });
  expect(leerStockLona(s.pedido)?.faltas).toEqual([]);
});

test.each([{ pedido: "" }, { faltas: [{ ...entrada.faltas[0], disponible: -1 }] },
  { lonas: Array(51).fill(entrada.lonas[0]) }])("rechaza datos inválidos", cambio => {
  expect(validarStockLona({ ...entrada, ...cambio })).toBeNull();
});

test("el historial y Reenviar excluyen stock, la cola de envío lo recoge", async () => {
  getDb().exec("INSERT INTO planteamiento_correo (tipo,pedido_id,ficheros,para,asunto,estado,creado_at,proximo_at) VALUES ('stock','P','[]','[]','Falta material','pendiente','2026','2026')");
  expect(leerCorreosDe("P")).toEqual([]);
  expect(await reenviarUltimo("P", "ivan")).toBe(false);
  expect(correosParaEnviar(new Date("2027-01-01"))[0].asunto).toBe("Falta material");
});
