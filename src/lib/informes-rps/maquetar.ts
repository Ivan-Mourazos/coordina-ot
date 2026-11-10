// ─── Colocar una plantilla de RPS en páginas ─────────────────────────────────
// Hace lo que hace Stimulsoft con las bandas de nuestras dos plantillas:
//
//   · cabecera de grupo: una vez por OF (agrupa por la expresión de la banda);
//   · datos: una vez por fila de la OF, en el orden de la plantilla, saltando
//     las filas que una condición oculta (tarea «0», reserva de 0);
//   · pie de grupo: al fondo de la página si lo pide («PrintAtBottom») y, si
//     lo pide, página nueva después;
//   · resumen: una vez al final.
//
// Las líneas y el rectángulo «sueltos» de la página van de un punto en una
// banda a otro punto en otra (de la cabecera al pie): se calculan con dónde
// cayó cada banda. Un texto que puede crecer estira su banda y empuja lo que
// tiene debajo. Todo en centímetros desde la esquina de la página.

import { anchosCode128 } from "./code128";
import { evaluar, rellenar, type Fila } from "./expresion";

// ─── La plantilla (scripts/extraer-informe-rps.mjs) ─────────────────────────
export interface Fuente {
  familia: string;
  tamano: number;
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  pixel?: boolean;
}
export interface Borde {
  lados: Array<"arriba" | "derecha" | "abajo" | "izquierda">;
  color?: string;
  grosor: number;
}
export interface Condicion {
  campo: string;
  operador: string;
  valor: string;
  ocultar?: boolean;
}
interface Base {
  nombre: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}
export type Pieza =
  | (Base & {
      tipo: "texto";
      texto: string;
      fuente?: Fuente;
      horizontal?: string;
      vertical?: string;
      borde?: Borde;
      fondo?: string;
      tinta?: string;
      ajustar?: boolean;
      crecer?: boolean;
      formatoFecha?: string;
      condiciones?: Condicion[];
    })
  | (Base & { tipo: "barras"; codigo: string })
  | (Base & { tipo: "imagen"; datos?: string })
  | (Base & { tipo: "lineaH"; color?: string; grosor: number })
  | (Base & { tipo: "inicio" | "fin"; referencia?: string })
  | (Base & { tipo: "rectangulo" | "lineaV"; guid?: string; color?: string; grosor: number })
  | (Base & { tipo: "desconocido" });

export interface Banda {
  tipo: string;
  nombre: string;
  alto: number;
  agruparPor?: string;
  ordenarPor?: { campo: string; descendente: boolean };
  nuevaPaginaDespues?: boolean;
  imprimirAbajo?: boolean;
  condiciones?: Condicion[];
  piezas: Pieza[];
}
export interface Plantilla {
  codigo: string;
  pagina: { ancho: number; alto: number; margenes?: number[] };
  bandas: Banda[];
  sueltas: Pieza[];
}

// ─── Lo que sale: piezas ya colocadas y rellenas ─────────────────────────────
export type Elemento =
  | { tipo: "texto"; x: number; y: number; ancho: number; alto: number; texto: string; pieza: Extract<Pieza, { tipo: "texto" }> }
  | { tipo: "barras"; x: number; y: number; ancho: number; alto: number; anchos: number[]; texto: string }
  | { tipo: "imagen"; x: number; y: number; ancho: number; alto: number; datos: string }
  | { tipo: "linea"; x1: number; y1: number; x2: number; y2: number; color: string; grosor: number }
  | { tipo: "rectangulo"; x: number; y: number; ancho: number; alto: number; color: string; grosor: number };

export interface Pagina {
  elementos: Elemento[];
}

const PT_A_CM = 2.54 / 72;

function cumple(c: Condicion, fila: Fila, hoy: Date): boolean {
  const v = evaluar(`Result.${c.campo}`, { fila, hoy });
  const esperado = c.valor;
  if (c.operador !== "EqualTo") return false;
  if (typeof v === "boolean") return String(v) === esperado.toLowerCase();
  if (typeof v === "number" || v === null) {
    const n = Number(esperado);
    if (!Number.isNaN(n)) return (v ?? 0) === n;
  }
  return String(v ?? "") === esperado;
}

