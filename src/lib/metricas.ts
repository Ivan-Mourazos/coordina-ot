import { leerDevolucion } from "./devolucion";
import { leerAnulacion } from "./anulacion";

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
// EL MES DE UNA DEVOLUCIÓN ES EL DE SU REVISIÓN, no el día en que se devolvió.
// Contando cada movimiento en su propio mes, una revisión empezada el 31 de
// agosto y devuelta el 1 de septiembre dejaba la revisión en agosto y la
// devolución en septiembre: numerador y denominador de meses distintos. En
// septiembre eso salió como "4 de 2" — un 150 % con todo funcionando bien.
//
// Así el mes se lee tal cual está escrito: "de las 214 revisiones de agosto,
// 77 acabaron volviendo". El precio es que el mes en curso siempre parece
// mejor de lo que acabará siendo, porque sus devoluciones todavía no han
// llegado; eso lo dice la propia pantalla.
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
  /** Las devoluciones DE ESAS revisiones, no las que ocurrieron este mes.
   *
   *  Ver `calcularMetricas`: una revisión empezada el 31 de agosto y devuelta
   *  el 1 de septiembre cuenta en agosto por los dos lados. */
  devoluciones: number;
}

/** Un tramo de tiempo medido entre dos momentos del ciclo. */
export interface Tramo {
  /** Cuántas veces se ha podido medir. Con pocas, la mediana no dice gran cosa
   *  y quien la pinte tiene que poder avisarlo. */
  n: number;
  /** MEDIANA, no media: una OF que se quedó un mes en la cola porque alguien se
   *  fue de vacaciones desplaza la media y hace pensar que todo va lento. La
   *  mediana dice cómo es el caso normal, que es lo que se pregunta. */
  medianaMin: number | null;
}

export interface Tiempos {
  /** De mandarla a revisar a que alguien la coja. Es la espera de verdad: la OF
   *  está lista y no avanza. */
  esperaCola: Tramo;
  /** De empezar la revisión a resolverla, apruebe o devuelva. */
  repaso: Tramo;
  /** De devolverla a que el autor la dé por corregida o la vuelva a mandar. */
  correccion: Tramo;
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

  /** Cuántas OF se anularon, y por qué. El dato lleva guardado desde el
   *  2026-08-11 —anular pide la causa desde entonces— y no lo había mirado
   *  nadie. `causa` es el id de `anulacion.ts`, o null para las anuladas antes
   *  de que se pidiera. */
  anulaciones: number;
  porCausaAnulacion: { causa: string | null; n: number }[];

  /** Dónde se para el trabajo. */
  tiempos: Tiempos;
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
  let anulaciones = 0;
  const porCausa = new Map<number | null, number>();
  const porCausaAnulacion = new Map<string | null, number>();
  const porMes = new Map<string, MesMetricas>();
  const cronometro = new Cronometro();
  // Cuándo empezó la revisión que sigue abierta en cada OF, para poder llevar
  // su devolución al mes que le toca. Se suelta al resolverse (devolver o
  // aprobar): la siguiente vuelta de esa OF es otra revisión distinta.
  const revisionAbierta = new Map<string, string>();

  const mes = (at: string) => {
    const k = mesDe(at);
    const m = porMes.get(k) ?? { mes: k, revisiones: 0, devoluciones: 0 };
    porMes.set(k, m);
    return m;
  };

