import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sql from "mssql";
import { describe, expect, it, vi } from "vitest";
import { huellaSql, medirConsultas, normalizarSql, objetoSql } from "../server/medir-consultas.js";

describe("normalizarSql", () => {
  it("iguala la misma consulta con otros valores", () => {
    const a = normalizarSql("SELECT * FROM CPRMOTask WHERE OF = 'AR.26.1' AND n = 3");
    const b = normalizarSql("select  * FROM CPRMOTask\n WHERE OF = N'BR.26.99' AND n = 145 -- nota");
    expect(a.toLowerCase()).toBe(b.toLowerCase());
  });

  it("iguala listas de parámetros de distinta longitud", () => {
    const a = normalizarSql("SELECT 1 FROM X WHERE id IN (@id0, @id1)");
    const b = normalizarSql("SELECT 1 FROM X WHERE id IN (@id0, @id1, @id2, @id3)");
    expect(a).toBe(b);
    expect(huellaSql(a)).toBe(huellaSql(b));
  });
});

describe("objetoSql", () => {
  it("saca la primera tabla o vista", () => {
    expect(objetoSql("SELECT a FROM dbo.TGM_PENDIENTE_OT WITH (NOLOCK)")).toBe("dbo.TGM_PENDIENTE_OT");
    expect(objetoSql("UPDATE [scg_Fases] SET x = 0")).toBe("scg_Fases");
    expect(objetoSql("INSERT INTO sch_RPS_bonos (a) VALUES (?)")).toBe("sch_RPS_bonos");
  });
});

describe("medirConsultas", () => {
  it("apunta cada consulta sin cambiar su resultado ni sus errores", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "consultas-"));
    const proto = sql.Request.prototype as unknown as Record<string, unknown>;
    const original = proto.query;
    let falla = false;
    proto.query = vi.fn(async () => {
      if (falla) throw new Error("se cayó");
      return { recordsets: [[{ a: 1 }, { a: 2 }]], recordset: [{ a: 1 }, { a: 2 }], rowsAffected: [2] };
    });
    vi.useFakeTimers({ toFake: ["setInterval"] });
    try {
      medirConsultas({ web: "Prueba", dir });
      const req = new sql.Request();
      const res = await req.query("SELECT a FROM CPRMOTask WHERE b = 'x'");
      expect(res.recordset).toHaveLength(2);
      falla = true;
      await expect(req.query("SELECT a FROM CPRMOTask WHERE b = 'y'")).rejects.toThrow("se cayó");
      await vi.advanceTimersByTimeAsync(6_000);
      await new Promise((r) => setTimeout(r, 50));
      const dias = (await readdir(dir)).filter((f) => /^\d{4}/.test(f));
      const lineas = (await readFile(path.join(dir, dias[0]), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
      expect(lineas).toHaveLength(2);
      expect(lineas[0]).toMatchObject({ web: "Prueba", obj: "CPRMOTask", filas: 2 });
      expect(lineas[1].err).toBe("se cayó");
      expect(lineas[0].q).toBe(lineas[1].q);
      const cat = (await readFile(path.join(dir, "catalogo.jsonl"), "utf8")).trim().split("\n");
      expect(cat).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      proto.query = original;
    }
  });
});
