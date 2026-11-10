# Peticiones de Belén para su vista (10/11/2026)

Lo que pidió por Teams después de probar la vista. Capturas en
`capturas-belen/`. Antes de programar, leer también `BRIEF-VISTA-BELEN.md`.

**RPS es solo lectura.** Imprimir documentos de RPS no es escribir, pero hay
que ver de dónde salen esos informes antes de prometer nada.

## 1. Imprimir la OF y la reserva de material
Captura: `2026-11-10-imprimir-of-y-reserva.png`

- Hoy lo hace en RPS: Fabricación → «Imprimir Documentación», elige las OF y
  marca **Hoja de Ruta** y **Vale de Material**.
- Salen dos informes:
  - «MATERIALES RESERVADOS OF 0233881, pedido AR.26.05479»: lista de material
    con código de barras y una tabla de imputación de material.
  - «HOJA RUTA»: logo TGM, O.F., cliente, operaciones con un código de barras
    por tarea y por máquina.
- Quiere imprimirlos desde Coordina.
- Por investigar: ¿se puede generar el informe de RPS (Crystal o similar) o
  hay que rehacerlo nosotros en PDF con los mismos datos? Los códigos de barras
  tienen que valer para fichar.
- Candidato: botón «Imprimir OF y reserva» en la ficha del pedido (por OF o
  por todas).

### Investigado (10/11/2026, solo lectura)

- Los dos informes son **Stimulsoft**, guardados en la tabla `CUSTReport` de
  RPS: `CPRROADMAP` («Hoja ruta OF») y `CPRTICKETMAT` («Materiales OF»). Cada
  fila trae el diseño (`ReportDefinition`, XML) y su consulta (`Query`), escrita
  contra el modelo de entidades de RPS, no contra tablas.
- Generarlos tal cual desde Coordina no es viable: haría falta el motor de
  Stimulsoft (licencia) y el modelo de entidades de RPS.
- Rehacerlos sí: cada entidad de la consulta es una tabla que ya leemos
  (`CPRManufacturingOrder`, `CPRMOTask`, `CPRMOResourceMachine`,
  `FACOrderLineSL` + `_FACOrderLineSL_Custom`, `FACOrderSL`, `FACCustomer`,
  `GENWarehouse`, `STKArticle`, `CPRMOMaterial`, `STKStockReserve`, `STKStock`,
  `GENMeasureUnit`). Probado con la OF 0233881 de la captura: mismos datos,
  menos de 100 ms.
- **Códigos de barras:** todos Code128 (automático) con texto simple:
  - Hoja de ruta, cabecera: el número de OF (`0233881`).
  - Hoja de ruta, una por operación: `OF-tarea` con el código de tarea tal
    cual (`0233881-02`; ojo, «2» y «02» son tareas distintas).
  - Vale de material: la serie del stock reservado o, si no tiene, el código
    del artículo.
  Reproducirlos igual es seguro: valen para fichar mientras el texto sea el
  mismo.
- Campos de la hoja de ruta: O.F., artículo, cantidad, F. entrega
  (`ManualEndDate`), fecha de hoy, pedido/línea, almacén, cliente, ref.
  cliente, descripción (comentario de la línea), rotulación, observaciones
  (notas de la OF), operaciones (nº, descripción, centro de trabajo, código de
  barras) y las tablas en blanco para apuntar a mano materia prima y tiempos.
- Vale de material: por material reservado, descripción, cantidad y unidad,
  código, serie y su código de barras; debajo, la tabla en blanco de
  imputación de materia prima.

## 2. Comprobar la fecha solicitada (nueva lista)
Captura: `2026-11-10-fechas-listas-y-orden.png` (Excel
`comprobaciones_planificad…`)

- Columnas: FechaInicio, FechaFin, Pedido, Línea, OF, Almacén, Cliente.
- Es la hoja donde filtra los trabajos **para hoy, mañana, atrasados…**
- Candidato: herramienta nueva con grupos Atrasados / Hoy / Mañana / Esta
  semana. Va con el retoque de «Pedidos por entrega» (ver la memoria
  `pendiente-entregas-belen`): puede que sean la misma pantalla.

## 3. Fechas comprometidas: solo lo pendiente
- Ahora salen todas. Quiere **solo los pedidos pendientes de hacer**: fuera
  los cumplimentados y **los que tienen los bultos subidos**.
- **Ordenadas por fecha.**

## 4. Juntar dos listas en una
- «1 tarea sin finalizar» = bultos subidos pero queda UNA tarea sin fichar o
  interrumpida.
- «Pendientes con bultos subidos» = bultos subidos y MÁS de una tarea sin
  fichar o interrumpida.
- Propone **una sola lista: «Bultos subidos, tareas pendientes»**, con las
  dos cosas.

## 5. Desfase de unidades: que salgan también las delegaciones
- Hoy la lista es solo de AR. **Delegaciones = SA y BE** (Iván, 10/11): en esta lista
  salen AR, SA y BE. Las demás listas siguen solo con AR.

## 6. Duplicar unidades: azul en vez de granate
- Es el **punto marrón de bultos** (antes granate; Iván, 10/11). Pasa a **azul**.
  Buscar `marron` en `puntoBultos` (lib/vista-belen.ts), FilaOFBelen y significados.ts.

## 7. Orden y color de las fechas en la fila de la OF
Captura: `2026-11-10-fechas-listas-y-orden.png` (anotada sobre AR.26.04441)

En este orden, cada una con su color:
1. **Fecha solicitada**, en rojo.
2. **Fecha comprometida**, en verde.
3. **Fecha logística** (Prev. logística), en malva.
4. **Fecha compras**, en azul.
5. **Comentario de la OF**, en rojo.

Ejemplo de su app vieja (AR.26.05385): `F.Sol` en rojo, `F.Compras` en azul,
`Prev Logística: fecha, responsable` en malva.

## 8. La OF se despliega hacia abajo con sus tareas
Captura: `2026-11-10-of-desplegable-y-tp-amarillo.png`

- Al pinchar en una OF se abre debajo «Detalles 0232470»: cada tarea con su
  máquina o sección, tiempo (min), estado (FINALIZADA…) y fecha. Al final, las
  TP/COT con «Hecho dd/mm», «SIN TIEMPO IMPUTADO» y «FIN RPS».
- Iván se lo confirmó por Teams.

## 9. TP/COT hecho = la OF en amarillo
- Cuando un TP o COT está hecho, la OF puede salir en amarillo, como en la
  captura de la app vieja (fila verde-amarilla).
- Cuidado con el estilo HeroUI: que sea un tinte amarillo suave, no la fila
  entera chillona. Enseñar una prueba a Iván antes.
