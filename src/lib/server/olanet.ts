import sql from "mssql";
import { claveBonoRps, type FilaBono } from "../bonos";
import type { EstadoFase } from "../fases";
import { esFaseDe, type Seccion } from "../secciones";
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

// Los valores de IdEstadoOF y su ciclo viven en lib/fases.ts. En scg_Fases
// conviven además 0 (fase cargada, sin tocar) y 4, el más común con diferencia
// (1,25 M filas), que pone el proceso que traspasa a RPS: nosotros no
// escribimos ninguno de los dos.

/** Valor de `traspasado` en sch_FasesMov según IT, confirmado en filas reales. */
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

/** Claves de los bonos NUESTROS que OLANET ya traspasó a RPS.
 *
 *  `traspasado = 0` es "pendiente de traspasar"; cualquier otro valor significa
 *  que OLANET ya lo procesó y el tiempo está en RPS (ver bonos.ts). En la tabla
 *  real no queda ni una fila en 0, ni siquiera del mismo día: el traspaso va
 *  muy por delante de esta comprobación, que corre cada minuto.
 *
 *  Se acota por día y operario en vez de preguntar bono a bono: `sch_RPS_bonos`
 *  ronda el medio millón de filas y son decenas de tramos por vuelta. El cruce
 *  fino se hace en memoria con la clave exacta. Sin días u operarios no se
 *  pregunta nada. */
