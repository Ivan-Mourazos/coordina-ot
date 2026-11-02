import { expect, test } from "vitest";
import { segmentosEnShare } from "../historial";
import {
  TOPE_TERMINADAS,
  comoDocumentoRps,
  componerSolicitudes,
  leerEtiqueta,
  nombreUsuario,
  sinCoger,
  type FilaCampo,
  type FilaTarea,
} from "../solicitudes";

const tarea = (cambios: Partial<FilaTarea>): FilaTarea => ({
  tarea: "t1",
  instancia: "i1",
  rol: "OT",
  etiqueta: "JACOBO - ASESORAMIENTO Y APOYO TECNICO - 044634 -PT26003761 -Ref. carruaje",
  estadoEjecucion: "Started",
  descripcion: "Formulario asignar trabajo a tecnico",
  usuario: null,
  creadaPor: "JACOBO",
  cerradaPor: null,
  creada: "2026-10-29T08:48:00.000Z",
  cerrada: null,
  ...cambios,
});

test("lee la etiqueta de RPS, con y sin presupuesto", () => {
  expect(leerEtiqueta("JACOBO - ASESORAMIENTO Y APOYO TECNICO - 044634 -PT26003761 -Ref. carruaje")).toEqual({
    comercial: "JACOBO",
    tipo: "ASESORAMIENTO Y APOYO TECNICO",
    oportunidad: "044634",
    presupuesto: "PT26003761",
    texto: "Ref. carruaje",
  });
  expect(leerEtiqueta("LAUDINA - BOCETO GRÁFICO - 044524 - -Maristas")).toMatchObject({
    oportunidad: "044524",
    presupuesto: null,
    texto: "Maristas",
  });
});

test("una etiqueta rara se conserva como texto", () => {
  expect(leerEtiqueta("algo distinto")).toMatchObject({ oportunidad: null, texto: "algo distinto" });
  expect(leerEtiqueta(null).texto).toBe("");
});

test("los códigos de usuario se leen como nombres", () => {
  expect(nombreUsuario("IVAN.SANCHEZ")).toBe("Ivan Sanchez");
  expect(nombreUsuario(null)).toBeNull();
});

test("sin usuario está sin coger, aunque el rol ya esté puesto", () => {
  const [s] = componerSolicitudes([tarea({})], [], "OT");
  expect(s.estado).toBe("sin_coger");
  expect(s.tecnico).toBeNull();
  expect(sinCoger([s])).toBe(1);
});

test("con usuario en la tarea de coger, ya la tiene alguien", () => {
  const [s] = componerSolicitudes([tarea({ usuario: "IVAN.SANCHEZ" })], [], "OT");
  expect(s).toMatchObject({ estado: "cogida", tecnico: "Ivan Sanchez" });
});

