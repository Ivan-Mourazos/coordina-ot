"use client";

import { ROL } from "@/lib/estado";
import { abrirEnPlanteamientos } from "@/lib/abrir-planteamientos";
import type { ModoPlantear } from "@/lib/herramientas";
import { AbrirCad } from "./AbrirCad";

/** Rótulo, ayuda y color del botón de Planteamientos TGM según lo que toque
 *  (ver `botonPlantear`). El verbo dice qué vas a hacer y el logo de
 *  Planteamientos, adónde vas (Iván, 07/11/2026: «Corregir en Planteamientos»
 *  era largo). Plantear en el color del autor, corregir en el rojo de «A
 *  corregir» y revisar en el del revisor. «Abrir» va NEUTRO
 *  (Iván, 21/10/2026): no hay trabajo de nadie, solo consultar. */
const BOTON_PLANTEAR: Record<ModoPlantear, { texto: string; ayuda: string; color: string }> = {
  plantear: {
    texto: "Plantear",
    ayuda: "Abre Planteamientos con este pedido cargado, en otra pestaña",
    color: `boton-3d ${ROL.plantear.solido}`,
  },
  corregir: {
    texto: "Corregir",
    ayuda: "Abre Planteamientos para corregir lo devuelto, en otra pestaña",
    color: "boton-3d bg-red-600 text-white hover:bg-red-700",
  },
  revisar: {
    texto: "Revisar",
    ayuda: "Abre Planteamientos para revisarlo, en otra pestaña",
    color: `boton-3d ${ROL.revisar.solido}`,
  },
  abrir: {
    texto: "Abrir",
    ayuda: "Abre este pedido en Planteamientos, en otra pestaña",
    color: "chip-3d text-text",
  },
};

/** Los atajos a otras herramientas en la cabecera de la ficha: Planteamientos
 *  (solo en lo que aquella web plantea) y «Abrir CAD». Juntos y siempre a la
 *  derecha, con «Abrir CAD» en la esquina: sin el de Planteamientos se quedaba
 *  a la izquierda (Iván, 07/11/2026). Lo usan la ficha del tablero y la del
 *  Historial, que también los necesita (08/11/2026). */
export function AtajosPedido({ codigo, plantear }: { codigo: string; plantear: { modo: ModoPlantear; url: string } | null }) {
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {plantear && (
        <a
          href={plantear.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            // Con Ctrl o Mayús se deja al navegador: es pedir otra pestaña a propósito.
            if (e.ctrlKey || e.metaKey || e.shiftKey) return;
            e.preventDefault();
            abrirEnPlanteamientos(plantear.url);
          }}
          title={BOTON_PLANTEAR[plantear.modo].ayuda}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${BOTON_PLANTEAR[plantear.modo].color}`}
        >
          {/* El logo de Planteamientos, en blanco sobre el color del botón. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/planteamientos-logo.png" alt="" aria-hidden="true" className={`size-4 shrink-0 ${plantear.modo === "abrir" ? "" : "brightness-0 invert"}`} />
          {BOTON_PLANTEAR[plantear.modo].texto}
          <span aria-hidden="true">↗</span>
        </a>
      )}
      <AbrirCad key={`cad:${codigo}`} pedido={codigo} />
    </div>
  );
}
