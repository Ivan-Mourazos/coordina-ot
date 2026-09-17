import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { RevisionView } from "../../components/RevisionView";
import { OPERARIOS, PEDIDOS } from "../mock";
import type { EstadoOF } from "../types";

function pintar(estados: EstadoOF[], miId = "revisor") {
  const pedido = {
    ...PEDIDOS[0],
    ofs: estados.map((estado, i) => ({
      ...PEDIDOS[0].ofs[0], id: `of-${i}`, codigo: `OF-${i}`, estado,
      ajenaOT: false, detenida: false, autorId: "autor", revisorId: "revisor",
    })),
  };
  return renderToStaticMarkup(createElement(RevisionView, {
    pedidos: [pedido], operarios: OPERARIOS, miId,
    onOpen() {}, onCambiarRevisor() {}, onAccion() {},
  }));
}

test("los cuatro estados van uno debajo de otro, no en columnas", () => {
  const html = pintar(["en_revision"]);
  // Cuatro secciones apiladas, cada una con su rótulo. Antes esto se medía
  // contando cuántos `bloque-3d` había, y dejó de valer cuando cada pedido
  // pasó a ser su propia tarjeta con relieve: el relieve es ahora de las
  // FILAS, y las secciones no pintan caja.
  expect(html.match(/<h2/g)).toHaveLength(4);
  // Y ninguna rejilla de columnas de tablero.
  expect(html).not.toContain("xl:grid-cols-4");
});

test("los cuatro estados salen siempre, tengan algo o no", () => {
  const html = pintar(["en_revision"]);
  for (const titulo of ["Por empezar", "Revisando", "Aprobadas por mí", "Devueltas por mí"]) {
    expect(html).toContain(titulo);
  }
});

test("cada pedido es una línea que se despliega, no una tarjeta abierta", () => {
  const html = pintar(["en_revision"]);
  expect(html).toContain('aria-expanded="false"');
  // Plegada no se ve lo de dentro: ni el selector de revisor ni los botones.
  expect(html).not.toContain("Revisor:");
  expect(html).not.toContain("Aprobar");
});

test("la línea dice lo que hace falta para elegir cuál abrir", () => {
  const html = pintar(["en_revision", "en_revision"]);
  expect(html).toContain(PEDIDOS[0].codigo);
  expect(html).toContain(PEDIDOS[0].cliente);
  expect(html).toContain("2 OF");
});

test("un estado sin nada lo dice, en vez de desaparecer", () => {
  expect(pintar(["en_revision"])).toContain("Aquí no tienes nada");
});

test("el conmutador de alcance sigue estando", () => {
  const html = pintar(["en_revision"]);
  expect(html).toContain("Solo mías");
  expect(html).toContain("Todo el equipo");
});

test("el código del pedido se puede pulsar: sin subirlo de capa, el clic se lo come el fondo que despliega", () => {
  const html = pintar(["en_revision"]);
  // `FilaDesplegable` cubre la fila entera con un botón `absolute inset-0`.
  // Al estar posicionado se pinta por encima de los hermanos que no lo están,
  // así que el código necesita `relative z-10` para recibir el clic. Sin esta
  // comprobación el fallo es invisible: renderToStaticMarkup no calcula
  // posiciones, y en pantalla el botón se ve perfectamente — solo que no hace
  // nada.
  expect(html).toContain("pointer-events-auto relative z-10");
  expect(html).toContain("Abrir detalle del pedido");
});

test("el estado del pedido se lee sin abrir la línea: es a lo que se viene a esta lista", () => {
  const aprobadas = pintar(["aprobada", "aprobada"]);
  expect(aprobadas).toContain("Pedido listo para pasar a Producción");
  const aMedias = pintar(["aprobada", "devuelta"]);
  expect(aMedias).toContain("1 de 2 OF aprobadas");
  expect(aMedias).toContain("queda trabajo pendiente");
  expect(aMedias).toContain("Vuelve al autor");
  // Y sigue plegada: lo de dentro no se ve.
  expect(aMedias).not.toContain("Revisor:");
});
