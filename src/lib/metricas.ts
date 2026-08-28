import { leerDevolucion } from "./devolucion";

// ─── Cuántas OF vuelven, y por qué ───────────────────────────────────────────
// Sale del REGISTRO DE ACCIONES, no del estado de las OF, y la diferencia no es
// un detalle: `observacion` guarda solo la ÚLTIMA devolución de cada OF. Una
// que vuelve tres veces contaría una, y en cuanto se aprueba deja de parecer
// devuelta — o sea que contando por ahí el número saldría corto y además se
// encogería solo con el tiempo. En el registro cada devolución es una fila y no
// se pierde ninguna.
//
// QUÉ SE PUEDE PREGUNTAR, que es lo que se pidió:
//   · cuántas vuelven, sobre cuántas se revisan (el "1 de cada 5", no el 40)
//   · por qué vuelven, ordenado
//   · si eso mejora, mes a mes
//
// Lo que NO lleva, a propósito: reparto por persona. El dato está en el
// registro, pero un tablero de "quién falla más" cambia cómo se usa la
// herramienta —se devuelve menos para no señalar a nadie— y entonces los
// números dejan de valer. Si se pide, se habla; por defecto no va.

/** Un movimiento del registro, con lo justo para contar. */
export interface MovimientoRegistrado {
  /** ISO. */
  at: string;
  /** El id de la acción: "devolver", "empezar_revision"… */
  motivo: string;
  ofId: string;
  /** Solo la traen las devoluciones; lleva las causas codificadas. */
  observacion: string | null;
}

export interface CuentaCausa {
  /** Id de `causa_devolucion`, o null para las devoluciones sin causa. */
  id: number | null;
  n: number;
}

export interface MesMetricas {
  /** "2026-08". */
  mes: string;
  revisiones: number;
  devoluciones: number;
}

export interface Metricas {
  /** Revisiones empezadas: es el denominador. Una OF que se revisa, se
   *  devuelve y se vuelve a revisar cuenta DOS, que es lo correcto — son dos
   *  repasos, y el segundo también podía acabar mal. */
  revisiones: number;
  devoluciones: number;
  /** De más frecuente a menos. Suman MÁS que `devoluciones` porque una
   *  devolución lleva varias causas, y así es como se lee: "22 de las 40
   *  llevaban error en cotas". */
  porCausa: CuentaCausa[];
  /** Del mes más antiguo al más reciente. */
  porMes: MesMetricas[];
}

const mesDe = (iso: string) => iso.slice(0, 7);

/** Cuenta lo que hay en el registro.
 *
 *  `sinCausa` no se separa en su propio campo: entra en `porCausa` con
 *  `id: null`. Son las devoluciones anteriores a que existieran las causas —y
 *  las que se escribieron sin marcar ninguna—, y esconderlas haría que los
 *  porcentajes no cuadraran con el total sin decir por qué. */
export function calcularMetricas(movs: readonly MovimientoRegistrado[]): Metricas {
  let revisiones = 0;
  let devoluciones = 0;
  const porCausa = new Map<number | null, number>();
  const porMes = new Map<string, MesMetricas>();

  const mes = (at: string) => {
    const k = mesDe(at);
    const m = porMes.get(k) ?? { mes: k, revisiones: 0, devoluciones: 0 };
    porMes.set(k, m);
    return m;
  };

  for (const mov of movs) {
    if (mov.motivo === "empezar_revision") {
      revisiones++;
      mes(mov.at).revisiones++;
      continue;
    }
    if (mov.motivo !== "devolver") continue;

    devoluciones++;
    mes(mov.at).devoluciones++;
    const causas = leerDevolucion(mov.observacion).causas;
    if (causas.length === 0) porCausa.set(null, (porCausa.get(null) ?? 0) + 1);
    // `new Set`: si una devolución trajera la misma causa dos veces, cuenta
    // una. No debería pasar desde la interfaz, pero el registro es de solo
    // añadir y lo que entró mal una vez se queda ahí para siempre.
    else for (const id of new Set(causas)) porCausa.set(id, (porCausa.get(id) ?? 0) + 1);
  }

  return {
    revisiones,
    devoluciones,
    porCausa: [...porCausa.entries()]
      .map(([id, n]) => ({ id, n }))
      // A igualdad de cuenta, las que tienen causa antes que el cajón sin
      // causa: ese no dice nada y no debe encabezar la lista.
      .sort((a, b) => b.n - a.n || (a.id === null ? 1 : b.id === null ? -1 : a.id - b.id)),
    porMes: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
  };
}

/** Cuántas de cada N vuelven. Null cuando no hubo revisiones: sin denominador
 *  no hay proporción, y pintar un 0 % diría que todo va bien cuando lo que
 *  pasa es que no se ha revisado nada. */
export function proporcionDevueltas(m: {
  revisiones: number;
  devoluciones: number;
}): number | null {
  return m.revisiones > 0 ? m.devoluciones / m.revisiones : null;
}
