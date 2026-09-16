import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ListaView } from "../../components/ListaView";
import { OPERARIOS, PEDIDOS } from "../mock";

function pintar(pedidos = PEDIDOS) {
  return renderToStaticMarkup(
    createElement(ListaView, {
      pedidos, operarios: OPERARIOS, onOpen() {}, orden: "planificacion" as const, ordenDesc: false,
    }),
  );
}

test("ya no es una tabla: la lista se pinta con la rejilla común", () => {
  const html = pintar();
  expect(html).not.toContain("<table");
  expect(html).not.toContain("<tbody");
  expect(html).toContain("bloque-3d");
});

test("un solo bloque, sin agrupar: el orden lo siguen mandando los filtros", () => {
  expect(pintar().match(/bloque-3d/g)).toHaveLength(1);
});

test("las cuatro columnas siguen estando, con sus rótulos", () => {
  const html = pintar();
  expect(html).toContain("Pedido · cliente");
  expect(html).toContain("Quién · estado");
  expect(html).toContain("Recorrido");
});

test("todas las filas se pueden desplegar", () => {
  const html = pintar();
  expect(html.match(/aria-expanded="false"/g)?.length).toBe(PEDIDOS.length);
});

test("la lista vacía explica si es que no hay trabajo o es que lo tapa un filtro", () => {
  const sinFiltros = renderToStaticMarkup(
    createElement(ListaView, {
      pedidos: [], operarios: OPERARIOS, onOpen() {}, orden: "planificacion" as const, ordenDesc: false,
    }),
  );
  expect(sinFiltros).toContain("No hay trabajo pendiente");

  const conFiltros = renderToStaticMarkup(
    createElement(ListaView, {
      pedidos: [], operarios: OPERARIOS, onOpen() {}, orden: "planificacion" as const,
      ordenDesc: false, hayFiltrosActivos: true,
    }),
  );
  expect(conFiltros).toContain("Ningún pedido pasa los filtros");
});

test("un pedido sin procesar se lee entero: lo dice su píldora, no una fila apagada", () => {
  // Sin `fichandoRol`: PEDIDOS[0] trae una OF con el punto en vivo, que pinta
  // su propio anillo con `opacity-60` (el ping de LiveDot, ajeno a esta
  // prueba) y daría un falso positivo si se dejara puesto.
  const pedido = {
    ...PEDIDOS[0],
    situacion: "pendiente" as const,
    ofs: PEDIDOS[0].ofs.map((of) => ({ ...of, fichandoRol: null })),
  };
  const html = pintar([pedido]);
  expect(html).toContain("Sin procesar");
  expect(html).not.toContain("opacity-60");
});
