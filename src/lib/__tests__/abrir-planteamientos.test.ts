import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  MENSAJE_ABRIR_PEDIDO,
  MENSAJE_PEDIDO_RECIBIDO,
  PESTANA_PLANTEAMIENTOS,
  abrirEnPlanteamientos,
} from "../abrir-planteamientos";

const URL_PEDIDO = "http://192.168.0.90:4400/?pedido=AR2604351";
const ORIGEN = "http://192.168.0.90:4400";

let oyentes: ((e: unknown) => void)[];
let abrir: ReturnType<typeof vi.fn>;

function pestana(enBlanco: boolean) {
  const location = enBlanco
    ? { href: "about:blank" }
    : {
        get href(): string {
          throw new Error("otro origen");
        },
        set href(_v: string) {
          throw new Error("no debe navegar");
        },
      };
  return { location, postMessage: vi.fn(), focus: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
  oyentes = [];
  abrir = vi.fn();
  vi.stubGlobal("window", {
    open: abrir,
    location: { assign: vi.fn() },
    addEventListener: (_: string, f: (e: unknown) => void) => oyentes.push(f),
    removeEventListener: (_: string, f: (e: unknown) => void) => {
      oyentes = oyentes.filter((o) => o !== f);
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("la primera vez crea la pestaña con nombre y va al pedido", () => {
  const nueva = pestana(true);
  abrir.mockReturnValue(nueva);
  abrirEnPlanteamientos(URL_PEDIDO);
  expect(abrir).toHaveBeenCalledWith("", PESTANA_PLANTEAMIENTOS);
  expect(nueva.location.href).toBe(URL_PEDIDO);
});

test("con la pestaña abierta le manda el pedido sin recargarla", () => {
  const abierta = pestana(false);
  abrir.mockReturnValue(abierta);
  abrirEnPlanteamientos(URL_PEDIDO);
  expect(abierta.postMessage).toHaveBeenCalledWith({ tipo: MENSAJE_ABRIR_PEDIDO, url: URL_PEDIDO }, ORIGEN);

  oyentes[0]({ origin: ORIGEN, source: abierta, data: { tipo: MENSAJE_PEDIDO_RECIBIDO } });
  vi.runAllTimers();
  expect(abrir).toHaveBeenCalledTimes(1);
  expect(oyentes).toHaveLength(0);
});

test("si no contesta, abre otra pestaña y no pisa la que había", () => {
  abrir.mockReturnValue(pestana(false));
  abrirEnPlanteamientos(URL_PEDIDO);
  vi.runAllTimers();
  expect(abrir).toHaveBeenLastCalledWith(URL_PEDIDO, "_blank");
});

test("una respuesta de otro origen no cuenta", () => {
  const abierta = pestana(false);
  abrir.mockReturnValue(abierta);
  abrirEnPlanteamientos(URL_PEDIDO);
  oyentes[0]({ origin: "http://otra", source: abierta, data: { tipo: MENSAJE_PEDIDO_RECIBIDO } });
  vi.runAllTimers();
  expect(abrir).toHaveBeenLastCalledWith(URL_PEDIDO, "_blank");
});

test("con el bloqueador de ventanas va como un enlace normal", () => {
  abrir.mockReturnValue(null);
  abrirEnPlanteamientos(URL_PEDIDO);
  expect(window.location.assign).toHaveBeenCalledWith(URL_PEDIDO);
});
