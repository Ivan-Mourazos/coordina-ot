# El panel y la revisión de Diseño Gráfico

Fecha: 2026-09-09 · Pedido por el equipo de Diseño Gráfico a través de Iván

## Por qué

Diseño Gráfico entró en CoordinaOT hace una semana con la web de Oficina
Técnica tal cual, y trabajan distinto. Dos cosas les estorban a diario:

1. **El panel les enseña primero lo que está esperando por otro.** "Esperando
   revisión" va antes que "Listo para pasar", y lo quieren al revés: lo que
   pueden cerrar hoy delante, y lo que depende de un tercero al final.
2. **La web les hace pasar las OF una a una.** En OT eso tiene sentido: un
   pedido se reparte entre varios y cada uno manda lo suyo cuando lo acaba. En
   Diseño no se reparte nada — **una persona hace el pedido entero y lo pasa de
   golpe**. Si Smith tiene que meter mano, Carrón se lo pasa cuando termina.
   Mandar OF por OF es repetir cinco veces un gesto que debería ser uno.

Ninguna de las dos es un fallo: es que la web sabe de una forma de trabajar y
hay dos.

## Alcance

**Entra:** el orden de las columnas del panel, por sección · las acciones de
estado suben del OF al pedido, en Diseño · el sitio donde se declara esa
diferencia.

**No entra, y a propósito:**

- **El Historial** (enseñar todas las OF de un pedido etiquetadas por centro de
  trabajo, con sus tiempos, y el buscador universal). Son dos proyectos aparte,
  más grandes que éste y que afectan a las dos secciones. Ver "Lo aplazado".
- **La píldora del reloj que sigue corriendo sin pedido.** Es un fallo, no un
  cambio: se persigue hasta la causa por su cuenta.
- **Oficina Técnica no cambia en nada.** Todo lo de aquí es opcional y quien no
  lo declare se comporta como hoy.

## Decisiones

### La diferencia se declara, no se pregunta

Todo esto vive en `src/lib/secciones.ts`, en dos campos nuevos y opcionales de
`Seccion`. Es el fichero cuyo propósito escrito es que *"todo lo que distingue a
una sección de otra viva aquí"*, y la razón está en su propia cabecera: esos
literales estuvieron repartidos por cinco sitios y se desincronizaban a la
primera.

Lo que NO se hace: un `if (seccion === "diseno")` dentro de un componente. Uno
solo no molesta; el problema es que ese patrón se multiplica, y a la tercera
sección hay que buscarlos por todo el código.

### El orden de fases lo pone la sección

Diseño declara su orden con "Listo para pasar" delante de "Esperando revisión".
Quien no declare ninguno se ordena como siempre.

**Lo ordenan CUATRO componentes, no uno.** `ZonaPersonal` (el panel), pero
también `TecnicoCard` (la tarjeta de cada compañero), `PanelCompanero` y
`FaseFlyout` (el desplegable de "ver todos"). Cambiar solo el panel dejaría el
mismo trabajo en dos órdenes distintos según dónde se mire, que es peor que no
cambiarlo. Los cuatro los monta `Board`, que ya sabe qué sección se está
mirando, así que el dato baja como una prop más.

### En Diseño se revisa por pedido

Con la sección declarada así:

- **Las OF se siguen viendo enteras** en la ficha, con su descripción y sus
  tiempos. No se esconde nada; lo que cambia es dónde están los botones.
- **Pasar a revisión, aprobar y devolver** suben al pedido. Las filas de OF
  dejan de tener los suyos, y también salen del menú de la fila.
- **Fichar se queda en los dos sitios**, igual que hoy: la OF suelta o el pedido
  entero. Es lo único que de verdad se hace a nivel de OF —arrancar el reloj en
  lo que estás tocando ahora— y quitarlo sería quitar precisión donde sí importa.
- **Anular se queda por OF.** Es la única de las cinco que no es "el paso
  siguiente del trabajo" sino "esto no debería estar aquí". Y pasa: las tareas
  que RPS duplica cambiando solo el cero de delante —la `2` y la `02`— salieron
  en 37 pedidos, y Diseño Gráfico es la sección más afectada. Cuando entra una
  OF así, lo que hace falta es quitar ésa y dejar el pedido en paz; con anular a
  nivel de pedido habría que cargarse los cinco trabajos buenos para tirar el malo.

### "El pedido entero" son las que se pueden mandar ahora

