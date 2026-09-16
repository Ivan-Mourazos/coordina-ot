"use client";

import { useRef, useState } from "react";

/** Cómo encaja la hoja en el hueco. Son los valores que entiende el visor de
 *  PDF del navegador en el fragmento de la URL (`#view=`), no un invento
 *  nuestro: `Fit` es la página entera, `FitH` ajusta al ancho y `FitV` al alto.
 *
 *  Cambiarlo recarga el iframe. Es el propio parte, ya en la caché del
 *  navegador, así que se nota poco; hacerlo sin recargar exigiría hablar con el
 *  visor por dentro, y eso no se puede. */
const AJUSTES = [
  { id: "FitH", icono: "↔", nombre: "Ajustar al ancho" },
  { id: "FitV", icono: "↕", nombre: "Ajustar al alto" },
] as const;
type Ajuste = "Fit" | (typeof AJUSTES)[number]["id"];

/** Los cuatro cuartos de vuelta, en el orden en que los da el botón. */
const GIROS = [0, 90, 180, 270] as const;
export type Giro = (typeof GIROS)[number];

/** El siguiente cuarto de vuelta. Cuatro pulsaciones = vuelta entera. */
export function siguienteGiro(giro: Giro): Giro {
  return GIROS[(GIROS.indexOf(giro) + 1) % GIROS.length];
}

/** ¿Este giro intercambia el ancho y el alto de la hoja?
 *
 *  `transform` NO cambia cómo se mide el elemento: el `<iframe>` se sigue
 *  midiendo en el sistema de coordenadas de antes de girar. Así que a 90° y a
 *  270° hay que darle de ancho el ALTO del hueco y de alto su ANCHO, o la hoja
 *  sale recortada por los lados y con franjas arriba y abajo. A 0° y a 180°
 *  mide igual y basta con el 100 % de siempre. */
export function giroIntercambia(giro: Giro): boolean {
  return giro === 90 || giro === 270;
}

/** Dónde se recuerda cómo prefiere cada uno abrir el parte. En el navegador y
 *  no en el servidor: es una preferencia de cómo se MIRA, no un dato del
 *  trabajo, y va con la pantalla en la que se está sentado — el mismo de
 *  siempre puede querer una cosa en el portátil y otra en el de sobremesa. */
const CLAVE_ENCAJE = "coordina-parte-encaje";

/** El encaje guardado, o la página entera si no hay ninguno. Se lee de forma
 *  SÍNCRONA al montar (no en un efecto): así el visor arranca ya con el encaje
 *  bueno en vez de cargar el parte dos veces, una por cada valor. */
function encajeGuardado(): Ajuste {
  if (typeof window === "undefined") return "Fit";
  try {
    const v = window.localStorage.getItem(CLAVE_ENCAJE);
    return v === "Fit" || v === "FitH" || v === "FitV" ? v : "Fit";
  } catch {
    // Navegador con el almacenamiento capado: se sigue, sin recordar nada.
    return "Fit";
  }
}

/** El parte escaneado, con sus botones en una barra estrecha a la izquierda.
 *
 *  LA ALTURA ES DE LA HOJA. El parte es un A4 vertical y lo que se viene a
 *  hacer aquí es leerlo entero; cualquier cosa puesta encima le come alto y
 *  obliga a bajar. Los botones van al lado, en vertical, donde sobra sitio: la
 *  hoja se queda con todo el alto y entra completa.
 *
 *  La barra del visor de PDF de Chrome se oculta (`toolbar=0`): es gris oscura,
 *  vive dentro del iframe —ninguna clase nuestra la alcanza—, encima de una
 *  ficha en relieve canta, y además gastaba ese alto. Lo que hacía falta de
 *  ella se rehace aquí con los mismos chips que «Material» y «Tareas y
 *  tiempos».
 *
 *  El zoom NO se rehace: lo lleva el visor por dentro (Ctrl + rueda) y sigue
 *  funcionando con la barra escondida.
 *
 *  Vive aquí y no dentro de una ficha porque son DOS: la del Historial y la del
 *  tablero (Pendientes y panel). */
