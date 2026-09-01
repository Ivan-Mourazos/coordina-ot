import { describe, expect, it } from "vitest";
import { hayCambio, textoNotaReescaneo, type EstadoScan } from "../pedido-scan";

const e = (huellaVista: string | null, huellaActual: string | null): EstadoScan => ({
  pedido: "AR.26.01829",
  huellaVista,
  huellaActual,
});

describe("hayCambio", () => {
  it("el parte no es el que se dio por visto: hay cambio", () => {
    expect(hayCambio(e("vieja", "nueva"))).toBe(true);
  });

  it("el mismo contenido no es un cambio, aunque el fichero se haya re-copiado", () => {
    // Es el caso que rompía esto cuando la señal era el mtime: el share
    // re-copia el parte cada media hora y el contenido no cambia.
    expect(hayCambio(e("misma", "misma"))).toBe(false);
  });

  it("un pedido recién vigilado NO avisa, aunque ya se le haya mirado el PDF", () => {
    // Es el caso del día del despliegue: los 81 pedidos vivos se registran de
    // golpe. Si el primer vistazo contara como cambio, saltarían todos a la vez
    // y el aviso nacería quemado.
    expect(hayCambio(e(null, "algo"))).toBe(false);
  });

  it("sin haber mirado todavía el PDF no hay nada que contar", () => {
    expect(hayCambio(e("algo", null))).toBe(false);
    expect(hayCambio(e(null, null))).toBe(false);
  });

  it("volver a una copia vieja también es un cambio", () => {
    // Una huella no se ordena: no hay "más nueva". Si en el share vuelve a
    // estar el parte de antes, quien lo lea NO está leyendo el que leyó ayer,
    // y tiene que saberlo.
    expect(hayCambio(e("nueva", "vieja"))).toBe(true);
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
