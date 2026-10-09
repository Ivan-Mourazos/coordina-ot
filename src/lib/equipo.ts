// ─── El equipo del Panel: tarjeta o «Libres» ─────────────────────────────────
// Cada compañero tenía su tarjeta aunque no llevara nada, y con cada persona
// nueva (Carlos, el día que impute) la fila crece con tarjetas vacías. Quien
// no tiene trabajo pasa a un nombre en la línea «Libres», junto al título del
// bloque: se sigue sabiendo quién está disponible —que es lo que dice una
// tarjeta vacía— sin gastar una tarjeta en decirlo.
//
// Qué es «tener trabajo» lo decide quien llama (`ocupado`), porque depende de
// cosas que solo sabe el tablero: sus OF como autor, sus revisiones pendientes
// y si tiene el reloj en marcha. Aquí solo se reparte, sin cambiar el orden.

export function partirEquipo<T extends { id: string }>(
  operarios: T[],
  ocupado: (id: string) => boolean,
): { conTrabajo: T[]; libres: T[] } {
  const conTrabajo: T[] = [];
  const libres: T[] = [];
  for (const o of operarios) (ocupado(o.id) ? conTrabajo : libres).push(o);
  return { conTrabajo, libres };
}