  for (const mov of movs) {
    cronometro.ve(mov);

    if (mov.motivo === "anular") {
      anulaciones++;
      const a = leerAnulacion(mov.observacion);
      const causa = a?.causa ?? null;
      porCausaAnulacion.set(causa, (porCausaAnulacion.get(causa) ?? 0) + 1);
      continue;
    }
    if (mov.motivo === "empezar_revision") {
      revisiones++;
      mes(mov.at).revisiones++;
      revisionAbierta.set(mov.ofId, mov.at);
      continue;
    }
    if (mov.motivo === "aprobar") {
      // Acabó bien: esa revisión ya no puede traer devolución.
      revisionAbierta.delete(mov.ofId);
      continue;
    }
    if (mov.motivo !== "devolver") continue;

    devoluciones++;
    // Sin revisión apuntada —las devoluciones anteriores a que se registrara
    // `empezar_revision`— se cuenta en su propio mes: descuadra, pero perderla
    // sería peor. Son pocas y solo al principio del histórico.
    const desdeRevision = revisionAbierta.get(mov.ofId);
    mes(desdeRevision ?? mov.at).devoluciones++;
    revisionAbierta.delete(mov.ofId);
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
    anulaciones,
    porCausaAnulacion: [...porCausaAnulacion.entries()]
      .map(([causa, n]) => ({ causa, n }))
      .sort((a, b) => b.n - a.n || (a.causa === null ? 1 : b.causa === null ? -1 : 0)),
    tiempos: cronometro.resultado(),
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

/** Mide los tramos del ciclo emparejando movimientos de la MISMA OF.
 *
 *  Cada tramo tiene un movimiento que lo abre y otro que lo cierra. Se guarda
 *  el momento de apertura por OF y, al llegar el cierre, se apunta la
 *  diferencia y se olvida — así una OF que da tres vueltas mide tres tramos,
 *  que es lo que pasó.
 *
 *  Un tramo abierto que nunca se cierra NO cuenta: la OF sigue esperando y
 *  todavía no se sabe cuánto tardará. Contarla como si hubiera acabado ahora
 *  haría que los números bajaran solos con el tiempo.
 */
class Cronometro {
  private abiertos = new Map<string, string>();
  private medidas: Record<keyof Tiempos, number[]> = {
    esperaCola: [],
    repaso: [],
    correccion: [],
  };

  /** Qué abre y qué cierra cada tramo. Un movimiento puede cerrar uno y abrir
   *  otro: `empezar_revision` cierra la espera y abre el repaso. */
  private static ABRE: Record<string, keyof Tiempos> = {
    terminar_planteo: "esperaCola",
    empezar_revision: "repaso",
    devolver: "correccion",
  };
  private static CIERRA: Record<string, keyof Tiempos> = {
    empezar_revision: "esperaCola",
    aprobar: "repaso",
    devolver: "repaso",
    aprobar_corregida: "correccion",
    terminar_planteo: "correccion",
  };

  ve(mov: MovimientoRegistrado): void {
    // Recuperarla de la cola cancela la espera: la OF salió de ahí sin que
    // nadie la mirara, así que no hay espera que medir.
    if (mov.motivo === "recuperar_planteo") {
      this.abiertos.delete(this.clave("esperaCola", mov.ofId));
      return;
    }

    const cierra = Cronometro.CIERRA[mov.motivo];
    if (cierra) {
      const k = this.clave(cierra, mov.ofId);
      const desde = this.abiertos.get(k);
      if (desde) {
        const min = (Date.parse(mov.at) - Date.parse(desde)) / 60000;
        // Negativo solo puede salir de un registro desordenado; se ignora en
        // vez de restar tiempo al resto.
        if (min >= 0) this.medidas[cierra].push(min);
        this.abiertos.delete(k);
      }
    }

    const abre = Cronometro.ABRE[mov.motivo];
    if (abre) this.abiertos.set(this.clave(abre, mov.ofId), mov.at);
  }

  resultado(): Tiempos {
    return {
      esperaCola: tramo(this.medidas.esperaCola),
      repaso: tramo(this.medidas.repaso),
      correccion: tramo(this.medidas.correccion),
    };
  }

  private clave(tramo: keyof Tiempos, ofId: string) {
    return `${tramo}:${ofId}`;
  }
}

function tramo(minutos: number[]): Tramo {
  if (minutos.length === 0) return { n: 0, medianaMin: null };
  const orden = [...minutos].sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  const mediana = orden.length % 2 === 1 ? orden[m] : (orden[m - 1] + orden[m]) / 2;
  return { n: orden.length, medianaMin: Math.round(mediana) };
}
