// ============================================================================
//  Pruebas de la interfaz, en un Chromium de verdad.
//
//  Levanta un servidor estático con la app, intercepta js/lib/db.js y en su
//  lugar sirve pruebas/db-falso.js. De ahí en adelante la app corre entera —
//  mismo HTML, mismo CSS, mismos módulos — pero contra datos en memoria.
//
//  Todo error de JavaScript en la consola hace fallar la prueba: es la red que
//  caza los errores de tipeo, los imports rotos y los undefined, que en una app
//  sin build no los ve nadie hasta que alguien abre la pantalla.
//
//  Correr con:  node pruebas/app.test.mjs
// ============================================================================
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
// El puerto lo asigna el sistema (listen(0)): así dos corridas seguidas o
// en paralelo no se pelean por el mismo número.
let PUERTO = 0;

// El reloj de las pruebas está congelado en un instante fijo, y el del
// navegador también (ver abrirApp). Sin esto, una prueba que siembra un evento
// a las 19:00 de hoy pasa a la mañana y falla a la noche, porque para entonces
// ese evento ya pasó y la tarjeta de "lo que sigue" no se dibuja.
// Martes 29/9/2026 a las 15:00 de Buenos Aires: un día de semana, con la tarde
// por delante.
const AHORA = new Date('2026-09-29T15:00:00-03:00');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ics': 'text/calendar; charset=utf-8',
};

function servidor() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let ruta = decodeURIComponent(url.pathname);
      if (ruta === '/' || ruta.endsWith('/')) ruta += 'index.html';

      // normalize + startsWith: nadie sale de la carpeta del proyecto con "..".
      const archivo = normalize(join(RAIZ, ruta));
      if (!archivo.startsWith(RAIZ)) {
        res.writeHead(403).end('no');
        return;
      }

      const contenido = await readFile(archivo);
      res.writeHead(200, {
        'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(contenido);
    } catch {
      res.writeHead(404).end('no está');
    }
  });
}

// ---------------------------------------------------------------------------
//  Mini corredor de pruebas
// ---------------------------------------------------------------------------

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

function afirmar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function igual(actual, esperado, mensaje) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${mensaje}\n    esperado: ${b}\n    recibido: ${a}`);
}

// ---------------------------------------------------------------------------
//  Ayudas sobre la página
// ---------------------------------------------------------------------------

/** Abre la app con el db falso puesto y espera a que termine de cargar. */
async function abrirApp(navegador, { semilla, antesDeCargar } = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: 400, height: 860 },
    // Zona horaria y locale de Buenos Aires: si algo depende de la del equipo,
    // acá se nota.
    timezoneId: 'America/Argentina/Buenos_Aires',
    locale: 'es-AR',
  });

  const errores = [];
  const pagina = await contexto.newPage();

  pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  pagina.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // El favicon y el service worker no importan en las pruebas.
      if (!/favicon|ServiceWorker|sw\.js/i.test(t)) errores.push(`console: ${t}`);
    }
  });

  // La sustitución: cualquier import de js/lib/db.js recibe el falso.
  await pagina.route('**/js/lib/db.js', async (ruta) => {
    const cuerpo = await readFile(join(RAIZ, 'pruebas/db-falso.js'), 'utf8');
    await ruta.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: cuerpo,
    });
  });

  // Las fuentes de Google no se pueden alcanzar desde este contenedor y su
  // fallo ensuciaría la consola. Se responden vacías: la app tiene que andar
  // igual sin ellas, que es justamente lo que se quiere verificar.
  await pagina.route(/fonts\.(googleapis|gstatic)\.com/, (ruta) =>
    ruta.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );

  // La semilla va antes de que corra cualquier script: recargar la página
  // vuelve a ejecutar el módulo falso, así que sembrar después se perdería.
  if (semilla) {
    await pagina.addInitScript((d) => {
      globalThis.__semilla = d;
    }, semilla);
  }

  // El mismo instante que usa el lado de Node, así lo que la prueba siembra y
  // lo que la app considera "hoy" no pueden discrepar.
  await pagina.clock.setFixedTime(AHORA);

  if (antesDeCargar) await antesDeCargar(pagina);

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#barra:not(.oculto)', { timeout: 10_000 });

  return { pagina, contexto, errores };
}

const irA = async (pagina, vista) => {
  await pagina.click(`#barra button[data-vista="${vista}"]`);
  await pagina.waitForTimeout(120);
};

const bd = (pagina, fn) => pagina.evaluate(fn);

const hoyISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    .format(AHORA);

