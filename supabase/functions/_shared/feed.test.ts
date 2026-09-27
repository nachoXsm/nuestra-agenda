// ============================================================================
//  Prueba del feed .ics contra un parser real (ICAL.js, de Mozilla).
//
//  Importa: un .ics mal armado no tira ningun error visible. El celular
//  simplemente no muestra los eventos, o los muestra tres horas corridos. Asi
//  que aca no se compara texto: se parsea el archivo con la misma clase de
//  libreria que usan los clientes de calendario y se verifica que las
//  ocurrencias caigan en la fecha y la hora correctas.
// ============================================================================
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import ICAL from 'npm:ical.js@2';
import {
  type ComidaMenu,
  type Consultar,
  type Evento,
  generarFeed,
  type Persona,
} from './feed.ts';

const HOGAR = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const TOKEN = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const TOMAS = 'cccccccc-3333-4333-8333-cccccccccccc';

function base(): Evento {
  return {
    id: 'dddddddd-4444-4444-8444-dddddddddddd',
    titulo: 'Natación',
    detalle: null,
    lugar: null,
    categoria: 'hijo',
    // 22:00Z = 19:00 en Buenos Aires
    inicio: '2026-09-29T22:00:00Z',
    fin: '2026-09-29T23:00:00Z',
    todo_el_dia: false,
    persona_id: TOMAS,
    repite: 'no',
    repite_dias: null,
    repite_hasta: null,
    aviso_minutos: null,
    updated_at: '2026-09-27T12:00:00Z',
  };
}

// Devuelve un `consultar` de mentira, y de paso guarda las rutas pedidas para
// poder revisar que los filtros se armen bien.
function falsoConsultar(datos: {
  hogar?: { id: string; nombre: string }[];
  eventos?: Evento[];
  personas?: Persona[];
  menu?: ComidaMenu[];
}): { consultar: Consultar; rutas: string[] } {
  const rutas: string[] = [];
  const consultar: Consultar = <T>(ruta: string): Promise<T> => {
    rutas.push(ruta);
    const tabla = ruta.split('?')[0];
    const respuesta = tabla === 'ag_hogares'
      ? (datos.hogar ?? [{ id: HOGAR, nombre: 'Casa Sánchez' }])
      : tabla === 'ag_eventos'
      ? (datos.eventos ?? [])
      : tabla === 'ag_personas'
      ? (datos.personas ?? [{ id: TOMAS, nombre: 'Tomás', emoji: '🧒' }])
      : tabla === 'ag_menu'
      ? (datos.menu ?? [])
      : [];
    return Promise.resolve(respuesta as T);
  };
  return { consultar, rutas };
}

function url(qs: string): URL {
  return new URL(`https://x.supabase.co/functions/v1/ics-feed?${qs}`);
}

const feedOk = `hogar=${HOGAR}&token=${TOKEN}`;

// Parsea el .ics y registra su VTIMEZONE, como hace un cliente de verdad.
function parsear(ics: string) {
  const comp = new ICAL.Component(ICAL.parse(ics));
  const vtz = comp.getFirstSubcomponent('vtimezone');
  if (vtz) {
    const tz = new ICAL.Timezone(vtz);
    if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz);
  }
  return comp;
}

// ---------------------------------------------------------------------------
//  Autorización
// ---------------------------------------------------------------------------

Deno.test('sin parámetros devuelve 400', async () => {
  const { consultar } = falsoConsultar({});
  assertEquals((await generarFeed(url(''), consultar)).status, 400);
});

Deno.test('con un hogar que no es un uuid devuelve 400 y no consulta nada', async () => {
  const { consultar, rutas } = falsoConsultar({});
  const r = await generarFeed(url(`hogar=pepe&token=${TOKEN}`), consultar);
  assertEquals(r.status, 400);
  assertEquals(rutas.length, 0, 'no tiene que tocar la base con basura');
});

Deno.test('token equivocado devuelve 404 sin filtrar si el hogar existe', async () => {
  const { consultar } = falsoConsultar({ hogar: [] });
  const r = await generarFeed(url(feedOk), consultar);
  assertEquals(r.status, 404);
  // No debe decir "token inválido" vs "hogar inexistente": seria confirmar ids.
  assertStringIncludes(r.cuerpo, 'no existe o el link ya no es válido');
});

Deno.test('el token viaja en la consulta del hogar', async () => {
  const { consultar, rutas } = falsoConsultar({ eventos: [base()] });
  await generarFeed(url(feedOk), consultar);
  assertStringIncludes(rutas[0], `feed_token=eq.${TOKEN}`);
});

