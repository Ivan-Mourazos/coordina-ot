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

test("valida el origen de primer nivel y usa web si se omite", () => {
  expect(validarStockLona(entrada)?.origen).toBe("web");
  expect(validarStockLona({ ...entrada, origen: "web" })?.origen).toBe("web");
  expect(validarStockLona({ ...entrada, origen: "plano-manual" })?.origen).toBe("plano-manual");
  expect(validarStockLona({ ...entrada, origen: undefined })).toBeNull();
  expect(validarStockLona({ ...entrada, origen: "web", extra: true })).toBeNull();
});

test("el plano reemplaza sus OF, recorta las líneas compartidas y conserva las de otros planos", () => {
  const s = validarStockLona({ ...entrada, pedido: "AR.26.05064", ofs: ["123", "124", "125"] })!;
  const compartida = { ...s.faltas[0], codigo: "LV2", ofs: ["123", "124"] };
  const otra = { ...s.faltas[0], codigo: "LV3", ofs: ["125"] };
  const lonaCompartida = { ...s.lonas[0], codigo: "LV2", ofs: compartida.ofs };
  const otraLona = { ...s.lonas[0], codigo: "LV3", ofs: otra.ofs };
  guardarStockLona({ ...s, faltas: [...s.faltas, compartida, otra], lonas: [...s.lonas, lonaCompartida, otraLona] });
  // Simula una fila de antes de que el contrato incluyera el origen.
  getDb().prepare("UPDATE stock_lona_entrega SET datos = json_remove(datos, '$.origen') WHERE pedido_id = ?").run(s.pedido);

  const plano = { ...s, origen: "plano-manual" as const, ofs: ["123", "126"], consultado: "2026-11-23T11:50:00Z",
    faltas: [{ ...s.faltas[0], necesita: 60, ofs: ["126"] }], lonas: [{ ...s.lonas[0], ml: 60, ofs: ["126"] }] };
  guardarStockLona(plano);
  guardarStockLona({ ...plano, ofs: ["125"], lonas: [], faltas: [] });
  guardarStockLona({ ...plano, ofs: ["124"], lonas: [], faltas: [], consultado: s.consultado });
  const leido = () => JSON.parse((getDb().prepare("SELECT datos FROM stock_lona_entrega WHERE pedido_id = ?")
    .get(s.pedido) as { datos: string }).datos);
  expect(leido()).toEqual({
    cliente: s.cliente, origen: "plano-manual", ofs: ["123", "124", "125", "126"],
    faltas: [{ ...compartida, ofs: ["124"] }, otra, ...plano.faltas],
    lonas: [{ ...lonaCompartida, ofs: ["124"] }, otraLona, ...plano.lonas],
  });

  guardarStockLona({ ...s, origen: "web", ofs: ["123"], consultado: "2026-11-23T12:00:00Z" });
  expect(leido()).toEqual({ cliente: s.cliente, origen: "web", ofs: ["123"], faltas: s.faltas, lonas: s.lonas });
  expect(leerStockLona(s.pedido, ["124", "125", "126"])).toEqual([]);
});

test.each([{ pedido: "" }, { entrega: undefined }, { entrega: "2" }, { entrega: 1.5 }, { consultadoPor: undefined },
  { extra: true }, { consultado: "23 nov 2026" }, { consultado: "2026-02-30T11:40:00Z" },
  { faltas: [{ ...entrada.faltas[0], disponible: -1 }] },
  { faltas: [{ ...entrada.faltas[0], disponible: entrada.faltas[0].necesita }] },
  { faltas: [{ ...entrada.faltas[0], ofs: ["otra"] }] },
  { faltas: [{ ...entrada.faltas[0], origen: "reserva" }] },
  { faltas: [{ ...entrada.faltas[0], stock: 1257.8 }] },
  { faltas: [{ ...entrada.faltas[0], stock: 1257.8, reservado: 860 }] },
  { faltas: [{ ...entrada.faltas[0], stock: 1257.8, reservado: 860, reservadoOtros: 40 }] },
  { faltas: [{ ...entrada.faltas[0], stock: -1, reservado: 0, reservadoPropio: 0 }] },
  { faltas: [{ ...entrada.faltas[0], stock: 10, reservado: -1, reservadoPropio: 0 }] },
  { faltas: [{ ...entrada.faltas[0], stock: 10, reservado: 0, reservadoPropio: Number.NaN }] },
  { lonas: [{ ...entrada.lonas[0], porOf: { "123": 42.3 } }] },
  { lonas: [{ ...entrada.lonas[0], origen: "otro" }] },
  { lonas: Array(51).fill(entrada.lonas[0]) }])("rechaza datos inválidos", cambio => {
  expect(validarStockLona({ ...entrada, ...cambio })).toBeNull();
});

test("acepta y guarda faltas con la cuenta completa de 8 claves y conserva el formato de 5", () => {
  const conCuenta = {
    ...entrada,
    pedido: "AR.26.05099",
    faltas: [{ codigo: "PLAST880NEGRP204", descripcion: "PVC negro 204", necesita: 410.2, disponible: 397.8,
      stock: 1257.8, reservado: 860, reservadoPropio: 40, ofs: ["123"] }],
  };
  const validado = validarStockLona(conCuenta);
  expect(validado?.faltas[0]).toEqual({
    codigo: "PLAST880NEGRP204", descripcion: "PVC negro 204", necesita: 410.2, disponible: 397.8,
    stock: 1257.8, reservado: 860, reservadoPropio: 40, ofs: ["123"],
  });
  guardarStockLona(validado!);
  expect(leerStockLona("AR.26.05099", ["123"])[0].faltas[0]).toMatchObject({
    codigo: "PLAST880NEGRP204", stock: 1257.8, reservado: 860, reservadoPropio: 40, disponible: 397.8, necesita: 410.2,
  });

  const conCeros = validarStockLona({
    ...entrada,
    faltas: [{ ...entrada.faltas[0], disponible: 0, stock: 0, reservado: 0, reservadoPropio: 0 }],
  });
  expect(conCeros?.faltas[0]).toMatchObject({ stock: 0, reservado: 0, reservadoPropio: 0 });

  const sinCuenta = validarStockLona(entrada)!;
  expect(Object.keys(sinCuenta.faltas[0]).sort()).toEqual(["codigo", "descripcion", "disponible", "necesita", "ofs"]);
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
