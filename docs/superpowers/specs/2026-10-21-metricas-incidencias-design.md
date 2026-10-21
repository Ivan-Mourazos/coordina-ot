# Métricas: incidencias de OT y porcentajes por familia

Fecha: 21/10/2026 · Pedido por Iván.

## Qué cambia en la pantalla

1. **Motivo de devolución.** «Por causa» añade el % sobre las OF entregadas a
   revisión del periodo. «Por familia» pasa a desplegables (como «Mis
   correcciones»): cada familia con sus OF devueltas y el % sobre las OF de esa
   familia entregadas a revisión; al abrirla, las causas con su % sobre esas
   mismas OF. Se cuentan OF distintas, no devoluciones.
2. **Desaparece «Motivos por familia».** En su sitio, **«Incidencias OT»**
   (solo en la sección de Oficina Técnica): incidencias de RPS cuyo tipo es
   «… ERROR EN PLANTEAMIENTO» (corte, confección, soldadura) apuntadas en el
   periodo elegido. Total, % sobre las OF pasadas del periodo y lista de
   familias con número y %. Una OF cuenta una vez aunque tenga varios apuntes.
   No se separa por sección ni por tipo.
3. **Mes a mes** pierde la línea «Pasadas sin revisión».
4. **Mis datos.** «Mis incidencias» = solo errores de planteamiento en OF
   tuyas, con % sobre tus OF pasadas, en total y por familia. La gráfica
   enseña pasadas e incidencias de enero a diciembre; sin revisión y devueltas
   siguen desde agosto (antes no existían).

## Reglas

- **Quién pasó una OF y cuándo.** Si la OF (número de orden) tiene registro en
  Coordina —entregada a revisión o dada por buena—, manda Coordina: autor =
  quien la entregó por última vez, fecha = la de la entrega. Si no lo tiene y
  su tarea de OT se cerró en RPS **antes del 1 de septiembre de 2026**
  (`COORDINA_EN_USO`), se usa RPS: fecha = cierre de la tarea de OT (fase
  cerrada en OLANET o `RealEndDate`), autor = quien más fichó de OT
  (`TGM_FICHAJES_OT`). Sin registro y cerrada después: no cuenta (de OT no
  debería haber OF cerradas fuera de Coordina). Agosto entra en el rescate
  porque Coordina aún iba a medias: 185 OF entregadas en Coordina frente a 363
  cerradas en RPS; septiembre ya cuadra (363 frente a 392).
- **De quién es una incidencia.** Del autor que diga Coordina para esa orden;
  si la orden no tiene registro, del de RPS. Sin autor, cuenta para el equipo
  y para nadie en particular.
- **Fechas.** La incidencia cuenta en el mes en que se apuntó; la OF pasada,
  en el mes en que se pasó.
- **Unidad.** Las cuentas de incidencias y su base van por número de orden.

## Datos (RPS, solo lectura)

- `leerIncidenciasPlanteamiento(periodo)`: `CPRImputationMO` improductivas con
  `CPRUnproductiveType.Description LIKE '%ERROR EN PLANTEAMIENTO%'`, empresa
  001, con familia y autor RPS (código de empleado).
- `leerPasesRps(periodo)`: OF con tarea de OT (recursos de la sección, sin
  «PLANTEAR EN TALLER») cerrada en el periodo, recortado a antes de agosto,
  con familia y autor RPS. Los meses cerrados no cambian: se guarda en memoria.
- Un fallo de RPS no tumba las métricas locales: el panel dice que no hay datos.

## Pruebas

- Unitarias en `metricas-personales.test.ts`: OF distintas por causa y familia,
  base de %, fusión Coordina/RPS por orden, atribución, corte de agosto.
- API (`api-metricas.test.ts`): wiring y fallo de RPS.
- Manual contra RPS real y en el navegador, tema claro y oscuro.
