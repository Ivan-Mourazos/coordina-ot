import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { FilterBar } from "../../components/FilterBar";
import { FILTROS_INICIALES } from "../filtros";
import { SECCIONES } from "../secciones";

// Carrón (11/09/2026): en Diseño Gráfico no reparten el trabajo entre varios,
// así que de la barra solo usan el buscador y ver lo que va tarde.

const pinta = (seccion: "ot" | "diseno") =>
  renderToStaticMarkup(
    createElement(FilterBar, {
      vista: "asignar" as const,
      seccion: SECCIONES[seccion],
      titulo: "Sin asignar",
      filtros: FILTROS_INICIALES,
      setFiltros: () => {},
      opciones: { familias: ["TOLDO" as const], estados: ["pendiente" as const], prioridades: [2 as const] },
      operarios: [],
      conteos: { normal: 3, taller: 0, detenidas: 0, anuladas: 0, internos: 1 },
      rotuloAjustes: "Agrupar",
      ajustes: createElement("span", null, "Sin agrupar"),
    }),
  );

test("en Diseño la barra se queda en buscador y «Solo atrasados»", () => {
  const html = pinta("diseno");
  expect(html).toContain("Pedido, cliente o negocio…");
  expect(html).toContain("Solo atrasados");
  expect(html).not.toContain("Familia");
  expect(html).not.toContain("Prioridad");
  expect(html).not.toContain("Tu trabajo");
  // Ni el ajuste de agrupar: es otra cosa que colocar sin que nadie lo pida.
  expect(html).not.toContain("Sin agrupar");
});

test("en Oficina Técnica siguen todos los controles de siempre", () => {
  const html = pinta("ot");
  expect(html).toContain("Familia");
  expect(html).toContain("Prioridad");
  expect(html).toContain("Tu trabajo");
  expect(html).toContain("Solo atrasados");
  expect(html).toContain("Sin agrupar");
  // El desplegable enseña la categoría elegida; sus opciones («Pedidos
  // internos» entre ellas) solo existen al abrirlo, y eso lo cubre
  // `categoriasDe` en filtros.test.ts.
  expect(html).toContain("Tu trabajo · 3");
});
