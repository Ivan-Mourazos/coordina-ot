import { describe, expect, it } from "vitest";
import {
  SECCIONES,
  SECCION_POR_DEFECTO,
  esFaseDe,
  esSeccionId,
  recursosSql,
  recursosDeTrabajoSql,
  seccionDe,
  seccionDeRecurso,
  esFaseDeLaWeb,
  condicionMaquinaSql,
} from "../secciones";
import { esFaseDeOT } from "../fase-pendiente";

describe("todas las secciones", () => {
  it("ningún par comparte vista, máquina ni recursos", () => {
    // Si alguna de las tres coincidiera, una sección estaría leyendo o
    // escribiendo lo de la otra: Carrón vería el trabajo de OT, o su tiempo se
    // le sumaría a Oficina Técnica. Sin vista (Impresión) no hay nada que
    // compartir: dos `undefined` no son la misma vista.
    const todas = Object.values(SECCIONES);
    for (const a of todas) {
      for (const b of todas) {
        if (a.id === b.id) continue;
        if (a.vista !== undefined && b.vista !== undefined) {
          expect(a.vista, `${a.id}/${b.id}`).not.toBe(b.vista);
        }
        expect(a.maquina, `${a.id}/${b.id}`).not.toBe(b.maquina);
        expect(a.recursos.some((r) => b.recursos.includes(r)), `${a.id}/${b.id}`).toBe(false);
      }
    }
  });

  it("los recursos son los que filtran las vistas de RPS", () => {
    // Comprobado contra la definición de las vistas el 2026-09-01: las dos son
    // la misma consulta y solo cambia esta línea.
    expect(SECCIONES.ot.recursos).toEqual(["a-otec", "otec-a"]);
    // Diseño lleva además los dos plóters de corte. La VISTA de RPS sigue
    // filtrando solo por a-dgra/dgra-a —es de IT, no nuestra—, pero esta lista
    // es la que decide DE QUIÉN ES EL TIEMPO en toda la web, y el corte de
    // vinilo es de ellos: desde junio los únicos que fichan en P-PCUS son
    // Smith (48), Carrón (88) y Manuel Gómez (22).
    expect(SECCIONES.diseno.recursos).toEqual(["a-dgra", "dgra-a", "p-pcus"]);
  });
});

describe("qué sección es", () => {
  it("un id conocido da la suya", () => {
    expect(seccionDe("diseno").id).toBe("diseno");
    expect(seccionDe("ot").id).toBe("ot");
  });

  it("cualquier otra cosa cae en la de siempre y NO revienta", () => {
    // Esto llega de la URL y de la BD: un valor raro no puede tumbar el
    // tablero, y lo que había antes de que existieran las secciones era OT.
    for (const malo of [null, undefined, "", "OT", "produccion", 7, {}]) {
      expect(seccionDe(malo).id).toBe(SECCION_POR_DEFECTO);
    }
  });

  it("esSeccionId no se deja colar nada", () => {
    expect(esSeccionId("ot")).toBe(true);
    expect(esSeccionId("diseno")).toBe(true);
    expect(esSeccionId("DISENO")).toBe(false);
    expect(esSeccionId(null)).toBe(false);
  });
});

describe("de quién es una fase", () => {
  it("recoge las erratas reales del centro", () => {
    // En scg_Fases esa columna trae `A-OTECP` y `24A-OTEC`: por eso se busca un
    // trozo y no el nombre entero.
    for (const m of ["A-OTEC", "OTEC-A", "U-A-OTEC", "S-OTEC", "B-OTEC", "A-OTECP", "24A-OTEC"]) {
      expect(esFaseDe(m, SECCIONES.ot)).toBe(true);
    }
    for (const m of ["A-DGRA", "DGRA-A", "a-dgra"]) {
      expect(esFaseDe(m, SECCIONES.diseno)).toBe(true);
    }
  });

  it("una fase no puede ser de las dos", () => {
    expect(esFaseDe("A-OTEC", SECCIONES.diseno)).toBe(false);
    expect(esFaseDe("A-DGRA", SECCIONES.ot)).toBe(false);
    // Ni de ninguna: el resto del taller queda fuera de las dos.
    for (const m of ["A-MONT", "A-ROTU", "A-COST", "P-FINAL"]) {
      expect(esFaseDe(m, SECCIONES.ot)).toBe(false);
      expect(esFaseDe(m, SECCIONES.diseno)).toBe(false);
    }
  });

  it("esFaseDeOT sigue diciendo lo mismo que decía", () => {
    // Es el atajo que usan los sitios que solo hablan de OT. Si dejara de
    // coincidir con su sección, media app estaría mirando una regla y la otra
    // media otra distinta.
    for (const m of ["A-OTEC", "A-OTECP", "A-DGRA", "A-MONT", "otec-a"]) {
      expect(esFaseDeOT(m)).toBe(esFaseDe(m, SECCIONES.ot));
    }
  });
});

