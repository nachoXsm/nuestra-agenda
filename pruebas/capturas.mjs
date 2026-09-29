// ============================================================================
//  Saca capturas de pantalla de la app con datos de ejemplo.
//
//  Sirve para mirar el diseño sin tener que levantar Supabase, y para revisar
//  que el tema claro y el oscuro se vean bien los dos.
//
//    node pruebas/capturas.mjs          → docs/capturas/*.png
// ============================================================================
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
// El puerto lo asigna el sistema (listen(0)): así dos corridas seguidas o
// en paralelo no se pelean por el mismo número.
let PUERTO = 0;
const SALIDA = join(RAIZ, 'docs/capturas');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const srv = createServer(async (req, res) => {
  try {
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (ruta === '/' || ruta.endsWith('/')) ruta += 'index.html';
    const archivo = normalize(join(RAIZ, ruta));
    if (!archivo.startsWith(RAIZ)) return res.writeHead(403).end();
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(archivo));
  } catch {
    res.writeHead(404).end();
  }
});

await new Promise((r) => srv.listen(0, '127.0.0.1', r));
PUERTO = srv.address().port;
await mkdir(SALIDA, { recursive: true });

// ---------------------------------------------------------------------------
//  Datos de ejemplo: una semana creíble de una familia
// ---------------------------------------------------------------------------

const hoyISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date());

const dia = (n) => {
  const d = new Date(`${hoyISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const lunes = (n = 0) => {
  const d = new Date(`${hoyISO()}T12:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow) + n);
  return d.toISOString().slice(0, 10);
};

const HOGAR = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

// Los integrantes de ejemplo, con los tintes del manual.
const PERSONAS = [
  { id: 'p1', hogar_id: HOGAR, user_id: 'u1', nombre: 'Ana', color: '#4F7A63', emoji: '🧉', es_admin: true, orden: 0 },
  { id: 'p2', hogar_id: HOGAR, user_id: 'u2', nombre: 'Bruno', color: '#2C5A66', emoji: '🌻', es_admin: false, orden: 1 },
  { id: 'p3', hogar_id: HOGAR, user_id: null, nombre: 'Lila', color: '#C4674A', emoji: '🧒', es_admin: false, orden: 2 },
];

const tarea = (id, titulo, persona, vence, extra = {}) => ({
  id,
  hogar_id: HOGAR,
  titulo,
  detalle: null,
  persona_id: persona,
  vence,
  hecha: false,
  hecha_en: null,
  repite: 'no',
  created_at: new Date().toISOString(),
  ...extra,
});
const ev = (id, titulo, categoria, fecha, hora, persona, extra = {}) => ({
  id,
  hogar_id: HOGAR,
  titulo,
  categoria,
  detalle: null,
  lugar: null,
  inicio: `${fecha}T${hora}:00-03:00`,
  fin: null,
  todo_el_dia: false,
  persona_id: persona,
  repite: 'no',
  repite_dias: [],
  repite_hasta: null,
  aviso_minutos: null,
  updated_at: new Date().toISOString(),
  ...extra,
});

const comida = (fecha, momento, titulo, ingredientes, extra = {}) => ({
  id: `${fecha}-${momento}`,
  hogar_id: HOGAR,
  fecha,
  momento,
  titulo,
  ingredientes,
  etiquetas: [],
  notas: null,
  a_cargo: null,
  ...extra,
});

