import { describe, expect, it } from "vitest";
import type { OF } from "../types";
import {
  cambiarRevisor,
  puedeCambiarRevisor,
  puedeTraspasarAutor,
  traspasarAutor,
} from "../traspaso";

const of = (parcial: Partial<OF> = {}): OF => ({
  id: "of-1",
  codigo: "OF-023",
  descripcion: "Toldo portal A",
  familia: "TOLDO",
  piezas: 1,
  autorId: "ivan",
  revisorId: null,
  estado: "en_curso",
  fichandoRol: null,
  tiempoEstimadoMin: 60,
  tiempoPlanteoMin: 52,
  tiempoRevisionMin: 0,
  ...parcial,
});

describe("puedeTraspasarAutor", () => {
  it("solo donde queda trabajo del autor", () => {
    expect(puedeTraspasarAutor(of({ estado: "pendiente" }))).toBe(true);
    expect(puedeTraspasarAutor(of({ estado: "en_curso" }))).toBe(true);
    expect(puedeTraspasarAutor(of({ estado: "devuelta" }))).toBe(true);
  });

  it("no cuando el autor ya terminó ni sobre lo anulado", () => {
    expect(puedeTraspasarAutor(of({ estado: "por_revisar" }))).toBe(false);
    expect(puedeTraspasarAutor(of({ estado: "en_revision" }))).toBe(false);
    expect(puedeTraspasarAutor(of({ estado: "aprobada" }))).toBe(false);
    expect(puedeTraspasarAutor(of({ estado: "anulada" }))).toBe(false);
  });
});

describe("traspasarAutor", () => {
  it("conserva el trabajo hecho y solo cambia de manos", () => {
    const r = traspasarAutor(of({ observacion: "faltan cotas" }), "tamara");
    expect(r.autorId).toBe("tamara");
    expect(r.estado).toBe("en_curso");
    expect(r.tiempoPlanteoMin).toBe(52);
    expect(r.observacion).toBe("faltan cotas");
  });

  it("borra el revisor: se nombró para el trabajo del autor anterior", () => {
    const r = traspasarAutor(of({ estado: "devuelta", revisorId: "tamara" }), "jaime");
    expect(r.revisorId).toBeNull();
  });

  it("no deja a nadie de autor y revisor a la vez", () => {
    const r = traspasarAutor(of({ estado: "devuelta", revisorId: "tamara" }), "tamara");
    expect(r.autorId).toBe("tamara");
    expect(r.revisorId).toBeNull();
  });
});

describe("cambiarRevisor", () => {
  it("solo sobre OF que ya tienen revisión en marcha", () => {
    expect(puedeCambiarRevisor(of({ estado: "por_revisar" }))).toBe(true);
    expect(puedeCambiarRevisor(of({ estado: "en_revision" }))).toBe(true);
    expect(puedeCambiarRevisor(of({ estado: "en_curso" }))).toBe(false);
    expect(puedeCambiarRevisor(of({ estado: "aprobada" }))).toBe(false);
  });

  it("en por_revisar solo cambia el nombre", () => {
    const r = cambiarRevisor(of({ estado: "por_revisar", revisorId: "tamara" }), "jaime");
    expect(r.revisorId).toBe("jaime");
    expect(r.estado).toBe("por_revisar");
  });

  it("si la revisión ya había empezado, vuelve a por_revisar", () => {
    const r = cambiarRevisor(
      of({ estado: "en_revision", revisorId: "tamara", tiempoRevisionMin: 20 }),
      "jaime",
    );
    expect(r.estado).toBe("por_revisar");
    expect(r.revisorId).toBe("jaime");
    // El tiempo de Tamara no se toca: es suyo y ya está fichado.
    expect(r.tiempoRevisionMin).toBe(20);
  });

  it("el autor nunca puede ser su propio revisor", () => {
    expect(() => cambiarRevisor(of({ estado: "por_revisar" }), "ivan")).toThrow();
  });
});
