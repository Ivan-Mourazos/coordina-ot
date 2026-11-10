// Solo lectura, contra RPS: ¿pedidoEsDePvc acierta? (pnpm exec vitest run scripts/verificar-pvc.test.ts)
import { it } from "vitest";
process.loadEnvFile(".env.local");
process.env.DATASOURCE = "rps";
const PVC = ["AR.26.05080", "AR.26.04947", "AR.26.04890", "AR.26.04784", "AR.26.05116", "AR.26.05193", "AR.26.04316", "AR.26.04384", "AR.26.04562", "AR.26.04574", "AR.26.05081", "AR.26.04202", "AR.26.05372", "AR.26.04681"];
const ACRIL = ["AR.26.05446", "AR.26.05433", "AR.26.05427", "AR.26.05432", "AR.26.05413", "AR.26.05495", "AR.26.04236", "AR.26.04293", "AR.26.04342", "AR.26.04489", "AR.26.04340", "AR.26.04575", "AR.26.04117", "AR.26.04612"];
it("pvc", async () => {
  const { pedidoEsDePvc } = await import("../src/lib/server/pvc-db");
  for (const [t, l] of [["PVC", PVC], ["ACRIL", ACRIL]] as const) {
    const r = await Promise.all(l.map(async (p) => `${p}=${(await pedidoEsDePvc(p)) ? "pvc" : "no"}`));
    console.log(t, r.join(" "));
  }
}, 120000);
