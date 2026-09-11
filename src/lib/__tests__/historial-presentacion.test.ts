import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { nombreHistorial } from "../nombre-historial";
import { DocumentosRps } from "../../components/DocumentosRps";
import { HistorialTareas } from "../../components/HistorialTareas";
import { agruparTiemposPorCentro } from "../historial-centros";

test("nombres y primer apellido, sin códigos y conservando nombres compuestos", () => {
  expect(nombreHistorial("SÁNCHEZ MERA, JOSÉ MANUEL")).toBe("José Manuel Sánchez");
  expect(nombreHistorial("LÓPEZ GARCÍA, SILVIA")).toBe("Silvia López");
  expect(nombreHistorial("DE LA TORRE LÓPEZ, ANA")).toBe("Ana de la Torre");
  expect(nombreHistorial("  DA   SILVA PEREIRA, JOSE LUIS  ")).toBe("José Luis da Silva");
  expect(nombreHistorial("167")).toBe("Nombre no disponible");
});

test("documentos plegados y todas las fotos juntas, antes del planteamiento", () => {
  const documentos = [
    { clase: "Planteamiento", archivo: "plan.pdf" },
    { clase: "Fotos de la visita", archivo: "visita.jpg" },
    { clase: "Fotos de la instalación", archivo: "montaje.jpg" },
    { clase: "Mantenimiento (SAT)", archivo: "sat.png" },
    { clase: "Mantenimiento (SAT)", archivo: "parte.pdf" },
  ].map((d, i) => ({ ...d, descripcion: d.archivo, url: `/documento/${i}` }));
  const html = renderToStaticMarkup(createElement(DocumentosRps, { documentos }));
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
  expect(html).not.toContain('aria-expanded="true"');
  expect(html).not.toContain("Fotos de la visita");
  expect(html).not.toContain("Fotos de la instalación");
  expect(html.indexOf("Fotos")).toBeLessThan(html.indexOf("Planteamiento"));
  expect(html).not.toContain("<img");
});

test("el desglose conserva tareas, totales y personas de la sección sin sumar dos veces", () => {
  const base = { orden: "0231922", descripcion: "Lona", centro: "ot" as const, tarea: "1", descripcionTarea: "Plantear", empleado: "Iván Sánchez", minutos: 7 };
  const ofs = agruparTiemposPorCentro([base, { ...base, empleado: "Jaime Vázquez", minutos: 3 },
    { ...base, tarea: "5", centro: "taller", descripcionTarea: "Confeccionar", empleado: "Silvia López", minutos: 34 }], (n) => n);
  expect(ofs[0].tareas![0].tiempoImputadoMin).toBe(10);
  expect(ofs[0].tareas![0].personas).toHaveLength(2);
  const html = renderToStaticMarkup(createElement(HistorialTareas, { ofs, seccion: "ot" }));
  expect(html).toContain("Tareas y tiempos");
  expect(html).toContain("Confeccionar");
  expect(html).toContain("34m");
  expect(html).toContain("Iván Sánchez");
  expect(html).toContain("Jaime Vázquez");
  expect(html).not.toContain("Silvia López");
});
