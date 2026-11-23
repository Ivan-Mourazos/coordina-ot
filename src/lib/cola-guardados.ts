// ─── Guardados del tablero, en fila ──────────────────────────────────────────
// Cada guardado manda la foto COMPLETA de la OF y el servidor se queda con la
// última que le llega. Dos guardados lanzados a la vez pueden llegar al revés,
// y entonces gana la foto vieja. Pasaba al fichar una OF de la bandeja:
// «asignar» (aún sin empezar) y «empezar_planteo» salían con milésimas de
// diferencia, ganaba «sin empezar» y desaparecía «Pasar a revisión» hasta
// volver a fichar (8 veces del 5 al 18/11/2026, según acciones_log).
//
// La cola los manda uno detrás de otro y lleva la cuenta que necesita el
// sondeo del tablero: una foto pedida mientras algún guardado viajaba puede
// ser de antes de guardarlo, y no se debe aplicar.

export interface ColaGuardados {
  /** Encola `enviar`; no arranca hasta que acabe el anterior. */
  encolar<T>(enviar: () => Promise<T>): Promise<T>;
  /** Cambia al empezar y al acabar cada guardado. */
  readonly seq: number;
  /** Guardados encolados o en curso. */
  readonly enVuelo: number;
}

export function crearColaGuardados(): ColaGuardados {
  let cola: Promise<unknown> = Promise.resolve();
  let seq = 0;
  let enVuelo = 0;
  return {
    encolar<T>(enviar: () => Promise<T>): Promise<T> {
      enVuelo += 1;
      seq += 1;
      const envio = cola.then(enviar).finally(() => {
        enVuelo -= 1;
        seq += 1;
      });
      // Un guardado que falla no frena a los de detrás.
      cola = envio.catch(() => {});
      return envio;
    },
    get seq() {
      return seq;
    },
    get enVuelo() {
      return enVuelo;
    },
  };
}
