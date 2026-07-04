// GET /api/health — estado del origen de datos.
// En mock responde directo; en rps hace SELECT 1 contra SQL Server y mide latencia.

export async function GET() {
  const source = process.env.DATASOURCE === "rps" ? "rps" : "mock";

  if (source === "mock") {
    return Response.json({ ok: true, source, db: "n/a (mock)" });
  }

  try {
    const t0 = Date.now();
    const { getPool } = await import("@/lib/server/db");
    const pool = await getPool();
    await pool.request().query("SELECT 1 AS ok");
    return Response.json({ ok: true, source, latencyMs: Date.now() - t0 });
  } catch (e) {
    return Response.json(
      { ok: false, source, error: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }
}
