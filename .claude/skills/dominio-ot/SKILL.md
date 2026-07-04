---
name: dominio-ot
description: Use when working on CoordinaOT features involving pedidos, OFs, estados, fichaje, roles autor/revisor, or the RPS/SQL Server data layer — loads the business rules that are not derivable from a single file.
user-invocable: false
---

# Dominio CoordinaOT (Oficina Técnica, Toldos Gómez)

## Modelo

- **Pedido** (código `AR…`) = lo que se escanea y llega de Producción. Contiene 1..n **OF** (Órdenes de Fabricación). El pedido nunca se duplica por número de OFs.
- El trabajo real es **por OF**, nunca por pedido. Contrato de tipos: [src/lib/types.ts](../../../src/lib/types.ts).

## Roles (a nivel de OF)

- **Autor** = quien *plantea* la OF (operario asignado en tablero).
- **Revisor** = compañero que repasa antes de mandar a Producción. **Regla dura: revisor ≠ autor.**
- Tiempos de planteo y revisión SUMAN al total de la OF pero se guardan por separado.

## Estados de OF

`pendiente → en_curso → por_revisar → en_revision → aprobada | devuelta`; `anulada` fuera de ciclo. Metadatos visuales (colores, chips, rank) centralizados en [src/lib/estado.ts](../../../src/lib/estado.ts) — nunca hardcodear colores de estado/rol en componentes; usar `ESTADO` y `ROL`.

- Color por rol en TODA la app: plantear = esmeralda, revisar = violeta.
- Pedido "finalizado" = todas sus OF `aprobada`. "Atrasado" = `fechaPlanificacion < hoy` y no finalizado.

## Reglas de datos / RPS (acordadas con IT)

- Único punto de acceso a datos: [src/lib/data.ts](../../../src/lib/data.ts). Hoy mock; mañana API routes contra RPS/SQL Server con las MISMAS firmas. La UI no se toca.
- Solo entran a OT los pedidos con `situacion: "procesado"` (escaneado + OF asignada + pasado). Los `pendiente` solo se consultan en la Lista, no son trabajo de OT.
- **Fichaje de tiempos vía API de RPS, siempre por OF** — nunca simular el terminal de fichaje.
- Sin login: identidad de operario en `localStorage` (`coordina-operario-id`), marcado por revisor.

## Al tocar código

- Next.js 16 con breaking changes: leer `node_modules/next/dist/docs/` antes de usar APIs dudosas (ver AGENTS.md).
- Clases Tailwind deben aparecer como literales para compilarse (por eso los meta-objetos guardan strings de clases).
