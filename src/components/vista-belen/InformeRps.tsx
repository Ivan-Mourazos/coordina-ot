import type { CSSProperties } from "react";
import type { Elemento, Pagina } from "@/lib/informes-rps/maquetar";

// ─── Pinta las páginas de un informe de RPS ──────────────────────────────────
// Cada página es una hoja A4 de verdad (cm) con sus piezas en posición
// absoluta, tal y como las coloca la plantilla de RPS. Sin colores de la web:
// es papel. Se imprime con el navegador (ver app/vista-belen/imprimir).

const cm = (n: number) => `${n.toFixed(3)}cm`;

/** Grosor de borde de Stimulsoft (en píxeles de pantalla) a algo que se vea
 *  igual en papel. */
const grosor = (g: number) => `${Math.max(0.5, g * 0.6).toFixed(2)}px`;

function estiloTexto(e: Extract<Elemento, { tipo: "texto" }>): CSSProperties {
  const p = e.pieza;
  const f = p.fuente;
  const b = p.borde;
  const linea = b ? `${grosor(b.grosor)} solid ${b.color ?? "black"}` : undefined;
  const lado = (l: "arriba" | "derecha" | "abajo" | "izquierda") => (b?.lados.includes(l) ? linea : undefined);
  return {
    position: "absolute",
    left: cm(e.x),
    top: cm(e.y),
    width: cm(e.ancho),
    height: cm(e.alto),
    boxSizing: "border-box",
    fontFamily: f?.familia ? `"${f.familia}", Arial, sans-serif` : "Arial, sans-serif",
    fontSize: f ? (f.pixel ? `${f.tamano}px` : `${f.tamano}pt`) : "10pt",
    fontWeight: f?.negrita ? 700 : 400,
    fontStyle: f?.cursiva ? "italic" : undefined,
    textDecoration: f?.subrayado ? "underline" : undefined,
    color: p.tinta && p.tinta !== "transparent" ? p.tinta : "black",
    background: p.fondo && p.fondo !== "transparent" ? p.fondo : undefined,
    borderTop: lado("arriba"),
    borderRight: lado("derecha"),
    borderBottom: lado("abajo"),
    borderLeft: lado("izquierda"),
    display: "flex",
    alignItems: p.vertical === "center" ? "center" : p.vertical === "bottom" ? "flex-end" : "flex-start",
    justifyContent: p.horizontal === "center" ? "center" : p.horizontal === "right" ? "flex-end" : "flex-start",
    textAlign: p.horizontal === "center" ? "center" : p.horizontal === "right" ? "right" : "left",
    whiteSpace: p.ajustar ? "pre-wrap" : "pre",
    overflow: "hidden",
    lineHeight: 1.15,
    padding: "0 1px",
  };
}

function Barras({ e }: { e: Extract<Elemento, { tipo: "barras" }> }) {
  const total = e.anchos.reduce((a, b) => a + b, 0);
  let x = 0;
  const barras: Array<{ x: number; w: number }> = [];
  e.anchos.forEach((w, i) => {
    if (i % 2 === 0) barras.push({ x, w });
    x += w;
  });
  return (
    <svg
      role="img"
      aria-label={`Código de barras ${e.texto}`}
      viewBox={`0 0 ${total} 1`}
      preserveAspectRatio="none"
      style={{ position: "absolute", left: cm(e.x), top: cm(e.y), width: cm(e.ancho), height: cm(e.alto) }}
      shapeRendering="crispEdges"
    >
      {barras.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={1} fill="black" />
      ))}
    </svg>
  );
}

function Pieza({ e }: { e: Elemento }) {
  switch (e.tipo) {
    case "texto":
      return <div style={estiloTexto(e)}>{e.texto}</div>;
    case "barras":
      return <Barras e={e} />;
    case "imagen":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- imagen incrustada en la plantilla de RPS (base64), papel
        <img
          alt=""
          src={`data:image/png;base64,${e.datos}`}
          style={{ position: "absolute", left: cm(e.x), top: cm(e.y), width: cm(e.ancho), height: cm(e.alto), objectFit: "contain" }}
        />
      );
    case "linea": {
      const horizontal = Math.abs(e.y1 - e.y2) < 1e-6;
      return (
        <div
          style={{
            position: "absolute",
            left: cm(Math.min(e.x1, e.x2)),
            top: cm(Math.min(e.y1, e.y2)),
            width: horizontal ? cm(Math.abs(e.x2 - e.x1)) : 0,
            height: horizontal ? 0 : cm(Math.abs(e.y2 - e.y1)),
            borderTop: horizontal ? `${grosor(e.grosor)} solid ${e.color}` : undefined,
            borderLeft: horizontal ? undefined : `${grosor(e.grosor)} solid ${e.color}`,
          }}
        />
      );
    }
    case "rectangulo":
      return (
        <div
          style={{
            position: "absolute",
            left: cm(e.x),
            top: cm(e.y),
            width: cm(e.ancho),
            height: cm(e.alto),
            boxSizing: "border-box",
            border: `${grosor(e.grosor)} solid ${e.color}`,
          }}
        />
      );
  }
}

export function PaginasInforme({ paginas, titulo }: { paginas: Pagina[]; titulo: string }) {
  return (
    <>
      {paginas.map((p, i) => (
        <section key={i} aria-label={`${titulo}, página ${i + 1}`} className="hoja-a4">
          {p.elementos.map((e, j) => (
            <Pieza key={j} e={e} />
          ))}
        </section>
      ))}
    </>
  );
}