export async function bonosTraspasados(
  dias: readonly string[],
  operarios: readonly string[],
  maquina: string,
): Promise<Set<string>> {
  if (dias.length === 0 || operarios.length === 0) return new Set();
  const peticion = (await getPoolOlanet()).request().input("maquina", sql.VarChar(50), maquina);
  const marcasDia = dias.map((d, i) => {
    peticion.input(`d${i}`, sql.DateTime, new Date(`${d}T00:00:00Z`));
    return `@d${i}`;
  });
  const marcasOp = operarios.map((o, i) => {
    peticion.input(`o${i}`, sql.VarChar(50), o);
    return `@o${i}`;
  });
  const r = await peticion.query<{
    of: string; numope: string; operario: string; ini: Date; horaini: string | number;
  }>(
    `SELECT [of], numope, operario, ini, horaini
       FROM sch_RPS_bonos
      WHERE maquina = @maquina
        AND traspasado <> 0
        AND ini IN (${marcasDia.join(", ")})
        AND operario IN (${marcasOp.join(", ")})`,
  );
  return new Set(
    r.recordset.map((f) =>
      claveBonoRps({
        of: (f.of ?? "").trim(),
        numope: (f.numope ?? "").trim(),
        operario: (f.operario ?? "").trim(),
        // `ini` es un DATETIME a medianoche UTC: se escribió así (ver
        // insertarBono), así que se lee así.
        ini: f.ini.toISOString().slice(0, 10),
        horaini: Number(f.horaini),
      }),
    ),
  );
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

/** Mueve una fase de estado: lo marca en scg_Fases y deja el movimiento en
 *  sch_FasesMov. Vale para los tres estados (iniciar, interrumpir, finalizar).
 *  Las dos escrituras van juntas en una transacción — una fase marcada como
 *  finalizada sin su movimiento deja el histórico incoherente, y desde
 *  scg_Fases es desde donde los tiempos suben solos a RPS. */
export async function moverFase(opts: {
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

export interface FilaEnCurso {
  of: string;
  fase: number;
  minutos: number;
  operarioRps: string;
  /** La máquina de su sección (A-OTEC, A-DGRA). Va en la fila porque el
   *  borrado de esta tabla se acota por máquina: quien sincroniza tiene que
   *  poder repartir las filas antes de llamar. Ver refrescarEnCurso. */
  maquina: string;
}

/** Deja en `tgm_fichajes_olanet_ot` la foto de quién está fichando AHORA en
 *  Oficina Técnica. Es lo que ve Producción en tiempo real.
 *
 *  La tabla no tiene clave primaria y es COMPARTIDA con el olanet de taller,
 *  así que el borrado va acotado a nuestra máquina: las filas de producción no
 *  se tocan. Se hace en una transacción para que nadie lea la tabla a medias
 *  y crea que no ficha nadie. */
export async function sincronizarFichajeEnCurso(
  filas: readonly FilaEnCurso[],
  maquina: string,
): Promise<void> {
  const pool = await getPoolOlanet();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input("maquina", sql.VarChar(50), maquina)
      .query("DELETE FROM tgm_fichajes_olanet_ot WHERE maquina = @maquina");

    for (const f of filas) {
      await new sql.Request(tx)
        .input("of", sql.VarChar(50), f.of)
        .input("fase", sql.Int, f.fase)
        .input("tiempo", sql.Int, Math.round(f.minutos))
        .input("maquina", sql.VarChar(50), maquina)
        .input("operario", sql.VarChar(50), f.operarioRps)
        .query(
          `INSERT INTO tgm_fichajes_olanet_ot (orden, fase, tiempo, maquina, codoperario)
           VALUES (@of, @fase, @tiempo, @maquina, @operario)`,
        );
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ─── Fases de OT sin finalizar ───────────────────────────────────────────────
// Pasabas el pedido a Producción y la fase de OT se quedaba en pausa; tenían
// que avisar desde el taller y había que abrir la herramienta vieja para
// cerrarla. Esto es para el arrastre: de aquí en adelante "Pasar a Producción"
// ya la mueve solo.

/** Las fases que OLANET tiene cargadas para estas OF, con su estado.
 *
 *  Devuelve TODAS, también las del taller y las ya finalizadas: quién es de OT
 *  y qué se puede tocar lo decide `lib/fase-pendiente.ts`, que es puro y está
 *  probado. Aquí solo se lee.
 *
 *  `IdBoletin` viaja porque es lo que necesita `moverFase` para cerrar la fase,
 *  y buscarlo otra vez por (Orden, Fase) abriría una carrera: entre la consulta
 *  y el clic, la misma pareja podría resolver a otro boletín. */
export interface FasePendiente {
  of: string;
  fase: string;
  idBoletin: string;
  estado: number;
}

/** Lo que a una sección le queda por hacer, según OLANET.
 *
 *  Es la lista de trabajo de las secciones con `fuente: "olanet"`. Se lee de
 *  aquí y no del `PercentProgress` de la vista de RPS porque ese número no mide
 *  avance: cada imputación entra con 100, así que dice "alguien le fichó", no
 *  "está hecha" (ver `Seccion.fuente`). `IdEstadoOF` sí es el estado real de la
 *  fase.
 *
 *  Los TRES estados vivos, no solo el 0. Dejando fuera iniciada e interrumpida,
 *  la tarjeta se desvanecería a media faena en cuanto se fichara desde la web,
 *  que es justo el fallo que esto viene a arreglar. Fuera quedan la 3
 *  (finalizada) y la 4 (eliminada por OLANET).
 *
 *  El LIKE de `MaquinaTeo` recoge las erratas y las urgencias —"U-A-DGRA" lleva
 *  "DGRA" dentro—, y `esFaseDe` vuelve a filtrar en TypeScript para no fiar la
 *  frontera entre secciones a un LIKE. */
export async function fasesPendientesDe(seccion: Seccion): Promise<FasePendiente[]> {
  const pool = await getPoolOlanet();
  const r = await pool
    .request()
    .input("marca", sql.VarChar(30), `%${seccion.marcaEnFases}%`)
    .query<{
      Orden: string | null;
      Fase: string | null;
      IdBoletin: string;
      MaquinaTeo: string | null;
      IdEstadoOF: number | null;
    }>(
      `SELECT Orden, Fase, IdBoletin, MaquinaTeo, IdEstadoOF
         FROM scg_Fases
        WHERE MaquinaTeo LIKE @marca AND IdEstadoOF IN (0, 1, 2)`,
    );
  return r.recordset
    .filter((f) => esFaseDe(f.MaquinaTeo ?? "", seccion))
    .map((f) => ({
      of: (f.Orden ?? "").trim(),
      fase: (f.Fase ?? "").trim(),
      idBoletin: String(f.IdBoletin),
      estado: f.IdEstadoOF ?? -1,
    }))
    .filter((f) => f.of !== "" && f.fase !== "");
}

export async function fasesDeOFs(
  ofs: readonly string[],
): Promise<
  { idBoletin: string; of: string; fase: string; descripcion: string; maquina: string; estado: number }[]
> {
  if (ofs.length === 0) return [];
  const pool = await getPoolOlanet();
  const peticion = pool.request();
  // Lista parametrizada: los códigos vienen del historial, pero concatenarlos
  // en el SQL sería abrir la puerta igual.
  const marcas = ofs.map((of, i) => {
    peticion.input(`of${i}`, sql.VarChar(50), of);
    return `@of${i}`;
  });
  const r = await peticion.query<{
    IdBoletin: string;
    Orden: string | null;
    Fase: string | null;
    FaseDesc: string | null;
    MaquinaTeo: string | null;
    IdEstadoOF: number | null;
  }>(
    `SELECT IdBoletin, Orden, Fase, FaseDesc, MaquinaTeo, IdEstadoOF
       FROM scg_Fases
      WHERE Orden IN (${marcas.join(", ")})
      ORDER BY Orden, Fase`,
  );
  return r.recordset.map((f) => ({
    idBoletin: String(f.IdBoletin),
    of: (f.Orden ?? "").trim(),
    fase: (f.Fase ?? "").trim(),
    descripcion: (f.FaseDesc ?? "").trim(),
    maquina: (f.MaquinaTeo ?? "").trim(),
    // NULL se trata como desconocido, no como cero: el 0 es "cargada de
    // gestión", que SÍ se ofrece cerrar, y colar ahí un dato ausente pondría
    // un botón que escribe en RPS sobre una fase de la que no sabemos nada.
    estado: f.IdEstadoOF ?? -1,
  }));
}

/** El estado que OLANET tiene AHORA para esa fase, o null si no existe.
 *
 *  Se relee justo antes de cerrar: entre que la ficha pintó el botón y alguien
 *  lo pulsa pueden pasar minutos, y la fase puede haberse finalizado desde el
 *  taller o haberla retirado OLANET. */
export async function estadoDeFase(idBoletin: string): Promise<number | null> {
  const pool = await getPoolOlanet();
  const r = await pool
    .request()
    .input("idBoletin", sql.BigInt, idBoletin)
    .query<{ IdEstadoOF: number | null; MaquinaTeo: string | null }>(
      "SELECT IdEstadoOF, MaquinaTeo FROM scg_Fases WHERE IdBoletin = @idBoletin",
    );
  const fila = r.recordset[0];
  if (!fila) return null;
  return fila.IdEstadoOF ?? -1;
}

/** La máquina de esa fase, para volver a comprobar en el servidor que es de OT. */
export async function maquinaDeFase(idBoletin: string): Promise<string | null> {
  const pool = await getPoolOlanet();
  const r = await pool
    .request()
    .input("idBoletin", sql.BigInt, idBoletin)
    .query<{ MaquinaTeo: string | null }>(
      "SELECT MaquinaTeo FROM scg_Fases WHERE IdBoletin = @idBoletin",
    );
  return r.recordset[0] ? (r.recordset[0].MaquinaTeo ?? "").trim() : null;
}