// ---------------------------------------------------------------------------
//  Estructura del archivo
// ---------------------------------------------------------------------------

Deno.test('genera un calendario que parsea sin errores', async () => {
  const { consultar } = falsoConsultar({ eventos: [base()] });
  const r = await generarFeed(url(feedOk), consultar);

  assertEquals(r.status, 200);
  assertEquals(r.headers['Content-Type'], 'text/calendar; charset=utf-8');

  const comp = parsear(r.cuerpo);
  assertEquals(comp.name, 'vcalendar');
  assertEquals(comp.getFirstPropertyValue('version'), '2.0');
  assert(comp.getFirstSubcomponent('vtimezone'), 'tiene que traer la VTIMEZONE');
  assertEquals(comp.getFirstPropertyValue('x-wr-calname'), 'Casa Sánchez');
  assertEquals(comp.getAllSubcomponents('vevent').length, 1);
});

Deno.test('todas las líneas respetan el límite de 75 octetos', async () => {
  const largo = base();
  largo.titulo = 'Reunión de padres del jardín con la maestra de sala de 5 ' +
    'para hablar del acto de fin de año 🎒🧒';
  largo.detalle = 'Llevar la autorización firmada por los dos. ' +
    'Después hay que pasar por la panadería a encargar la torta.';
  largo.lugar = 'Jardín Arco Iris, Av. Rivadavia 4567, CABA';

  const { consultar } = falsoConsultar({ eventos: [largo] });
  const r = await generarFeed(url(feedOk), consultar);

  for (const linea of r.cuerpo.split('\r\n')) {
    const bytes = new TextEncoder().encode(linea).length;
    assert(bytes <= 75, `línea de ${bytes} octetos: ${linea.slice(0, 40)}…`);
  }

  // Y al parsear, el texto vuelve entero.
  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  assertStringIncludes(ev.summary, 'acto de fin de año 🎒🧒');
  assertStringIncludes(ev.description, 'encargar la torta');
});

Deno.test('el título dice de quién es el evento', async () => {
  const { consultar } = falsoConsultar({ eventos: [base()] });
  const r = await generarFeed(url(feedOk), consultar);
  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  assertEquals(ev.summary, '🧒 Natación (Tomás)');
});

Deno.test('un evento de toda la familia no lleva nombre', async () => {
  const e = base();
  e.persona_id = null;
  e.categoria = 'familia';
  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);
  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  assertEquals(ev.summary, '🏠 Natación');
});

// ---------------------------------------------------------------------------
//  Horas
// ---------------------------------------------------------------------------

Deno.test('la hora queda en hora de Buenos Aires, no en UTC', async () => {
  const { consultar } = falsoConsultar({ eventos: [base()] });
  const r = await generarFeed(url(feedOk), consultar);

  assertStringIncludes(
    r.cuerpo,
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20260929T190000',
  );

  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  assertEquals(ev.startDate.hour, 19, 'las 22:00Z son las 19:00 acá');
  assertEquals(ev.startDate.day, 29);
  // Y el instante absoluto tiene que coincidir con lo que guardó la base.
  assertEquals(
    ev.startDate.toJSDate().toISOString(),
    '2026-09-29T22:00:00.000Z',
  );
});

Deno.test('sin hora de fin, el evento dura una hora', async () => {
  const e = base();
  e.fin = null;
  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);
  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  assertEquals(ev.endDate.hour, 20);
});

Deno.test('un evento de todo el día cierra el día siguiente (DTEND exclusivo)', async () => {
  const e = base();
  e.todo_el_dia = true;
  e.titulo = 'Cumple de Tomás';
  e.categoria = 'cumple';
  // Mediodía UTC para que no haya duda del día local.
  e.inicio = '2026-10-15T12:00:00Z';
  e.fin = null;

  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);

  assertStringIncludes(r.cuerpo, 'DTSTART;VALUE=DATE:20261015');
  // Si el DTEND fuera el mismo día, muchos calendarios no lo muestran.
  assertStringIncludes(r.cuerpo, 'DTEND;VALUE=DATE:20261016');

  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  assert(ev.startDate.isDate, 'tiene que ser tipo DATE, no DATE-TIME');
  assertEquals(ev.startDate.day, 15);
});

// ---------------------------------------------------------------------------
//  Repeticiones — el corazón del feed
// ---------------------------------------------------------------------------