const semilla = {
  personas: PERSONAS,
  hogar: {
    id: HOGAR,
    nombre: 'Casa de ejemplo',
    codigo: 'TR7KM9',
    feed_token: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  },
  eventos: [
    ev('e1', 'Clase de natación', 'hijo', dia(0), '19:00', 'p3', {
      lugar: 'Club Belgrano',
      repite: 'semanal',
      repite_dias: [2, 4],
      aviso_minutos: 60,
    }),
    ev('e2', 'Reunión de padres', 'colegio', dia(1), '18:30', 'p3', {
      lugar: 'Sala de 5',
    }),
    ev('e3', 'Pediatra', 'salud', dia(3), '16:00', 'p3'),
    ev('e4', 'Cena con los chicos de la facu', 'pareja', dia(4), '21:00', null),
    ev('e5', 'Entrega del informe', 'trabajo', dia(2), '12:00', 'p1'),
    ev('e6', 'Cumple de la abuela', 'cumple', dia(6), '13:00', null, {
      todo_el_dia: true,
      repite: 'anual',
    }),
    ev('e7', 'Yoga', 'otro', dia(0), '08:00', 'p2', { repite: 'semanal' }),
  ],
  menu: [
    comida(lunes(0), 'almuerzo', 'Ensalada de garbanzos y pollo', [
      { item: 'Garbanzos', cantidad: '1 lata', rubro: 'almacen' },
      { item: 'Pechuga de pollo', cantidad: '400 g', rubro: 'carniceria' },
    ]),
    comida(lunes(0), 'cena', 'Tortilla de acelga y papa', [
      { item: 'Acelga', cantidad: '1 atado', rubro: 'verduleria' },
      { item: 'Papa', cantidad: '2', rubro: 'verduleria' },
      { item: 'Huevo', cantidad: '5', rubro: 'almacen' },
    ]),
    comida(lunes(1), 'cena', 'Wok de verduras con pollo', [
      { item: 'Chaucha', cantidad: '250 g', rubro: 'verduleria' },
      { item: 'Zapallito', cantidad: '2', rubro: 'verduleria' },
    ], { notas: 'Día de natación: dejar todo cortado a la mañana' }),
    comida(lunes(2), 'almuerzo', 'Sopa de zapallo y jengibre', [
      { item: 'Zapallo anco', cantidad: '1 chico', rubro: 'verduleria' },
    ]),
    comida(lunes(3), 'cena', 'Merluza al horno con papas', [
      { item: 'Filet de merluza', cantidad: '600 g', rubro: 'pescaderia' },
      { item: 'Papa', cantidad: '4', rubro: 'verduleria' },
    ]),
  ],
  tareas: [
    tarea('t1', 'Pagar el gas', 'p1', dia(0)),
    tarea('t2', 'Comprar el regalo de cumpleaños', 'p2', dia(2)),
    tarea('t3', 'Renovar la obra social', 'p1', dia(-1)),
    tarea('t4', 'Sacar la ropa de invierno', null, null),
    tarea('t5', 'Llevar las zapatillas al arreglo', 'p2', dia(5)),
    tarea('t6', 'Turno del dentista', 'p3', dia(4), { hecha: true, hecha_en: new Date().toISOString() }),
    tarea('t7', 'Sacar la basura', null, dia(0), { hecha: true, repite: 'semanal', hecha_en: new Date().toISOString() }),
  ],
  compras: [
    { id: 'c1', hogar_id: HOGAR, item: 'Acelga', cantidad: '1 atado', rubro: 'verduleria', comprado: false, origen: 'menu', created_at: new Date().toISOString() },
    { id: 'c2', hogar_id: HOGAR, item: 'Zapallo anco', cantidad: '1 chico', rubro: 'verduleria', comprado: false, origen: 'menu', created_at: new Date().toISOString() },
    { id: 'c3', hogar_id: HOGAR, item: 'Papa', cantidad: '2 + 4', rubro: 'verduleria', comprado: false, origen: 'menu', created_at: new Date().toISOString() },
    { id: 'c4', hogar_id: HOGAR, item: 'Pechuga de pollo', cantidad: '400 g', rubro: 'carniceria', comprado: false, origen: 'menu', created_at: new Date().toISOString() },
    { id: 'c5', hogar_id: HOGAR, item: 'Filet de merluza', cantidad: '600 g', rubro: 'pescaderia', comprado: false, origen: 'menu', created_at: new Date().toISOString() },
    { id: 'c6', hogar_id: HOGAR, item: 'Huevo', cantidad: '5', rubro: 'almacen', comprado: true, origen: 'menu', created_at: new Date().toISOString() },
  ],
  chef: [
    { id: 'x1', rol: 'user', contenido: '¿Qué cocino mañana que llegamos tarde de natación?' },
    {
      id: 'x2',
      rol: 'assistant',
      contenido: 'Mañana tenés natación a las 19, así que te quedan veinte minutos ' +
        'de cocina. Con lo que hay de temporada iría a un **wok de chauchas y ' +
        'zapallitos con pollo**: cortás todo a la mañana, y a la noche son cinco ' +
        'minutos a fuego fuerte.\n\nSi querés adelantar todavía más, dejá el pollo ' +
        'marinado con limón y ajo desde hoy. Sale más sabroso y no agrega tiempo.',
    },
  ],
};

