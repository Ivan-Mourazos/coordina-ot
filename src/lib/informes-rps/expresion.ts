// ─── Las expresiones de las plantillas de RPS ────────────────────────────────
// Los textos de Stimulsoft mezclan literal y expresiones C# entre llaves:
//   «MATERIALES RESERVADOS OF {Result.ManufacturingOrder_CodManufacturingOrder}»
// Las dos plantillas que copiamos solo usan un trozo pequeño de C#: campos de
// la fila (Result.X), Today, concatenar con +, comparar con ==, IIF(…),
// String.IsNullOrEmpty(…) y Format("{0:N2}", …). Eso es lo que entiende esto;
// cualquier otra cosa lanza un error, para que no se imprima algo a medias.

export type Valor = string | number | boolean | Date | null;
export type Fila = Record<string, Valor>;

export interface Contexto {
  fila: Fila;
  hoy: Date;
}

// ─── Trocear el texto ────────────────────────────────────────────────────────
/** Separa literal y expresiones. Las llaves dentro de comillas («"{0:N2}"») no
 *  cierran la expresión. */
export function trozos(texto: string): Array<{ literal: string } | { expresion: string }> {
  const out: Array<{ literal: string } | { expresion: string }> = [];
  let i = 0;
  let literal = "";
  while (i < texto.length) {
    if (texto[i] !== "{") {
      literal += texto[i++];
      continue;
    }
    let j = i + 1;
    let profundidad = 1;
    let comillas = false;
    while (j < texto.length && profundidad > 0) {
      const c = texto[j];
      if (c === '"') comillas = !comillas;
      else if (!comillas && c === "{") profundidad++;
      else if (!comillas && c === "}") profundidad--;
      j++;
    }
    if (profundidad > 0) {
      literal += texto.slice(i);
      break;
    }
    if (literal) out.push({ literal });
    literal = "";
    out.push({ expresion: texto.slice(i + 1, j - 1) });
    i = j;
  }
  if (literal) out.push({ literal });
  return out;
}

// ─── Analizar ────────────────────────────────────────────────────────────────
type Nodo =
  | { t: "texto"; v: string }
  | { t: "numero"; v: number }
  | { t: "nombre"; v: string }
  | { t: "llamada"; f: string; args: Nodo[] }
  | { t: "suma"; a: Nodo; b: Nodo }
  | { t: "igual"; a: Nodo; b: Nodo };

function tokens(s: string): string[] {
  const out: string[] = [];
  const re = /\s*("(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?|[A-Za-z_][\w.]*|==|[+(),])/gy;
  let m: RegExpExecArray | null;
  let fin = 0;
  while ((m = re.exec(s))) {
    out.push(m[1]);
    fin = re.lastIndex;
  }
  if (s.slice(fin).trim()) throw new Error(`Expresión no entendida: «${s}»`);
  return out;
}

function analizar(expr: string): Nodo {
  const t = tokens(expr);
  let i = 0;
  const ver = () => t[i];
  const tomar = (esperado?: string) => {
    const x = t[i++];
    if (esperado !== undefined && x !== esperado) throw new Error(`Se esperaba «${esperado}» en «${expr}»`);
    if (x === undefined) throw new Error(`Expresión incompleta: «${expr}»`);
    return x;
  };
  const primario = (): Nodo => {
    const x = tomar();
    if (x === "(") {
      const n = igualdad();
      tomar(")");
      return n;
    }
    if (x.startsWith('"')) return { t: "texto", v: JSON.parse(x) };
    if (/^\d/.test(x)) return { t: "numero", v: Number(x) };
    if (ver() === "(") {
      tomar("(");
      const args: Nodo[] = [];
      if (ver() !== ")") {
        args.push(igualdad());
        while (ver() === ",") {
          tomar(",");
          args.push(igualdad());
        }
      }
      tomar(")");
      return { t: "llamada", f: x, args };
    }
    return { t: "nombre", v: x };
  };
  const suma = (): Nodo => {
    let n = primario();
    while (ver() === "+") {
      tomar("+");
      n = { t: "suma", a: n, b: primario() };
    }
    return n;
  };
  const igualdad = (): Nodo => {
    const a = suma();
    if (ver() === "==") {
      tomar("==");
      return { t: "igual", a, b: suma() };
    }
    return a;
  };
  const n = igualdad();
  if (i !== t.length) throw new Error(`Sobra algo en «${expr}»`);
  return n;
}

// ─── Evaluar ─────────────────────────────────────────────────────────────────
const cache = new Map<string, Nodo>();

/** Número como lo escribe .NET en España: coma decimal, sin ceros de sobra. */
export function numeroATexto(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6))).replace(".", ",");
}

