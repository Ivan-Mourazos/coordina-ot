import { redirect } from "next/navigation";

// Dirección antigua (hasta el 17/11/2026): la vista de Producción vive ahora
// en /produccion. Se deja para los marcadores y pestañas que ya la tengan.
export default function VistaBelenAntigua() {
  redirect("/produccion");
}
