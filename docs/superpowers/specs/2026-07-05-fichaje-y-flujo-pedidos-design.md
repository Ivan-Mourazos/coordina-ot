# Diseño: fichaje de tiempos y flujo de pedidos/OFs

Fecha: 2026-07-05 · Estado: aprobado en conversación, pendiente de revisión final

## Contexto

CoordinaOT (tablero de Oficina Técnica) hoy simula el fichaje: `fichandoRol` es un flag,
los minutos del mock no se acumulan de verdad y nada persiste. Los tiempos reales se
imputan hoy en una ventana externa (Olanet) escribiendo códigos de pedido/OF una por
línea. Los botones de estado están duplicados entre tarjeta y drawer, con textos a
medias y sin confirmaciones.

Este diseño cubre: (1) motor de fichaje por intervalos, (2) máquina de estados de OF
única, (3) panel «Mi fichaje», (4) capa de export a Olanet.

## Decisiones de producto (confirmadas con Iván)

- Los tiempos van a RPS como imputación de **Oficina Técnica en global**, sin nombre de
  operario. La identidad web (localStorage, sin contraseña) solo organiza el tablero.
- Fichaje **libre y manual**: el operario marca las OFs/pedidos que quiera de los suyos;
  no se ficha automáticamente al pasar a plantear. Varios a la vez permitido (pedidos
  rápidos), tiempo repartido a partes iguales.
- Fichar por pedido = todas sus OFs válidas (excluye detenidas, anuladas, aprobadas).
- Las OFs **detenidas por producción** se omiten siempre del fichaje.
- Ligado suave estado↔fichaje: fichar una OF `pendiente` la pasa a `en_curso`; terminar
  planteo / aprobar / devolver **cortan** su fichaje; pausar NO cambia el estado.
- La web separa tiempo de planteo y de revisión; a RPS se manda el total.
- Olanet parece funcionar por **tramos horarios** (p.ej. 13:00–13:30), no por suma de
  minutos → la web almacena intervalos con timestamps, nunca solo totales.
- Debe verse clarísimo qué se está fichando: que no se quede ningún pedido sin fichar.

## 1. Motor de fichaje — `src/lib/fichaje.ts` (puro, sin React/BD)

```ts
interface Intervalo {
  inicio: string;        // ISO timestamp
  fin: string | null;    // null = corriendo
  ofIds: string[];       // OFs que comparten el tramo (reparto igual)
  rol: Rol;              // plantear | revisar
  operarioId: string;    // solo interno web
}
interface Fichaje { intervalos: Intervalo[] }
```

Reglas:
- Cambiar el conjunto de OFs de un fichaje corriendo = cerrar intervalo y abrir otro
  con el conjunto nuevo. El reparto de cada tramo queda fijo, la historia no se recalcula.
- Minutos por OF = Σ `(fin − inicio) / nºOFs` de sus intervalos. `tiempoPlanteoMin` y
  `tiempoRevisionMin` pasan a ser derivados.
- Pausar = cerrar intervalo abierto; reanudar = abrir uno igual.
- Persistencia fase 1: localStorage (sobrevive recargas; timestamps, no contadores).
  Fase 2: los intervalos cerrados se exportan a Olanet.

## 2. Máquina de estados — `src/lib/acciones.ts` (única fuente de verdad)

```ts
interface AccionDef {
  id: AccionOF;
  label: string;                       // texto único y definitivo
  tono: "primaria" | "peligro" | "neutra";
  confirmar?: string;                  // pide confirmación
  desde: EstadoOF[];
  requiere?: "autor" | "revisor";
  efectoFichaje?: "corta" | "arranca";
}
```

Tarjeta, drawer y panel pintan botones desde `accionesDisponibles(of, miRol)` — muere la
duplicidad. Tarjeta: máx. 2 acciones primarias + fichar; el resto en drawer.

