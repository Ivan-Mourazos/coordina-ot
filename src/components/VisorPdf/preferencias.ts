import { useState } from "react";
import {
  alternarEncaje,
  guardarEncaje,
  guardarMotor,
  leerEncaje,
  leerMotor,
  type Encaje,
  type MotorPdf,
} from "@/lib/visor-pdf";

// ─── Lo que cada uno deja puesto ─────────────────────────────────────────────
// Con qué visor abre los PDF y cómo los encaja. En el navegador y no en el
// servidor: es cómo se MIRA, no un dato del trabajo, y va con la pantalla en la
// que se está sentado — el mismo de siempre puede querer una cosa en el
// portátil y otra en el de sobremesa.
//
// Se lee de forma SÍNCRONA al montar (no en un efecto): así el visor arranca ya
// como lo dejaste, en vez de pintarse de una manera y saltar a la otra.

/** `window.localStorage` puede lanzar solo con tocarlo (cookies bloqueadas). */
function almacen(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function useMotorPdf(): [MotorPdf, (m: MotorPdf) => void] {
  const [motor, setMotor] = useState<MotorPdf>(() => leerMotor(almacen()));
  return [
    motor,
    (m) => {
      guardarMotor(almacen(), m);
      setMotor(m);
    },
  ];
}

/** El encaje de un visor, recordado en `clave`. Devuelve el actual y lo que
 *  hace pulsar ↔ o ↕ (pulsar el puesto vuelve a la página entera). */
export function useEncajePdf(clave: string): [Encaje, (pulsado: "FitH" | "FitV") => void] {
  const [encaje, setEncaje] = useState<Encaje>(() => leerEncaje(almacen(), clave));
  return [
    encaje,
    (pulsado) => {
      const nuevo = alternarEncaje(encaje, pulsado);
      guardarEncaje(almacen(), clave, nuevo);
      setEncaje(nuevo);
    },
  ];
}
