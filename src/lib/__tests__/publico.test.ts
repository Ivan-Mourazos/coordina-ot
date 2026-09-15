import { expect, test } from "vitest";
import type { HistorialPedidoDetalle } from "../historial";
import type { BaseHistorial, IndiceHistorial } from "../historial-indice";
import {
  agruparOfsPublicas,
  capitalizaFrase,
  detallePublico,
  esPedidoTerminado,
  estaPendiente,
  filtrarPublico,
  frasePublica,
  normalizarFiltrosPublicos,
  type OfPublica,
  PAGE_PUBLICO,
} from "../publico";

const base = (p: Partial<BaseHistorial> & { pedido: string }): BaseHistorial => ({
  fechaPedido: Date.UTC(2026, 0, 1),
  nOf: 1,
  tieneSeccion: false,
  pendienteSeccion: false,
  pendienteTotal: false,
  finalizada: Date.UTC(2026, 0, 5),
  fechaEntrega: Date.UTC(2026, 1, 1),
  pendienteEntrega: false,
  ...p,
});

test("pendiente es tener tarea abierta O algo sin entregar", () => {
  expect(estaPendiente(base({ pedido: "A", pendienteTotal: true }))).toBe(true);
  expect(estaPendiente(base({ pedido: "B", pendienteEntrega: true }))).toBe(true);
  expect(estaPendiente(base({ pedido: "C" }))).toBe(false);
});

test("la frase dice por dónde va, y la entrega es el último tramo", () => {
  // Centros que NO están en la tabla de nombres bonitos (ver más abajo): aquí
  // solo importa cómo se junta la frase, no la traducción del centro.
  expect(frasePublica(["UN CENTRO", "OTRO CENTRO MAS"], true))
    .toBe("Pendiente de: Un centro, Otro centro mas");
  expect(frasePublica([], true)).toBe("Fabricado, pendiente de entregar");
  expect(frasePublica([], false)).toBe("Entregado");
});

const indice = (filas: BaseHistorial[]): IndiceHistorial => ({
  at: Date.now(),
  base: { ot: filas, diseno: filas },
  info: new Map(filas.map((f) => [f.pedido, {
    cliente: "MAHOU, S.A.", negocio: null, ciudadEntrega: null, familias: ["TOLDO"],
    ordenes: "0230001", textos: "MAHOU, S.A.\nTOLDO DE FACHADA",
  }])),
  personas: new Map(),
});

test("pendientes: primero lo que se entrega antes, y lo sin fecha al final", () => {
  const i = indice([
    base({ pedido: "A", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 2, 1) }),
    base({ pedido: "B", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 1, 1) }),
    base({ pedido: "C", pendienteTotal: true, fechaEntrega: null }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["B", "A", "C"]);
});