describe("los recursos en SQL", () => {
  it("salen entrecomillados y separados por coma", () => {
    expect(recursosSql(SECCIONES.ot)).toBe("'a-otec','otec-a'");
    expect(recursosSql(SECCIONES.diseno)).toBe("'a-dgra','dgra-a','p-pcus'");
  });

  it("dobla la comilla, aunque hoy no haga falta", () => {
    // Los valores salen de la tabla de secciones y nunca de fuera, así que no
    // hay nada que inyectar. Es para que quien añada una sección no tenga que
    // acordarse.
    const inventada = { ...SECCIONES.ot, recursos: ["a-o'tec"] };
    expect(recursosSql(inventada)).toBe("'a-o''tec'");
  });
});

describe("de dónde saca cada sección su trabajo", () => {
  it("OT se queda con su vista y Diseño lee OLANET", () => {
    // El `PercentProgress < 100` de las vistas no dice "sin acabar": cada
    // imputación entra con 100, así que la tarea vale 0 hasta que alguien
    // ficha el primer minuto. En OT eso coincide con "ya está planteada y
    // pasada a Producción" y se nota como acierto; en Diseño esconde el
    // trabajo a medias.
    expect(SECCIONES.ot.fuente).toBe("vista");
    expect(SECCIONES.diseno.fuente).toBe("olanet");
  });
});

describe("secciones en obras", () => {
  it("ninguna lo está: las dos enseñan su trabajo", () => {
    // Diseño Gráfico estuvo anunciada y sin trabajo mientras su lista no era
    // de fiar; se abrió el 08/09/2026 tras comprobarla contra RPS y OLANET.
    // Si alguien vuelve a poner `enObras` sin querer, media web deja de
    // enseñar su sección —tablero, lista, métricas y consultas— y en pantalla
    // solo queda el cartel de "ya viene", que es un fallo silencioso.
    for (const s of Object.values(SECCIONES)) {
      expect(s.enObras).toBeUndefined();
    }
  });
});

describe("los plóters de corte son de Diseño Gráfico", () => {
  it("su tiempo cuenta para Diseño", () => {
    // Sin P-PCUS en `recursos`, las horas del corte se contaban a Taller.
    expect(recursosSql(SECCIONES.diseno)).toContain("'p-pcus'");
  });

  it("pero el corte no sale en su tablero: se ficha en la máquina", () => {
    // Lo pidieron el 23/09/2026, después de que Carrón fichara el diseño de
    // 0232394 en la tarea de cortar. Con ver el tiempo en el pedido les basta.
    expect(recursosDeTrabajoSql(SECCIONES.diseno)).toBe("'a-dgra','dgra-a'");
    for (const m of ["P-PCUS", "U-P-PCUS"]) {
      expect(esFaseDe(m, SECCIONES.diseno)).toBe(false);
    }
    expect(esFaseDe("A-DGRA", SECCIONES.diseno)).toBe(true);
  });

  it("en OT el tablero usa todos sus recursos", () => {
    expect(recursosDeTrabajoSql(SECCIONES.ot)).toBe(recursosSql(SECCIONES.ot));
  });

  it("y no arrastran los demás plóters, que no son suyos", () => {
    // `P-PCMU` es el plóter de MANUEL: desde enero de 2025 lleva 38 fichajes
    // suyos contra 5 de Smith y ninguno de Carrón, justo al revés que P-PCUS.
    // Va con Impresión Digital, no aquí.
    //
    // `A-PCMU` es el Mutoh viejo, muerto desde mayo de 2022, y `P-PCCUS` una
    // errata con una C de más y una sola tarea. Entrarían solos si los trozos
    // fueran "PCUS"/"PCMU" sueltos, y con ellos cambiarían los tiempos de
    // meses pasados sin que nadie lo hubiera pedido.
    for (const m of ["A-PCMU", "P-PCMU", "P-PCCUS", "PCOR-P"]) {
      expect(esFaseDe(m, SECCIONES.diseno)).toBe(false);
    }
  });

  it("y no son de Oficina Técnica", () => {
    for (const m of ["P-PCUS", "P-PCMU"]) {
      expect(esFaseDe(m, SECCIONES.ot)).toBe(false);
    }
  });

  it("la condición SQL va con un LIKE por trozo y su propio parámetro", () => {
    // Sin parámetros no hay nada interpolado en el SQL, y quien ejecuta los
    // tipa como VarChar: un texto sin tipo viaja como nvarchar contra una
    // columna varchar y SQL Server tira el índice (5.522 ms contra 8).
    const conDos = { ...SECCIONES.diseno, marcasEnFases: ["DGRA", "OTRA"] };
    const { sql: cond, params } = condicionMaquinaSql(conDos);
    expect(params.map((p) => p.valor)).toEqual(["%DGRA%", "%OTRA%"]);
    expect(cond).toBe(
      "MaquinaTeo LIKE @marca0 OR MaquinaTeo LIKE @marca1",
    );
    // Ni una comilla ni un valor dentro de la cadena de SQL.
    expect(cond).not.toContain("%");
  });
});

