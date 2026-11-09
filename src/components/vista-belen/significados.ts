// ─── Qué significa cada dato de la pantalla de Belén ─────────────────────────
// La pantalla junta datos de RPS y de OLANET que Belén veía con otros nombres
// en sus Excels. Iván (10/11/2026) teme que «no sepa qué es qué»: cada texto
// sale al pasar el ratón por su dato (etiquetas con subrayado de puntos). Una
// leyenda fija se probó y ocupaba demasiado: aquí solo los textos.
export const SIGNIFICA = {
  puntoVerde: "Bultos subidos: se han dado de entrada tantas unidades como lleva la OF. El trabajo está acabado.",
  puntoGranate: "Hay unidades subidas, pero no coinciden con las de la OF (de más o de menos). Revisar.",
  puntoRojo: "Bultos sin subir: todavía no se ha dado de entrada ninguna unidad. El trabajo no está acabado.",
  prioridad: "Prioridad de la OF en RPS.",
  situacion: "Situación de la OF en RPS: con imputaciones (se está trabajando), detenida o finalizada.",
  finalizado: "La operación está acabada: OLANET la dio por finalizada o RPS la tiene al 100 %.",
  interrumpido: "Alguien la empezó (fichó o la cargó en máquina) y no está acabada.",
  sinEmpezar: "Nadie la ha tocado todavía.",
  solicitada: "La fecha que pidió el cliente en el pedido.",
  comprometida: "La fecha que dio Producción (la que apuntas en RPS).",
  llegaMaterial: "Cuándo llega lo último que falta de compras para esta OF.",
  paquete: "Quién hizo el bulto en OLANET y cuándo.",
  logistica: "La instalación programada: quién va y qué día (orden de instalación de RPS).",
  tp: "Trabajo previo a pedido (visita a medir o a ver la obra). Pendiente = sin cerrar en RPS.",
  cot: "Consulta con Oficina Técnica. Pendiente = sin cerrar en RPS.",
  asignado: "Lo que Oficina Técnica apuntó en la OF al plantearla.",
  reservado: "Lo que Almacén ha apartado del stock para esa OF.",
  pedidoProveedor: "Lo que Compras ha pedido al proveedor para la OF; casi siempre es otra cosa que lo asignado (tubo, lacado, portes).",
} as const;
