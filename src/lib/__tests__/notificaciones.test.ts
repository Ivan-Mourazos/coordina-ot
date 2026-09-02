import { describe, expect, it } from "vitest";
import {
  agruparAvisos,
  aplicarDescartes,
  esDescartable,
  identidadAviso,
  type AvisoSuelto,
} from "../notificaciones";
import type { OF, Pedido } from "../types";

const of = (id: string, extra: Partial<OF> = {}): OF => ({
  id,
  codigo: `OF-${id}`,
  descripcion: "x",
  familia: "TOLDO",
  piezas: 1,
  autorId: null,
  revisorId: null,
  estado: "pendiente",
  fichandoRol: null,
  tiempoEstimadoMin: 0,
  tiempoPlanteoMin: 0,
  tiempoRevisionMin: 0,
  ...extra,
});

const pedido = (id: string, ofs: OF[]): Pedido => ({
  id,
  codigo: `AR.26.0000${id}`,
  cliente: "MAHOU",
  situacion: "procesado",
  fechaSolicitud: "2026-09-01",
  fechaPlanificacion: "2026-08-20",
  fechaEntrega: "2026-09-01",
  prioridad: 2,
  ofs,
  accent: "ninguno",
  lineas: 0,
  croquis: false,
});

describe("agruparAvisos", () => {
  it("un pedido mandado entero a revisar es UN aviso, no uno por OF", () => {
    const ofs = [of("a"), of("b"), of("c")];
    const p = pedido("1", ofs);
    const sueltos: AvisoSuelto[] = ofs.map((o) => ({ tipo: "revisar", pedido: p, of: o }));
    const r = agruparAvisos(sueltos);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pedidoEntero: true, totalOFs: 3 });
    expect(r[0].ofs).toHaveLength(3);
  });

  it("OF sueltas de un pedido de varias NO son el pedido entero", () => {
    const ofs = [of("a"), of("b"), of("c"), of("d"), of("e")];
    const p = pedido("1", ofs);
    const r = agruparAvisos([
      { tipo: "revisar", pedido: p, of: ofs[0] },
      { tipo: "revisar", pedido: p, of: ofs[1] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pedidoEntero: false, totalOFs: 5 });
    expect(r[0].ofs.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("las anuladas no cuentan: tres de cuatro con una anulada SÍ es el pedido entero", () => {
    const vivas = [of("a"), of("b"), of("c")];
    const p = pedido("1", [...vivas, of("z", { estado: "anulada" })]);
    const r = agruparAvisos(vivas.map((o) => ({ tipo: "revisar" as const, pedido: p, of: o })));
    expect(r[0]).toMatchObject({ pedidoEntero: true, totalOFs: 3 });
  });

  it("tipos distintos del mismo pedido no se mezclan", () => {
    const ofs = [of("a"), of("b")];
    const p = pedido("1", ofs);
    const r = agruparAvisos([
      { tipo: "revisar", pedido: p, of: ofs[0] },
      { tipo: "devuelta", pedido: p, of: ofs[1] },
    ]);
    expect(r.map((i) => i.tipo)).toEqual(["revisar", "devuelta"]);
  });

  it("pedidos distintos no se mezclan", () => {
    const p1 = pedido("1", [of("a")]);
    const p2 = pedido("2", [of("b")]);
    const r = agruparAvisos([
      { tipo: "revisar", pedido: p1, of: p1.ofs[0] },
      { tipo: "revisar", pedido: p2, of: p2.ofs[0] },
    ]);
    expect(r).toHaveLength(2);
  });

  it("el aviso de pedido completo no lleva OF y no se dice entero", () => {
    const p = pedido("1", [of("a"), of("b")]);
    const r = agruparAvisos([{ tipo: "pedidoCompleto", pedido: p, of: null }]);
    expect(r[0]).toMatchObject({ ofs: [], pedidoEntero: false });
  });

  it("conserva el orden de aparición y los datos del primero", () => {
    const p1 = pedido("1", [of("a")]);
    const p2 = pedido("2", [of("b")]);
    const r = agruparAvisos([
      { tipo: "recibida", pedido: p2, of: p2.ofs[0], quien: "Tamara", otro: "Iván" },
      { tipo: "recibida", pedido: p1, of: p1.ofs[0], quien: "Jaime" },
    ]);
    expect(r.map((i) => i.pedido.id)).toEqual(["2", "1"]);
    expect(r[0]).toMatchObject({ quien: "Tamara", otro: "Iván" });
  });
});

describe("identidadAviso", () => {
  it("el mismo tipo sobre otra OF del mismo pedido es OTRA situación", () => {
    const p = pedido("1", [of("a"), of("b")]);
    const [uno] = agruparAvisos([{ tipo: "revisar", pedido: p, of: p.ofs[0] }]);
    const [dos] = agruparAvisos([{ tipo: "revisar", pedido: p, of: p.ofs[1] }]);
    const [ambas] = agruparAvisos([
      { tipo: "revisar", pedido: p, of: p.ofs[0] },
      { tipo: "revisar", pedido: p, of: p.ofs[1] },
    ]);
    expect(new Set([uno, dos, ambas].map((i) => identidadAviso(i, "ot"))).size).toBe(3);
  });

  it("no depende del orden en que se recorrieran las OF", () => {
    const p = pedido("1", [of("a"), of("b")]);
    const [ab] = agruparAvisos([
      { tipo: "revisar", pedido: p, of: p.ofs[0] },
      { tipo: "revisar", pedido: p, of: p.ofs[1] },
    ]);
    const [ba] = agruparAvisos([
      { tipo: "revisar", pedido: p, of: p.ofs[1] },
      { tipo: "revisar", pedido: p, of: p.ofs[0] },
    ]);
    expect(identidadAviso(ab, "ot")).toBe(identidadAviso(ba, "ot"));
  });

  it("distingue tipo y pedido", () => {
    const p1 = pedido("1", [of("a")]);
    const p2 = pedido("2", [of("a")]);
    const [revisar] = agruparAvisos([{ tipo: "revisar", pedido: p1, of: p1.ofs[0] }]);
    const [devuelta] = agruparAvisos([{ tipo: "devuelta", pedido: p1, of: p1.ofs[0] }]);
    const [otroPedido] = agruparAvisos([{ tipo: "revisar", pedido: p2, of: p2.ofs[0] }]);
    expect(new Set([revisar, devuelta, otroPedido].map((i) => identidadAviso(i, "ot"))).size).toBe(3);
  });

  it("solo son descartables los deducidos: los de movimiento ya se apagan por clave", () => {
    const p = pedido("1", [of("a")]);
    const items = agruparAvisos([
      { tipo: "revisar", pedido: p, of: p.ofs[0] },
      { tipo: "devuelta", pedido: p, of: p.ofs[0] },
      { tipo: "pedidoCompleto", pedido: p, of: null },
      { tipo: "recibida", pedido: p, of: p.ofs[0], clave: "7:recibida:a" },
      { tipo: "cedida", pedido: p, of: p.ofs[0], clave: "7:cedida:a" },
      { tipo: "revisarNueva", pedido: p, of: p.ofs[0], clave: "7:revisarNueva:a" },
      { tipo: "revisarQuitada", pedido: p, of: p.ofs[0], clave: "7:revisarQuitada:a" },
    ]);
    expect(items.filter(esDescartable).map((i) => i.tipo)).toEqual([
      "revisar",
      "devuelta",
      "pedidoCompleto",
    ]);
  });
});

describe("aplicarDescartes", () => {
  it("con la lista INCOMPLETA se lleva por delante descartes que sí valían", () => {
    // No es un fallo de esta función —hace lo que promete— sino la trampa que
    // tiene, y por eso está escrita aquí: quien la llame tiene que pasarle
    // TODOS los avisos vivos.
    //
    // Pasó de verdad. Los avisos de nota salen de un fetch, y en el primer
    // render de la página todavía no habían llegado; la poda concluía que sus
    // descartes ya no apagaban nada y los tiraba. Al contestar el fetch, las
    // notas volvían a salir sin descarte y la campana las cantaba otra vez: en
    // cada recarga resucitaban las notas ya vistas.
    //
    // Board no poda hasta que las notas han llegado alguna vez. Este test es
    // para que se entienda POR QUÉ está esa espera, si alguien la quita.
    const p = pedido("1", [of("a")]);
    const nota = agruparAvisos([
      { tipo: "notaNueva", pedido: p, of: null, clave: "nota:42", texto: "ojo con la cota" },
    ]);
    const yaVisto = [identidadAviso(nota[0], "ot")];

    // Con la nota delante, el descarte la apaga y se conserva.
    const conNota = aplicarDescartes(nota, yaVisto);
    expect(conNota.visibles).toHaveLength(0);
    expect(conNota.vigentes).toEqual(yaVisto);

    // Sin ella —porque aún no ha cargado— el descarte se da por muerto…
    expect(aplicarDescartes([], yaVisto).vigentes).toEqual([]);
    // …y si se guardara eso, al llegar la nota volvería a sonar.
    expect(aplicarDescartes(nota, []).visibles).toHaveLength(1);
  });

  it("abrir un aviso apaga ese y nada más", () => {
    const p = pedido("1", [of("a"), of("b")]);
    const items = agruparAvisos([
      { tipo: "revisar", pedido: p, of: p.ofs[0] },
      { tipo: "devuelta", pedido: p, of: p.ofs[1] },
    ]);
    const { visibles } = aplicarDescartes(items, [identidadAviso(items[0], "ot")]);
    expect(visibles.map((i) => i.tipo)).toEqual(["devuelta"]);
  });

  it("no apaga los de movimiento del mismo pedido", () => {
    const p = pedido("1", [of("a")]);
    const items = agruparAvisos([
      { tipo: "revisar", pedido: p, of: p.ofs[0] },
      { tipo: "recibida", pedido: p, of: p.ofs[0], clave: "7:recibida:a" },
    ]);
    const { visibles } = aplicarDescartes(items, [identidadAviso(items[0], "ot")]);
    expect(visibles.map((i) => i.tipo)).toEqual(["recibida"]);
  });

  it("mandarte OTRA OF del mismo pedido a revisar vuelve a avisar", () => {
    const p = pedido("1", [of("a"), of("b")]);
    const soloA = agruparAvisos([{ tipo: "revisar", pedido: p, of: p.ofs[0] }]);
    const descartes = [identidadAviso(soloA[0], "ot")];
    expect(aplicarDescartes(soloA, descartes).visibles).toHaveLength(0);

    const aYb = agruparAvisos([
      { tipo: "revisar", pedido: p, of: p.ofs[0] },
      { tipo: "revisar", pedido: p, of: p.ofs[1] },
    ]);
    expect(aplicarDescartes(aYb, descartes).visibles).toHaveLength(1);
  });

  it("el descarte sigue vigente mientras el aviso siga ahí", () => {
    const p = pedido("1", [of("a")]);
    const items = agruparAvisos([{ tipo: "revisar", pedido: p, of: p.ofs[0] }]);
    const descartes = [identidadAviso(items[0], "ot")];
    expect(aplicarDescartes(items, descartes).vigentes).toEqual(descartes);
  });

  it("un descarte cuya situación ya no existe se poda", () => {
    const p = pedido("1", [of("a")]);
    const items = agruparAvisos([{ tipo: "revisar", pedido: p, of: p.ofs[0] }]);
    const descartes = [identidadAviso(items[0], "ot"), "9:revisar:z"];
    // Aviso resuelto (la OF ya está aprobada): no queda nada que apagar.
    expect(aplicarDescartes([], descartes).vigentes).toEqual([]);
    expect(aplicarDescartes(items, descartes).vigentes).toEqual([descartes[0]]);
  });

  it("si te devuelven la misma OF por segunda vez, vuelve a avisar", () => {
    const p = pedido("1", [of("a")]);
    const devuelta = agruparAvisos([{ tipo: "devuelta", pedido: p, of: p.ofs[0] }]);
    // La abro: se apaga.
    let descartes = aplicarDescartes(devuelta, [identidadAviso(devuelta[0], "ot")]).vigentes;
    expect(aplicarDescartes(devuelta, descartes).visibles).toHaveLength(0);
    // La corrijo y la mando: el aviso desaparece y con él su descarte.
    descartes = aplicarDescartes([], descartes).vigentes;
    // Me la devuelven otra vez: es un hecho nuevo y suena.
    expect(aplicarDescartes(devuelta, descartes).visibles).toHaveLength(1);
  });

  it("el aviso de pedido completo se descarta y se poda como los demás", () => {
    const p = pedido("1", [of("a")]);
    const items = agruparAvisos([{ tipo: "pedidoCompleto", pedido: p, of: null }]);
    const descartes = [identidadAviso(items[0], "ot")];
    expect(aplicarDescartes(items, descartes).visibles).toHaveLength(0);
    expect(aplicarDescartes([], descartes).vigentes).toEqual([]);
  });

  it("sin descartes no se toca nada", () => {
    const p = pedido("1", [of("a")]);
    const items = agruparAvisos([{ tipo: "revisar", pedido: p, of: p.ofs[0] }]);
    expect(aplicarDescartes(items, [])).toEqual({ visibles: items, vigentes: [] });
  });
});

describe("avisos de nota", () => {
  const p = pedido("1", [of("a")]);
  const nota = (id: string, texto: string): AvisoSuelto => ({
    pedido: p,
    of: null,
    tipo: "notaNueva",
    quien: "Tamara",
    clave: `nota:${id}`,
    texto,
  });

  it("dos notas del mismo pedido son DOS avisos, no uno", () => {
    // Agrupadas por `pedido:tipo`, la segunda desaparecía: salía el recado de
    // la primera y del otro no quedaba rastro en ninguna parte.
    const items = agruparAvisos([nota("n1", "falta el croquis"), nota("n2", "y el material")]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.texto)).toEqual(["falta el croquis", "y el material"]);
  });

  it("se puede descartar: leer el recado apaga la campana", () => {
    expect(esDescartable(agruparAvisos([nota("n1", "x")])[0])).toBe(true);
  });

  it("descartar una nota no apaga la siguiente", () => {
    // La identidad lleva el id de la nota. Sin eso, "pedido + tipo + las OF"
    // era el mismo texto para las dos —una nota no cuelga de ninguna OF— y el
    // recado de mañana nacía ya apagado.
    const items = agruparAvisos([nota("n1", "x"), nota("n2", "y")]);
    const [uno, dos] = items.map((i) => identidadAviso(i, "ot"));
    expect(uno).not.toBe(dos);

    const { visibles } = aplicarDescartes(items, [uno]);
    expect(visibles.map((i) => i.texto)).toEqual(["y"]);
  });

  it("el descarte se poda cuando la nota deja de ser reciente", () => {
    const items = agruparAvisos([nota("n2", "y")]);
    // El descarte de una nota que ya no está no puede quedarse guardado: si
    // no, volvería a apagar un aviso con esa misma identidad.
    const { vigentes } = aplicarDescartes(items, ["1:notaNueva:nota:n1"]);
    expect(vigentes).toEqual([]);
  });
});

describe("dos secciones comparten la lista de descartes", () => {
  // Ángel mira Diseño Gráfico y vuelve a Oficina Técnica, y le renacen los
  // avisos que ya había abierto. La poda es correcta dentro de una sección
  // —"un descarte solo vale mientras exista el aviso que apaga"— pero el
  // tablero de Diseño no trae los pedidos de OT, así que desde allí TODOS los
  // descartes de OT parecen caducados y se borran.
  const p = pedido("1", [of("a")]);
  const suyo = agruparAvisos([{ tipo: "devuelta", pedido: p, of: of("a") }]);

  it("mirar la otra sección no toca los descartes de la tuya", () => {
    const descartes = [identidadAviso(suyo[0], "ot")];
    // El tablero de Diseño: ni un aviso de OT a la vista.
    expect(aplicarDescartes([], descartes, "diseno").vigentes).toEqual(descartes);
  });

  it("y al volver, el aviso sigue apagado", () => {
    let descartes = aplicarDescartes(suyo, [identidadAviso(suyo[0], "ot")], "ot").vigentes;
    descartes = aplicarDescartes([], descartes, "diseno").vigentes;
    expect(aplicarDescartes(suyo, descartes, "ot").visibles).toHaveLength(0);
  });

  it("cada sección sí poda lo suyo", () => {
    // Lo de siempre dentro de una lista: si la situación desaparece, fuera.
    const descartes = [identidadAviso(suyo[0], "ot")];
    expect(aplicarDescartes([], descartes, "ot").vigentes).toEqual([]);
  });

  it("lo guardado sin sección es de Oficina Técnica", () => {
    // Lo que ya está en el navegador de todos se guardó antes de que hubiera
    // dos listas, y la web era solo de OT.
    expect(aplicarDescartes([], ["1:devuelta:a"], "ot").vigentes).toEqual([]);
    expect(aplicarDescartes([], ["1:devuelta:a"], "diseno").vigentes).toEqual(["1:devuelta:a"]);
  });
});