test("las tareas seguidas de RPS son una sola solicitud, con su historial", () => {
  const tareas = [
    tarea({ tarea: "a", descripcion: "Formulario pedir datos comercial", usuario: "JACOBO", cerradaPor: "JACOBO", creada: "2026-10-29T08:44:00.000Z", cerrada: "2026-10-29T00:00:00.000Z" }),
    tarea({ tarea: "b", usuario: "IVAN.SANCHEZ", cerradaPor: "IVAN.SANCHEZ", cerrada: "2026-11-02T00:00:00.000Z" }),
    tarea({ tarea: "c", descripcion: "Formulario tecnico, trabajo asignado", usuario: "IVAN.SANCHEZ", cerradaPor: "IVAN.SANCHEZ", creada: "2026-11-02T12:01:00.000Z", cerrada: "2026-11-02T00:00:00.000Z" }),
    tarea({ tarea: "d", descripcion: "Aviso al comercial", usuario: "JACOBO", creada: "2026-11-02T12:01:30.000Z" }),
    tarea({ tarea: "e", descripcion: "Navegar a actividad", usuario: "JESUS", creada: "2026-11-02T12:02:00.000Z" }),
  ];
  const campos: FilaCampo[] = [
    { tarea: "b", campo: "Comentario comercial", valor: "Ref. 2-Wheel" },
    { tarea: "c", campo: "Comentarios", valor: "Hablado por correo." },
    { tarea: "b", campo: "Adjunto 1 comercial", valor: "\\\\192.168.0.128\\rps\\VENTAS\\OPORTUNIDADES\\ACTIVIDADES\\lona carruaje.pdf" },
  ];
  const lista = componerSolicitudes(tareas, campos, "OT");
  expect(lista).toHaveLength(1);
  expect(lista[0]).toMatchObject({
    estado: "terminada",
    tecnico: "Ivan Sanchez",
    avisoPendiente: true,
    comentario: "Ref. 2-Wheel",
    respuesta: "Hablado por correo.",
    comercial: "Jacobo",
    oportunidad: "044634",
  });
  expect(lista[0].adjuntos).toEqual([{ tarea: "b", numero: 1, archivo: "lona carruaje.pdf" }]);
  expect(lista[0].pasos).toHaveLength(4);
});

test("las solicitudes de la misma oportunidad se enlazan", () => {
  const lista = componerSolicitudes(
    [
      tarea({ instancia: "vieja", cerrada: "2026-11-02T00:00:00.000Z", usuario: "IVAN.SANCHEZ", cerradaPor: "IVAN.SANCHEZ" }),
      tarea({ instancia: "nueva", tarea: "t2", creada: "2026-11-02T09:17:00.000Z" }),
    ],
    [],
    "OT",
  );
  expect(lista.map((s) => s.id)).toEqual(["nueva", "vieja"]);
  expect(lista[0].relacionadas).toMatchObject([{ id: "vieja", estado: "terminada", tecnico: "Ivan Sanchez" }]);
});

test("una ejecución cancelada no se queda sin coger", () => {
  const [s] = componerSolicitudes([tarea({ estadoEjecucion: "Terminated" })], [], "OT");
  expect(s.estado).toBe("terminada");
});

test("cada sección ve su rol, pero enlaza con lo de la otra", () => {
  const lista = componerSolicitudes(
    [tarea({ instancia: "ot" }), tarea({ instancia: "dg", tarea: "t2", rol: "DISEÑO" })],
    [],
    "OT",
  );
  expect(lista.map((s) => s.id)).toEqual(["ot"]);
  expect(lista[0].relacionadas.map((r) => r.id)).toEqual(["dg"]);
});

test("lo abierto no se recorta; lo terminado, sí", () => {
  const terminadas = Array.from({ length: TOPE_TERMINADAS + 5 }, (_, i) =>
    tarea({ instancia: `f${i}`, tarea: `f${i}`, estadoEjecucion: "Completed", cerrada: "2026-10-01T00:00:00.000Z" }),
  );
  const lista = componerSolicitudes([...terminadas, tarea({ instancia: "abierta", tarea: "x" })], [], "OT");
  expect(lista.filter((s) => s.estado === "terminada")).toHaveLength(TOPE_TERMINADAS);
  expect(lista.some((s) => s.id === "abierta")).toBe(true);
});

test("la ruta de un adjunto entra por la misma puerta que los documentos", () => {
  const ruta = "\\\\192.168.0.128\\rps\\VENTAS\\OPORTUNIDADES\\ACTIVIDADES\\carruajes.pdf";
  expect(segmentosEnShare(comoDocumentoRps(ruta))).toEqual(["VENTAS", "OPORTUNIDADES", "ACTIVIDADES", "carruajes.pdf"]);
  expect(segmentosEnShare(comoDocumentoRps("C:\\Windows\\win.ini"))).toBeNull();
  expect(segmentosEnShare(comoDocumentoRps("\\\\192.168.0.128\\rps\\..\\secreto.txt"))).toBeNull();
});
