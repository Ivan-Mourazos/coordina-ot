import { expect, test } from "vitest";
import { planteamientosDe } from "../src/lib/server/planteamiento-pdf";
import { imprimirPdf } from "../src/lib/server/ipp";
import { readFileSync } from "node:fs";

// ─── Planteamientos contra las carpetas y la impresora de verdad ─────────────
// Solo lectura, salvo la última prueba, que IMPRIME una página en la impresora
// de OT y necesita su propia bandera.
//
//   VALIDAR_PLANTEAMIENTOS=1 PEDIDOS=AR.26.05016,AR.26.04351 \
//     node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/verificar-planteamientos.test.ts
//   …y para imprimir una prueba en OT: IMPRIMIR_PRUEBA_OT=/ruta/a/una-pagina.pdf

const ACTIVO = process.env.VALIDAR_PLANTEAMIENTOS === "1";
const lista = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// Pedidos con planteamiento, de CAD o de la web de toldos: todos se imprimen.
test.skipIf(!ACTIVO)("los planteamientos de los pedidos se encuentran", async () => {
  for (const p of lista(process.env.PEDIDOS)) {
    const r = await planteamientosDe(p);
    console.info(p, r);
    expect(r.aviso).toBeNull();
    expect(r.ficheros.length).toBeGreaterThan(0);
  }
});

test.skipIf(!process.env.IMPRIMIR_PRUEBA_OT)("imprime una página en la impresora de OT", async () => {
  const r = await imprimirPdf("ipp://192.168.4.249/ipp", new Uint8Array(readFileSync(process.env.IMPRIMIR_PRUEBA_OT!)), {
    nombre: "Prueba CoordinaOT",
    usuario: "CoordinaOT",
  });
  console.info("trabajo", r.trabajo);
});