export function aTexto(v: Valor, formatoFecha?: string): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return fechaATexto(v, formatoFecha);
  if (typeof v === "number") return numeroATexto(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  return v;
}

/** «d» (por defecto) = 19/11/2026; «D» = jueves, 19 de noviembre de 2026.
 *  Las fechas de RPS son de calendario: se leen en UTC para no correr un día. */
export function fechaATexto(f: Date, formato = "d"): string {
  if (f.getUTCFullYear() <= 1900) return "";
  if (formato === "D") {
    return f.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }
  return f.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function evaluarNodo(n: Nodo, c: Contexto): Valor {
  switch (n.t) {
    case "texto":
      return n.v;
    case "numero":
      return n.v;
    case "nombre":
      if (n.v === "Today") return c.hoy;
      if (n.v.startsWith("Result.")) {
        const campo = n.v.slice("Result.".length);
        if (!(campo in c.fila)) throw new Error(`La fila no trae el campo ${campo}`);
        return c.fila[campo];
      }
      throw new Error(`Nombre desconocido: ${n.v}`);
    case "suma": {
      const a = evaluarNodo(n.a, c);
      const b = evaluarNodo(n.b, c);
      if (typeof a === "number" && typeof b === "number") return a + b;
      return aTexto(a) + aTexto(b);
    }
    case "igual": {
      const a = evaluarNodo(n.a, c);
      const b = evaluarNodo(n.b, c);
      // Como en la base de datos de RPS: un número vacío cuenta como 0.
      if (typeof b === "number") return (typeof a === "number" ? a : Number(a ?? 0)) === b;
      return aTexto(a) === aTexto(b);
    }
    case "llamada": {
      if (n.f === "IIF") {
        if (n.args.length !== 3) throw new Error("IIF necesita tres partes");
        return evaluarNodo(n.args[0], c) ? evaluarNodo(n.args[1], c) : evaluarNodo(n.args[2], c);
      }
      if (n.f === "String.IsNullOrEmpty") {
        const v = evaluarNodo(n.args[0], c);
        return v === null || v === "";
      }
      if (n.f === "Format") {
        const plantilla = evaluarNodo(n.args[0], c);
        const v = evaluarNodo(n.args[1], c);
        const m = typeof plantilla === "string" ? plantilla.match(/^\{0:N(\d+)\}$/) : null;
        if (!m) throw new Error(`Formato no admitido: ${String(plantilla)}`);
        const d = Number(m[1]);
        return typeof v === "number"
          ? v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true })
          : aTexto(v);
      }
      throw new Error(`Función no admitida: ${n.f}`);
    }
  }
}

export function evaluar(expr: string, c: Contexto): Valor {
  let n = cache.get(expr);
  if (!n) {
    n = analizar(expr);
    cache.set(expr, n);
  }
  return evaluarNodo(n, c);
}

/** El texto de una pieza, ya relleno. Una expresión sola conserva el formato
 *  de fecha de la pieza («D» en la fecha de entrega). */
export function rellenar(texto: string, c: Contexto, formatoFecha?: string): string {
  return trozos(texto)
    .map((t) => ("literal" in t ? t.literal : aTexto(evaluar(t.expresion, c), formatoFecha)))
    .join("");
}
