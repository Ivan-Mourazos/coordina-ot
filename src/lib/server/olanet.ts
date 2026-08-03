import sql from "mssql";
import type { FilaBono } from "../bonos";
import { getPoolOlanet } from "./db";

// ─── Escritura del fichaje en OLANET ─────────────────────────────────────────
// Todo lo que se manda a OLANET_TGM_DATOS pasa por aquí. Consultas siempre
// parametrizadas: los códigos de OF y tarea vienen de la vista de RPS, que ya
// avisaron que trae datos sucios, y concatenarlos en el SQL sería un agujero.
//
// Dos trampas de esta BD, comprobadas contra el servidor:
//   · `of` es palabra reservada en T-SQL: siempre [of].
//   · RPSNext usa Modern_Spanish_CI_AS y OLANET_TGM_DATOS
//     SQL_Latin1_General_CP1_CI_AS. Cualquier comparación que cruce las dos
//     necesita COLLATE explícito. Aquí no cruzamos: se compara con parámetros.

/** Estado de la fase al dejar de fichar (columna IdEstadoOF). Valores de IT.
 *  En la tabla real conviven además 0 (fase cargada, sin tocar) y 4, que es el
 *  más común con diferencia (1,25 M filas) y lo pone el proceso que traspasa a
 *  RPS: nosotros no escribimos ninguno de los dos. */
export const ESTADO_FASE = { interrumpida: 2, finalizada: 3 } as const;
export type EstadoFase = (typeof ESTADO_FASE)[keyof typeof ESTADO_FASE];

/** Valor de `traspasado` en sch_FasesMov según IT. */
const FASESMOV_TRASPASADO = 2;

/** `IdBolMaqAct` no existe fuera del terminal de OLANET. IT indicó ponerlo a 0
 *  para que no falle; no interviene en ningún cálculo. */
const SIN_BOLETIN_MAQUINA = 0;

/** IdBoletin de la fase de una OF, o null si OLANET no la tiene cargada.
 *
 *  Comprobado sobre la vista de OT: las OFs fichables (LANZADA y CON
 *  IMPUTACIONES) tienen todas su fila; las únicas que faltan son CREADA y
 *  DETENIDA, que no se pueden fichar. Aun así se devuelve null en vez de
 *  lanzar: una OF sin fase no debe tumbar el envío de las demás. */
export async function buscarIdBoletin(
  of: string,
  fase: string,
): Promise<string | null> {
  const pool = await getPoolOlanet();
  const r = await pool
    .request()
    .input("of", sql.VarChar(50), of)
    .input("fase", sql.VarChar(50), fase)
    .query<{ IdBoletin: string }>(
      "SELECT TOP 1 IdBoletin FROM scg_Fases WHERE Orden = @of AND Fase = @fase",
    );
  return r.recordset[0]?.IdBoletin ?? null;
}

/** Inserta una línea de tiempo. `id` es IDENTITY: no se cubre. */
export async function insertarBono(
  fila: FilaBono,
  tx?: sql.Transaction,
): Promise<void> {
  // El tipado de mssql no acepta una unión Transaction | ConnectionPool.
  const peticion = tx ? new sql.Request(tx) : new sql.Request(await getPoolOlanet());
  await peticion
    .input("empresa", sql.VarChar(10), fila.empresa)
    .input("of", sql.VarChar(50), fila.of)
    .input("numope", sql.VarChar(50), fila.numope)
    .input("numbono", sql.BigInt, Number(fila.numbono))
    .input("numsec", sql.BigInt, Number(fila.numsec))
    .input("operario", sql.VarChar(50), fila.operario)
    .input("maquina", sql.VarChar(50), fila.maquina)
    .input("ini", sql.DateTime, new Date(`${fila.ini}T00:00:00Z`))
    .input("horaini", sql.BigInt, fila.horaini)
    .input("tipo", sql.VarChar(50), fila.tipo)
    .input("tipohora", sql.VarChar(50), fila.tipohora)
    .input("fin", sql.DateTime, new Date(`${fila.fin}T00:00:00Z`))
    .input("horafin", sql.BigInt, fila.horafin)
    .input("buenas", sql.Decimal(18, 0), fila.buenas)
    .input("malas", sql.Decimal(18, 0), fila.malas)
    .input("motivo", sql.VarChar(50), fila.motivo)
    .input("devueltas", sql.VarChar(50), fila.devueltas)
    .input("causadev", sql.VarChar(50), fila.causadev)
    .input("terminado", sql.VarChar(50), fila.terminado)
    .input("valoresextra", sql.VarChar(50), fila.valoresextra)
    .input("traspasado", sql.Int, fila.traspasado)
    .query(
      `INSERT INTO sch_RPS_bonos
         (empresa, [of], numope, numbono, numsec, operario, maquina,
          ini, horaini, tipo, tipohora, fin, horafin,
          buenas, malas, motivo, devueltas, causadev, terminado,
          valoresextra, traspasado)
       VALUES
         (@empresa, @of, @numope, @numbono, @numsec, @operario, @maquina,
          @ini, @horaini, @tipo, @tipohora, @fin, @horafin,
          @buenas, @malas, @motivo, @devueltas, @causadev, @terminado,
          @valoresextra, @traspasado)`,
    );
}

