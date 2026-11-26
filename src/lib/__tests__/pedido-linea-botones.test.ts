import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LineaRevisar } from "../../components/LineaRevisar";
import { PedidoLinea } from "../../components/PedidoLinea";
import { OPERARIOS, PEDIDOS } from "../mock";

const noop = () => {};

function pinta(opts: { fichandoYo?: boolean } = {}) {
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o) => ({ ...o, ajenaOT: false, detenida: false }));
  return renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase: "sinEmpezar" as const,
      onOpen: noop,
      onFichar: noop,
      onDesficharVarias: noop,
      completarPedido: noop,
      operarios: OPERARIOS,
      ofIdsFichandoYo: opts.fichandoYo ? new Set(ofs.map((o) => o.id)) : undefined,
    }),
  );
}

test("la fecha y la cuenta de OF no se esconden nunca: los botones van en su hueco", () => {
  // Antes los botones se superponían al final de la fila y la fecha y la
  // cuenta de OF se apartaban (`invisible`) para dejarles sitio. Desde el
  // 26/11/2026 van en su propio hueco y lo que cede es el cliente.
  const html = pinta();
  expect(html).not.toContain("group-hover:invisible");
  expect(html).not.toMatch(/text-\[10px\][^"]*\binvisible\b/);
});

test("con mi reloj en marcha, «Pausar» está siempre a la vista y la fecha también", () => {
  const html = pinta({ fichandoYo: true });
  expect(html).toContain("Pausar");
  expect(html).not.toMatch(/text-\[10px\][^"]*\binvisible\b/);
});

test("los tiempos de la fila van en minutos enteros, sin segundos", () => {
  // "14m 7s" al lado de "36m" y "42m": en una lista que se recorre con la
  // vista, los segundos son ruido.
  expect(pinta()).not.toMatch(/\d+m \d+s/);
});

test("una OF detenida dice POR QUÉ no se puede fichar, en vez de no ofrecer nada", () => {
  // La regla es correcta —Producción la paró, no admite fichaje— pero desde la
  // fila no se veía: no había botón ni explicación, y parecía que la web se
  // había roto.
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o) => ({ ...o, ajenaOT: false, detenida: true }));
  const html = renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase: "sinEmpezar" as const,
      onOpen: noop, onFichar: noop, onDesficharVarias: noop, completarPedido: noop,
      operarios: OPERARIOS,
    }),
  );
  expect(html).toContain("Detenida por Producción");
  expect(html).not.toContain("⏱ Fichar");
});

const pintaFase = (fase: "esperandoRevision" | "sinEmpezar", cambios: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o) => ({ ...o, ajenaOT: false, detenida: false, ...cambios }));
  return renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase,
      onOpen: noop, onFichar: noop, onDesficharVarias: noop, completarPedido: noop,
      operarios: OPERARIOS,
      ...extra,
    }),
  );
};

test("esperando revisión enseña QUIÉN la revisa, en vez del candado", () => {
  // PEDIDOS[0] tiene una OF en revisión con revisor.
  expect(pintaFase("esperandoRevision")).toContain("Lo revisa ");
});

test("esperando revisión sin revisor conocido: el motivo de la fase, corto en estrecho", () => {
  const html = pintaFase("esperandoRevision", { revisorId: null });
  expect(html).toContain("Lo tiene el revisor</span>");
  expect(html).toContain("le toca al revisor");
  expect(html).toContain("@max-[26rem]:hidden");
});

test("la fila dice con el cursor que se puede pulsar, y ya no hay franja superpuesta", () => {
  const html = pinta();
  expect(html).toContain("cursor-pointer");
  // Antes una franja `absolute` tapaba el final de la fila.
  expect(html).not.toContain("absolute inset-y-0 right-2");
});

test("«Fichar» de la fila no cuenta las aprobadas", () => {
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o, i) => ({
    ...o, ajenaOT: false, detenida: false, fichable: true, cerradaRps: undefined,
    autorId: "ivan", estado: i === 0 ? ("aprobada" as const) : ("en_curso" as const),
  }));
  const html = renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
      fase: "planteando" as const,
      onOpen: noop, onFichar: noop, onDesficharVarias: noop, completarPedido: noop,
      operarios: OPERARIOS,
    }),
  );
  // Dos OF, una aprobada: el botón es de UNA (sin número).
  expect(html).toMatch(/>(Fichar|Reanudar)<\/button>/);
});

test("«Pasar a revisión» sale en la fila cuando hay OF mías listas y se revisa", () => {
  const pedido = PEDIDOS[0];
  const ofs = pedido.ofs.map((o) => ({
    ...o, ajenaOT: false, detenida: false, fichable: true, cerradaRps: undefined,
    autorId: "ivan", revisorId: null, estado: "en_curso" as const,
  }));
  const props = {
    facet: { pedido: { ...pedido, ofs }, locationId: "ivan", ofs },
    fase: "planteando" as const,
    onOpen: noop, onFichar: noop, onDesficharVarias: noop, completarPedido: noop,
    operarios: OPERARIOS,
    miId: "ivan",
    onPasarRevision: async () => true,
  };
  expect(renderToStaticMarkup(createElement(PedidoLinea, { ...props, seccion: { sinRevision: false } }))).toContain("Pasar a revisión");
  // Donde no revisa nadie (Impresión), no.
  expect(renderToStaticMarkup(createElement(PedidoLinea, { ...props, seccion: { sinRevision: true } }))).not.toContain("Pasar a revisión");
});

test("las filas del panel propio y de revisar llevan la clase del barrido de fichaje sin parche opaco encima", () => {
  const pedido = PEDIDOS[0];
  const ofsPlantear = pedido.ofs.map((o) => ({
    ...o,
    ajenaOT: false,
    detenida: false,
    fichandoRol: "plantear" as const,
  }));
  const htmlPlantear = renderToStaticMarkup(
    createElement(PedidoLinea, {
      facet: { pedido: { ...pedido, ofs: ofsPlantear }, locationId: "ivan", ofs: ofsPlantear },
      fase: "planteando" as const,
      onOpen: noop,
      onFichar: noop,
      onDesficharVarias: noop,
      completarPedido: noop,
      operarios: OPERARIOS,
      ofIdsFichandoYo: new Set(ofsPlantear.map((o) => o.id)),
    }),
  );
  expect(htmlPlantear).toContain("fila-fichando-plantear");
  expect(htmlPlantear).not.toContain("[background-color:inherit]");

  const ofsRevisar = pedido.ofs.map((o) => ({
    ...o,
    ajenaOT: false,
    detenida: false,
    estado: "en_revision" as const,
    revisorId: "ivan",
    fichandoRol: "revisar" as const,
  }));
  const htmlRevisar = renderToStaticMarkup(
    createElement(LineaRevisar, {
      facet: { pedido: { ...pedido, ofs: ofsRevisar }, ofs: ofsRevisar },
      miId: "ivan",
      operarios: OPERARIOS,
      onOpen: noop,
      onEmpezar: noop,
      onFichar: noop,
      onDesficharVarias: noop,
      ofIdsFichandoYo: new Set(ofsRevisar.map((o) => o.id)),
    }),
  );
  expect(htmlRevisar).toContain("fila-fichando-revisar");
  expect(htmlRevisar).not.toContain("[background-color:inherit]");
});
