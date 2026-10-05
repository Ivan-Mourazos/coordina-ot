// GET /api/partes/AR.26.02711.pdf (y .png) — el mismo parte escaneado que sirve
// /api/pedidos/[archivo], bajo otra dirección.
//
// La dirección nueva existe por una sola razón: hasta el 05/10/2026 el parte se
// servía con caché de un día, y los navegadores que ya lo tenían guardado no
// vuelven a preguntar por esa dirección hasta que les caduque, diga lo que diga
// ahora el servidor. Con una dirección que ningún navegador ha visto, el primer
// vistazo ya llega con las cabeceras buenas (no-cache + ETag) y el parte
// re-escaneado se ve sin que nadie tenga que vaciar nada.
//
// La de /api/pedidos sigue viva para los enlaces que ya estén copiados por ahí.
export { GET } from "../../pedidos/[archivo]/route";