const oculta = (conds: Condicion[] | undefined, fila: Fila, hoy: Date) =>
  !!conds?.some((c) => c.ocultar && cumple(c, fila, hoy));

/** Alto que necesita un texto que puede crecer. Estimación: ancho medio de
 *  carácter de Arial ≈ 0,5 de su tamaño; interlineado 1,15. */
export function altoNecesario(texto: string, anchoCm: number, fuente?: Fuente): number {
  const pt = fuente?.pixel ? (fuente.tamano * 72) / 96 : (fuente?.tamano ?? 10);
  const caracter = pt * 0.5 * PT_A_CM * (fuente?.negrita ? 1.08 : 1);
  const porLinea = Math.max(1, Math.floor(anchoCm / caracter));
  const lineas = texto
    .split(/\r?\n/)
    .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / porLinea)), 0);
  return lineas * pt * 1.15 * PT_A_CM;
}

interface Colocada {
  banda: Banda;
  pagina: number;
  y: number;
  alto: number;
  /** Desplazamiento vertical de cada pieza por textos que crecieron encima. */
  empuje: (pieza: Base) => number;
}

export function maquetar(plantilla: Plantilla, filas: readonly Fila[], hoy: Date): Pagina[] {
  const [mIzq, , mArr, mAbj] = plantilla.pagina.margenes ?? [0, 0, 0, 0];
  const arriba = mArr;
  const abajo = plantilla.pagina.alto - mAbj;
  const paginas: Pagina[] = [{ elementos: [] }];
  const colocadas: Colocada[] = [];
  let y = arriba;
  const nuevaPagina = () => {
    paginas.push({ elementos: [] });
    y = arriba;
  };

  /** Rellena y coloca una banda en (página actual, y). */
  const colocar = (banda: Banda, fila: Fila, yBanda: number) => {
    const c = { fila, hoy };
    // Primero, cuánto crece cada texto que puede crecer.
    const crecen: Array<{ y: number; fondo: number; delta: number }> = [];
    const textos = new Map<Pieza, string>();
    for (const p of banda.piezas) {
      if (p.tipo !== "texto") continue;
      const t = rellenar(p.texto, c, p.formatoFecha);
      textos.set(p, t);
      if (p.crecer) {
        const delta = altoNecesario(t, p.ancho, p.fuente) - p.alto;
        if (delta > 0) crecen.push({ y: p.y, fondo: p.y + p.alto, delta });
      }
    }
    const empuje = (p: Base) => crecen.filter((g) => p.y >= g.fondo - 1e-6).reduce((m, g) => Math.max(m, g.delta), 0);
    const crece = (p: Base) => crecen.find((g) => Math.abs(g.y - p.y) < 1e-6 && Math.abs(g.fondo - (p.y + p.alto)) < 1e-6)?.delta ?? 0;
    const alto = banda.alto + crecen.reduce((m, g) => Math.max(m, g.delta), 0);
    const pagina = paginas[paginas.length - 1];

    for (const p of banda.piezas) {
      const x = mIzq + p.x;
      const yp = yBanda + p.y + empuje(p);
      if (p.tipo === "texto") {
        if (oculta(p.condiciones, fila, hoy)) continue;
        pagina.elementos.push({ tipo: "texto", x, y: yp, ancho: p.ancho, alto: p.alto + crece(p), texto: textos.get(p) ?? "", pieza: p });
      } else if (p.tipo === "barras") {
        const texto = rellenar(p.codigo, c);
        if (texto) pagina.elementos.push({ tipo: "barras", x, y: yp, ancho: p.ancho, alto: p.alto, anchos: anchosCode128(texto), texto });
      } else if (p.tipo === "imagen" && p.datos) {
        pagina.elementos.push({ tipo: "imagen", x, y: yp, ancho: p.ancho, alto: p.alto, datos: p.datos });
      } else if (p.tipo === "lineaH") {
        pagina.elementos.push({ tipo: "linea", x1: x, y1: yp, x2: x + p.ancho, y2: yp, color: p.color ?? "black", grosor: p.grosor });
      }
    }
    colocadas.push({ banda, pagina: paginas.length - 1, y: yBanda, alto, empuje });
    return alto;
  };

  const cabecera = plantilla.bandas.find((b) => b.tipo === "cabeceraGrupo");
  const datos = plantilla.bandas.find((b) => b.tipo === "datos");
  const pie = plantilla.bandas.find((b) => b.tipo === "pieGrupo");
  const resumen = plantilla.bandas.find((b) => b.tipo === "resumen");

  // Grupos en el orden en que llegan.
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const clave = cabecera?.agruparPor ? rellenar(cabecera.agruparPor, { fila: f, hoy }) : "";
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(f);
  }

  const reservaPie = pie?.imprimirAbajo ? pie.alto : 0;
  let primera = true;
  for (const filasGrupo of grupos.values()) {
    if (!primera && y > arriba + 1e-6) {
      // Viene de un grupo sin salto de página: sigue debajo si cabe.
      if (cabecera && y + cabecera.alto > abajo - reservaPie) nuevaPagina();
    }
    primera = false;
    const inicioGrupo = colocadas.length;
    if (cabecera) y += colocar(cabecera, filasGrupo[0], y);
    if (datos) {
      const orden = datos.ordenarPor;
      const lista = filasGrupo
        .filter((f) => !oculta(datos.condiciones, f, hoy))
        .sort((a, b) => {
          if (!orden) return 0;
          const x = a[orden.campo] ?? "";
          const z = b[orden.campo] ?? "";
          const r = typeof x === "number" && typeof z === "number" ? x - z : String(x).localeCompare(String(z), "es", { numeric: true });
          return orden.descendente ? -r : r;
        });
      for (const f of lista) {
        if (y + datos.alto > abajo - reservaPie + 1e-6) nuevaPagina();
        y += colocar(datos, f, y);
      }
    }
    if (pie) {
      const ultima = filasGrupo[filasGrupo.length - 1];
      if (pie.imprimirAbajo) {
        const yPie = abajo - pie.alto;
        if (y > yPie + 1e-6) nuevaPagina();
        y = yPie;
      } else if (y + pie.alto > abajo + 1e-6) {
        nuevaPagina();
      }
      y += colocar(pie, ultima, y);
    }
    dibujarSueltas(plantilla, colocadas.slice(inicioGrupo), paginas, mIzq);
    if (pie?.nuevaPaginaDespues) nuevaPagina();
  }

  if (resumen && filas.length) {
    if (y + resumen.alto > abajo + 1e-6 && y > arriba + 1e-6) nuevaPagina();
    y += colocar(resumen, filas[filas.length - 1], y);
  }

  // La última página puede haber quedado vacía por un «página nueva después».
  while (paginas.length > 1 && paginas[paginas.length - 1].elementos.length === 0) paginas.pop();
  return paginas;
}

