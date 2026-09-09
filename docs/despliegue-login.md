# El login: cómo se despliega y cómo se enciende

Son **dos días distintos**, y confundirlos es lo único que puede salir mal aquí.

---

## Día 1 — subir el código (el login APAGADO)

Esto no cambia nada para el equipo. `COORDINA_LOGIN` no está puesta, o está a
`off`, y todo el mundo sigue entrando como siempre: elige su cara y adentro.

1. Desplegar como cualquier otra versión.
2. **Backup de `data/coordina.db` antes de arrancar** (`pnpm backup`): la
   migración 7 crea la tabla `persona`. Es la práctica de siempre, y aquí más.
3. Después de arrancar, comprobar dos cosas:
   - `PRAGMA user_version` en `data/coordina.db` dice **7**.
   - La web se ve exactamente igual que ayer. Si sale una pantalla de PIN, la
     variable está encendida y no debería.

**Nada está protegido todavía.** El servidor sigue creyéndose el `operarioId`
que le manda el navegador, igual que siempre. Lo único que cambia es que la
maquinaria está puesta y probada.

---

## Día 2 — encenderlo

Aquí sí lo nota todo el mundo: **todos los navegadores del equipo pierden su
identidad guardada** y se encuentran la pantalla del PIN. No es un fallo, es el
cambio.

### Antes

1. **Avisar al equipo el día anterior.** El mensaje es corto: "mañana la web te
   va a pedir un PIN; es tu extensión, y la primera vez te la pide dos veces".
2. **Tener a mano la lista de extensiones.** Quien no se acuerde de la suya se
   queda fuera de su herramienta de trabajo hasta que alguien se la diga.
3. **Generar el secreto EN el servidor** y ponerlo en su `.env.local`. Sin él la
   app no arranca con el login encendido. No reutilizar el de desarrollo:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
4. Otro backup. Encender no migra nada, pero es el día de tocar producción.

### Encender

En el `.env.local` del servidor:

```
COORDINA_LOGIN=activo
COORDINA_SESION_SECRET=<lo generado en el paso 3>
```

y reiniciar el proceso. **No hay que desplegar código.**

### Ángel entra el primero

Mientras una persona no tenga PIN puesto, cualquiera de la red puede ponérselo
y entrar como ella: el primer PIN que se teclea para un nombre se acepta como
bueno, quien lo teclee. Ángel es la ÚNICA cuenta activa con rol de supervisor,
o sea la única que puede reiniciarle el PIN a alguien: si alguien se quedara
con su identidad, controlaría después quién recupera su cuenta, y no habría
forma de deshacerlo desde el menú.

Por eso, nada más reiniciar el proceso y ANTES de avisar al resto del equipo
de que ya pueden entrar: que Ángel entre, elija su PIN y lo compruebe. Solo
entonces se abre paso a los demás.

### Comprobar, en este orden

1. La pantalla de PIN sale.
2. Ángel entra (ver arriba) y el tablero le sale bien.
3. En las herramientas del navegador, Aplicación → Cookies: `coordina_sesion`
   con **HttpOnly marcado**. Si `document.cookie` la enseña desde la consola,
   algo se hizo mal y el login no protege nada.
4. El menú de arriba a la derecha dice **Salir**, no "Cambiar".

### Si algo va mal

Quitar `COORDINA_LOGIN` (o ponerla a `off`) y reiniciar. Vuelve a estar como
antes en un minuto, y nadie pierde nada: los ids de las personas son los de
siempre, así que todo lo que se guardó con el login encendido sigue siendo suyo.

### Las novedades, ese día

El log de novedades sale de los mensajes de commit, y los commits del login se
hicieron **sin** línea `Novedad:` a propósito: el día que se subió el código no
le cambió nada a nadie. El día que se enciende sí. Poner estas dos líneas en el
commit que cambie la configuración, y pasar `pnpm novedades`:

    Novedad: nuevo | Ahora entras con un PIN
    Detalle: Eliges tu nombre como siempre y tecleas los cuatro números de tu extensión. La primera vez te los pide dos veces, para que no se cuele una errata. Cuando termines, en el menú de arriba a la derecha tienes Salir.
    Novedad: arreglado | Lo que escribías podía firmarlo otro
    Detalle: Hasta ahora el nombre viajaba desde el navegador y se podía cambiar. Ahora lo pone el servidor: lo que fichas, apruebas o escribes queda a tu nombre y solo al tuyo.

### Encender con el equipo delante, y repasar después

Encender la variable un rato antes de que llegue nadie, para "probarlo en
frío", es tentador y es un error: cada cuenta sin PIN es una cuenta libre
hasta que su dueño la reclama, así que cuanto más tiempo pase encendido sin
gente delante tecleando su PIN, más tiempo queda esa puerta abierta sin nadie
vigilándola. Enciéndelo con el equipo ya sentado y avisado, para que cada uno
reclame la suya en cuanto pueda.

Al rato de encenderlo, repasar que no quede nadie sin PIN puesto: el propio
menú de "PIN olvidado" (el que usa Ángel para resetear) marca "sin PIN" junto
al nombre de quien todavía no lo ha puesto, así que mirarlo es cosa de abrir
ese menú. A quien esté de vacaciones o de baja ese día, avisarle para que lo
ponga en cuanto pueda, o esperar a que vuelva: mientras no lo tenga, su cuenta
sigue reclamable por cualquiera de la red, igual que la de Ángel al principio.

### Después

Ángel es el único con rol de supervisor: si alguien se atasca, él le resetea el
PIN desde el menú.

---

## Lo que NO entra en esta versión

La consulta sin login (fase 2) y la vista de supervisión de Cris, Carlos y
Esteban (fase 3). Sus filas están sembradas en la tabla con `activo = 0`; el día
que se abran, se activan y no hay que migrar nada.
