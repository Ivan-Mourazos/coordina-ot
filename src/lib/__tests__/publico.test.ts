import { expect, test } from "vitest";
import { capitalizaFrase, nombreBonito, nombreDeCentro } from "../publico";

// ─── Los nombres de centro para quien no es del taller ───────────────────────
// La lista blanca del detalle está en publico-detalle.test.ts; qué pedidos
// salen y en qué orden, en consulta.test.ts.

test("un centro de la tabla sale con su nombre bonito", () => {
  expect(nombreDeCentro("PLOTER DE CORTE MASCARA ULTRA SIGN PAL GRC1325")).toBe("Plotter de corte");
  expect(nombreDeCentro("OFICINA TECNICA ARZUA")).toBe("Oficina Técnica");
});

test("un centro que no está en la tabla sale con el texto de RPS, en frase", () => {
  expect(nombreDeCentro("UN CENTRO INVENTADO XYZ")).toBe("Un centro inventado xyz");
});

test("la trampa del centro escrito de dos formas (espacios de más) no rompe la tabla", () => {
  // Doble espacio en medio.
  expect(nombreDeCentro("CONFECCION  BERGONDO")).toBe("Confección (Bergondo)");
  // Espacio de sobra al final.
  expect(nombreDeCentro("MONTAJE TOLDO PLANO ")).toBe("Montaje");
});

test("los clientes y las localidades dejan de gritar, y las siglas se quedan", () => {
  expect(nombreBonito("IGLESIAS CAGIDE, LUIS")).toBe("Iglesias Cagide, Luis");
  expect(nombreBonito("SANTIAGO DE COMPOSTELA")).toBe("Santiago de Compostela");
  // Siglas con puntos y sin ellos.
  expect(nombreBonito("COREN, S.C.G.")).toBe("Coren, S.C.G.");
  expect(nombreBonito("HIJOS DE RIVERA, S.A.U.")).toBe("Hijos de Rivera, S.A.U.");
  expect(nombreBonito("BRICOSYL, S.L.")).toBe("Bricosyl, S.L.");
  expect(nombreBonito("TOLDOS GOMEZ SL")).toBe("Toldos Gomez SL");
  // Sin el punto final, y con la sigla partida en dos palabras: en RPS salen
  // las dos formas ("ALUMINIOS CORTIZO S. A.U").
  expect(nombreBonito("ALUMINIOS CORTIZO S. A.U")).toBe("Aluminios Cortizo S. A.U");
  expect(nombreBonito("RAMOS REY, S. L.")).toBe("Ramos Rey, S. L.");
  // Números y partículas gallegas.
  expect(nombreBonito("2006 PORTANOVA, S.L.")).toBe("2006 Portanova, S.L.");
  expect(nombreBonito("CASA DO CANTO")).toBe("Casa do Canto");
  // Una partícula que abre el nombre no se apaga.
  expect(nombreBonito("DE LA FUENTE, ANA")).toBe("De la Fuente, Ana");
  // Espacios de más, como los guarda RPS.
  expect(nombreBonito("  A CORUÑA ")).toBe("A Coruña");
});

test("capitalizaFrase baja el volumen: RPS a gritos, aquí solo la inicial", () => {
  expect(capitalizaFrase("PLANTEAR Y PREPARAR ARCHIVOS MAQ. DE CORTE")).toBe(
    "Plantear y preparar archivos maq. de corte",
  );
  expect(capitalizaFrase("lona remolque")).toBe("Lona remolque");
});