Deno.test('un evento semanal se expande en los días pedidos', async () => {
  const e = base();
  // Martes 29/9/2026 19:00. Repite martes (2) y jueves (4).
  e.repite = 'semanal';
  e.repite_dias = [2, 4];
  e.repite_hasta = '2026-10-15';

  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);

  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  assert(ev.isRecurring(), 'el parser tiene que verlo como repetido');

  const fechas: string[] = [];
  const it = ev.iterator();
  for (let next = it.next(); next && fechas.length < 20; next = it.next()) {
    fechas.push(`${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`);
  }

  // Martes y jueves desde el 29/9 hasta el 15/10 inclusive.
  assertEquals(fechas, [
    '2026-09-29', // martes
    '2026-10-01', // jueves
    '2026-10-06',
    '2026-10-08',
    '2026-10-13',
    '2026-10-15',
  ]);
  // Todas a las 19:00 locales.
  assertEquals(it.last?.hour ?? 19, 19);
});

Deno.test('una ocurrencia cancelada no aparece', async () => {
  const e = base();
  e.repite = 'semanal';
  e.repite_dias = [2];
  e.repite_hasta = '2026-10-27';
  // El 13/10 no hay natación.
  e.ag_ocurrencias = [
    { fecha: '2026-10-13', estado: 'cancelado' },
    // "hecho" no es una cancelación: ese día sigue estando.
    { fecha: '2026-10-06', estado: 'hecho' },
  ];

  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);

  assertStringIncludes(
    r.cuerpo,
    'EXDATE;TZID=America/Argentina/Buenos_Aires:20261013T190000',
  );

  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  const fechas: string[] = [];
  const it = ev.iterator();
  for (let next = it.next(); next && fechas.length < 20; next = it.next()) {
    fechas.push(`${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`);
  }

  assert(!fechas.includes('2026-10-13'), `el 13/10 fue cancelado: ${fechas}`);
  assert(fechas.includes('2026-10-06'), 'el 6/10 estaba "hecho", tiene que estar');
  assertEquals(fechas, ['2026-09-29', '2026-10-06', '2026-10-20', '2026-10-27']);
});

Deno.test('el UNTIL corta la repetición donde dice', async () => {
  const e = base();
  e.repite = 'diario';
  e.repite_hasta = '2026-10-02';

  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);

  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  const fechas: string[] = [];
  const it = ev.iterator();
  for (let next = it.next(); next && fechas.length < 20; next = it.next()) {
    fechas.push(`${next.year}-${String(next.month).padStart(2, '0')}-${String(next.day).padStart(2, '0')}`);
  }

  assertEquals(fechas, ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
});

Deno.test('un cumpleaños anual de todo el día se repite cada año', async () => {
  const e = base();
  e.titulo = 'Cumple de Tomás';
  e.categoria = 'cumple';
  e.todo_el_dia = true;
  e.inicio = '2026-10-15T12:00:00Z';
  e.fin = null;
  e.repite = 'anual';
  e.persona_id = null;

  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);

  assertStringIncludes(r.cuerpo, 'RRULE:FREQ=YEARLY');

  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  const anios: number[] = [];
  const it = ev.iterator();
  for (let next = it.next(); next && anios.length < 3; next = it.next()) {
    assertEquals(next.day, 15);
    assertEquals(next.month, 10);
    anios.push(next.year);
  }
  assertEquals(anios, [2026, 2027, 2028]);
});

// ---------------------------------------------------------------------------
//  Recordatorios
// ---------------------------------------------------------------------------

Deno.test('el aviso genera una alarma que el celular puede disparar', async () => {
  const e = base();
  e.aviso_minutos = 45;

  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);

  const vevent = parsear(r.cuerpo).getAllSubcomponents('vevent')[0];
  const alarma = vevent.getFirstSubcomponent('valarm');
  assert(alarma, 'tiene que haber una VALARM');
  assertEquals(alarma.getFirstPropertyValue('action'), 'DISPLAY');

  const trigger = alarma.getFirstPropertyValue('trigger');
  // 45 minutos antes.
  assertEquals(String(trigger), '-PT45M');
});

Deno.test('sin aviso no se agrega alarma', async () => {
  const { consultar } = falsoConsultar({ eventos: [base()] });
  const r = await generarFeed(url(feedOk), consultar);
  const vevent = parsear(r.cuerpo).getAllSubcomponents('vevent')[0];
  assertEquals(vevent.getFirstSubcomponent('valarm'), null);
});

// ---------------------------------------------------------------------------
//  Filtros y menú
// ---------------------------------------------------------------------------

