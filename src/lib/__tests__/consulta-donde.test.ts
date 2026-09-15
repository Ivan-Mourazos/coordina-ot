import { expect, test } from "vitest";
import {
  dondeEstaOF,
  dondeEstaPedido,
  EN_CURSO,
  FINALIZADA,
  fraseDonde,
  numeroDeTarea,
  PAUSADA,
  textoSituacion,
  type TareaConEstado,
} from "../consulta-donde";

// ─── Por dónde va un pedido, y quién lo tiene ────────────────────────────────
// Lo segundo que pregunta un comercial después de «¿cómo va?». Las tareas van
// en paralelo, así que puede estar en más de un sitio a la vez.

const tarea = (p: Partial<TareaConEstado> & Pick<TareaConEstado, "codigo">): TareaConEstado => ({
  orden: "0231429",
  descripcion: "TAREA",
  centro: "CALDERERIA",
  esFinalizar: false,
  cerrada: false,
  movimiento: null,
  ...p,
});

test("FINALIZAR cerrada: la OF no tiene dónde estar, aunque quede algo de antes abierto", () => {
  expect(dondeEstaOF("0231429", [
    tarea({ codigo: "3", centro: "CORTE ACRILICO" }),
    tarea({ codigo: "9", centro: "FINALIZACION", esFinalizar: true, cerrada: true }),
  ])).toBeNull();
});

test("una tarea pausada en OLANET sale con el nombre de quien la tiene", () => {
  // Inspirado en AR.26.04082: «Plantear y preparar archivos» pausada por
  // Adrián Quinteiro desde el 07/09.
  const donde = dondeEstaOF("0231429", [
    tarea({ codigo: "2", centro: "OFICINA TECNICA ARZUA", cerrada: true }),
    tarea({
      codigo: "5",
      descripcion: "PLANTEAR Y PREPARAR ARCHIVOS",
      centro: "CORTE AUTOMÁTICO PARQUE EMPRESARIAL",
      movimiento: { estado: PAUSADA, nombre: "Adrián Quinteiro", desde: "2026-09-07" },
    }),
    tarea({ codigo: "7", centro: "COSTURA POLIGONO" }),
  ]);
  expect(donde).toEqual({
    orden: "0231429",
    enCurso: [],
    pausadas: [{
      paso: "Corte (Parque Empresarial)",
      tarea: "Plantear y preparar archivos",
      quien: "Adrián Quinteiro",
      desde: "2026-09-07",
    }],
    siguientes: [],
  });
});

test("en curso y pausada a la vez: salen las dos, y no hay «siguiente»", () => {
  const donde = dondeEstaOF("X", [
    tarea({ codigo: "3", centro: "CALDERERIA", movimiento: { estado: EN_CURSO, nombre: "Ana", desde: null } }),
    tarea({ codigo: "4", centro: "CORTE ACRILICO", movimiento: { estado: PAUSADA, nombre: "Luis", desde: null } }),
    tarea({ codigo: "8", centro: "COSTURA POLIGONO" }),
  ])!;
  expect(donde.enCurso.map((p) => p.quien)).toEqual(["Ana"]);
  expect(donde.pausadas.map((p) => p.quien)).toEqual(["Luis"]);
  expect(donde.siguientes).toEqual([]);
});

test("si nadie ha empezado nada, lo siguiente son las abiertas con el número más bajo, varias si empatan", () => {
  const donde = dondeEstaOF("X", [
    tarea({ codigo: "2", centro: "OFICINA TECNICA ARZUA", cerrada: true }),
    tarea({ codigo: "5", centro: "CORTE ACRILICO" }),
    tarea({ codigo: "05", centro: "COSTURA POLIGONO" }),
    tarea({ codigo: "7", centro: "CALDERERIA" }),
  ])!;
  expect(donde.siguientes.map((p) => p.paso)).toEqual(["Corte", "Costura (Parque Empresarial)"]);
});

test("las pseudo-tareas sin centro no cuentan, y un movimiento finalizado cierra la tarea", () => {
  expect(dondeEstaOF("X", [
    tarea({ codigo: "0", descripcion: "MATERIALES", centro: null }),
    tarea({ codigo: "3", movimiento: { estado: FINALIZADA, nombre: "Ana", desde: null } }),
  ])).toBeNull();
});

test("FINALIZAR abierta sin centro sigue siendo trabajo pendiente", () => {
  const donde = dondeEstaOF("X", [
    tarea({ codigo: "3", cerrada: true }),
    tarea({ codigo: "9", descripcion: "FINALIZAR", centro: null, esFinalizar: true }),
  ])!;
  expect(donde.siguientes.map((p) => p.paso)).toEqual(["Finalizar"]);
});

test("sin OLANET (sin movimientos) se sigue diciendo por dónde va, sin nombres", () => {
  const donde = dondeEstaOF("X", [tarea({ codigo: "3", centro: "CALDERERIA" })])!;
  expect(donde.siguientes).toEqual([{ paso: "Calderería", tarea: "Tarea", quien: null, desde: null }]);
});

test("códigos que no son número van detrás de los que sí", () => {
  expect(numeroDeTarea("02")).toBe(2);
  expect(numeroDeTarea("A1")).toBe(Number.POSITIVE_INFINITY);
});

test("el pedido junta sus OF en el orden en que llegan y deja fuera las rematadas", () => {
  const donde = dondeEstaPedido([
    tarea({ orden: "B", codigo: "3" }),
    tarea({ orden: "A", codigo: "9", esFinalizar: true, cerrada: true }),
    tarea({ orden: "C", codigo: "4", centro: "CORTE ACRILICO" }),
  ]);
  expect(donde.map((d) => d.orden)).toEqual(["B", "C"]);
});

test("la frase de la fila junta todas las OF sin repetir", () => {
  const donde = dondeEstaPedido([
    tarea({ orden: "A", codigo: "3", movimiento: { estado: EN_CURSO, nombre: "Ana", desde: null } }),
    tarea({ orden: "B", codigo: "3", movimiento: { estado: EN_CURSO, nombre: "Ana", desde: null } }),
    tarea({ orden: "C", codigo: "4", centro: "CORTE ACRILICO", movimiento: { estado: PAUSADA, nombre: null, desde: null } }),
    tarea({ orden: "D", codigo: "1", centro: "COSTURA POLIGONO" }),
  ]);
  expect(fraseDonde(donde)).toBe(
    "Haciendo: Calderería — Ana · Pausado: Corte · Siguiente: Costura (Parque Empresarial)",
  );
  expect(fraseDonde([])).toBeNull();
});

test("el texto de situación: en fábrica dice dónde; esperando salir lo dice; entregado calla (lo dice la fecha)", () => {
  const donde = dondeEstaPedido([tarea({ codigo: "3" })]);
  expect(textoSituacion("fabrica", donde)).toBe("Siguiente: Calderería");
  expect(textoSituacion("fabrica", [])).toBe("En fábrica");
  expect(textoSituacion("salir", [])).toBe("Fabricado, esperando salir");
  expect(textoSituacion("entregado", [])).toBeNull();
});
