import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import {
  accionAlFichar,
  ofsFichablesDe,
  ofsPara,
} from "../accion-pedido";

const of = (p: Partial<OF>): OF =>
  ({
    id: "0230001:5",
    descripcion: "LONA",
    familia: "LONA",
    piezas: 1,
    autorId: "ivan",
    revisorId: null,
    estado: "pendiente",
    fichandoRol: null,
    tiempoEstimadoMin: 0,
    tiempoPlanteoMin: 0,
    tiempoRevisionMin: 0,
    ...p,
    // El código es la orden, la parte del id antes de ":". Dos OF con el mismo
    // código son dos tareas de la misma orden, y eso ya cambia qué se ficha.
    codigo: p.codigo ?? (p.id ?? "0230001:5").split(":")[0],
  }) as OF;

describe("accionAlFichar", () => {
  // La fila del tablero ya no ofrece una "acción primaria" por fase: solo el
  // botón del reloj y, cuando no queda nada, el de pasar el pedido. Lo que
  // antes hacía "Empezar planteo" o "Retomar" lo hace ahora fichar, y esta
  // función es la que dice qué transición acompaña al reloj.
  it("desde pendiente, fichar empieza el planteo", () => {
    expect(accionAlFichar(of({}))).toBe("empezar_planteo");
  });

  it("desde devuelta, fichar la retoma", () => {
    expect(accionAlFichar(of({ estado: "devuelta" }))).toBe("retomar");
  });

  it("pendiente con tiempo ya fichado se retoma fichando", () => {
    // Pasa con lo que viene de RPS: una OF con tiempo imputado en el terminal
    // que aquí sigue "pendiente". `faseDeOF` la clasifica como "planteando" por
    // ese tiempo, pero desde "pendiente" lo único que cabe es volver a empezar,
    // y eso es fichar.
    expect(accionAlFichar(of({ estado: "pendiente", tiempoPlanteoMin: 12 })))
      .toBe("empezar_planteo");
  });

  it("en curso no mueve nada: el reloj arranca y ya está", () => {
    // Pasar a revisión se hace desde el detalle, que es donde se nombra al
    // revisor. En la fila sería la acción que hay que pensar puesta donde se
    // pulsa de pasada.
    expect(accionAlFichar(of({ estado: "en_curso" }))).toBeNull();
    expect(accionAlFichar(of({ estado: "aprobada" }))).toBeNull();
  });
});

describe("ofsPara", () => {
  it("devuelve solo las OFs que admiten esa accion", () => {
    const a = of({ id: "a:1", estado: "en_curso" });
    const b = of({ id: "b:1", estado: "aprobada" });
    expect(ofsPara({ ofs: [a, b] }, "terminar_planteo").map((o) => o.id)).toEqual(["a:1"]);
  });

  it("lista vacia si ninguna la admite", () => {
    expect(ofsPara({ ofs: [of({ estado: "aprobada" })] }, "empezar_planteo")).toEqual([]);
  });
});

describe("ofsFichablesDe", () => {
  it("excluye anuladas y detenidas, pero NO las aprobadas", () => {
    // Una aprobada sigue siendo de PLANTEO y se puede fichar: al autor le queda
    // trabajo después de que se la aprueben (archivos de corte, imprimir).
    const ok = of({ id: "ok:1", estado: "en_curso" });
    const p = {
      ofs: [
        ok,
        of({ id: "x:1", estado: "aprobada" }),
        of({ id: "y:1", estado: "anulada" }),
        of({ id: "z:1", estado: "en_curso", detenida: true }),
      ],
    };
    expect(ofsFichablesDe(p, "plantear").map((o) => o.id)).toEqual(["ok:1", "x:1"]);
  });

  it("con OFs fichables de los dos roles a la vez, devuelve solo el grupo pedido", () => {
    // Un pedido puede tener a la vez una OF en_curso (rol plantear) y otra
    // por_revisar (rol revisar): faseDePedido ya da por normal esa mezcla.
    // El motor de fichaje solo admite un rol corriendo a la vez, así que el
    // rol tiene que ser explícito y no inferirse de "la primera OF".
    const plantear = of({ id: "plantear:1", estado: "en_curso" });
    const revisar = of({ id: "revisar:1", estado: "por_revisar", revisorId: "ana" });
    const p = { ofs: [plantear, revisar] };
    expect(ofsFichablesDe(p, "plantear").map((o) => o.id)).toEqual(["plantear:1"]);
    expect(ofsFichablesDe(p, "revisar").map((o) => o.id)).toEqual(["revisar:1"]);
  });

  // AR.26.04684: la OF 0232394 trae en Diseño la 6 (diseñar) y la 10 (cortar).
  // Fichar el pedido desde la fila no puede repartir el diseño con el corte.
  it("de cada OF solo ficha su primera tarea", () => {
    const p = {
      ofs: [
        of({ id: "0232394:6", tarea: "DISEÑAR ROTULACION" }),
        of({ id: "0232394:10", tarea: "CORTAR ROTULACION" }),
        of({ id: "0232395:6" }),
      ],
    };
    expect(ofsFichablesDe(p, "plantear").map((o) => o.id)).toEqual(["0232394:6", "0232395:6"]);
  });

  it("si la primera tarea ya no admite reloj, pasa la siguiente", () => {
    const p = {
      ofs: [
        of({ id: "0232394:6", estado: "anulada" }),
        of({ id: "0232394:10" }),
      ],
    };
    expect(ofsFichablesDe(p, "plantear").map((o) => o.id)).toEqual(["0232394:10"]);
  });
});
