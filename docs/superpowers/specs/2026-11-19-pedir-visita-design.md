# Pedir visita a Oficina Técnica — diseño

Fecha: 19/11/2026 · Pide: Iván · Maqueta aprobada: `tmp/maqueta-pedir-visita.html` (HeroUI, tema claro)

## Para qué

Cuando OT necesita que un instalador o comercial **venga a la oficina** por un pedido, hoy se
escribe a mano un correo a Instalaciones (CC Oficina Técnica y Producción) y se deja una nota en
el pedido. Instalaciones no sabe qué días no estamos (teletrabajo, vacaciones) y pone visitas
esos días.

El botón «Pedir visita» hace las dos cosas de una vez y lleva ya los días en que no estamos.

**Fuera de alcance:** Bizneo (no hay datos), crear el aviso en RPS, saber qué fecha fijó
Instalaciones. La visita que vale es la que Comerciales/Producción ponen en RPS (vista «Visitas
COT»); Coordina no guarda ni enseña una fecha de visita propia.

## 1. Mis ausencias

Cada técnico, desde la pestaña **Visitas** (botón «Mis ausencias» junto al calendario), guarda:

- **Teletrabajo fijo:** días de la semana (L–V). Tamara: X y V. Alberto: J.
- **Ausencias puntuales:** rango de fechas (desde–hasta, ambos incluidos) + nota opcional.

Privacidad: la nota solo la ve su dueño. Fuera de esa pantalla solo existe «no está en OT».

Guardado en la SQLite de Coordina (`estado-db`), dos tablas por operario: días fijos y rangos.
Las ausencias pasadas se pueden borrar solas a los 90 días.

### En el calendario de Visitas (19/11, Iván)

El calendario mensual de la pestaña Visitas (`CalendarioVisitas.tsx`, visitas reales de RPS)
enseña también las ausencias de OT:

- Día con alguien de OT fuera: marca propia (franja roja abajo), distinta del punto de visitas.
  Ese día se puede pinchar aunque no tenga visitas.
- Al elegir un día, encima de sus visitas: «No están en OT: Tamara» (o «Tamara y Alberto»).
  Sirve para ver el choque si Instalaciones pone una visita un día malo.
- Leyenda del calendario: «no está alguien de OT».
- Lo ve cualquiera con sesión (OT, Diseño, Producción, Dirección). La **consulta sin login no**
  enseña ausencias (reutiliza la misma vista con otra base: ahí ni se piden).
- La ventana «Pedir visita» mantiene su tira de 3 semanas (maqueta aprobada): ahí hay que leer
  nombres bajo cada día y retocar, y en las celdas del mes no caben.

## 2. Botón «Pedir visita» (ficha del pedido)

Lo ve cualquier usuario con sesión de OT. Abre una ventana con:

| Campo | Comportamiento |
|---|---|
| Cabecera | Pedido, cliente, píldoras **Solicitada** (fecha de entrega de Coordina = fecha solicitada) y **Prioridad**, nº de OF. Solo lectura. |
| OF | Las OF del pedido con casilla. Si hay una sola, viene marcada; si hay varias, ninguna. Obligatorio marcar ≥ 1. |
| Viene | Texto libre obligatorio. Autocompleta con los nombres usados antes (tabla propia, ordenados por uso reciente). |
| Cuándo | Píldora deslizante: «Lo antes posible» · «Un día» (+ fecha) · «Sin prisa». Por defecto «Lo antes posible». |
| Motivo | Texto libre opcional. |
| Le atiende | Quien pide, ya puesto. «+ Añadir» para compañeros de OT. Al menos uno. |
| No estamos en OT | Calendario L–V de 3 semanas desde hoy. Rellenado con las ausencias de quienes atienden (nombre bajo el día; «Ambos»/«Todos» si coinciden). Pinchar un día lo quita o añade **solo para esta petición**. La fecha solicitada lleva borde ámbar; el día de «Un día», borde verde. |

Si el día elegido en «Un día» cae en un día marcado como «no estamos», la ventana avisa en una
línea antes de enviar (no bloquea).

## 3. Correo

- **De:** coordina@ (Microsoft Graph, `graph-correo.ts`). **Para:** Instalaciones.
  **CC:** Oficina Técnica, Producción. **Responder a:** quien pide (sin decirlo en el texto;
  casi nunca responden).
- **Asunto:** `Visita de Juan Castro a Oficina Técnica · mar 25/11 · AR.26.05448`
  (sin fecha si «Sin prisa»; «lo antes posible» si es esa opción).
- **Cuerpo (HTML):**
  1. Frase: «Visita de **Juan Castro** a Oficina Técnica con **Tamara y Alberto** el **martes 25/11**.»
     — o «… lo antes posible.» — o sin cola de fecha si «Sin prisa».
  2. Bloque del pedido: pedido y cliente; píldoras Solicitada y Prioridad; OF marcadas, una por
     línea con descripción; **Motivo** al final, si lo hay.
  3. Bloque rojo «Esos días no estamos en OT, por favor no pongáis la visita:» con los días y
     quién falta; rangos seguidos agrupados («2/12 al 5/12 · Tamara»). Si no hay ninguno, no sale.
  4. Firma: «Pedido desde Coordina por Tamara.»
- Configuración en `.env`, con el mismo esquema que el planteamiento:
  `CORREO_VISITA=off|ensayo|activo`, `CORREO_VISITA_PARA`, `CORREO_VISITA_CC`. En ensayo va
  todo a `CORREO_ENSAYO_PARA`.
- Envío por cola con reintentos (mismo patrón que `correo-cola.ts` + `correo-worker.ts`, en
  tabla propia: la actual está ligada al planteamiento).

## 4. Nota en el pedido

Al encolar el correo se crea una nota normal en el hilo del pedido (`crearNota`), autor = quien
pide, para todos, **sin menciones**:

> Visita solicitada a Instalaciones: Juan Castro con Tamara y Alberto, preferible mar 25/11.
> OF 26/10234, 26/10235, 26/10236. Motivo: confirmar medidas del cofre antes de pasar a Producción.

Es lo que antes se escribía a mano. No hay otra marca de «visita pedida» en la ficha. Si el
correo acaba descartado (error no reintentable), se añade una respuesta en ese hilo diciéndolo.

Pedir otra visita del mismo pedido está permitido; la ventana enseña arriba la última nota de
visita solicitada si existe.

## Errores

- Sin credenciales Graph o `CORREO_VISITA=off`: el botón no aparece.
- Fallo de envío reintentable: se reintenta; la nota ya está puesta.
- Validación (sin OF, sin «Viene», sin quien atiende): no deja enviar, mensaje en el campo.

## Pruebas

- Unitarias: cálculo de días no disponibles (fijos + rangos + retoques), agrupado de rangos para
  el correo, texto de la frase según «Cuándo», asunto, texto de la nota.
- Ruta: valida entrada, encola correo y crea nota; modo ensayo redirige destinatarios.
- Visual: ventana, «Mis ausencias» y calendario de Visitas con ausencias, en claro y oscuro,
  1280×720. Consulta sin login: sin marcas de ausencia.

## Novedad

`Novedad[ot]: nuevo | Pedir visita a Instalaciones desde el pedido`
`Detalle: Marcas las OF, quién viene y el motivo; el correo lleva los días que no estáis en la oficina y queda nota en el pedido.`