export function ParteEscaneado({
  codigo,
  scanUrl,
}: {
  codigo: string;
  scanUrl: string;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [ajuste, setAjuste] = useState<Ajuste>(encajeGuardado);
  // El giro NO se guarda entre pedidos. El encaje sí (es cómo prefiere mirar
  // cada uno), pero esto es de ESTE parte: que el siguiente se abriera torcido
  // porque el anterior lo estaba sería peor que no tener botón.
  const [giro, setGiro] = useState<Giro>(0);
  // Cuadrados: en una barra estrecha el rótulo no cabe, así que el nombre va
  // en el `title` y en el `aria-label` —el lector de pantalla lo lee igual—.
  const chip = "chip-3d grid size-8 place-items-center rounded-lg text-sm text-text";

  function imprimir() {
    const ventana = marco.current?.contentWindow;
    try {
      if (!ventana) throw new Error("sin visor");
      ventana.focus();
      ventana.print();
    } catch {
      window.open(scanUrl, "_blank", "noopener");
    }
  }

  return (
    // El clic no sale de aquí: en la ficha del tablero, un clic fuera la
    // cierra, y pulsar un botón del parte no es salirse de ella.
    <div className="flex h-full w-full gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex shrink-0 flex-col gap-1.5">
        {/* Ajustar al ancho o al alto. Pulsado otra vez vuelve a la página
            entera, que es como empieza: así dos botones cubren los tres
            encajes sin gastar un tercero en el carril. */}
        {AJUSTES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() =>
              setAjuste((antes) => {
                const nuevo = antes === a.id ? "Fit" : a.id;
                // Se recuerda para la próxima vez que se abra un parte, aquí o
                // en otra ficha: quien prefiere verlo al ancho lo elige una vez.
                try {
                  window.localStorage.setItem(CLAVE_ENCAJE, nuevo);
                } catch {
                  // Sin almacenamiento el botón sigue funcionando; solo no dura.
                }
                return nuevo;
              })
            }
            aria-pressed={ajuste === a.id}
            title={`${ajuste === a.id ? "Volver a la página entera" : a.nombre} · se recuerda para la próxima vez`}
            aria-label={a.nombre}
            // Anillo y color de marca para el que está puesto. NO
            // `glass-chip-activo`: esa tiñe el fondo, y `chip-3d` va después en
            // la hoja, así que con la misma especificidad se lo comería.
            className={`${chip} ${
              ajuste === a.id ? "ring-2 ring-brand-400 text-brand-700 dark:text-brand-300" : ""
            }`}
          >
            {a.icono}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setGiro(siguienteGiro)}
          title={`Girar el parte · ahora ${giro}°`}
          aria-label="Girar el parte"
          className={`${chip} ${giro !== 0 ? "ring-2 ring-brand-400 text-brand-700 dark:text-brand-300" : ""}`}
        >
          ↻
        </button>
        <a href={scanUrl} download={`${codigo}.pdf`} title="Descargar el parte" aria-label="Descargar el parte" className={chip}>
          ↓
        </a>
        <button type="button" onClick={imprimir} title="Imprimir el parte" aria-label="Imprimir el parte" className={chip}>
          ⎙
        </button>
      </div>
      {/* El `div` declara el hueco como contenedor de tamaño (`container-type:
          size`): así el iframe de dentro puede medirse en unidades relativas a
          ESTE hueco (`cqw`/`cqh`) en vez de a la ventana o a su propio tamaño
          de antes de girar. Es más simple que observar el hueco con JS
          (`ResizeObserver`) para nada más que repetir en variables CSS un
          tamaño que el propio CSS ya sabe. */}
      <div
        className="relative h-full min-w-0 flex-1 overflow-hidden rounded-xl"
        style={{ containerType: "size" }}
      >
        <iframe
          // `key` CON EL ENCAJE, y no es cosmética: cambiar solo el fragmento
          // de la URL no recarga nada —para el navegador es la misma página— y
          // el visor se quedaba con el encaje anterior. Medido: pulsar «al
          // ancho» y luego «al alto» daba dos capturas idénticas. Con la
          // clave, React tira el iframe y monta otro, que es una navegación
          // de verdad.
          //
          // EL GIRO NO ENTRA EN LA CLAVE. Es CSS: si entrara, girar tiraría el
          // visor, recargaría el PDF y volvería a la página 1.
          key={ajuste}
          ref={marco}
          src={`${scanUrl}#page=1&view=${ajuste}&toolbar=0`}
          title={`Pedido ${codigo}`}
          style={{
            transform: `translate(-50%, -50%) rotate(${giro}deg)`,
            // Girado un cuarto impar, el iframe se sigue midiendo con el
            // ancho y el alto de ANTES de girar (`transform` no cambia el
            // layout). Por eso aquí se le da la vuelta a los ejes: de ancho
            // el alto del hueco (`100cqh`) y de alto su ancho (`100cqw`), y al
            // girar la hoja de pie queda llenándolo entero.
            width: giroIntercambia(giro) ? "100cqh" : "100%",
            height: giroIntercambia(giro) ? "100cqw" : "100%",
          }}
          className="absolute left-1/2 top-1/2 border-none bg-white"
        />
      </div>
    </div>
  );
}