describe("Impresión Digital", () => {
  const { impresion, diseno, ot } = SECCIONES;

  it("es una sección que se puede pedir por la URL", () => {
    expect(esSeccionId("impresion")).toBe(true);
    expect(seccionDe("impresion").id).toBe("impresion");
    expect(esSeccionId("taller")).toBe(false);
  });

  it("sus recursos son los tres de impresión y no pisan los de nadie", () => {
    expect(impresion.recursos).toEqual(["imdi-a", "p-hpla", "p-pcmu"]);
    for (const r of impresion.recursos) {
      expect(diseno.recursos).not.toContain(r);
      expect(ot.recursos).not.toContain(r);
    }
    expect(seccionDeRecurso("IMDI-A")).toBe("impresion");
    expect(seccionDeRecurso("P-HPLA")).toBe("impresion");
    expect(seccionDeRecurso("P-PCMU")).toBe("impresion");
    // El plóter de Diseño sigue siendo de Diseño.
    expect(seccionDeRecurso("P-PCUS")).toBe("diseno");
  });

  it("el troquelado cuenta tiempo pero no sale en el tablero", () => {
    expect(recursosSql(impresion)).toContain("'p-pcmu'");
    expect(recursosDeTrabajoSql(impresion)).not.toContain("p-pcmu");
    expect(esFaseDe("P-PCMU", impresion)).toBe(false);
  });

  it("reconoce sus fases de OLANET tal como vienen escritas", () => {
    // IMDI-A sale en scg_Fases como U-P-IMDI (medido el 13/10/2026).
    expect(esFaseDe("U-P-IMDI", impresion)).toBe(true);
    expect(esFaseDe("P-HPLA", impresion)).toBe(true);
    expect(esFaseDeLaWeb("U-P-IMDI")).toBe(true);
  });

  it("la frontera con Diseño no se cruza en ningún sentido", () => {
    for (const m of ["A-DGRA", "U-A-DGRA", "P-PCUS", "U-P-PCUS"]) expect(esFaseDe(m, impresion)).toBe(false);
    for (const m of ["U-P-IMDI", "P-HPLA", "P-PCMU"]) expect(esFaseDe(m, diseno)).toBe(false);
  });

  it("lee de OLANET, sin vista, sin revisión y con su propia máquina", () => {
    expect(impresion.fuente).toBe("olanet");
    expect(impresion.vista).toBeUndefined();
    expect(impresion.sinRevision).toBe(true);
    expect(impresion.maquina).toBe("IMDI-A");
  });

  it("toda sección que lee de la vista tiene vista", () => {
    for (const s of Object.values(SECCIONES)) {
      if (s.fuente === "vista") expect(s.vista).toBeTruthy();
    }
  });

  it("cada sección tiene nombre corto", () => {
    expect(Object.values(SECCIONES).map((s) => s.nombreCorto)).toEqual(["OT", "Diseño", "Impresión"]);
  });
});
