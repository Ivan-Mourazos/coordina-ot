import {
  fueraEnFecha,
  juntarMeses,
  limitesMes,
  mesSiguiente,
  nombrePersona,
  normalizarDia,
  type BizneoDia,
  type DiaDisponibilidad,
  type DisponibilidadMes,
  type FueraHoy,
  type PersonaDisponibilidad,
} from "../disponibilidad";
import { OPERARIOS } from "../mock";
import { cacheConDisco } from "./cache-disco";
import { operarioDeCorreo } from "./operarios";

// ─── Bizneo: quién está y quién no ───────────────────────────────────────────
// SOLO LECTURA y SOLO SERVIDOR. Coordina no pide ni aprueba ausencias: eso se
// sigue haciendo en Bizneo. Aquí se lee el calendario de cada persona para
// enseñar quién trabaja, quién está fuera y cuándo vuelve.
//
// El token va en la URL (así lo pide Bizneo, `?token=`) y probablemente abre
// MUCHO más que ausencias (nóminas, contratos). Por eso:
//   - vive solo en el `.env` del servidor y nunca llega al navegador;
//   - ningún mensaje de error ni log lleva la URL;
//   - solo se llaman los dos endpoints de abajo.
// Ver docs/BIZNEO-ESTUDIO.md.
//
// Sin token: en producción (DATASOURCE=rps) la función está APAGADA y las
// pantallas no la enseñan. En desarrollo salen datos inventados para poder
// trabajar la pantalla sin credenciales.

const TIEMPO_MAX_MS = 20_000;
const POR_PAGINA = 100;
/** Tope de páginas por lectura: 20 × 100 = 2000 personas, de sobra. Evita que
 *  una paginación rota se ponga a pedir sin fin. */
const MAX_PAGINAS = 20;

