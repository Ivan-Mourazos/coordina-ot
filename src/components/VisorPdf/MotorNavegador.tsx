/** El PDF pintado por el navegador, como siempre: cada uno con lo que tenga
 *  puesto (el de Chrome, el de Firefox, la extensión de Adobe…).
 *
 *  `key` con el fragmento, y no es cosmética: cambiar solo el fragmento de la
 *  URL no recarga nada —para el navegador es la misma página— y el visor se
 *  quedaba con el encaje anterior. Con la clave, React tira el iframe y monta
 *  otro. Es la recarga que el motor propio se ahorra. */
export function MotorNavegador({
  url,
  fragmento,
  titulo,
}: {
  url: string;
  fragmento: string;
  titulo: string;
}) {
  return (
    <iframe
      key={fragmento}
      src={`${url}#${fragmento}`}
      title={titulo}
      onClick={(e) => e.stopPropagation()}
      className="h-full w-full rounded-xl border-none bg-white"
    />
  );
}
