/** Piezas de una OF, en SQL. `mo` = alias de `CPRManufacturingOrder`, `lin` =
 *  alias de su línea de pedido (`FACOrderLineSL`).
 *
 *  `CPRManufacturingOrder.Quantity` son piezas casi siempre, pero cuando la
 *  línea de pedido se vende por m² RPS copia a la OF los METROS CUADRADOS
 *  aunque la OF diga «uni»: AR.26.05712 salía con 12,68 piezas y son 4 lonas.
 *  Las piezas de esas líneas están en `QuantitySecondUnit`. Medido el
 *  24/11/2026 desde junio: 152 de 172 OF con línea en m² llevaban los m².
 *
 *  Solo se cambia cuando la OF lleva literalmente la cantidad de la línea:
 *  si alguien la corrigió a mano (0,3 m² → 1 pieza) se respeta lo suyo. */
export function piezasOfSql(mo: string, lin: string): string {
  return `CASE WHEN ${lin}.IDUnitQuantity <> '001-uni' AND ${lin}.QuantitySecondUnit > 0
                AND ${mo}.Quantity = ${lin}.Quantity
           THEN ${lin}.QuantitySecondUnit ELSE ${mo}.Quantity END`;
}