/** Cierra una fase: marca el estado en scg_Fases y deja el movimiento en
 *  sch_FasesMov. Las dos van juntas en una transacción — una fase marcada como
 *  finalizada sin su movimiento deja el histórico incoherente, y desde
 *  scg_Fases es desde donde los tiempos suben solos a RPS. */
export async function cerrarFase(opts: {
  idBoletin: string;
  estado: EstadoFase;
  operarioRps: string;
  cuando: Date;
}): Promise<void> {
  const pool = await getPoolOlanet();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input("idBoletin", sql.BigInt, opts.idBoletin)
      .input("estado", sql.Int, opts.estado)
      .query("UPDATE scg_Fases SET IdEstadoOF = @estado WHERE IdBoletin = @idBoletin");

    await new sql.Request(tx)
      .input("idBoletin", sql.BigInt, opts.idBoletin)
      .input("estado", sql.Int, opts.estado)
      .input("idBolMaqAct", sql.BigInt, SIN_BOLETIN_MAQUINA)
      .input("cuando", sql.DateTime, opts.cuando)
      .input("operario", sql.VarChar(20), opts.operarioRps)
      .input("traspasado", sql.Int, FASESMOV_TRASPASADO)
      .query(
        `INSERT INTO sch_FasesMov
           (IdBoletin, IdEstadoOF, IdBolMaqAct, dhMovimiento,
            operario_id, idMotivoInt, Maquina, traspasado)
         VALUES
           (@idBoletin, @estado, @idBolMaqAct, @cuando,
            @operario, NULL, NULL, @traspasado)`,
      );
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/** Refresca la foto de "quién está fichando ahora". La tabla no tiene clave
 *  primaria, así que se borra y se reinserta la fila de ese operario en esa
 *  OF/fase dentro de una transacción. */
export async function refrescarFichajeEnCurso(opts: {
  of: string;
  fase: number;
  minutos: number;
  maquina: string;
  operarioRps: string;
}): Promise<void> {
  const pool = await getPoolOlanet();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const filtro = "orden = @of AND fase = @fase AND codoperario = @operario";
    await new sql.Request(tx)
      .input("of", sql.VarChar(50), opts.of)
      .input("fase", sql.Int, opts.fase)
      .input("operario", sql.VarChar(50), opts.operarioRps)
      .query(`DELETE FROM tgm_fichajes_olanet_ot WHERE ${filtro}`);

    await new sql.Request(tx)
      .input("of", sql.VarChar(50), opts.of)
      .input("fase", sql.Int, opts.fase)
      .input("tiempo", sql.Int, Math.round(opts.minutos))
      .input("maquina", sql.VarChar(50), opts.maquina)
      .input("operario", sql.VarChar(50), opts.operarioRps)
      .query(
        `INSERT INTO tgm_fichajes_olanet_ot (orden, fase, tiempo, maquina, codoperario)
         VALUES (@of, @fase, @tiempo, @maquina, @operario)`,
      );
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/** Quita al operario de la foto de fichaje en curso (al pausar o cerrar). */
export async function borrarFichajeEnCurso(opts: {
  of: string;
  fase: number;
  operarioRps: string;
}): Promise<void> {
  const pool = await getPoolOlanet();
  await pool
    .request()
    .input("of", sql.VarChar(50), opts.of)
    .input("fase", sql.Int, opts.fase)
    .input("operario", sql.VarChar(50), opts.operarioRps)
    .query(
      "DELETE FROM tgm_fichajes_olanet_ot WHERE orden = @of AND fase = @fase AND codoperario = @operario",
    );
}