| Acción | Desde | Texto | Confirma | Fichaje |
|---|---|---|---|---|
| empezar planteo | pendiente, devuelta | Empezar planteo | — | arranca |
| terminar planteo | en_curso, devuelta | Pasar a revisión | — | corta |
| deshacer empezar | en_curso | Volver a pendiente | sí | corta |
| empezar revisión | por_revisar | Empezar revisión | — | arranca (revisar) |
| aprobar | en_revision | Aprobar → Producción | **sí** | corta |
| devolver | en_revision | Devolver con nota (obligatoria) | — | corta |
| reabrir | aprobada | Reabrir revisión | sí | — |
| retomar devuelta | devuelta | Retomar planteo | — | arranca |
| anular | pendiente, en_curso, por_revisar | Anular OF | **sí** | corta |
| restaurar anulada | anulada | Restaurar | sí | — |

Confirmaciones con diálogo ligero propio (no `window.confirm`), Escape cancela.
Pausar/reanudar no es transición: vive en el motor de fichaje.

## 3. Panel «Mi fichaje» — `src/components/MiFichaje.tsx`

- Dock lateral colapsable. Colapsado: píldora fija `⏱ 3 OFs · 0:42` que pulsa mientras
  ficha (esmeralda planteando / violeta revisando); gris si no ficha.
- Expandido: tus OFs agrupadas por pedido, toggle por OF, «fichar todo el pedido» en la
  cabecera de grupo, botón grande Pausar todo / Reanudar, minutos de hoy por OF.
- Aviso anti-olvido: OFs `en_curso` sin fichaje corriendo > 10 min (constante, ajustable) → píldora ámbar
  «Planteando sin fichar». Cambio de identidad con reloj corriendo → aviso.
- OFs detenidas: deshabilitadas con etiqueta «Detenida»; «fichar pedido» las salta y lo
  indica («fichando 4 de 5 — 1 detenida»).
- Accesos rápidos: botón `⏱ Fichar` en tarjeta de pedido y en fila de OF del drawer.
- `LiveBadge` pasa a alimentarse de los intervalos reales.

## 4. Export a Olanet — `src/lib/server/olanet.ts` (fase 2, bloqueada por IT)

- Entrada: intervalos cerrados. Salida: formato que defina IT (soporta totales por OF o
  total por pedido repartido — ambos derivan de la misma estructura).
- Envío manual primero: botón «Enviar tiempos del día» con resumen previo. Los envíos
  quedan marcados para no duplicar. Automatizar después.
- Sin red con RPS el fichaje sigue funcionando (motor local); solo el envío falla y
  reintenta.

## Tiempo estimado (añadido 2026-07-05)

Producción pone tiempo estimado a algunos pedidos/OFs; en teoría sirve para organizar el
día, hoy funciona regular. El modelo ya tiene `tiempoEstimadoMin`:
- Buscar la columna real en la introspección de RPSNext.
- El panel y las tarjetas ya muestran estimado vs real; el uso para planificar el día
  (ordenar, avisar de desvíos) queda como mejora posterior — no bloquea este diseño.

## ❓ PREGUNTAS ABIERTAS PARA IT — buscar el primer día con acceso a BD

1. **Formato Olanet**: estructura exacta de los datos de tiempos y vía de entrega
   (¿API, fichero, tabla intermedia?). IT debe decirlo.
2. **Modelo por tramos**: confirmar que los tiempos se almacenan por intervalos
   horarios (13:00–13:30) y no por minutos sumados.
3. **OF detenida**: cómo se marca en RPSNext una OF detenida por producción, y cómo
   distinguirla del estado "interrumpido" (= iniciado y pausado sin detener).
4. **Escritura**: ¿podemos escribir en BD o solo vía Olanet? (usuario actual `lectura`
   apunta a solo-lectura).
5. **Tiempos ya imputados**: ¿son legibles por OF, para no partir de cero?
6. **Tiempo estimado**: columna real de estimados de producción (pedido y/u OF).

## Testing

- `fichaje.ts` y `acciones.ts` son funciones puras → primeros tests unitarios del
  proyecto (Vitest): reparto de intervalos, transiciones válidas/ inválidas, expansión
  pedido→OFs con detenidas.
- UI verificada con Playwright MCP (fichar, pausar, recargar página con reloj corriendo).

## Orden de implementación previsto

1. Motor de fichaje + tests.
2. Máquina de estados + tests; conectar tarjeta/drawer (textos y confirmaciones nuevos).
3. Panel Mi fichaje + accesos rápidos + avisos.
4. (Con datos de IT) columnas reales, export Olanet, OFs detenidas reales.
