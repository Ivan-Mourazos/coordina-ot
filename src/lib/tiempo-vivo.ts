import type { Intervalo } from "./fichaje";
import type { FichajeWebOF, OF, Pedido } from "./types";

// ─── El tiempo que se ve correr ──────────────────────────────────────────────
// Los minutos de cada OF los calcula el servidor (ver `aplicarTiemposFichaje`)
// y el navegador pide el tablero cada 30 s. Entre vuelta y vuelta el "Tiempo"
// de la ficha, el de la fila del panel y el de las zonas se quedaban quietos y
// luego saltaban de golpe; con el parte abierto delante, que es como se trabaja
// casi siempre, no se veía avanzar.
//
// El servidor manda, con cada OF que se está fichando, a qué ritmo sube
// (`ritmoVivo`) y a qué hora lo calculó (`calculadoAt`). Aquí se adelanta lo que
// ha corrido desde entonces. No es un segundo cálculo del tiempo: la siguiente
// vuelta del tablero trae el de verdad y este se descarta.
//
// LO MÍO SE CUENTA CON MI FICHAJE, no con el ritmo del servidor. El servidor
// va hasta 30 s por detrás: con su ritmo, al pausar el contador seguía subiendo
// medio minuto, y al fichar se quedaba quieto otro medio. Mi fichaje lo tiene
// el navegador al instante, así que de mí se toman mis tramos, recortados a lo
// que ha pasado desde el cálculo; del ritmo solo se usa la parte de los demás.

/** Tope de lo que se adelanta. Si el tablero deja de llegar (red caída,
 *  servidor reiniciando), el contador se para aquí en vez de seguir sumando un
 *  tiempo que nadie ha confirmado. Son diez vueltas del tablero. */
const MAX_ADELANTO_MIN = 5;

/** Mi fichaje, para contar lo mío sin esperar al servidor. */
export interface FichajePropio {
  operarioId: string;
  intervalos: readonly Intervalo[];
}

/** ¿Hay algo que adelantar? Para no repintar el tablero cada pocos segundos
 *  cuando no corre ningún reloj. */
export function hayTiempoVivo(pedidos: readonly Pedido[], propio?: FichajePropio): boolean {
  return (
    pedidos.some((p) => p.ofs.some((o) => o.ritmoVivo)) ||
    (propio?.intervalos.some((iv) => iv.fin === null) ?? false)
  );
}

/** Los pedidos con los minutos adelantados hasta `ahora` (hora del SERVIDOR,
 *  ver `ahoraDelServidor`). Lo que no se mueve se devuelve tal cual, misma
 *  referencia, para no repintar lo que no ha cambiado. */
export function adelantarTiempos(
  pedidos: Pedido[],
  calculadoAt: string | undefined,
  ahora: number,
  propio?: FichajePropio,
): Pedido[] {
  if (!calculadoAt) return pedidos;
  const desde = Date.parse(calculadoAt);
  const hasta = Math.min(ahora, desde + MAX_ADELANTO_MIN * 60_000);
  if (!(hasta > desde)) return pedidos;
  const min = (hasta - desde) / 60_000;

  // Lo mío por OF: lo que mis tramos se solapan con [desde, hasta].
  const mio = new Map<string, { plantear: number; revisar: number }>();
  for (const iv of propio?.intervalos ?? []) {
    if (iv.ofIds.length === 0) continue;
    const a = Math.max(desde, Date.parse(iv.inicio));
    const b = Math.min(hasta, iv.fin ? Date.parse(iv.fin) : hasta);
    if (!(b > a)) continue;
    const parte = (b - a) / 60_000 / iv.ofIds.length;
    for (const id of iv.ofIds) {
      const m = mio.get(id) ?? { plantear: 0, revisar: 0 };
      if (iv.rol === "plantear") m.plantear += parte;
      else m.revisar += parte;
      mio.set(id, m);
    }
  }

  let cambiado = false;
  const salida = pedidos.map((p) => {
    if (!p.ofs.some((o) => o.ritmoVivo || mio.has(o.id))) return p;
    cambiado = true;
    return { ...p, ofs: p.ofs.map((o) => adelantarOF(o, min, mio.get(o.id), propio?.operarioId)) };
  });
  return cambiado ? salida : pedidos;
}

function adelantarOF(
  of: OF,
  min: number,
  mio: { plantear: number; revisar: number } | undefined,
  yo: string | undefined,
): OF {
  // De los demás, su ritmo por el tiempo pasado; de mí, lo que dicen mis tramos.
  const otros = (of.ritmoVivo?.porOperario ?? []).filter((o) => o.operarioId !== yo);
  const suma: FichajeWebOF[] = otros.map((o) => ({
    operarioId: o.operarioId,
    planteoMin: o.planteoMin * min,
    revisionMin: o.revisionMin * min,
  }));
  if (mio && yo) suma.push({ operarioId: yo, planteoMin: mio.plantear, revisionMin: mio.revisar });
  if (suma.length === 0) return of;

  const planteo = suma.reduce((n, s) => n + s.planteoMin, 0);
  const revision = suma.reduce((n, s) => n + s.revisionMin, 0);
  const fichadoWeb: FichajeWebOF[] = (of.fichadoWeb ?? []).map((f) => ({ ...f }));
  for (const s of suma) {
    let f = fichadoWeb.find((x) => x.operarioId === s.operarioId);
    if (!f) {
      f = { operarioId: s.operarioId, planteoMin: 0, revisionMin: 0 };
      fichadoWeb.push(f);
    }
    f.planteoMin += s.planteoMin;
    f.revisionMin += s.revisionMin;
  }

  return {
    ...of,
    tiempoPlanteoMin: of.tiempoPlanteoMin + planteo,
    tiempoRevisionMin: of.tiempoRevisionMin + revision,
    planteoWebMin: (of.planteoWebMin ?? 0) + planteo,
    revisionWebMin: (of.revisionWebMin ?? 0) + revision,
    fichadoWeb,
  };
}
