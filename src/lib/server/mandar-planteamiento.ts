import { modoImpresion, prepararImpresion } from "./impresion-cola";
import { modoCorreo, prepararCorreo } from "./correo-cola";
import { planteamientosDe, type Planteamientos } from "./planteamiento-pdf";
import type { DatosCorreo } from "../correo-planteamiento";
import { leerAjustesImpresion, leerEleccion, leerNotaCorreo } from "../planteamiento";

// ─── Imprimir y mandar el planteamiento ──────────────────────────────────────
// Lo de después de pasar algo a Producción: el planteamiento sale en las
// impresoras y por correo (specs 2026-10-13 y 2026-10-14). Lo usan «Pasar a
// Producción» (el pedido entero) y «Dar por terminada en RPS» (una OF suelta:
// Iván, 05/11/2026, «que se dé por pasado»). Lo que elige el navegador llega
// en el cuerpo con los mismos nombres en los dos casos.
//
// Nunca tumba lo de antes: la OF o el pedido ya están pasados; imprimir y
// mandar el correo van sin esperar y su fallo solo se apunta en el log.

export interface OpcionesPlanteamiento {
  imprimirPlanteamiento?: unknown;
  mandarCorreo?: unknown;
  planteamiento?: unknown;
  notaCorreo?: unknown;
  impresion?: unknown;
  /** Qué PDF se imprimen cuando alguno ya salió antes (ver el aviso de pasar). */
  imprimirSolo?: unknown;
}

export function lanzarPlanteamiento(
  codigo: string,
  operarioId: string,
  datosCorreo: DatosCorreo | undefined,
  body: OpcionesPlanteamiento,
): void {
  const eleccion = leerEleccion(body.planteamiento);
  // Qué se imprime: lo elegido, nada si se desmarcó, o (undefined) todo.
  const solo = Array.isArray(body.imprimirSolo)
    ? body.imprimirSolo.filter((n): n is string => typeof n === "string").slice(0, 50)
    : null;
  const imprimir = eleccion
    ? new Set(eleccion.imprimir)
    : solo ? new Set(solo)
    : body.imprimirPlanteamiento === false ? new Set<string>() : undefined;
  // Una sola búsqueda para las dos cosas: es contra una carpeta de red.
  let busqueda: Promise<Planteamientos> | null = null;
  const buscar = (c: string) => (busqueda ??= planteamientosDe(c));
  if ((!imprimir || imprimir.size > 0) && modoImpresion() !== "off") {
    void prepararImpresion(codigo, operarioId, undefined, buscar, imprimir, leerAjustesImpresion(body.impresion) ?? undefined).catch((e) =>
      console.error(`[impresion] no se pudo preparar ${codigo}:`, (e as Error).message),
    );
  }
  if (body.mandarCorreo !== false && modoCorreo() !== "off" && datosCorreo) {
    // Las OF y la nota también se pueden tocar a mano; las OF solo se QUITAN:
    // el servidor sigue siendo quien dice qué OF van.
    const notaSuelta = leerNotaCorreo(body.notaCorreo);
    const datos = eleccion
      ? { ...datosCorreo, ofs: datosCorreo.ofs.filter((of) => eleccion.ofs.includes(of.codigo)), nota: eleccion.nota }
      : notaSuelta ? { ...datosCorreo, nota: notaSuelta } : datosCorreo;
    void prepararCorreo(datos, operarioId, undefined, buscar, {
      adjuntar: eleccion ? new Set(eleccion.adjuntar) : undefined,
      imprimir,
    }).catch((e) => console.error(`[correo] no se pudo preparar ${codigo}:`, (e as Error).message));
  }
}