test("realizados: lo último terminado primero, y no se cuela un pendiente", () => {
  const i = indice([
    base({ pedido: "A", finalizada: Date.UTC(2026, 0, 2) }),
    base({ pedido: "B", finalizada: Date.UTC(2026, 0, 9) }),
    base({ pedido: "VIVO", pendienteEntrega: true }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "realizados", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["B", "A"]);
});

test("hasMore avisa de que hay otra página, sin devolver la fila de más", () => {
  const filas = Array.from({ length: PAGE_PUBLICO + 5 }, (_, n) =>
    base({ pedido: `P${String(n).padStart(3, "0")}`, pendienteTotal: true }));
  const r = filtrarPublico(indice(filas), { lista: "pendientes", page: 0 });
  expect(r.filas).toHaveLength(PAGE_PUBLICO);
  expect(r.hasMore).toBe(true);
});

test("buscar por código encuentra el pedido", () => {
  const i = indice([
    base({ pedido: "AR.26.00123", pendienteTotal: true }),
    base({ pedido: "AR.26.00999", pendienteTotal: true }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0, q: "AR.26.00123" });
  expect(filas.map((f) => f.pedido)).toEqual(["AR.26.00123"]);
});

test("hasta es inclusive: el cierre de media tarde de ese día entra entero", () => {
  const i = indice([
    // "hasta" se pone a medianoche LOCAL del día 9; este pedido cierra ese
    // mismo día 9 pero a las 17:00, así que tiene que salir igualmente.
    base({ pedido: "A", finalizada: new Date(2026, 0, 9, 17, 0).getTime() }),
    base({ pedido: "B", finalizada: new Date(2026, 0, 10, 0, 0).getTime() }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "realizados", page: 0, hasta: "2026-01-09" });
  expect(filas.map((f) => f.pedido)).toEqual(["A"]);
});

test("desde es inclusive: entrar justo el día de desde", () => {
  const i = indice([
    base({ pedido: "A", pendienteTotal: true, fechaEntrega: new Date(2026, 0, 9, 0, 0).getTime() }),
    base({ pedido: "B", pendienteTotal: true, fechaEntrega: new Date(2026, 0, 8, 23, 0).getTime() }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0, desde: "2026-01-09" });
  expect(filas.map((f) => f.pedido)).toEqual(["A"]);
});

test("los comparadores desempatan igual en las dos direcciones", () => {
  const i = indice([
    base({ pedido: "B", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 1, 1) }),
    base({ pedido: "A", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 1, 1) }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["A", "B"]);
});

test("pendientes sin buscar no baja de 2025: RPS nunca cerró pedidos viejos y eso no es lo que está en marcha", () => {
  const i = indice([
    base({ pedido: "AR.19.05555", pendienteTotal: true, fechaPedido: Date.UTC(2019, 5, 1) }),
    base({ pedido: "AR.25.05555", pendienteTotal: true, fechaPedido: Date.UTC(2025, 0, 1) }),
  ]);
  const sinBuscar = filtrarPublico(i, { lista: "pendientes", page: 0 }).filas.map((f) => f.pedido);
  expect(sinBuscar).not.toContain("AR.19.05555");
  expect(sinBuscar).toContain("AR.25.05555");
});

test("buscando su código, el pendiente de 2019 sí sale: quien busca un pedido sabe lo que busca", () => {
  const i = indice([
    base({ pedido: "AR.19.05555", pendienteTotal: true, fechaPedido: Date.UTC(2019, 5, 1) }),
  ]);
  const { filas } = filtrarPublico(i, { lista: "pendientes", page: 0, q: "AR.19.05555" });
  expect(filas.map((f) => f.pedido)).toEqual(["AR.19.05555"]);
});

// ─── Cambio (task-7d): sin PDF aparte, sin "Lo llevó", tareas sin tiempo/gente ─
// El botón "Ver PDF del pedido" y su ruta pública se han ido: el PDF ya sale
// entre los documentos de RPS (comprobado contra RPS en tres pedidos reales),
// así que `PedidoPublicoDetalle` ya no lleva `scanUrl`. `detallePublico` es la
// función que decide qué campos salen de cada OF y de cada tarea: los tests
// de abajo son la lista blanca puesta a prueba.

function detalleConTareas(): HistorialPedidoDetalle {
  return {
    codigo: "AR.26.02711",
    cliente: "MAHOU, S.A.",
    negocio: null,
    ciudadEntrega: null,
    prioridad: 1,
    fechaSolicitud: null,
    fechaFinalizacion: null,
    piezas: 0,
    familias: [],
    comentarioVenta: null,
    scanUrl: "/api/pedidos/AR.26.02711.pdf",
    ofs: [
      {
        codigo: "0230001",
        descripcion: "Toldo cofre",
        centro: "ot",
        tiempoImputadoMin: 120,
        quien: ["Juan Pérez"],
        personas: [{ nombre: "Juan Pérez", min: 120 }],
        tareas: [
          { codigo: "010", descripcion: "Plantear", tiempoImputadoMin: 100, personas: [{ nombre: "Juan Pérez", min: 100 }] },
          { codigo: "020", descripcion: "Revisar", tiempoImputadoMin: 20, personas: [{ nombre: "Ana Ruiz", min: 20 }] },
        ],
      },
    ],
    documentos: [],
  };
}

test("detallePublico ya no lleva scanUrl: el PDF sale entre los documentos, no en un campo aparte", () => {
  const publico = detallePublico(detalleConTareas());
  expect(publico).not.toHaveProperty("scanUrl");
});

test("detallePublico marca cada tarea cerrada o abierta con el mapa que le pasan, por orden:tarea", () => {
  const cerradas = new Map([["0230001:010", true]]);
  const publico = detallePublico(detalleConTareas(), cerradas);
  expect(publico.ofs[0].tareas).toEqual([
    { codigo: "010", descripcion: "Plantear", cerrada: true },
    { codigo: "020", descripcion: "Revisar", cerrada: false },
  ]);
});

test("pedido terminado: las tareas traen su tiempo, no `cerrada`; pedido pendiente: al revés — y ningún nombre en ninguno de los dos (matiz de Iván)", () => {
  const detalle = detalleConTareas();

  // Las dos tareas cerradas: el pedido entero está terminado.
  const terminado = detallePublico(
    detalle,
    new Map([["0230001:010", true], ["0230001:020", true]]),
  );
  expect(terminado.ofs[0].tareas).toEqual([
    { codigo: "010", descripcion: "Plantear", tiempoImputadoMin: 100 },
    { codigo: "020", descripcion: "Revisar", tiempoImputadoMin: 20 },
  ]);

  // Una sola tarea abierta basta para que el pedido siga pendiente.
  const pendiente = detallePublico(
    detalle,
    new Map([["0230001:010", true], ["0230001:020", false]]),
  );
  expect(pendiente.ofs[0].tareas).toEqual([
    { codigo: "010", descripcion: "Plantear", cerrada: true },
    { codigo: "020", descripcion: "Revisar", cerrada: false },
  ]);

  // Ni rastro de quién hizo cada cosa, esté el pedido vivo o terminado.
  expect(JSON.stringify(terminado)).not.toContain("Juan Pérez");
  expect(JSON.stringify(pendiente)).not.toContain("Juan Pérez");
});

test("una tarea sin entrada en el mapa de cierres se da por abierta, no por hecha", () => {
  // Sin mapa (el valor por defecto de `detallePublico`): nada se puede
  // comprobar, y "abierta" es la lectura que no miente de más.
  const publico = detallePublico(detalleConTareas());
  expect(publico.ofs[0].tareas.every((t) => t.cerrada === false)).toBe(true);
});

test("ni un minuto ni un nombre se cuelan por OF ni por tarea: es la clase de cosa que se re-rompe sola", () => {
  const publico = detallePublico(detalleConTareas());
  const of = publico.ofs[0] as unknown as Record<string, unknown>;
  expect(of).not.toHaveProperty("tiempoImputadoMin");
  expect(of).not.toHaveProperty("quien");
  expect(of).not.toHaveProperty("personas");
  for (const tarea of of.tareas as Array<Record<string, unknown>>) {
    expect(tarea).not.toHaveProperty("tiempoImputadoMin");
    expect(tarea).not.toHaveProperty("personas");
  }
  // Por si el minuto o el nombre se colaran por un campo nuevo que nadie
  // metió en esta lista todavía: ni rastro en el JSON entero.
  const crudo = JSON.stringify(publico);
  expect(crudo).not.toContain("Juan Pérez");
  expect(crudo).not.toContain("Ana Ruiz");
  expect(crudo).not.toMatch(/tiempoImputadoMin/);
});

test("los filtros llegan de la URL con valores sanos", () => {
  const f = normalizarFiltrosPublicos(new URLSearchParams("lista=realizados&page=3&q=mahou"));
  expect(f).toMatchObject({ lista: "realizados", page: 3, q: "mahou" });
  // Basura en la URL no puede tumbar la página ni colar otra lista.
  expect(normalizarFiltrosPublicos(new URLSearchParams("lista=inventada&page=-7")))
    .toMatchObject({ lista: "pendientes", page: 0 });
});

// ─── Cambio 1: lo vencido en su propio apartado ──────────────────────────────
// Ver publico.ts: filtrarPublico recibe "hoy" para poder separar. Sin "hoy" el
// comportamiento es el de siempre (nadie queda fuera), porque los tests de
// arriba no hablan de vencidos y no tienen por qué aprender una fecha nueva.

test("lo vencido no se mezcla con lo que viene, y aparece completo con soloVencidos", () => {
  const i = indice([
    base({ pedido: "VIEJO", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 0, 1) }), // vencido
    base({ pedido: "FUTURO", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 2, 1) }), // por venir
  ]);
  const hoy = "2026-02-01";
  const principal = filtrarPublico(i, { lista: "pendientes", page: 0 }, hoy).filas.map((f) => f.pedido);
  expect(principal).toEqual(["FUTURO"]);
  expect(principal).not.toContain("VIEJO");

  const vencidos = filtrarPublico(i, { lista: "pendientes", page: 0, soloVencidos: true }, hoy).filas.map((f) => f.pedido);
  expect(vencidos).toEqual(["VIEJO"]);
});

test("el número de vencidos es el total, no el de la página", () => {
  const filas = Array.from({ length: PAGE_PUBLICO + 5 }, (_, n) =>
    base({ pedido: `V${String(n).padStart(3, "0")}`, pendienteTotal: true, fechaEntrega: Date.UTC(2026, 0, 1) }));
  const r = filtrarPublico(indice(filas), { lista: "pendientes", page: 0 }, "2026-06-01");
  expect(r.vencidos).toBe(PAGE_PUBLICO + 5);
  // La página principal no trae ninguno: están todos vencidos.
  expect(r.filas).toHaveLength(0);
});

test("los sin fecha siguen al final, detrás de lo que viene y sin los vencidos en medio", () => {
  const i = indice([
    base({ pedido: "VENCIDO", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 0, 1) }),
    base({ pedido: "PRONTO", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 2, 1) }),
    base({ pedido: "TARDE", pendienteTotal: true, fechaEntrega: Date.UTC(2026, 3, 1) }),
    base({ pedido: "SINFECHA", pendienteTotal: true, fechaEntrega: null }),
  ]);
  const { filas, vencidos } = filtrarPublico(i, { lista: "pendientes", page: 0 }, "2026-02-01");
  expect(filas.map((f) => f.pedido)).toEqual(["PRONTO", "TARDE", "SINFECHA"]);
  expect(vencidos).toBe(1);
});

test("sin pasar 'hoy', filtrarPublico no separa nada: es el comportamiento de siempre", () => {
  const i = indice([
    base({ pedido: "VIEJO", pendienteTotal: true, fechaEntrega: Date.UTC(2020, 0, 1) }),
  ]);
  const { filas, vencidos } = filtrarPublico(i, { lista: "pendientes", page: 0 });
  expect(filas.map((f) => f.pedido)).toEqual(["VIEJO"]);
  expect(vencidos).toBeUndefined();
});

// ─── Cambio 2: nombres de centro legibles ────────────────────────────────────

test("un centro de la tabla sale con su nombre bonito", () => {
  expect(frasePublica(["PLOTER DE CORTE MASCARA ULTRA SIGN PAL GRC1325"], true))
    .toBe("Pendiente de: Plotter de corte");
  expect(frasePublica(["OFICINA TECNICA ARZUA"], true)).toBe("Pendiente de: Oficina Técnica");
});

test("un centro que no está en la tabla sale con el texto de RPS, en frase", () => {
  expect(frasePublica(["UN CENTRO INVENTADO XYZ"], true)).toBe("Pendiente de: Un centro inventado xyz");
});

test("la trampa del centro escrito de dos formas (espacios de más) no rompe la tabla", () => {
  // Doble espacio en medio.
  expect(frasePublica(["CONFECCION  BERGONDO"], true)).toBe("Pendiente de: Confección (Bergondo)");
  // Espacio de sobra al final.
  expect(frasePublica(["MONTAJE TOLDO PLANO "], true)).toBe("Pendiente de: Montaje");
});

test("buscar por cliente levanta el corte: un pedido de 2019 sale si lo filtro por su cliente", () => {
  const i = indice([
    base({ pedido: "AR.19.05555", pendienteTotal: true, fechaPedido: Date.UTC(2019, 5, 1) }),
  ]);
  // Sin filtros: el corte de 2025 lo deja fuera
  const sinFiltros = filtrarPublico(i, { lista: "pendientes", page: 0 }).filas.map((f) => f.pedido);
  expect(sinFiltros).not.toContain("AR.19.05555");
  // Filtrando por cliente: sale igual
  const porCliente = filtrarPublico(i, { lista: "pendientes", page: 0, cliente: "MAHOU" }).filas.map((f) => f.pedido);
  expect(porCliente).toContain("AR.19.05555");
  // Filtrando solo por familia: el corte sigue activo
  const porFamilia = filtrarPublico(i, { lista: "pendientes", page: 0, familia: "TOLDO" }).filas.map((f) => f.pedido);
  expect(porFamilia).not.toContain("AR.19.05555");
});

test("dos centros de RPS con el mismo nombre bonito no se repiten en la frase", () => {
  // Pasaba en pedidos reales: «Pendiente de: Soldadura (Parque Empresarial),
  // Soldadura (Parque Empresarial)». Son dos centros distintos en RPS (alta
  // frecuencia y aire caliente) que se llaman igual para quien consulta.
  expect(
    frasePublica(
      ["SOLDADURA ALTA FRECUENCIA PARQUE EMPRESARIAL", "SOLDADURA AIRE CALIENTE PARQUE EMPRESARIAL"],
      false,
    ),
  ).toBe("Pendiente de: Soldadura (Parque Empresarial)");
});

// ─── Cambio (task-7d, legibilidad): descripciones sin gritar ─────────────────

test("capitalizaFrase baja el volumen: RPS a gritos, aquí solo la inicial", () => {
  expect(capitalizaFrase("PLANTEAR Y PREPARAR ARCHIVOS MAQ. DE CORTE")).toBe(
    "Plantear y preparar archivos maq. de corte",
  );
  expect(capitalizaFrase("lona remolque")).toBe("Lona remolque");
});

// ─── Cambio (task-7d): una cabecera por OF, no por OF-y-centro ──────────────
// `HistorialPedidoDetalle.ofs` trae una entrada por OF Y CENTRO: un pedido
// real con cuatro OF de varios centros salía como doce bloques. Aquí se
// prueba la agrupación que lo arregla, y el caso de las OF idénticas que la
// motivó (cuatro "Lona remolque" seguidas con las mismas tareas).

const of = (p: Partial<OfPublica> & Pick<OfPublica, "codigo">): OfPublica => ({
  descripcion: "Lona remolque",
  centro: "ot",
  tareas: [{ codigo: "010", descripcion: "Plantear", cerrada: true }],
  ...p,
});

test("dos entradas de la MISMA OF (una por centro) se agrupan en una sola cabecera, con las tareas de las dos", () => {
  const grupos = agruparOfsPublicas([
    of({ codigo: "0231918", centro: "ot", tareas: [{ codigo: "010", descripcion: "Plantear", cerrada: true }] }),
    of({ codigo: "0231918", centro: "diseno", tareas: [{ codigo: "020", descripcion: "Diseñar", cerrada: false }] }),
  ]);
  expect(grupos).toHaveLength(1);
  expect(grupos[0].codigos).toEqual(["0231918"]);
  expect(grupos[0].tareas.map((t) => t.codigo)).toEqual(["010", "020"]);
});

test("varias OF con la MISMA descripción y las MISMAS tareas se enseñan juntas, sin esconder ningún código", () => {
  const tareas: OfPublica["tareas"] = [{ codigo: "010", descripcion: "Plantear", cerrada: true }];
  const grupos = agruparOfsPublicas([
    of({ codigo: "0231918", tareas }),
    of({ codigo: "0231919", tareas }),
    of({ codigo: "0231920", tareas }),
    of({ codigo: "0231921", tareas }),
  ]);
  expect(grupos).toHaveLength(1);
  expect(grupos[0].codigos).toEqual(["0231918", "0231919", "0231920", "0231921"]);
});

test("OF con distinta descripción o distintas tareas NO se juntan, aunque compartan un código de tarea", () => {
  const grupos = agruparOfsPublicas([
    of({ codigo: "0231918", descripcion: "Lona remolque" }),
    of({ codigo: "0231919", descripcion: "Toldo cofre" }),
    of({
      codigo: "0231920",
      descripcion: "Lona remolque",
      tareas: [{ codigo: "010", descripcion: "Plantear", cerrada: false }], // misma tarea, otro estado
    }),
  ]);
  expect(grupos.map((g) => g.codigos)).toEqual([["0231918"], ["0231919"], ["0231920"]]);
});

test("el orden de salida es el de la primera aparición de cada grupo", () => {
  const grupos = agruparOfsPublicas([
    of({ codigo: "B", descripcion: "Toldo" }),
    of({ codigo: "A", descripcion: "Lona" }),
  ]);
  expect(grupos.map((g) => g.codigos[0])).toEqual(["B", "A"]);
});

// ─── Cambio (task-7d): el rótulo del bloque de tareas según el pedido ───────

test("esPedidoTerminado lee la MISMA señal que ya decide qué trae cada tarea", () => {
  const pendiente: OfPublica[] = [of({ codigo: "A", tareas: [{ codigo: "010", descripcion: "Plantear", cerrada: false }] })];
  const terminado: OfPublica[] = [of({ codigo: "A", tareas: [{ codigo: "010", descripcion: "Plantear", tiempoImputadoMin: 30 }] })];
  expect(esPedidoTerminado(pendiente)).toBe(false);
  expect(esPedidoTerminado(terminado)).toBe(true);
  // Sin ninguna tarea no hay nada que decidir: se da por terminado, como
  // `pedidoTerminado` por vacuidad (ver el comentario en publico.ts).
  expect(esPedidoTerminado([])).toBe(true);
  expect(esPedidoTerminado([of({ codigo: "A", tareas: [] })])).toBe(true);
});