// ---------------------------------------------------------------------------

// Chromium: en este contenedor ya viene instalado en una ruta fija, que puede no
// coincidir con la versión que espera el paquete de playwright. Si ese binario
// existe se usa; si no (por ejemplo en CI, donde playwright baja el suyo), se
// deja que playwright elija.
function chromiumDelSistema() {
  const ruta = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
  return existsSync(ruta) ? ruta : undefined;
}

// --lang: los <input type=date|time> los dibuja el navegador con SU idioma, no
// con el locale del contexto. Sin esto se ven en formato de Estados Unidos
// (09/29/2026, 07:00 PM), que no es lo que ve alguien en Buenos Aires.
const navegador = await chromium.launch({
  executablePath: chromiumDelSistema(),
  args: ['--lang=es-AR'],
});

async function capturar(tema) {
  const ctx = await navegador.newContext({
    viewport: { width: 400, height: 860 },
    deviceScaleFactor: 2,
    timezoneId: 'America/Argentina/Buenos_Aires',
    locale: 'es-AR',
  });
  const pagina = await ctx.newPage();

  await pagina.route('**/js/lib/db.js', async (r) => {
    await r.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: await readFile(join(RAIZ, 'pruebas/db-falso.js'), 'utf8'),
    });
  });
  await pagina.route(/fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );

  await pagina.addInitScript(
    ([d, t]) => {
      globalThis.__semilla = d;
      try {
        localStorage.setItem('ag_tema', t);
      } catch { /* bloqueado */ }
    },
    [semilla, tema],
  );

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#barra:not(.oculto)', { timeout: 15_000 });
  await pagina.waitForTimeout(600);

  const sacar = async (nombre) => {
    await pagina.waitForTimeout(450);
    // Sin fullPage a propósito: la barra de abajo y el botón flotante están
    // fijos, así que en una captura de la página entera aparecerían flotando en
    // el medio. Lo que se ve acá es lo que se ve en el teléfono.
    await pagina.screenshot({ path: join(SALIDA, `${tema}-${nombre}.png`) });
    console.log(`  ${tema}-${nombre}.png`);
  };

  for (const vista of ['inicio', 'agenda', 'comidas', 'tareas', 'familia']) {
    await pagina.click(`#barra button[data-vista="${vista}"]`);
    await sacar(vista);
  }

  // Las tres alturas de la agenda, que son el corazón de la app.
  await pagina.click('#barra button[data-vista="agenda"]');
  await pagina.waitForTimeout(300);
  for (const modo of ['Semana', 'Día']) {
    await pagina.click(`.segmentado button:has-text("${modo}")`);
    await sacar(`agenda-${modo.toLowerCase().replace('í', 'i')}`);
  }

  // La lista de compras y una hoja abierta, que son pantallas propias.
  await pagina.click('#barra button[data-vista="comidas"]');
  await pagina.waitForTimeout(300);
  await pagina.click('.segmentado button:has-text("Lista de compras")');
  await sacar('compras');

  // El Chef no está en la barra: se entra con el botón flotante de Comidas, que
  // solo existe en la solapa del menú (en la de compras no hay botón flotante).
  await pagina.click('.segmentado button:has-text("Menú semanal")');
  await pagina.waitForTimeout(300);
  await pagina.click('.fab');
  await sacar('chef');

  await pagina.click('#barra button[data-vista="agenda"]');
  await pagina.waitForTimeout(300);
  await pagina.click('.fab');
  await sacar('evento');

  await ctx.close();
}

console.log('Capturas:');
await capturar('oscuro');
await capturar('claro');

await navegador.close();
srv.close();
console.log(`\nListas en docs/capturas/`);
