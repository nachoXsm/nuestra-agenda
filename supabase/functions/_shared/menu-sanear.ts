// ============================================================================
//  Saneado del menu que devuelve el modelo.
//
//  El modelo casi siempre responde bien, pero "casi siempre" no alcanza cuando
//  lo que sigue es escribir en la base y mostrarselo a alguien. Aca se descarta
//  todo lo que no tenga forma de comida: fechas invalidas, momentos inventados,
//  dos comidas para el mismo dia y momento, rubros que no existen en la lista de
//  compras, tiempos absurdos, textos kilometricos.
//
//  Vive en un modulo aparte para poder probarlo (ver menu-sanear.test.ts).
// ============================================================================

export interface ItemMenu {
  fecha: string;
  momento: string;
  titulo: string;
  tiempo_min?: number;
  etiquetas?: string[];
  nota?: string;
  ingredientes?: { item: string; cantidad?: string; rubro?: string }[];
}

export interface MenuSaneado {
  resumen: string;
  menu: ItemMenu[];
}

// Tienen que coincidir con los rubros que entiende la lista de compras.
const RUBROS_OK = new Set([
  'verduleria',
  'carniceria',
  'pescaderia',
  'almacen',
  'panaderia',
  'fiambreria',
  'dietetica',
  'otros',
]);

// Una fecha tiene que existir de verdad: el 31 de febrero no pasa.
function fechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a &&
    fecha.getUTCMonth() === m - 1 &&
    fecha.getUTCDate() === d;
}

export function sanearMenu(
  crudo: unknown,
  dias: number,
  momentos: string[],
): MenuSaneado {
  const obj = (crudo ?? {}) as Record<string, unknown>;
  const filas = Array.isArray(obj.menu) ? obj.menu : [];
  const validos = new Set(momentos);
  const vistos = new Set<string>();
  const menu: ItemMenu[] = [];

  for (const f of filas) {
    if (!f || typeof f !== 'object') continue;
    const d = f as Record<string, unknown>;

    const fecha = String(d.fecha ?? '').slice(0, 10);
    const momento = String(d.momento ?? '').toLowerCase().trim();
    const titulo = String(d.titulo ?? '').trim();

    if (!fechaValida(fecha)) continue;
    if (!validos.has(momento)) continue;
    if (!titulo) continue;

    // Una sola comida por fecha y momento: la tabla ag_menu tiene esa clave
    // unica, un duplicado reventaria el insert.
    const clave = `${fecha}|${momento}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const ingredientes = (Array.isArray(d.ingredientes) ? d.ingredientes : [])
      .map((i) => {
        if (!i || typeof i !== 'object') return null;
        const it = i as Record<string, unknown>;
        const item = String(it.item ?? '').trim();
        if (!item) return null;
        const rubro = String(it.rubro ?? '').toLowerCase().trim();
        return {
          item: item.slice(0, 120),
          cantidad: String(it.cantidad ?? '').trim().slice(0, 60),
          rubro: RUBROS_OK.has(rubro) ? rubro : 'otros',
        };
      })
      .filter((x): x is { item: string; cantidad: string; rubro: string } => x !== null)
      .slice(0, 25);

    const tiempo = Number(d.tiempo_min);

    menu.push({
      fecha,
      momento,
      titulo: titulo.slice(0, 140),
      tiempo_min: Number.isFinite(tiempo) && tiempo > 0 && tiempo < 600
        ? Math.round(tiempo)
        : undefined,
      etiquetas: (Array.isArray(d.etiquetas) ? d.etiquetas : [])
        .map((e) => String(e).trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 6),
      nota: String(d.nota ?? '').trim().slice(0, 300) || undefined,
      ingredientes,
    });
  }

  menu.sort((a, b) =>
    a.fecha === b.fecha
      ? (a.momento === 'almuerzo' ? -1 : 1)
      : (a.fecha < b.fecha ? -1 : 1)
  );

  return {
    resumen: String(obj.resumen ?? '').trim().slice(0, 1000),
    // Tope duro: si el modelo se entusiasma, no se guardan 90 comidas.
    menu: menu.slice(0, dias * Math.max(momentos.length, 1)),
  };
}