Deno.test('el filtro por persona entra en una sola condición and', async () => {
  const { consultar, rutas } = falsoConsultar({ eventos: [base()] });
  await generarFeed(url(`${feedOk}&persona=${TOMAS}`), consultar);

  const rutaEventos = rutas.find((r) => r.startsWith('ag_eventos'))!;
  // Dos parametros or= por separado harian que PostgREST descarte uno.
  assertEquals((rutaEventos.match(/[?&]or=/g) ?? []).length, 0);
  assertStringIncludes(rutaEventos, `and=(or(inicio.gte.`);
  assertStringIncludes(rutaEventos, `or(persona_id.eq.${TOMAS},persona_id.is.null)`);
});

Deno.test('una persona que no es uuid se ignora en vez de romper la consulta', async () => {
  const { consultar, rutas } = falsoConsultar({ eventos: [base()] });
  const r = await generarFeed(url(`${feedOk}&persona=drop-table`), consultar);
  assertEquals(r.status, 200);
  const rutaEventos = rutas.find((x) => x.startsWith('ag_eventos'))!;
  assert(!rutaEventos.includes('drop-table'));
});

Deno.test('la fecha del filtro no lleva milisegundos', async () => {
  const { consultar, rutas } = falsoConsultar({ eventos: [] });
  await generarFeed(url(feedOk), consultar);
  const rutaEventos = rutas.find((x) => x.startsWith('ag_eventos'))!;
  // PostgREST corta el valor en el segundo punto: "00.000Z" le deja uno de más.
  assert(
    /inicio\.gte\.\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(rutaEventos),
    rutaEventos,
  );
});

Deno.test('el menú solo aparece si se pide', async () => {
  const menu: ComidaMenu[] = [
    { id: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee', fecha: '2026-09-28', momento: 'cena', titulo: 'Tarta de acelga' },
  ];

  const sinMenu = falsoConsultar({ eventos: [], menu });
  const r1 = await generarFeed(url(feedOk), sinMenu.consultar);
  assertEquals(parsear(r1.cuerpo).getAllSubcomponents('vevent').length, 0);
  assert(!sinMenu.rutas.some((x) => x.startsWith('ag_menu')), 'no debe consultar el menú');

  const conMenu = falsoConsultar({ eventos: [], menu });
  const r2 = await generarFeed(url(`${feedOk}&incluir=menu`), conMenu.consultar);
  const eventos = parsear(r2.cuerpo).getAllSubcomponents('vevent');
  assertEquals(eventos.length, 1);

  const ev = new ICAL.Event(eventos[0]);
  assertEquals(ev.summary, '🍽 Cena: Tarta de acelga');
  assert(ev.startDate.isDate, 'el menú va como evento de día completo');
  assertEquals(ev.startDate.day, 28);
  // TRANSPARENT para que no parezca que ese día estás ocupado.
  assertEquals(eventos[0].getFirstPropertyValue('transp'), 'TRANSPARENT');
  assertStringIncludes(r2.cuerpo, 'DTEND;VALUE=DATE:20260929');
});

Deno.test('el punto y coma y la coma del texto no rompen el archivo', async () => {
  const e = base();
  e.titulo = 'Pediatra; control anual, 10hs';
  e.lugar = 'Sanatorio; piso 3, consultorio 12';
  e.detalle = 'Llevar: libreta, carnet\ny la orden';

  const { consultar } = falsoConsultar({ eventos: [e] });
  const r = await generarFeed(url(feedOk), consultar);

  const ev = new ICAL.Event(parsear(r.cuerpo).getAllSubcomponents('vevent')[0]);
  // El parser tiene que devolver el texto original, sin las barras de escape.
  assertStringIncludes(ev.summary, 'Pediatra; control anual, 10hs');
  assertEquals(ev.location, 'Sanatorio; piso 3, consultorio 12');
  assertStringIncludes(ev.description, 'Llevar: libreta, carnet\ny la orden');
});

Deno.test('cada evento tiene un UID estable', async () => {
  const e1 = base();
  const e2 = { ...base(), id: 'ffffffff-6666-4666-8666-ffffffffffff', titulo: 'Fútbol' };

  const { consultar } = falsoConsultar({ eventos: [e1, e2] });
  const r = await generarFeed(url(feedOk), consultar);

  const uids = parsear(r.cuerpo)
    .getAllSubcomponents('vevent')
    .map((v) => v.getFirstPropertyValue('uid'));

  assertEquals(uids.length, 2);
  assertEquals(new Set(uids).size, 2, 'los UID no se pueden repetir');
  assertEquals(uids[0], `${e1.id}@nuestra-agenda`);
});
