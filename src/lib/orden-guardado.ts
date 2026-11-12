// ─── Un orden elegido por la persona, guardado como lista de ids ─────────────
// Lo usan la portada de Belén (sus herramientas) y sus barras de pestañas.

/** Pone `base` en el orden guardado; lo que no estaba guardado (pestañas
 *  nuevas) va al final en su orden de siempre, y lo guardado que ya no existe
 *  se ignora. */
export function ordenarPorIds<T extends { id: string }>(base: readonly T[], guardado: unknown): T[] {
  const ids = Array.isArray(guardado) ? [...new Set(guardado.filter((v): v is string => typeof v === "string"))] : [];
  return [
    ...ids.flatMap((id) => base.filter((x) => x.id === id)),
    ...base.filter((x) => !ids.includes(x.id)),
  ];
}

/** Mueve el elemento `id` a la posición `destino`. */
export function moverA<T extends { id: string }>(lista: readonly T[], id: string, destino: number): T[] {
  const origen = lista.findIndex((x) => x.id === id);
  if (origen < 0 || destino < 0 || destino >= lista.length || origen === destino) return [...lista];
  const nuevas = [...lista];
  const [x] = nuevas.splice(origen, 1);
  nuevas.splice(destino, 0, x);
  return nuevas;
}
