import { describe, expect, it } from "vitest";
import { hayCambio, textoNotaReescaneo, type EstadoScan } from "../pedido-scan";

const e = (mtimeVisto: number | null, mtimeActual: number | null): EstadoScan => ({
  pedido: "AR.26.01829",
  mtimeVisto,
  mtimeActual,
});

describe("hayCambio", () => {
  it("el parte es más nuevo que lo que se dio por visto: hay cambio", () => {
    expect(hayCambio(e(1000, 2000))).toBe(true);
  });

  it("el mismo mtime no es un cambio", () => {
    expect(hayCambio(e(2000, 2000))).toBe(false);
  });

  it("un pedido recién vigilado NO avisa, aunque ya se le haya mirado el PDF", () => {
    // Es el caso del día del despliegue: los 81 pedidos vivos se registran de
    // golpe. Si el primer vistazo contara como cambio, saltarían todos a la vez
    // y el aviso nacería quemado.
    expect(hayCambio(e(null, 2000))).toBe(false);
  });

  it("sin haber mirado todavía el PDF no hay nada que contar", () => {
    expect(hayCambio(e(1000, null))).toBe(false);
    expect(hayCambio(e(null, null))).toBe(false);
  });

  it("un mtime MENOR no es un cambio: el fichero no rejuvenece", () => {
    // Pasa al restaurar una copia de seguridad del share. Avisar ahí sería
    // contar como novedad algo más viejo de lo que ya se leyó.
    expect(hayCambio(e(2000, 1000))).toBe(false);
  });
});

describe("textoNotaReescaneo", () => {
  it("dice la fecha y la hora del escaneo", () => {
    // Con el constructor local, no con un literal ISO: si no, el test dependería
    // de la zona horaria de la máquina que lo corre.
    const t = new Date(2026, 7, 24, 11, 4, 0).getTime();
    expect(textoNotaReescaneo(t)).toBe(
      "Se ha vuelto a escanear el parte (24/8/2026 a las 11:04). Compruébalo antes de seguir: puede traer cambios.",
    );
  });

  it("los minutos van con cero a la izquierda", () => {
    const t = new Date(2026, 0, 3, 9, 5, 0).getTime();
    expect(textoNotaReescaneo(t)).toContain("3/1/2026 a las 9:05");
  });

  it("NO promete que el pedido haya cambiado, solo que se re-escaneó", () => {
    // El mtime cambia también al re-subir el mismo fichero. El texto no puede
    // afirmar lo que esta señal no sabe.
    const texto = textoNotaReescaneo(Date.now());
    expect(texto).toContain("vuelto a escanear");
    expect(texto).toMatch(/puede traer cambios/);
    expect(texto).not.toMatch(/ha cambiado|modificado/);
  });
});
