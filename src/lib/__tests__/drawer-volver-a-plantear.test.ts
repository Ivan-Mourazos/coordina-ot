import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Drawer } from "../../components/Drawer";
import { A_LA_VISTA, accionesDisponibles } from "../acciones";
import { OPERARIOS, PEDIDOS } from "../mock";
import { SECCIONES } from "../secciones";
import type { OF } from "../types";

// ─── «Volver a plantear» llega al cajón de cerradas ──────────────────────────
// Sección 2 de la spec del 15/09/2026: una OF dada por terminada en RPS sale
// de la lista de trabajo y se va al cajón «Ver N cerradas en RPS», y ahí lo
// ÚNICO que ofrece es «Volver a plantear» — no «Reabrir revisión» ni
// «Recuperar para corregir», que la llevarían a otro estado sin quitarle la
// marca. La ofrece cualquier técnico, como «Restaurar» en las anuladas.
//
// LO QUE ESTE FICHERO PUEDE Y NO PUEDE PROBAR. Pintar la fila de una OF
// escondida exige ABRIR el cajón, y eso es estado del cliente:
// `renderToStaticMarkup` no puede pulsar nada y el proyecto no tiene entorno
// de DOM en los tests. Así que se prueba por los dos lados que sí se pueden:
// que la OF llega al cajón (eso se pinta, y es lo que se ve sin abrir nada) y
// que lo que `AccionesOF` decide para esa misma OF es «Volver a plantear»
// suelta. Mismo criterio que el test del botón del reloj en
// `drawer-cerrada.test.ts`.

const noop = () => {};
const base = PEDIDOS[0].ofs[0];

const cerrada: OF = {
  ...base, id: "0232086:9", codigo: "0232086", autorId: "ivan", revisorId: "jaime",
  estado: "aprobada", ajenaOT: false, detenida: false, fichandoRol: null,
  cerradaRps: { at: "2026-09-15T11:42:00.000Z", por: "ivan", modo: "activo" },
};
const enCurso: OF = {
  ...base, id: "0232087:9", codigo: "0232087", autorId: "ivan", revisorId: null,
  estado: "en_curso", ajenaOT: false, detenida: false, fichandoRol: null,
};

const pinta = (ofs: OF[], miId: string) =>
  renderToStaticMarkup(
    createElement(Drawer, {
      pedido: { ...PEDIDOS[0], situacion: "procesado" as const, ofs },
      operarios: OPERARIOS, seccion: SECCIONES.ot, miId,
      onClose: noop, onAssignPedido: noop, onCompletar: noop, onSetRevisor: noop,
      onTraspasarAutor: noop, onAccion: noop, onFichar: noop, onDesfichar: noop,
      onDesficharVarias: noop, onCerradoEnRps: noop, onGemelaReintentada: noop,
    }),
  );

/** Lo que la fila de la OF acaba ofreciendo: `accionesDisponibles` con los
 *  recortes que hace `AccionesOF` en el Drawer. Aquí solo manda el primero
 *  (`esLaUltima`), porque una OF cerrada no es fichable ni tiene reloj. */
const ofrece = (of: OF, miId: string, esLaUltima = false) =>
  accionesDisponibles(of, miId)
    .filter((a) => !(esLaUltima && a.id === "cerrar_en_rps"))
    .map((a) => a.id);

test("la OF cerrada se aparta al cajón de cerradas del pedido, y el resto sigue en la lista", () => {
  const html = pinta([cerrada, enCurso], "tamara");
  expect(html).toContain("Ver 1 cerrada en RPS");
  expect(html).toContain("0232087"); // la otra OF sigue a la vista
});

test("en el cajón, la única acción de una cerrada es «Volver a plantear»", () => {
  expect(ofrece(cerrada, "tamara")).toEqual(["volver_a_plantear"]);
  // Y con el nombre con el que se lee en pantalla.
  expect(accionesDisponibles(cerrada, "tamara")[0].label).toBe("Volver a plantear");
});

test("la ofrece cualquier técnico: el autor, el revisor y quien pasaba por ahí", () => {
  for (const quien of ["ivan", "jaime", "tamara"]) {
    expect(ofrece(cerrada, quien)).toContain("volver_a_plantear");
  }
});

test("sale como botón suelto, no escondida detrás del «⋯»", () => {
  // El Drawer manda al cajón de "⋯" lo que NO está en `A_LA_VISTA`. En una OF
  // cerrada esta es la única acción que hay, así que esconderla ahí sería un
  // clic de más para llegar a lo único que se puede hacer con esa OF.
  expect(A_LA_VISTA.has("volver_a_plantear")).toBe(true);
  const enCajon = accionesDisponibles(cerrada, "tamara").filter((a) => !A_LA_VISTA.has(a.id));
  expect(enCajon).toEqual([]);
});

test("y no salen «Reabrir revisión» ni «Recuperar para corregir», que no quitan la marca", () => {
  expect(ofrece(cerrada, "jaime")).not.toContain("reabrir");
  expect(ofrece(cerrada, "ivan")).not.toContain("recuperar_aprobada");
  // Tampoco se ofrece cerrarla otra vez.
  expect(ofrece(cerrada, "ivan")).not.toContain("cerrar_en_rps");
});

test("una OF aprobada SIN la marca sigue como siempre: nada de «Volver a plantear»", () => {
  const aprobada: OF = { ...cerrada, cerradaRps: undefined };
  expect(ofrece(aprobada, "tamara")).not.toContain("volver_a_plantear");
  expect(ofrece(aprobada, "jaime")).toContain("reabrir");
  expect(pinta([aprobada, enCurso], "tamara")).not.toContain("cerrada en RPS");
});
