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

// ─── La barra de carga de cada compañero ─────────────────────────────────────
// Un bloque por PEDIDO, en el mismo orden que las columnas de la zona de
// arriba: primero lo que le toca revisar y luego sus fases, en el orden de la
// sección. Así un color se lee igual en los dos sitios, y el número de bloques
// se cuenta sin mirar el «3 ped».
//
// Lo que revisa entra en la barra porque también es carga: sin ello, quien
// solo revisa salía con «0 ped» y la barra vacía mientras tenía trabajo.

export interface ItemCarga {
  /** Id del pedido. */
  id: string;
  atrasado: boolean;
}

export interface BloqueCarga {
  id: string;
  color: string;
  /** Nombre de la columna, para el título del bloque. */
  fase: string;
  atrasado: boolean;
  /** Es el pedido en el que tiene el reloj en marcha, con ese mismo rol. */
  vivo: boolean;
}

export function bloquesDeCarga({
  revisiones,
  grupos,
  vivo,
  colorRevisar,
}: {
  revisiones: ItemCarga[];
  grupos: { label: string; color: string; items: ItemCarga[] }[];
  /** El pedido del reloj, y si ficha revisando. Un pedido puede estar en
   *  los dos lados (plantea una OF y revisa otra): el pulso va solo en el
   *  bloque del rol con el que ficha. */
  vivo: { id: string; revisando: boolean } | null;
  colorRevisar: string;
}): BloqueCarga[] {
  const bloques: BloqueCarga[] = revisiones.map((r) => ({
    id: r.id,
    color: colorRevisar,
    fase: "Por revisar",
    atrasado: r.atrasado,
    vivo: vivo !== null && vivo.revisando && vivo.id === r.id,
  }));
  for (const g of grupos)
    for (const it of g.items)
      bloques.push({
        id: it.id,
        color: g.color,
        fase: g.label,
        atrasado: it.atrasado,
        vivo: vivo !== null && !vivo.revisando && vivo.id === it.id,
      });
  return bloques;
}