function config(): { url: string; token: string } | null {
  const url = process.env.BIZNEO_URL?.trim().replace(/\/+$/, "");
  const token = process.env.BIZNEO_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

function modoDemo(): boolean {
  return !config() && process.env.DATASOURCE !== "rps";
}

/** ¿Hay algo que enseñar? Con token, siempre; sin él, solo en desarrollo. */
export function bizneoActivo(): boolean {
  return config() !== null || modoDemo();
}

interface Paginado {
  pagination?: { total_pages?: number | null } | null;
}

async function pedir<T extends Paginado>(ruta: string, params: Record<string, string>): Promise<T> {
  const c = config();
  if (!c) throw new Error("Bizneo sin configurar");
  const qs = new URLSearchParams({ ...params, token: c.token });
  let r: Response;
  try {
    r = await fetch(`${c.url}/api/v1/${ruta}?${qs}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    });
  } catch (e) {
    // El error de fetch puede llevar la URL dentro: se cuenta sin ella.
    const motivo = (e as Error).name === "TimeoutError" ? "no contestó a tiempo" : "no se pudo conectar";
    throw new Error(`Bizneo (${ruta}): ${motivo}`);
  }
  if (!r.ok) throw new Error(`Bizneo (${ruta}): HTTP ${r.status}`);
  return (await r.json()) as T;
}

async function pedirTodo<T extends Paginado>(ruta: string, params: Record<string, string>, lista: (p: T) => unknown[]): Promise<unknown[]> {
  const todo: unknown[] = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const p = await pedir<T>(ruta, { ...params, page: String(page), page_size: String(POR_PAGINA) });
    const filas = lista(p) ?? [];
    todo.push(...filas);
    const total = p.pagination?.total_pages ?? 1;
    if (page >= total || filas.length === 0) break;
  }
  return todo;
}

// ─── Departamento de cada persona ────────────────────────────────────────────

interface UsuarioBizneo {
  id: number;
  main_taxons?: string | string[] | { name?: string }[] | null;
}

function nombreGrupo(t: UsuarioBizneo["main_taxons"]): string {
  if (!t) return "Sin departamento";
  if (typeof t === "string") return t.trim() || "Sin departamento";
  const nombres = t.map((x) => (typeof x === "string" ? x : x?.name ?? "")).filter(Boolean);
  return nombres[0] ?? "Sin departamento";
}

/** La plantilla cambia poco: se lee como mucho cada 6 h. */
const cacheGrupos = cacheConDisco<Map<number, string>>("bizneo-grupos", 6 * 60 * 60_000);

function leerGrupos(): Promise<Map<number, string>> {
  return cacheGrupos("todos", async () => {
    const usuarios = (await pedirTodo<Paginado & { users?: UsuarioBizneo[] }>("users", {}, (p) => p.users ?? [])) as UsuarioBizneo[];
    return new Map(usuarios.map((u) => [u.id, nombreGrupo(u.main_taxons)]));
  });
}

// ─── El calendario de un mes ─────────────────────────────────────────────────

interface UsuarioTimeline {
  id: number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  day_details?: BizneoDia[] | null;
}

/** Un mes no cambia a cada momento (las ausencias se piden con días). 15 min
 *  de caché bastan y dejan a Bizneo en paz aunque medio equipo abra la pestaña. */
const cacheMes = cacheConDisco<DisponibilidadMes>("bizneo-mes", 15 * 60_000);

async function leerMesDeBizneo(mes: string): Promise<DisponibilidadMes> {
  // Bizneo limita el timeline a un mes por petición: por eso se pide por meses.
  const { desde, hasta } = limitesMes(mes);
  const [usuarios, grupos] = await Promise.all([
    pedirTodo<Paginado & { users?: UsuarioTimeline[] }>("timeline", { start_date: desde, end_date: hasta }, (p) => p.users ?? []) as Promise<UsuarioTimeline[]>,
    // Sin departamentos se sigue enseñando el calendario, todo en un grupo.
    leerGrupos().catch((e) => {
      console.warn("[bizneo] sin departamentos:", (e as Error).message);
      return new Map<number, string>();
    }),
  ]);
  const personas: PersonaDisponibilidad[] = usuarios.map((u) => ({
    id: u.id,
    nombre: nombrePersona(u.first_name, u.last_name),
    grupo: grupos.get(u.id) ?? "Sin departamento",
    operarioId: operarioDeCorreo(u.email),
    dias: Object.fromEntries((u.day_details ?? []).filter((d) => d?.date).map((d) => [d.date, normalizarDia(d)])),
  }));
  return { mes, personas, actualizado: new Date().toISOString() };
}

/** El calendario de un mes («YYYY-MM»). Lanza si Bizneo falla. */
export function leerDisponibilidadMes(mes: string): Promise<DisponibilidadMes> {
  if (modoDemo()) return Promise.resolve(mesDemo(mes));
  return cacheMes(mes, () => leerMesDeBizneo(mes));
}

/** Quién está fuera en `fecha`. Lee también el mes siguiente para saber cuándo
 *  vuelve quien se va de vacaciones a fin de mes; si ese falla, sin vuelta. */
export async function leerFueraEnFecha(fecha: string): Promise<{ fuera: FueraHoy[]; actualizado: string; demo?: boolean }> {
  const mes = fecha.slice(0, 7);
  const [este, siguiente] = await Promise.all([
    leerDisponibilidadMes(mes),
    leerDisponibilidadMes(mesSiguiente(mes)).catch(() => null),
  ]);
  const meses = siguiente ? [este, siguiente] : [este];
  return { fuera: fueraEnFecha(juntarMeses(meses), fecha), actualizado: este.actualizado, demo: este.demo };
}

// ─── Datos inventados (solo desarrollo, sin token) ───────────────────────────

const GRUPO_DEMO: Record<string, string> = { ot: "Oficina Técnica", diseno: "Diseño Gráfico", impresion: "Impresión Digital" };

const OTROS_DEMO: { nombre: string; grupo: string }[] = [
  { nombre: "Comercial de ejemplo 1", grupo: "Comercial" },
  { nombre: "Comercial de ejemplo 2", grupo: "Comercial" },
  { nombre: "Comercial de ejemplo 3", grupo: "Comercial" },
  { nombre: "Taller de ejemplo 1", grupo: "Producción" },
  { nombre: "Taller de ejemplo 2", grupo: "Producción" },
];

/** Entero estable a partir de un texto: el mismo día sale siempre igual. */
function semilla(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 1000;
}

function diaDemo(nombre: string, fecha: string): DiaDisponibilidad {
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return { estado: "libre" };
  if (fecha.endsWith("-12-08") || fecha.endsWith("-12-25")) return { estado: "festivo", nota: "Festivo nacional" };
  // Una semana de vacaciones por persona y mes, en una semana distinta para cada uno.
  const semana = Math.floor((Number(fecha.slice(8)) - 1) / 7);
  const n = semilla(nombre + fecha.slice(0, 7));
  if (semana === n % 5 && n % 3 === 0) return { estado: "vacaciones" };
  const r = semilla(nombre + fecha);
  if (r < 25) return { estado: "fuera" };
  if (r < 60) return { estado: "parcial", nota: "Fuera desde las 9:00 (2 h)" };
  if (r < 130) return { estado: "teletrabajo", nota: "8:00–16:00" };
  return { estado: "trabaja", nota: "8:00–16:00" };
}

function mesDemo(mes: string): DisponibilidadMes {
  const { desde, hasta } = limitesMes(mes);
  const fechas: string[] = [];
  for (let d = Number(desde.slice(8)); d <= Number(hasta.slice(8)); d++) fechas.push(`${mes}-${String(d).padStart(2, "0")}`);
  const gente = [
    ...OPERARIOS.map((o) => ({ nombre: o.nombre, grupo: GRUPO_DEMO[o.seccion ?? "ot"] ?? "Oficina Técnica", operarioId: o.id })),
    ...OTROS_DEMO.map((o) => ({ ...o, operarioId: null })),
  ];
  return {
    mes,
    demo: true,
    actualizado: new Date().toISOString(),
    personas: gente.map((g, i) => ({
      id: 1000 + i,
      nombre: g.nombre,
      grupo: g.grupo,
      operarioId: g.operarioId,
      dias: Object.fromEntries(fechas.map((f) => [f, diaDemo(g.nombre, f)])),
    })),
  };
}
