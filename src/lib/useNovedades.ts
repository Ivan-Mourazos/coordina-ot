"use client";

import { useEffect, useState } from "react";
import { MARCA_ULTIMA, cambiosSinLeer, cuantasNuevas, type PerfilNovedades } from "./novedades";

const CLAVE_ANTERIOR = "coordina-novedades-visto";

/** Una marca por persona: compartir ordenador no da por leído lo de otro. La
 * marca anterior se respeta al migrar; su número sigue contando todos los cambios. */
export function useNovedades(personaId: string | null, perfil: PerfilNovedades) {
  const clave = personaId ? `${CLAVE_ANTERIOR}:${personaId}` : null;
  const [lectura, setLectura] = useState<{ clave: string; perfil: PerfilNovedades; visto: string | null; abierta: boolean } | null>(null);
  const [fechas, setFechas] = useState<Record<string, string>>({});
  const activa = clave !== null;

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    void Promise.resolve().then(() => {
      if (!vivo) return;
      let visto = MARCA_ULTIMA;
      try {
        visto = localStorage.getItem(clave) ?? localStorage.getItem(CLAVE_ANTERIOR) ?? MARCA_ULTIMA;
        if (visto) localStorage.setItem(clave, visto);
      } catch { /* Sin almacenamiento, se puede seguir leyendo el panel. */ }
      setLectura({ clave, perfil, visto, abierta: cuantasNuevas(visto, perfil) > 0 });
    });
    return () => { vivo = false; };
  }, [clave, perfil]);

  useEffect(() => {
    if (!activa) return;
    const ctl = new AbortController();
    fetch("/api/novedades", { cache: "no-store", signal: ctl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { fechas?: Record<string, string> } | null) => {
        if (!ctl.signal.aborted && d?.fechas) setFechas(d.fechas);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [activa]);

  const actual = lectura?.clave === clave && lectura?.perfil === perfil ? lectura : null;
  const abrir = () => {
    if (actual) setLectura({ ...actual, abierta: true });
  };
  const cerrar = () => {
    if (!actual || !clave) return;
    setLectura({ ...actual, abierta: false, visto: MARCA_ULTIMA });
    try {
      if (MARCA_ULTIMA) localStorage.setItem(clave, MARCA_ULTIMA);
    } catch { /* El cierre funciona también sin almacenamiento. */ }
  };

  return {
    abierta: actual?.abierta ?? false,
    pendientes: actual ? cuantasNuevas(actual.visto, perfil) : 0,
    nuevos: cambiosSinLeer(actual?.visto ?? null, undefined, perfil),
    fechas, abrir, cerrar,
  };
}
