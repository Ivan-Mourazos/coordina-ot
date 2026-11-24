import { expect, test } from "vitest";
import { piezasOfSql } from "../server/piezas-sql";

test("las piezas salen de la segunda unidad solo si la OF copió los m² de la línea", () => {
  const sql = piezasOfSql("mo", "l").replace(/\s+/g, " ");
  expect(sql).toContain("l.IDUnitQuantity <> '001-uni'");
  expect(sql).toContain("l.QuantitySecondUnit > 0");
  expect(sql).toContain("mo.Quantity = l.Quantity");
  expect(sql).toMatch(/THEN l\.QuantitySecondUnit ELSE mo\.Quantity END$/);
});
