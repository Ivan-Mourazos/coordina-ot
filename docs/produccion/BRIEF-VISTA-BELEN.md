# Vista de Producción para Belén Alamancos — punto de partida

Recogido el 09/11/2026 con Iván. Sirve para arrancar una sesión nueva sin
arrastrar el historial anterior.

## Quién y para qué

Belén Alamancos Bermúdez (Producción) revisa tareas y fichajes, finaliza
operaciones pendientes, revisa los bultos de los pedidos y más. Hoy lo hace con
Excels con macros y otras herramientas. En RPS firma las notas de las OF como
«BELEN AB - …» (`CPRManufacturingOrder.Notes`). Irá pidiendo cosas poco a poco.

## Decisiones tomadas

1. **Va dentro de Coordina, con un acceso propio de Producción.** Belén entra con
   su usuario y aterriza en su pantalla. No ve el tablero de OT salvo que se
   decida otra cosa. Se reutilizan el login, el acceso a RPS, el Historial y la
   ficha del pedido.
2. **Lo primero es el buscador de pedidos.** Es lo que más usa: buscar un pedido
   concreto. Debe ser **ultrarrápido**.
3. **Después vienen las pestañas**, una por herramienta. Cada una lleva su propio
   diseño cuando Belén la pida.

## El buscador

Acepta lo que escriba (ya resuelto en `src/lib/codigo-busqueda.ts`, ver abajo):

| Escribe | Busca |
|---|---|
| `AR.26.05448`, `26.05448`, `2605448`, `ar2605448` | El pedido AR.26.05448, exacto |
| `5448` | AR.26/25/24/23.05448 |
| `26.054` | Pedidos que empiezan por AR.26.054 |
| `0232470` | La OF y, desde ella, su pedido |
| texto | El cliente |

Al encontrar el pedido sale **una fila por OF** (ejemplo de Belén: AR.26.04716,
con las OF 0232466, 0232469 y 0232470). Lo que quiere ver de un vistazo:

- **Prioridad** en número: 0, 1, 2, 3.
- **Un punto de color** según los bultos:
  - verde: bultos subidos, trabajo acabado;
  - rojo: bultos sin subir, trabajo sin acabar;
  - granate: bultos subidos, pero las unidades no coinciden con las de la OF.
- OF, pedido y descripción de la OF.
- **Situación de la OF:** DETENIDA, CON IMPUTACIONES o FINALIZADA.
- **Cada operación de la OF** como FINALIZADO (acabada) o INTERRUMPIDO
  (empezada y sin acabar).
- **Forma de entrega**, por ejemplo INSTALAR.
- **Rotulación**, por ejemplo MAHOU.
- **Paquete:** quién hizo el bulto y cuándo. Ejemplo: «1 PAQUETES», «Prev
  Logística 2026-11-11 VALIÑO ALAMANCOS, JOSE LUIS».
- **Fecha comprometida.** Es el formulario BPM «Opción pedido», ver la memoria
  `fecha-comprometida-rps`.
- **Fecha de compras.** Ejemplo: «F.Compra: 11/11/2026».
- **Comentario de la OF:** las notas de la oficina de Producción. Ejemplo: OF
  0232470, «FALTA LONA ROJA (DE MOMENTO SE VAN SIN ROTULAR)».
- **Material de compras pendiente de recibir.**
- **TP/COT:** fecha en que se hizo, o si está pendiente de hacer.

## Pestañas para después (de sus Excels)

1. OF con 1 tarea sin finalizar.
2. Tareas pendientes con los bultos ya subidos.
3. Desfase de unidades: bultos subidos cuyas unidades no coinciden con las de
   la OF (`Control_falsos_positi….xlsx`).
4. Fechas comprometidas que dio Producción (`fecha_comprometida….xlsx`).
5. Fallos de descripción en la OF y varias máquinas en una misma operación
   (`fallos_maquinas-desc….xlsx`).

Iván dejará esos Excels (con macros) en una carpeta que dirá al empezar. **Hay que leer las macros
antes de diseñar nada.** Ahí está de qué tablas de RPS salen los bultos, quién
hizo el paquete, la fecha de compras, el material pendiente y el TP/COT.
Coordina no ha tocado nunca esas tablas.

## Ya hecho (09/11/2026)

- **Buscador de Coordina rápido.** Antes buscaba «contiene» con un parámetro sin
  tipo y tardaba de 5 a 12 s con `26.05448`.
  - `interpretarBusqueda` convierte lo escrito en un código exacto o en un
    principio de código.
  - `buscar-db.ts` consulta por igualdad o por prefijo, con `VarChar`.
  - Medido contra RPS: unos 20 ms los códigos, 17 ms la OF y 50-100 ms el texto
    de cliente.
  - El buscador de Belén debe usar esa misma función.

## Reglas que no cambian

- RPS es **solo lectura** (usuario de lectura, en 192.168.0.124). Nada de
  escribir en RPS ni ejecutar procedimientos de OLANET.
- En 192.168.4.113, solo el usuario `coordina`.
- Commits con línea `Novedad:` cuando el equipo lo note. Subir solo cuando Iván
  diga «sube» o «sí». Tras subir, darle el comando de despliegue.
- Estilo HeroUI: `docs/ESTILO-HEROUI.md`.

## Siguiente paso

1. Leer los Excels (Iván dice dónde están) y sus macros (consultas, tablas y columnas).
2. Con eso, proponer de dónde sale cada dato de la fila y medir las consultas
   en RPS.
3. Enseñar a Iván un boceto de la fila del pedido con datos reales antes de
   programar.
4. Diseñar el acceso de Producción: rol o usuario, a dónde llega al entrar y qué
   ve.
