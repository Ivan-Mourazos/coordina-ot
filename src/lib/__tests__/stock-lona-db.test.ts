import { expect, test, vi } from "vitest";
import { guardarStockLona, leerStockLona, validarStockLona } from "../server/stock-lona-db";
import { getDb } from "../server/estado-db";
import { correosParaEnviar, leerCorreosDe, reenviarUltimo } from "../server/correo-cola";

vi.hoisted(() => { process.env.COORDINA_DB_PATH = ":memory:"; });
const entrada = { pedido: " ar2605016 ", entrega: null, cliente: "Bar", ofs: ["123", "124"], consultadoPor: "Iván",
  consultado: "2026-11-23T11:40:00.000Z",
  lonas: [{ codigo: "LV1", descripcion: "PVC", ml: 42.3, ofs: ["123"], origen: "corte" }],
  faltas: [{ codigo: "LV1", descripcion: "PVC", necesita: 42.3, disponible: 18.75, ofs: ["123"] }] };

test("guarda cada entrega, usa 0 para null y solo reemplaza con una consulta posterior", () => {
  const s = validarStockLona(entrada)!;
  expect(s.pedido).toBe("AR.26.05016");
  guardarStockLona(s);
  const segunda = { ...s, entrega: 2, ofs: ["124"], faltas: [{ ...s.faltas[0], ofs: ["124"] }],
    consultado: "2026-11-23T11:50:00Z" };
  guardarStockLona(segunda);
  guardarStockLona({ ...s, entrega: 0, faltas: [] });
  guardarStockLona({ ...s, consultado: "2026-11-23T10:40:00Z", faltas: [] });
  expect(leerStockLona(s.pedido, s.ofs)).toMatchObject([
    { entrega: 2, faltas: segunda.faltas },
    { entrega: 0, faltas: s.faltas },
  ]);
  guardarStockLona({ ...s, consultado: "2026-11-23T11:45:00Z", faltas: [] });
  expect(leerStockLona(s.pedido, s.ofs)).toMatchObject([{ entrega: 2, faltas: segunda.faltas }]);
  expect(getDb().prepare("SELECT entrega FROM stock_lona_entrega ORDER BY entrega").all()).toEqual([{ entrega: 0 }, { entrega: 2 }]);
});

test.each(["corte", "reserva", "manual"])("acepta el origen %s", origen => {
  expect(validarStockLona({ ...entrada, lonas: [{ ...entrada.lonas[0], origen }] })?.lonas[0].origen).toBe(origen);
});

test.each([{ pedido: "" }, { entrega: undefined }, { entrega: "2" }, { entrega: 1.5 }, { consultadoPor: undefined },
  { extra: true }, { consultado: "23 nov 2026" }, { consultado: "2026-02-30T11:40:00Z" },
  { faltas: [{ ...entrada.faltas[0], disponible: -1 }] },
  { faltas: [{ ...entrada.faltas[0], disponible: entrada.faltas[0].necesita }] },
  { faltas: [{ ...entrada.faltas[0], ofs: ["otra"] }] },
  { faltas: [{ ...entrada.faltas[0], origen: "reserva" }] },
  { lonas: [{ ...entrada.lonas[0], porOf: { "123": 42.3 } }] },
  { lonas: [{ ...entrada.lonas[0], origen: "otro" }] },
  { lonas: Array(51).fill(entrada.lonas[0]) }])("rechaza datos inválidos", cambio => {
  expect(validarStockLona({ ...entrada, ...cambio })).toBeNull();
});

test("elige por OF la comprobación más reciente, incluso si esa OF ya tiene stock", () => {
  const s = validarStockLona({ ...entrada, pedido: "AR2605017" })!;
  guardarStockLona({ ...s, faltas: [{ ...s.faltas[0], ofs: s.ofs }] });
  guardarStockLona({ ...s, entrega: 3, ofs: ["124"], faltas: [], consultado: "2026-11-23T12:40:00Z" });
  expect(leerStockLona(s.pedido, ["124"])).toEqual([]);
  expect(leerStockLona(s.pedido, ["125"])).toEqual([]);
  expect(leerStockLona(s.pedido, ["123", "124"])).toMatchObject([
    { entrega: 0, faltas: [{ ...s.faltas[0], ofs: ["123", "124"] }] },
  ]);
});

test("el historial y Reenviar excluyen stock, la cola de envío lo recoge", async () => {
  getDb().exec("INSERT INTO planteamiento_correo (tipo,pedido_id,ficheros,para,asunto,estado,creado_at,proximo_at) VALUES ('stock','P','[]','[]','Falta material','pendiente','2026','2026')");
  expect(leerCorreosDe("P")).toEqual([]);
  expect(await reenviarUltimo("P", "ivan")).toBe(false);
  expect(correosParaEnviar(new Date("2027-01-01"))[0].asunto).toBe("Falta material");
});
