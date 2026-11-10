export interface PedidoEntregaBelen {
  codigo: string;
  cliente: string | null;
  ciudad: string | null;
  fechaEntrega: string | null;
  situacion: "fabrica" | "salir";
  ofs: number;
}

export interface FiltrosEntregasBelen {
  texto: string;
  desde: string;
  hasta: string;
  situacion: "" | PedidoEntregaBelen["situacion"];
  orden: "fechaEntrega" | "codigo" | "cliente" | "ciudad" | "situacion" | "ofs";
  descendente: boolean;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

export function filtrarEntregas(pedidos: readonly PedidoEntregaBelen[], f: FiltrosEntregasBelen): PedidoEntregaBelen[] {
  const palabras = normalizar(f.texto.trim()).split(/\s+/).filter(Boolean);
  return pedidos.filter((p) => {
    if (f.situacion && p.situacion !== f.situacion) return false;
    if (f.desde && (!p.fechaEntrega || p.fechaEntrega < f.desde)) return false;
    if (f.hasta && (!p.fechaEntrega || p.fechaEntrega > f.hasta)) return false;
    const texto = normalizar(`${p.codigo} ${p.cliente ?? ""} ${p.ciudad ?? ""}`);
    return palabras.every((palabra) => texto.includes(palabra));
  }).sort((a, b) => {
    const x = a[f.orden];
    const y = b[f.orden];
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    const comparacion = typeof x === "number" && typeof y === "number"
      ? x - y
      : String(x ?? "").localeCompare(String(y ?? ""), "es", { numeric: true, sensitivity: "base" });
    return (f.descendente ? -comparacion : comparacion) || a.codigo.localeCompare(b.codigo);
  });
}
