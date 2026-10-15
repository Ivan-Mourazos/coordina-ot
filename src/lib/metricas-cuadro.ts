import { calcularMetricas, type Medida, type MesMetricas, type MovimientoRegistrado, type Periodo } from "./metricas";
import { diasEntre, sumarDias } from "./fechas";

/** Solo VOLUMEN por persona, a propósito. Un «% que te devuelven» a la vista
 *  de todos cambia cómo se usa la herramienta: se devuelve menos para no
 *  señalar a un compañero, y entonces el número deja de valer. Iván lo decidió
 *  así sabiendo el riesgo (15/10/2026); el % va solo en el total de sección. */
export interface TecnicoMetricas {
  operarioId: string;
  planteos: number;
  revisiones: number;
}
export interface PuntoTendencia {
  desde: string;
  hasta: string;
  terminadas: number;
  planteos: number;
  proporcion: number | null;
  aprobacion: Medida;
}
export interface CuadroMetricas {
  porTecnico: TecnicoMetricas[];
  aprobacion: Medida;
  tendencia: PuntoTendencia[];
  meses: MesMetricas[];
}
const clave = (m: MovimientoRegistrado) => JSON.stringify([m.at, m.ofId, m.motivo, m.operarioId]);
const cierre = (motivo: string) => ["aprobar", "aprobar_corregida", "aprobar_sin_revision"].includes(motivo);
function mediana(valores: number[]): Medida {
  if (!valores.length) return { n: 0, medianaMin: null };
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return { n: orden.length, medianaMin: Math.round(orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2) };
}

/** El contexto incluye otras secciones y fechas anteriores: el autor puede
 * entregar antes del filtro y el revisor puede trabajar en otra sección.
 * Solo los movimientos seleccionados suman; el contexto identifica al autor.
 */
export function calcularCuadroMetricas(
  movimientos: readonly MovimientoRegistrado[],
  historico: readonly MovimientoRegistrado[],
  operarios: readonly string[],
  periodo?: Periodo,
): CuadroMetricas {
  const seleccion = new Set(movimientos.map(clave));
  const personas = new Map<string, TecnicoMetricas>();
  const permitidos = new Set(operarios);
  const persona = (id: string | null | undefined) => {
    if (!id || !permitidos.has(id)) return undefined;
    let p = personas.get(id);
    if (!p) {
      p = { operarioId: id, planteos: 0, revisiones: 0 };
      personas.set(id, p);
    }
    return p;
  };
  const enviado = new Map<string, string>();
  const aprobaciones: { at: string; minutos: number }[] = [];
  // Orden estable sin mutar el registro. La unión evita duplicar el periodo
  // cuando ya forma parte del contexto histórico.
  const todos = [...new Map([...historico, ...movimientos].map((m) => [clave(m), m])).values()]
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const m of todos) {
    const dentro = seleccion.has(clave(m));
    const firmante = dentro ? persona(m.operarioId) : undefined;
    if (m.motivo === "terminar_planteo") {
      if (!enviado.has(m.ofId)) enviado.set(m.ofId, m.at);
      if (firmante) firmante.planteos++;
    } else if (m.motivo === "empezar_revision") {
      if (firmante) firmante.revisiones++;
    } else if (cierre(m.motivo)) {
      const inicio = enviado.get(m.ofId);
      if (dentro && inicio) {
        const minutos = (Date.parse(m.at) - Date.parse(inicio)) / 60000;
        if (Number.isFinite(minutos) && minutos >= 0) aprobaciones.push({ at: m.at, minutos });
      }
      enviado.delete(m.ofId);
    } else if (m.motivo === "anular" || m.motivo === "recuperar_planteo") {
      enviado.delete(m.ofId);
    }
  }
  const fechas = movimientos.map((m) => m.at.slice(0, 10)).sort();
  const desde = periodo?.desde || fechas[0];
  const hasta = periodo?.hasta || fechas.at(-1);
  const tendencia: PuntoTendencia[] = [];
  const meses: MesMetricas[] = [];
  if (desde && hasta) {
    const porMes = new Map(calcularMetricas(movimientos).porMes.map((m) => [m.mes, m]));
    // También se muestran meses sin movimientos y el mes en curso: el hueco
    // es actividad cero, no una razón para quitar una columna del calendario.
    for (let d = `${desde.slice(0, 7)}-01`; d <= hasta;) {
      const mes = d.slice(0, 7);
      meses.push(porMes.get(mes) ?? { mes, planteos: 0, terminadas: 0, revisiones: 0, devoluciones: 0 });
      d = sumarDias(`${mes}-28`, 4).slice(0, 7) + "-01";
    }
    const semanal = diasEntre(desde, hasta) <= 120;
    // Los huecos también se pintan: omitir semanas vacías sugeriría continuidad.
    for (let d = semanal ? desde : `${desde.slice(0, 7)}-01`; d <= hasta;) {
      const siguiente = semanal ? sumarDias(d, 7) : sumarDias(`${d.slice(0, 7)}-28`, 4).slice(0, 7) + "-01";
      const fin = siguiente > hasta ? hasta : sumarDias(siguiente, -1);
      const filas = movimientos.filter((m) => m.at.slice(0, 10) >= d && m.at.slice(0, 10) <= fin);
      const datos = calcularMetricas(filas);
      tendencia.push({ desde: d, hasta: fin, terminadas: datos.volumen.ofTerminadas, planteos: datos.volumen.planteos,
        proporcion: datos.revisiones ? datos.devoluciones / datos.revisiones : null,
        aprobacion: mediana(aprobaciones.filter((a) => a.at.slice(0, 10) >= d && a.at.slice(0, 10) <= fin).map((a) => a.minutos)) });
      d = siguiente;
    }
    // Cada devolución conserva la semana de SU revisión, igual que el total
    // conserva su mes. Cortar primero en semanas daría numeradores ajenos.
    const cuentas = tendencia.map(() => ({ revisiones: 0, devoluciones: 0 }));
    const abiertas = new Map<string, number>();
    for (const m of [...movimientos].sort((a, b) => a.at.localeCompare(b.at))) {
      const dia = m.at.slice(0, 10);
      const i = tendencia.findIndex((p) => dia >= p.desde && dia <= p.hasta);
      if (i < 0) continue;
      if (m.motivo === "empezar_revision") { cuentas[i].revisiones++; abiertas.set(m.ofId, i); }
      else if (m.motivo === "devolver") {
        const inicio = abiertas.get(m.ofId);
        cuentas[inicio ?? i].devoluciones++;
        if (inicio === undefined) cuentas[i].revisiones++;
        abiertas.delete(m.ofId);
      } else if (cierre(m.motivo)) abiertas.delete(m.ofId);
    }
    tendencia.forEach((p, i) => { p.proporcion = cuentas[i].revisiones ? cuentas[i].devoluciones / cuentas[i].revisiones : null; });
  }
  return { porTecnico: operarios.flatMap((id) => personas.has(id) ? [personas.get(id)!] : []),
    // Mediana de ciclos completos, no suma de medianas de tramos distintos.
    // Las correcciones mantienen la primera entrega hasta aprobarse.
    aprobacion: mediana(aprobaciones.map((a) => a.minutos)), tendencia, meses };
}