/** Rectángulos y líneas verticales que van de un punto de una banda a otro de
 *  otra. Si el fin cae en otra página, se cortan al pie de la del inicio. */
function dibujarSueltas(plantilla: Plantilla, colocadas: Colocada[], paginas: Pagina[], mIzq: number) {
  const abajo = plantilla.pagina.alto - (plantilla.pagina.margenes?.[3] ?? 0);
  for (const s of plantilla.sueltas) {
    if (s.tipo !== "rectangulo" && s.tipo !== "lineaV") continue;
    const punto = (tipo: "inicio" | "fin") => {
      for (const c of colocadas) {
        const p = c.banda.piezas.find((q) => q.tipo === tipo && "referencia" in q && q.referencia === s.guid);
        if (p) return { pagina: c.pagina, x: mIzq + p.x, y: c.y + p.y + c.empuje(p) };
      }
      return null;
    };
    const a = punto("inicio");
    const b = punto("fin");
    if (!a) continue;
    const y2 = b && b.pagina === a.pagina ? b.y : abajo;
    const x2 = b ? b.x : a.x + s.ancho;
    const color = s.color ?? "black";
    if (s.tipo === "rectangulo") {
      paginas[a.pagina].elementos.push({ tipo: "rectangulo", x: a.x, y: a.y, ancho: x2 - a.x, alto: y2 - a.y, color, grosor: s.grosor });
    } else {
      paginas[a.pagina].elementos.push({ tipo: "linea", x1: a.x, y1: a.y, x2: a.x, y2, color, grosor: s.grosor });
    }
  }
}
