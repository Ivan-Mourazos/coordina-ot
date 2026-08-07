import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AvisoMovimiento } from "../avisos";

// ─── El viaje completo de una OF que cambia de manos ─────────────────────────
// Los tests de cada pieza pasaban en verde mientras el conjunto tenía agujeros:
// el corte de fichaje se hacía y el navegador lo deshacía, y un traspaso podía
// no avisar a nadie. Eso solo se ve siguiendo el dato de punta a punta, que es
// lo que hace este fichero: mismo camino que recorre la app, por sus endpoints.

let dir: string;
let estado: typeof import("../../app/api/estado/route");
let avisos: typeof import("../../app/api/avisos/route");
let fichajeApi: typeof import("../../app/api/fichaje/route");
let fichajeDb: typeof import("../server/fichaje-db");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coordina-viaje-"));
  process.env.COORDINA_DB_PATH = path.join(dir, "test.db");
  estado = await import("../../app/api/estado/route");
  avisos = await import("../../app/api/avisos/route");
  fichajeApi = await import("../../app/api/fichaje/route");
  fichajeDb = await import("../server/fichaje-db");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows mantiene abierto el handle del WAL; limpieza best effort.
  }
});

const post = (ruta: string, body: unknown) =>
  new Request(`http://x${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const of = (autorId: string | null, revisorId: string | null = null) => ({
  ofId: "of-viaje",
  autorId,
  revisorId,
  estado: "en_curso" as const,
  observacion: null,
});

async function avisosDe(operarioId: string): Promise<AvisoMovimiento[]> {
  const res = await avisos.GET(new Request(`http://x/api/avisos?operarioId=${operarioId}`));
  return ((await res.json()) as { avisos: AvisoMovimiento[] }).avisos;
}

test("Iván ficha una OF, se la pasa a Tamara y todo queda donde debe", async () => {
  // 1. La OF es de Iván y la está fichando, junto con otra suya.
  await fichajeApi.POST(
    post("/api/fichaje", {
      operarioId: "ivan",
      ofIds: ["of-viaje", "of-que-sigue-siendo-mia"],
      rol: "plantear",
    }),
  );
  expect(fichajeDb.leerFichaje("ivan").intervalos.at(-1)?.fin).toBeNull();

  // 2. Se la pasa a Tamara.
  const res = await estado.POST(
    post("/api/estado", {
      operarioId: "ivan",
      motivo: "traspaso",
      cambiosOF: [of("tamara")],
      previosOF: [of("ivan")],
      cortarFichajeDe: ["of-viaje"],
    }),
  );
  expect(res.status).toBe(200);

  // 3. Su fichaje sobre esa OF está cerrado, pero NO ha perdido el tiempo de
  //    la otra OF que compartía el tramo: sigue corriendo en un intervalo nuevo.
  const suyo = fichajeDb.leerFichaje("ivan");
  const abierto = suyo.intervalos.at(-1)!;
  expect(abierto.fin).toBeNull();
  expect(abierto.ofIds).toEqual(["of-que-sigue-siendo-mia"]);
  expect(suyo.intervalos.some((i) => i.ofIds.includes("of-viaje") && i.fin !== null)).toBe(true);

  // 4. Tamara se entera, y consta quién se la pasó y de quién venía.
  const suyos = await avisosDe("tamara");
  expect(suyos).toHaveLength(1);
  expect(suyos[0]).toMatchObject({ tipo: "recibida", ofId: "of-viaje", quien: "ivan" });

  // 5. A Iván no se le avisa de lo que acaba de hacer él mismo.
  expect(await avisosDe("ivan")).toEqual([]);

  // 6. Al abrir el pedido, el aviso se apaga — y solo para ella.
  await avisos.POST(post("/api/avisos", { operarioId: "tamara", claves: [suyos[0].clave] }));
  expect(await avisosDe("tamara")).toEqual([]);
});

test("si a Ángel le da por reorganizar, se enteran los dos", async () => {
  await estado.POST(
    post("/api/estado", {
      operarioId: "tamara",
      motivo: "asignar",
      cambiosOF: [{ ...of("tamara"), ofId: "of-reparto" }],
      previosOF: [{ ...of(null), ofId: "of-reparto" }],
    }),
  );
  await estado.POST(
    post("/api/estado", {
      operarioId: "angel",
      motivo: "traspaso",
      cambiosOF: [{ ...of("jaime"), ofId: "of-reparto" }],
      previosOF: [{ ...of("tamara"), ofId: "of-reparto" }],
    }),
  );

  // El que la recibe y la que la pierde. Que Ángel pueda mover trabajo ajeno
  // es deliberado (no hay permisos); lo que lo hace seguro es que quede escrito
  // quién fue.
  const jaime = (await avisosDe("jaime")).find((a) => a.ofId === "of-reparto");
  expect(jaime).toMatchObject({ tipo: "recibida", quien: "angel", otro: "tamara" });

  const tamara = (await avisosDe("tamara")).find((a) => a.ofId === "of-reparto");
  expect(tamara).toMatchObject({ tipo: "cedida", quien: "angel", otro: "jaime" });
});

test("el servidor rechaza dejar a la misma persona de autora y revisora", async () => {
  const res = await estado.POST(
    post("/api/estado", {
      operarioId: "angel",
      motivo: "asignar",
      cambiosOF: [{ ...of("tamara", "tamara"), ofId: "of-imposible" }],
    }),
  );
  expect(res.status).toBe(400);
});
