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

test("sin agrupar: el orden lo siguen mandando los filtros, no unos rótulos", () => {
  const html = pintar();
  // Lo que se comprueba es que NO hay rótulos de grupo (el Historial parte por
  // día y Revisiones por estado; aquí la lista va de corrido). Antes esto se
  // medía contando cuántos `bloque-3d` había, y dejó de valer cuando cada
  // pedido pasó a ser su propia tarjeta con relieve: ahora hay uno por fila.
  // El rótulo de un grupo es el <h3> que `BloqueLista` pinta sobre la caja.
  expect(html).not.toContain("<h3");
  // Y una tarjeta por pedido, que es lo que los separa.
  expect(html.match(/bloque-3d/g)?.length).toBeGreaterThan(PEDIDOS.length);
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

test("un pedido listo para pasar lo dice ARRIBA, junto al código, no en la columna de estado", () => {
  // AR.26.05508 trae una sola OF y ya está "aprobada": todo el pedido está
  // listo para pasar a Producción.
  const pedido = PEDIDOS.find((p) => p.codigo === "AR.26.05508")!;
  const html = pintar([pedido]);
  expect(html).toContain("Listo para Producción");
  // La celda de identidad pinta el cliente en su SEGUNDO renglón; si "Listo
  // para Producción" sale antes que el cliente, es que sigue en el primero,
  // junto al código y las familias — no ha bajado a la columna del medio, que
  // en el HTML viene después de que la celda de identidad se cierre entera.
  expect(html.indexOf("Listo para Producción")).toBeLessThan(html.indexOf(pedido.cliente));
});

test("sin nada pendiente, la columna de estado se queda en dos renglones como mucho: uno por rol", () => {
  const pedido = PEDIDOS.find((p) => p.codigo === "AR.26.05508")!;
  const html = pintar([pedido]);
  // Antes "Listo para Producción" era un tercer renglón AQUÍ, y con una sola
  // OF aprobada el tramo de planteo ("Planteado") y el de revisión
  // ("Revisado") ya son los únicos dos que puede haber.
  expect((html.match(/Planteado|Revisado/g) ?? []).length).toBe(2);
});
