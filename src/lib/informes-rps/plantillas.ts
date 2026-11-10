import hojaRuta from "./CPRROADMAP.json";
import vale from "./CPRTICKETMAT.json";
import type { Plantilla } from "./maquetar";

// Las dos plantillas de RPS que imprime Belén, copiadas tal cual con
// scripts/extraer-informe-rps.mjs. Si alguien cambia el informe en RPS, se
// vuelve a ejecutar ese script y se suben los JSON nuevos.
export const PLANTILLA_HOJA_RUTA = hojaRuta as unknown as Plantilla;
export const PLANTILLA_VALE = vale as unknown as Plantilla;