const enDias = (n) => {
  const d = new Date(`${hoyISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** El lunes de la semana de hoy, más n días. Las pruebas del menú lo usan para
 *  no depender del día en que se corran: el planificador muestra una semana de
 *  lunes a domingo, y sembrar "hoy y mañana" un domingo deja la segunda comida
 *  en la semana siguiente. */
const estaSemana = (n = 0) => {
  const d = new Date(`${hoyISO()}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow) + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
//  Pruebas
// ---------------------------------------------------------------------------

prueba('la app abre sin un solo error de JavaScript', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  // Se recorren las cinco secciones: es donde se rompen los imports.
  for (const v of ['hoy', 'agenda', 'menu', 'chef', 'ajustes']) {
    await irA(pagina, v);
  }
  await pagina.waitForTimeout(300);

  igual(errores, [], 'hubo errores de JavaScript');
  afirmar(
    await pagina.isVisible('#barra'),
    'la barra de abajo tiene que estar',
  );
  await contexto.close();
});

prueba('Hoy muestra lo de hoy y lo de mañana', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      eventos: [
        {
          id: 'e1',
          hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          titulo: 'Natación de Tomás',
          categoria: 'hijo',
          inicio: `${hoyISO()}T19:00:00-03:00`,
          fin: null,
          todo_el_dia: false,
          persona_id: 'p3',
          repite: 'no',
          repite_dias: [],
          repite_hasta: null,
          updated_at: new Date().toISOString(),
        },
        {
          id: 'e2',
          hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          titulo: 'Acto del colegio',
          categoria: 'colegio',
          inicio: `${enDias(1)}T09:00:00-03:00`,
          fin: null,
          todo_el_dia: false,
          persona_id: 'p3',
          repite: 'no',
          repite_dias: [],
          repite_hasta: null,
          updated_at: new Date().toISOString(),
        },
      ],
    },
  });
  await pagina.waitForTimeout(250);

  // textContent y no innerText: los encabezados de sección llevan
  // text-transform: uppercase, e innerText devuelve el texto ya transformado.
  const texto = await pagina.textContent('#main');
  afirmar(texto.includes('Natación de Tomás'), 'falta el evento de hoy');
  afirmar(texto.includes('Acto del colegio'), 'falta el evento de mañana');
  afirmar(texto.includes('Mañana'), 'falta la sección de mañana');
  // El evento de hoy que todavía no pasó aparece como "lo que sigue".
  afirmar(texto.includes('Lo que sigue'), 'falta la tarjeta de lo que sigue');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('se puede anotar un evento y aparece en la agenda', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'agenda');
  await pagina.click('.fab');
  await pagina.waitForSelector('.hoja');

  await pagina.fill('.hoja input[type="text"]', 'Pediatra de Tomás');
  // La categoría Salud.
  await pagina.click('.hoja .chips button:has-text("Salud")');
  await pagina.fill('.hoja input[type="date"]', enDias(2));
  await pagina.fill('.hoja input[type="time"]', '16:30');
  await pagina.click('.hoja button[type="submit"]');

  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 5000 });
  await pagina.waitForTimeout(250);

  const guardado = await bd(pagina, () => globalThis.__falso.eventos);
  igual(guardado.length, 1, 'tenía que guardarse un evento');
  igual(guardado[0].titulo, 'Pediatra de Tomás', 'el título');
  igual(guardado[0].categoria, 'salud', 'la categoría');
  afirmar(
    guardado[0].inicio.startsWith(`${enDias(2)}T16:30:00-03:00`),
    `la fecha y la hora con el offset de Buenos Aires: ${guardado[0].inicio}`,
  );

  const texto = await pagina.textContent('#main');
  afirmar(texto.includes('Pediatra de Tomás'), 'el evento tiene que verse en la agenda');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('un evento semanal se repite en el calendario', async (nav) => {
  // Todas las semanas el mismo día, sin fecha de corte.
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      eventos: [{
        id: 'e1',
        hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        titulo: 'Natación',
        categoria: 'hijo',
        inicio: `${enDias(0)}T19:00:00-03:00`,
        fin: null,
        todo_el_dia: false,
        persona_id: null,
        repite: 'semanal',
        repite_dias: [],
        repite_hasta: null,
        updated_at: new Date().toISOString(),
      }],
    },
  });

  await irA(pagina, 'agenda');
  await pagina.waitForTimeout(200);

  // La misma semana que viene tiene que tener el evento.
  const dentroDeUnaSemana = enDias(7);
  await pagina.evaluate((f) => {
    globalThis.NuestraAgenda.estado.fechaElegida = f;
  }, dentroDeUnaSemana);
  await pagina.click(`#barra button[data-vista="hoy"]`);
  await irA(pagina, 'agenda');
  await pagina.waitForTimeout(200);

  const proximas = await pagina.textContent('#main');
  afirmar(
    (proximas.match(/Natación/g) ?? []).length >= 2,
    'un evento semanal tiene que aparecer más de una vez en las próximas dos semanas',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('marcar algo como hecho se guarda', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      eventos: [{
        id: 'e1',
        hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        titulo: 'Sacar la basura',
        categoria: 'familia',
        inicio: `${hoyISO()}T21:00:00-03:00`,
        fin: null,
        todo_el_dia: false,
        persona_id: null,
        repite: 'diario',
        repite_dias: [],
        repite_hasta: null,
        updated_at: new Date().toISOString(),
      }],
    },
  });
  await pagina.waitForTimeout(250);

  await pagina.click('.evento .tilde');
  await pagina.waitForTimeout(300);

  const ocurrencias = await bd(pagina, () => globalThis.__falso.ocurrencias);
  igual(ocurrencias.length, 1, 'tenía que guardarse la ocurrencia');
  igual(ocurrencias[0].estado, 'hecho', 'el estado');
  igual(ocurrencias[0].fecha, hoyISO(), 'la fecha de la ocurrencia');

  afirmar(
    await pagina.isVisible('.evento.hecho'),
    'el evento tiene que verse tachado',
  );

  // Y destildar lo borra.
  await pagina.click('.evento .tilde');
  await pagina.waitForTimeout(300);
  igual(
    await bd(pagina, () => globalThis.__falso.ocurrencias.length),
    0,
    'destildar tiene que borrar la ocurrencia',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el menú se carga desde el recetario y respeta la temporada', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'menu');

  // La tarjeta de temporada tiene que mostrar la estación correcta.
  const mes = Number(hoyISO().slice(5, 7));
  const estacionEsperada = [12, 1, 2].includes(mes)
    ? 'verano'
    : [3, 4, 5].includes(mes)
    ? 'otoño'
    : [6, 7, 8].includes(mes)
    ? 'invierno'
    : 'primavera';

  const textoMenu = await pagina.textContent('#main');
  afirmar(
    textoMenu.toLowerCase().includes(estacionEsperada),
    `la tarjeta tiene que decir ${estacionEsperada}`,
  );

  // Se abre el primer hueco de almuerzo y se elige una receta.
  await pagina.click('.dia-menu .comida-slot.vacia');
  await pagina.waitForSelector('.hoja');
  await pagina.waitForTimeout(200);

  const nombreReceta = await pagina.innerText('.hoja .comida-slot .plato');
  await pagina.click('.hoja .comida-slot');
  await pagina.waitForTimeout(150);
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 5000 });
  await pagina.waitForTimeout(250);

  const menu = await bd(pagina, () => globalThis.__falso.menu);
  igual(menu.length, 1, 'tenía que guardarse una comida');
  afirmar(menu[0].ingredientes.length > 0, 'la receta tiene que traer sus ingredientes');
  afirmar(
    nombreReceta.startsWith(menu[0].titulo.slice(0, 12)),
    `se guardó la receta elegida: "${menu[0].titulo}" vs "${nombreReceta}"`,
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el menú se vuelca a la lista de compras agrupado por comercio', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      menu: [
        {
          id: 'm1',
          hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          // Lunes y martes de ESTA semana, no "hoy y mañana": el botón vuelca
          // la semana visible, y si la prueba corre un domingo, mañana ya es de
          // la semana siguiente y quedaría afuera.
          fecha: estaSemana(0),
          momento: 'cena',
          titulo: 'Tarta de acelga',
          ingredientes: [
            { item: 'Acelga', cantidad: '1 atado', rubro: 'verduleria' },
            { item: 'Huevo', cantidad: '3', rubro: 'almacen' },
          ],
          etiquetas: [],
        },
        {
          id: 'm2',
          hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          fecha: estaSemana(1),
          momento: 'cena',
          titulo: 'Wok',
          ingredientes: [
            { item: 'acelga', cantidad: '1', rubro: 'verduleria' },
            { item: 'Pollo', cantidad: '500 g', rubro: 'carniceria' },
          ],
          etiquetas: [],
        },
      ],
    },
  });
  await irA(pagina, 'menu');
  await pagina.waitForTimeout(200);

  await pagina.click('button:has-text("A la lista")');
  await pagina.waitForTimeout(500);

  const compras = await bd(pagina, () => globalThis.__falso.compras);
  igual(compras.length, 3, 'Acelga y acelga se juntan: 3 items, no 4');

  const acelga = compras.find((c) => c.item.toLowerCase() === 'acelga');
  afirmar(acelga.cantidad.includes('+'), 'las cantidades repetidas se suman');

  // Y la pantalla de compras las agrupa por comercio.
  await pagina.waitForTimeout(300);
  const textoCompras = await pagina.textContent('#main');
  afirmar(textoCompras.includes('Verdulería'), 'falta el rubro verdulería');
  afirmar(textoCompras.includes('Carnicería'), 'falta el rubro carnicería');
  afirmar(textoCompras.includes('Almacén'), 'falta el rubro almacén');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('tildar algo en la lista de compras lo pasa a comprado', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      compras: [{
        id: 'c1',
        hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        item: 'Pan',
        cantidad: '1 kg',
        rubro: 'panaderia',
        comprado: false,
        origen: 'manual',
        created_at: new Date().toISOString(),
      }],
    },
  });
  await pagina.evaluate(() => globalThis.NuestraAgenda && null);
  await irA(pagina, 'ajustes');
  await pagina.click('button:has-text("Lista de compras")');
  await pagina.waitForTimeout(300);

  await pagina.click('.compra:has-text("Pan")');
  await pagina.waitForTimeout(350);

  const compras = await bd(pagina, () => globalThis.__falso.compras);
  igual(compras[0].comprado, true, 'tenía que quedar comprado');
  afirmar(await pagina.isVisible('.compra.listo'), 'tiene que verse tachado');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el agente recibe la temporada, las preferencias y la agenda', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      eventos: [{
        id: 'e1',
        hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        titulo: 'Natación de Tomás',
        categoria: 'hijo',
        inicio: `${enDias(1)}T19:00:00-03:00`,
        fin: null,
        todo_el_dia: false,
        persona_id: 'p3',
        repite: 'no',
        repite_dias: [],
        repite_hasta: null,
        updated_at: new Date().toISOString(),
      }],
    },
  });
  await irA(pagina, 'chef');
  await pagina.waitForTimeout(400);

  await pagina.fill('.chat-entrada textarea', '¿Qué cocino mañana?');
  await pagina.click('.chat-entrada button');
  await pagina.waitForTimeout(600);

  const pedido = await bd(pagina, () => globalThis.__falso.ultimoPedidoChef);
  afirmar(pedido, 'tenía que llamarse al agente');
  igual(pedido.modo, 'chat', 'el modo');

  const ctx = pedido.contexto;
  afirmar(ctx.temporada, 'falta la tabla de temporada');
  afirmar(ctx.temporada.verduras.length > 5, 'la temporada tiene que traer verduras');
  afirmar(
    ['verano', 'otoño', 'invierno', 'primavera'].includes(ctx.temporada.estacion),
    'la estación',
  );
  afirmar(ctx.personas.includes('Tomás'), 'faltan las personas del hogar');
  afirmar(ctx.preferencias, 'faltan las preferencias');
  afirmar(Array.isArray(ctx.agenda) && ctx.agenda.length === 7, 'la agenda de 7 días');

  // Y lo importante: el día de la natación llega con su compromiso.
  const manana = ctx.agenda.find((d) => d.fecha === enDias(1));
  afirmar(manana, 'falta el día de mañana en la agenda');
  afirmar(
    manana.compromisos.some((c) => c.includes('Natación')),
    `el agente tiene que saber que mañana hay natación: ${JSON.stringify(manana)}`,
  );

  // La respuesta se ve en el chat.
  const texto = await pagina.textContent('.chat');
  afirmar(texto.includes('zapallo'), 'falta la respuesta del agente');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el menú que propone el agente se revisa antes de cargarlo', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      respuestaMenu: {
        resumen: 'Semana de verduras de estación.',
        menu: [
          {
            fecha: enDias(0),
            momento: 'almuerzo',
            titulo: 'Ensalada de tomate y choclo',
            tiempo_min: 20,
            etiquetas: ['vegetariano'],
            ingredientes: [{ item: 'tomate', cantidad: '4', rubro: 'verduleria' }],
          },
          {
            fecha: enDias(0),
            momento: 'cena',
            titulo: 'Tortilla de acelga',
            tiempo_min: 30,
            etiquetas: [],
            ingredientes: [{ item: 'acelga', cantidad: '1 atado', rubro: 'verduleria' }],
          },
          {
            fecha: enDias(1),
            momento: 'cena',
            titulo: 'Sopa de zapallo',
            tiempo_min: 35,
            etiquetas: [],
            ingredientes: [{ item: 'zapallo', cantidad: '1', rubro: 'verduleria' }],
          },
        ],
      },
    },
  });
  await irA(pagina, 'chef');
  await pagina.waitForTimeout(400);

  await pagina.click('button:has-text("Armar")');
  await pagina.waitForSelector('.hoja');
  await pagina.click('.hoja button[type="submit"]');

  // Aparece la propuesta, no se guarda sola.
  await pagina.waitForSelector('.hoja:has-text("Lo que propone")', { timeout: 8000 });
  igual(
    await bd(pagina, () => globalThis.__falso.menu.length),
    0,
    'no se tiene que guardar nada antes de que lo confirmen',
  );

  // Se saca una comida tocándola.
  await pagina.click('.hoja .comida-slot:has-text("Sopa de zapallo")');
  await pagina.waitForTimeout(150);

  const textoBoton = await pagina.innerText('.hoja .acciones button.primario');
  afirmar(textoBoton.includes('2'), `el botón tiene que decir 2 comidas: "${textoBoton}"`);

  await pagina.click('.hoja .acciones button.primario');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 8000 });
  await pagina.waitForTimeout(400);

  const menu = await bd(pagina, () => globalThis.__falso.menu);
  igual(menu.length, 2, 'tenían que guardarse las 2 que quedaron elegidas');
  afirmar(
    !menu.some((m) => m.titulo === 'Sopa de zapallo'),
    'la comida que se sacó no tiene que guardarse',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('la app anda igual aunque las Edge Functions no estén', async (nav) => {
  // Al instalar, las funciones son un paso aparte y se pueden dejar para
  // después. Todo lo que no depende de ellas —el hogar, la agenda, el menú, la
  // lista— tiene que andar igual, y lo que sí depende tiene que avisar con un
  // error entendible en vez de romper la pantalla.
  const { pagina, contexto, errores } = await abrirApp(nav);

  await pagina.evaluate(() => {
    globalThis.__falso.fallarProximo = 'chefChat';
  });

  await irA(pagina, 'chef');
  await pagina.waitForTimeout(400);
  await pagina.fill('.chat-entrada textarea', '¿qué cocino?');
  await pagina.click('.chat-entrada button');
  await pagina.waitForTimeout(700);

  // Avisa, y la pregunta que falló no queda colgada en la conversación.
  afirmar(await pagina.isVisible('.aviso.mal'), 'tiene que avisar del error');
  afirmar(
    !(await pagina.textContent('.chat')).includes('¿qué cocino?'),
    'la pregunta que falló no se deja en la pantalla como si hubiera andado',
  );

  // Y el resto de la app sigue entera: se puede anotar un evento.
  await irA(pagina, 'agenda');
  await pagina.click('.fab');
  await pagina.waitForSelector('.hoja');
  await pagina.fill('.hoja input[type="text"]', 'Natación');
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 5000 });
  await pagina.waitForTimeout(250);

  igual(
    await bd(pagina, () => globalThis.__falso.eventos.length),
    1,
    'la agenda tiene que andar sin las funciones',
  );

  // Y el menú también.
  await irA(pagina, 'menu');
  await pagina.waitForTimeout(200);
  await pagina.click('.dia-menu .comida-slot.vacia');
  await pagina.waitForSelector('.hoja');
  await pagina.click('.hoja .comida-slot');
  await pagina.waitForTimeout(150);
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 5000 });
  await pagina.waitForTimeout(250);

  igual(
    await bd(pagina, () => globalThis.__falso.menu.length),
    1,
    'el menú tiene que andar sin las funciones',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el link del calendario lleva el hogar y el token', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'ajustes');
  await pagina.click('button:has-text("Suscribir el calendario")');
  await pagina.waitForSelector('.link-feed');

  const link = await pagina.innerText('.link-feed');
  afirmar(link.includes('/functions/v1/ics-feed'), 'tiene que apuntar a la función');
  afirmar(link.includes('hogar=aaaaaaaa-1111'), 'falta el id del hogar');
  afirmar(link.includes('token=bbbbbbbb-2222'), 'falta el token');
  afirmar(!link.includes('incluir=menu'), 'el menú va aparte, no por defecto');

  // Y con el menú incluido cambia.
  await pagina.click('.hoja .chip:has-text("Incluir el menú")');
  await pagina.waitForTimeout(100);
  const conMenu = await pagina.innerText('.link-feed');
  afirmar(conMenu.includes('incluir=menu'), 'el botón tiene que agregar el menú');

  // Las instrucciones para los dos sistemas. Se usa textContent y no innerText:
  // la hoja tiene scroll y innerText puede dejar afuera lo que no se ve.
  const texto = await pagina.textContent('.hoja');
  afirmar(texto.includes('iPhone'), 'faltan los pasos de iPhone');
  afirmar(texto.includes('Android'), 'faltan los pasos de Android');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('se importa un calendario .ics y sus eventos entran a la agenda', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Colegio//ES',
    'X-WR-CALNAME:Colegio',
    'BEGIN:VEVENT',
    'UID:acto-2026@colegio',
    `DTSTART;TZID=America/Argentina/Buenos_Aires:${enDias(3).replace(/-/g, '')}T090000`,
    `DTEND;TZID=America/Argentina/Buenos_Aires:${enDias(3).replace(/-/g, '')}T110000`,
    'SUMMARY:Acto del 25 de mayo',
    'LOCATION:Patio del colegio',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:reunion@colegio',
    `DTSTART;VALUE=DATE:${enDias(5).replace(/-/g, '')}`,
    'SUMMARY:Jornada docente',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  await pagina.evaluate((texto) => {
    globalThis.__falso.icsRemoto = texto;
  }, ics);

  await irA(pagina, 'ajustes');
  await pagina.click('button:has-text("Importar un calendario")');
  await pagina.waitForSelector('.hoja');

  await pagina.fill('.hoja input[type="text"]', 'Colegio de Tomás');
  await pagina.fill('.hoja input[type="url"]', 'https://colegio.edu.ar/cal.ics');
  await pagina.click('.hoja button[type="submit"]');

  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 10_000 });
  await pagina.waitForTimeout(400);

  const eventos = await bd(pagina, () => globalThis.__falso.eventos);
  igual(eventos.length, 2, 'tenían que importarse los 2 eventos');

  const acto = eventos.find((e) => e.titulo.includes('Acto'));
  afirmar(acto, 'falta el acto');
  igual(acto.lugar, 'Patio del colegio', 'el lugar');
  afirmar(acto.calendario_id, 'el evento tiene que quedar atado al calendario');
  afirmar(
    acto.ics_uid.includes('acto-2026@colegio'),
    'el uid del .ics se conserva para no duplicar al resincronizar',
  );

  const jornada = eventos.find((e) => e.titulo.includes('Jornada'));
  igual(jornada.todo_el_dia, true, 'la jornada es de todo el día');

  // Volver a importar no duplica.
  await pagina.click('button[aria-label^="Sincronizar"]');
  await pagina.waitForSelector('.hoja');
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 10_000 });
  await pagina.waitForTimeout(400);

  igual(
    await bd(pagina, () => globalThis.__falso.eventos.length),
    2,
    'resincronizar no puede duplicar',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('sumar a un hijo sin cuenta', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'ajustes');
  await pagina.click('button:has-text("Sumar a alguien de la familia")');
  await pagina.waitForSelector('.hoja');

  await pagina.fill('.hoja input[type="text"]', 'Juana');
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 5000 });
  await pagina.waitForTimeout(300);

  const personas = await bd(pagina, () => globalThis.__falso.personas);
  const juana = personas.find((p) => p.nombre === 'Juana');
  afirmar(juana, 'tenía que sumarse Juana');
  igual(juana.user_id, null, 'un hijo no tiene cuenta');

  afirmar(
    (await pagina.textContent('#main')).includes('Juana'),
    'Juana tiene que verse en la lista',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el error del servidor se muestra y no se pierde lo escrito', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await pagina.evaluate(() => {
    globalThis.__falso.fallarProximo = 'guardarEvento';
  });

  await irA(pagina, 'agenda');
  await pagina.click('.fab');
  await pagina.waitForSelector('.hoja');
  await pagina.fill('.hoja input[type="text"]', 'Algo importante');
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForTimeout(500);

  // La hoja sigue abierta, con el error y el texto intacto.
  afirmar(await pagina.isVisible('.hoja'), 'la hoja no se puede cerrar si falló');
  const error = await pagina.innerText('.hoja .error-campo');
  afirmar(error.includes('Falla de prueba'), `falta el mensaje de error: "${error}"`);
  igual(
    await pagina.inputValue('.hoja input[type="text"]'),
    'Algo importante',
    'no se puede perder lo que escribió',
  );

  // Y reintentar funciona.
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 5000 });
  igual(
    await bd(pagina, () => globalThis.__falso.eventos.length),
    1,
    'el reintento tiene que guardar',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('validación: sin título no se guarda', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'agenda');
  await pagina.click('.fab');
  await pagina.waitForSelector('.hoja');
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForTimeout(250);

  afirmar(await pagina.isVisible('.hoja'), 'la hoja tiene que quedar abierta');
  const error = await pagina.innerText('.hoja .error-campo');
  afirmar(error.length > 0, 'tiene que decir qué falta');
  igual(await bd(pagina, () => globalThis.__falso.eventos.length), 0, 'no se guarda nada');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('validación: la hora de fin no puede ser anterior a la de inicio', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'agenda');
  await pagina.click('.fab');
  await pagina.waitForSelector('.hoja');
  await pagina.fill('.hoja input[type="text"]', 'Reunión');
  const horas = await pagina.$$('.hoja input[type="time"]');
  await horas[0].fill('19:00');
  await horas[1].fill('18:00');
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForTimeout(250);

  const error = await pagina.innerText('.hoja .error-campo');
  afirmar(error.includes('posterior'), `tiene que avisar: "${error}"`);
  igual(await bd(pagina, () => globalThis.__falso.eventos.length), 0, 'no se guarda');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el nombre de un hijo no se interpreta como HTML', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  // Si en algún lado se arma HTML pegando texto, esto lo destapa.
  const maligno = '<img src=x onerror="window.__hackeado=1">Tomás';

  await irA(pagina, 'ajustes');
  await pagina.click('button:has-text("Sumar a alguien de la familia")');
  await pagina.waitForSelector('.hoja');
  await pagina.fill('.hoja input[type="text"]', maligno);
  await pagina.click('.hoja button[type="submit"]');
  await pagina.waitForSelector('.hoja', { state: 'detached', timeout: 5000 });
  await pagina.waitForTimeout(400);

  igual(
    await pagina.evaluate(() => globalThis.__hackeado ?? null),
    null,
    'no se puede ejecutar nada de lo que se escribe en un campo',
  );
  afirmar(
    (await pagina.textContent('#main')).includes('<img src=x'),
    'el nombre tiene que verse tal cual, como texto',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('lo que devuelve el agente tampoco se interpreta como HTML', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await pagina.evaluate(() => {
    globalThis.__falso.respuestaChat =
      'Probá esto <img src=x onerror="window.__hackeado=1"> y **avisame**';
  });

  await irA(pagina, 'chef');
  await pagina.waitForTimeout(400);
  await pagina.fill('.chat-entrada textarea', 'hola');
  await pagina.click('.chat-entrada button');
  await pagina.waitForTimeout(700);

  igual(
    await pagina.evaluate(() => globalThis.__hackeado ?? null),
    null,
    'la respuesta del modelo no puede ejecutar nada',
  );
  // Pero el negrita del markdown sí se convierte.
  afirmar(
    await pagina.isVisible('.burbuja.chef strong'),
    'el negrita del modelo sí se tiene que ver',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el tema claro y el oscuro se aplican y se recuerdan', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'ajustes');
  await pagina.selectOption('.lista-ajustes select', 'claro');
  await pagina.waitForTimeout(200);

  igual(
    await pagina.getAttribute('html', 'data-tema'),
    'claro',
    'el tema claro tiene que aplicarse',
  );

  const fondoClaro = await pagina.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );

  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#barra:not(.oculto)');
  igual(
    await pagina.getAttribute('html', 'data-tema'),
    'claro',
    'el tema tiene que sobrevivir a recargar',
  );

  await irA(pagina, 'ajustes');
  await pagina.selectOption('.lista-ajustes select', 'oscuro');
  await pagina.waitForTimeout(200);
  const fondoOscuro = await pagina.evaluate(() =>
    getComputedStyle(document.body).backgroundColor
  );

  afirmar(fondoClaro !== fondoOscuro, 'los dos temas tienen que verse distinto');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('nada se sale de la pantalla a lo ancho', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav, {
    semilla: {
      eventos: [{
        id: 'e1',
        hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        titulo: 'Reunión de padres del jardín para hablar del acto de fin de año y de la colecta',
        detalle: 'Un texto larguísimo sin espacios: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        lugar: 'Un lugar con un nombre muy largo que no termina nunca, Avenida Siempreviva 742',
        categoria: 'colegio',
        inicio: `${hoyISO()}T19:00:00-03:00`,
        fin: null,
        todo_el_dia: false,
        persona_id: 'p3',
        repite: 'no',
        repite_dias: [],
        repite_hasta: null,
        updated_at: new Date().toISOString(),
      }],
    },
  });

  for (const v of ['hoy', 'agenda', 'menu', 'chef', 'ajustes']) {
    await irA(pagina, v);
    await pagina.waitForTimeout(150);
    const desborde = await pagina.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    afirmar(desborde <= 1, `la sección ${v} se sale ${desborde}px a lo ancho`);
  }

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('se puede tocar todo con el pulgar (44px de mínimo)', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  // Los botones de la barra de abajo son los que más se tocan.
  const chicos = await pagina.evaluate(() => {
    const malos = [];
    for (const b of document.querySelectorAll('#barra button')) {
      const r = b.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) {
        malos.push(`${b.textContent.trim()}: ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    return malos;
  });
  igual(chicos, [], 'hay botones de la barra difíciles de tocar');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el botón de atrás del celular navega entre secciones', async (nav) => {
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'menu');
  await irA(pagina, 'chef');
  igual(await pagina.evaluate(() => location.hash), '#chef', 'el hash sigue a la vista');

  await pagina.goBack();
  await pagina.waitForTimeout(250);
  igual(await pagina.evaluate(() => location.hash), '#menu', 'atrás vuelve al menú');
  afirmar(
    (await pagina.textContent('#titulo')).includes('Menú'),
    'y la pantalla tiene que ser la del menú',
  );

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('el botón de atrás también funciona desde la lista de compras', async (nav) => {
  // La lista de compras no está en la barra de abajo: se llega desde otras
  // pantallas. Si esas pantallas cambiaran la vista sin tocar el historial, el
  // botón de atrás saltearía una pantalla o cerraría la app.
  const { pagina, contexto, errores } = await abrirApp(nav);

  await irA(pagina, 'ajustes');
  await pagina.click('button:has-text("Lista de compras")');
  await pagina.waitForTimeout(300);

  igual(await pagina.evaluate(() => location.hash), '#compras', 'el hash sigue a la vista');
  afirmar(
    (await pagina.textContent('#titulo')).includes('Lista de compras'),
    'tiene que estar en la lista de compras',
  );

  await pagina.goBack();
  await pagina.waitForTimeout(300);
  igual(await pagina.evaluate(() => location.hash), '#ajustes', 'atrás vuelve a Más');

  igual(errores, [], 'hubo errores de JavaScript');
  await contexto.close();
});

prueba('sin hogar aparece la pantalla para crearlo o entrar con código', async (nav) => {
  const contexto = await (await nav).newContext?.({}) ?? null;
  // Esta prueba necesita interceptar antes de cargar, así que arma su propio contexto.
  const ctx = await nav.newContext({
    viewport: { width: 400, height: 860 },
    timezoneId: 'America/Argentina/Buenos_Aires',
    locale: 'es-AR',
  });
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));

  await pagina.route('**/js/lib/db.js', async (ruta) => {
    let cuerpo = await readFile(join(RAIZ, 'pruebas/db-falso.js'), 'utf8');
    // Sin hogar: miHogar devuelve null.
    cuerpo = cuerpo.replace(
      'return demora(bd.sesion ? bd.hogar : null);',
      'return demora(null);',
    );
    await ruta.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: cuerpo,
    });
  });

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('.entrada', { timeout: 10_000 });

  const texto = await pagina.textContent('.entrada');
  afirmar(texto.includes('Crear nuestro hogar'), 'falta la opción de crear');
  afirmar(texto.includes('Tengo un código'), 'falta la opción de entrar con código');

  // El campo de código solo acepta las letras del alfabeto del código.
  await pagina.click('button:has-text("Tengo un código")');
  await pagina.waitForSelector('.codigo-entrada');
  // Tecla por tecla, como escribe una persona: con fill() el maxlength del
  // campo trunca el texto antes de que corra el filtro y la prueba mentiría.
  await pagina.click('.codigo-entrada');
  await pagina.locator('.codigo-entrada').pressSequentially('ab-1lo9z2m');
  const valor = await pagina.inputValue('.codigo-entrada');
  afirmar(
    /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]*$/.test(valor),
    `el campo dejó pasar caracteres que no están en el código: "${valor}"`,
  );
  // De "ab-1lo9z2m" sobreviven a, b, 9, z, 2, m: los demás no existen en el
  // alfabeto del código (no hay 1, ni L, ni O, ni guiones).
  afirmar(valor === 'AB9Z2M', `tenía que quedar AB9Z2M y quedó "${valor}"`);

  igual(errores, [], 'hubo errores de JavaScript');
  await ctx.close();
  await contexto?.close();
});

// ---------------------------------------------------------------------------
//  Corrida
// ---------------------------------------------------------------------------

const srv = servidor();
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
PUERTO = srv.address().port;

// Chromium: en este contenedor ya viene instalado en una ruta fija, que puede no
// coincidir con la versión que espera el paquete de playwright. Si ese binario
// existe se usa; si no (por ejemplo en CI, donde playwright baja el suyo), se
// deja que playwright elija.
function chromiumDelSistema() {
  const ruta = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
  return existsSync(ruta) ? ruta : undefined;
}

const navegador = await chromium.launch({ executablePath: chromiumDelSistema() });

let pasaron = 0;
const fallaron = [];

for (const p of pruebas) {
  const arranque = Date.now();
  try {
    await p.fn(navegador);
    console.log(`  ok    ${p.nombre}  (${Date.now() - arranque}ms)`);
    pasaron++;
  } catch (e) {
    console.log(`  FALLÓ ${p.nombre}`);
    console.log(`        ${String(e.message).split('\n').join('\n        ')}`);
    fallaron.push(p.nombre);
  }
}

await navegador.close();
srv.close();

console.log('');
console.log(`${pasaron} pasaron, ${fallaron.length} fallaron`);
if (fallaron.length) {
  console.log('Fallaron: ' + fallaron.join(', '));
  process.exit(1);
}
