import { leerOverlay, leerPedidosPasados } from "./estado-db";
import { claveFase, fasesDeSeccionDelPedido, SECCIONES } from "./rps";
import type { SeccionId } from "../secciones";

export interface OfARecuperar {
  ofId: string;
  codigo: string;
  descripcion: string;
  /** null = sin autor registrado en CoordinaOT; la confirmación dice
   *  "quedarás tú". NO se deduce de RPS: una OF sin marcar y sin fila queda
   *  aprobada sin autor (decisión del 15/09/2026). */
  autorId: string | null;
  /** Lo que diga RPS de la OF. Una FINALIZADA se deja recuperar igual, pero
   *  la confirmación avisa de que el tiempo no subiría. */
  fichable: boolean;
}

/** Las OF de la sección de un pedido que "Volver a plantear el pedido" puede
 *  reabrir.
 *
 *  De `pedido_paso_seccion.of_ids` si se guardó al pasarlo: esa lista ya deja
 *  fuera anuladas, de taller y detenidas (ver `ofIdsPedido` en
 *  `api/estado/route.ts`), y es justo lo que Producción recibió. Si no hay
 *  lista (pasado antes de guardarla, o con la herramienta vieja), de RPS
 *  directamente; su consulta ya deja fuera el taller. Spec del 15/09/2026,
 *  sección 3, "Qué OF vuelven".
 *
 *  RPS se consulta en los dos casos: la lista guardada solo tiene ids, y la
 *  descripción y si se puede fichar hay que leerlos de lo que hay HOY (una OF
 *  pudo quedar FINALIZADA después de pasarla). Solo lectura. */
export async function ofsARecuperar(pedido: string, seccionId: SeccionId): Promise<OfARecuperar[]> {
  const seccion = SECCIONES[seccionId];
  const todasRps = await fasesDeSeccionDelPedido(pedido, seccion);
  // Por `claveFase` y no por texto: RPS puede guardar "03" donde el id dice
  // "3". El id que se devuelve es SIEMPRE el guardado, que es el que usa el
  // overlay.
  const porClave = new Map(todasRps.map((f) => [claveFase(f.of, f.fase), f]));
  const overlay = leerOverlay(seccionId);
  const guardadas = leerPedidosPasados(seccionId).get(pedido)?.ofIds;

  const base = guardadas && guardadas.length > 0
    ? guardadas.map((ofId) => {
        const [of, fase] = ofId.split(":");
        const datos = porClave.get(claveFase(of, fase));
        // Si RPS ya no la trae, vuelve igual (estaba en el pedido que se pasó)
        // pero sin fichar: no hay situación que diga que se puede.
        return { ofId, codigo: of, descripcion: datos?.descripcion ?? "", fichable: datos?.fichable ?? false };
      })
    : todasRps.map((f) => ({ ofId: `${f.of}:${f.fase}`, codigo: f.of, descripcion: f.descripcion, fichable: f.fichable }));

  return base.map((of) => ({ ...of, autorId: overlay.ofs.get(of.ofId)?.autorId ?? null }));
}
