import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Pista } from "../../components/Pista";

const pintar = () =>
  renderToStaticMarkup(
    <Pista texto="Girar el parte" detalle="Ahora a 0°">
      <button type="button" aria-label="Girar">
        ↻
      </button>
    </Pista>,
  );

test("la caja de alrededor no se maqueta, para no mover el botón en su fila", () => {
  expect(pintar()).toMatch(/^<span class="contents"><button\b/);
});

test("la explicación va en el propio botón, para el lector de pantalla", () => {
  expect(pintar()).toContain('aria-description="Ahora a 0°"');
});

test("de salida no hay globo: solo sale al pasar el ratón o llegar con Tab", () => {
  expect(pintar()).not.toContain('class="pista');
});