Si un pedido tiene tres OF y una sigue planteándose, se mandan las dos que están
listas. La alternativa —no dejar mandar nada hasta que estén todas— bloquea a
quien acabó por quien no, y en Diseño el pedido lo hace una sola persona, así
que ese caso es raro de por sí: si aparece, es que alguien dejó una a medias y
no tiene sentido retenerle las otras.

### Los tres botones del pedido dejan de esconderse con una sola OF

Los tres existen ya, y **los tres desaparecen cuando el pedido tiene una sola
OF**: "Pasar las N a revisión" pide `> 1`, "Aprobar las N" pide `> 1`, y el
cuadro de devolver el pedido entero, también. Tiene sentido hoy —con una sola,
el botón del pedido y el de su fila harían lo mismo— pero deja de tenerlo en
cuanto se quita el de la fila: el caso más común de Diseño es un pedido con una
OF, y se quedaría sin ninguna forma de pasarlo.

Así que en Diseño los tres salen siempre, con una OF o con cinco.

Y el de revisión pierde además una segunda condición: hoy exige que **todas las
OF sean del mismo autor**. Deja de importar, no porque se haya resuelto el caso
sino porque **en Diseño no ocurre** —no se reparten las OF de un pedido—. Se
implementa sin la restricción, que es más simple que mantenerla, y el
desplegable de revisor ya sabe excluir a varios autores a la vez si algún día
hiciera falta.

## Cómo

`Seccion` gana dos campos opcionales: el orden de fases y si su revisión es por
pedido. `agruparPorFase` pasa a aceptar la sección y ordenar por ella. `Board`
—que ya conoce la sección que se está mirando— se la pasa a los cuatro
componentes que agrupan y al `Drawer`, que hoy no la conoce.

En el `Drawer`, la diferencia se resuelve en dos sitios: la fila de OF deja de
pintar los botones de pasar a revisión, aprobar y devolver (y sus entradas del
menú), y los tres botones del pedido dejan de exigir más de una OF.

## Qué se prueba

- Diseño ordena sus columnas con "Listo para pasar" antes que "Esperando
  revisión"; Oficina Técnica, como siempre.
- Los cuatro sitios que agrupan por fase enseñan el MISMO orden dentro de una
  sección. Es lo que se rompe si alguien añade un quinto y se olvida.
- Una sección sin nada declarado se comporta exactamente como hoy. Es la garantía
  de que Oficina Técnica no se entera de este cambio.
- En Diseño, un pedido con una sola OF ofrece los tres botones del pedido:
  mandarlo a revisar, aprobarlo y devolverlo. Es el caso más común de esa
  sección y el que hoy se quedaría sin salida.
- En Diseño, la fila de una OF no ofrece pasar a revisión, aprobar ni devolver
  —ni en el botón ni en el menú—; pero sí ofrece fichar y anular.
- En Oficina Técnica sigue habiendo botón por OF, y los del pedido siguen
  pidiendo más de una.

## Lo aplazado, y qué hay que aclarar antes

**El Historial enseñando todas las OF.** Decidido ya: un bloque por centro de
trabajo (Oficina Técnica · Diseño Gráfico · Taller), cada uno con su total y con
quién lo hizo, y el bloque de tu sección abierto y los demás plegados. Lo que
falta por decidir antes de construirlo: si dentro del bloque de Taller se
desglosa por persona o basta el total. Es la primera vez que esta web enseñaría,
con nombre y apellidos, cuánto echó cada uno de corte o confección — es lo mismo
que ya enseña RPS, pero no a la misma gente.

Va aparte por tamaño y porque **no es de Diseño**: cambia el Historial de las dos
secciones. Y no es cosmético: hoy el número que enseña un pedido significa "esto
nos costó a nosotros", y medido sobre pedidos reales el 01/09, meter el taller lo
multiplica por 60 (SA.26.00860, de 4 min a 240) y por 143 (SA.26.00498, de 14 min
a 2010).

**El buscador del Historial.** Hoy tiene un campo de "Pedido o cliente" y, al
lado, un autocompletar de cliente: dos formas de buscar lo mismo. Se quiere uno
solo que busque por OF, pedido, cliente y texto de la OF, con los filtros aparte.
Va después del anterior: aquél cambia qué se enseña y éste cómo se busca dentro,
así que hacerlo antes es rehacerlo.

Antes de construirlo hay que mirar si el buscador global que ya tiene la web (el
de la lupa) sirve tal cual, en vez de escribir otro.
