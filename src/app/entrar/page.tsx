"use client";

import { useRouter } from "next/navigation";
import { LoginGate } from "@/components/LoginGate";

// La pantalla del PIN, que hasta hoy vivía dentro de Board. Desde allí no
// podía servir a la consulta, que no es una vista del tablero: quien llega sin
// sesión ve la consulta y entra por aquí cuando quiere trabajar.
export default function Entrar() {
  const router = useRouter();
  return (
    <LoginGate
      onEntrado={() => {
        // `refresh` y no `push`: la cookie ya está puesta, lo que hace falta es
        // que el servidor vuelva a decidir qué web toca (ver app/page.tsx).
        router.replace("/");
        router.refresh();
      }}
    />
  );
}
