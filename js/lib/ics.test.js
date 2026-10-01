// ============================================================================
//  Pruebas del parser de .ics.
//
//  Los archivos con los que va a trabajar esto vienen de afuera: Google, el
//  sistema del colegio, Outlook. Cada uno escribe distinto. Los casos de acá son
//  los formatos reales de esos productos, no ejemplos de manual.
//
//  Además hay una prueba de ida y vuelta contra NUESTRO propio feed: si algún día
//  cambia el generador y el parser deja de entenderlo, salta acá.
// ============================================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { eventoAIcs, leerFechaIcs, leerRrule, parsearIcs } from './ics.js';
import { aFecha, aHora } from './fechas.js';
import { generarFeed } from '../../supabase/functions/_shared/feed.ts';

const envolver = (...cuerpo) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//ES',
    ...cuerpo,
    'END:VCALENDAR',
  ].join('\r\n');

// ---------------------------------------------------------------------------
//  Fechas
// ---------------------------------------------------------------------------

Deno.test('leerFechaIcs entiende un instante UTC', () => {
  const f = leerFechaIcs('20260929T220000Z', {});
  assertEquals(f.soloFecha, false);
  assertEquals(f.instante.toISOString(), '2026-09-29T22:00:00.000Z');
  assertEquals(aHora(f.instante), '19:00', 'son las 19 en Buenos Aires');
});

Deno.test('leerFechaIcs entiende una fecha sola', () => {
  const f = leerFechaIcs('20261015', { VALUE: 'DATE' });
  assertEquals(f.soloFecha, true);
  assertEquals(f.fecha, '2026-10-15');
  // Anclado al mediodía local: así ninguna conversión lo pasa al día anterior.
  assertEquals(aFecha(f.instante), '2026-10-15');
});

Deno.test('leerFechaIcs entiende un TZID de otro país', () => {
  // 19:00 en Madrid en septiembre (CEST, UTC+2) son las 17:00 UTC.
  const f = leerFechaIcs('20260929T190000', { TZID: 'Europe/Madrid' });
  assertEquals(f.instante.toISOString(), '2026-09-29T17:00:00.000Z');
});

Deno.test('leerFechaIcs respeta el horario de verano de la zona de origen', () => {
  // En enero Madrid está en CET (UTC+1): las 19:00 son las 18:00 UTC.
  const invierno = leerFechaIcs('20260115T190000', { TZID: 'Europe/Madrid' });
  assertEquals(invierno.instante.toISOString(), '2026-01-15T18:00:00.000Z');
  // En julio está en CEST (UTC+2): las 19:00 son las 17:00 UTC.
  const verano = leerFechaIcs('20260715T190000', { TZID: 'Europe/Madrid' });
  assertEquals(verano.instante.toISOString(), '2026-07-15T17:00:00.000Z');
});

Deno.test('una zona de Outlook que no es IANA cae en hora local', () => {
  // Outlook manda "Romance Standard Time" y cosas así. Se toma como hora de
  // Buenos Aires, que es lo más probable para el calendario de un colegio de acá.
  const f = leerFechaIcs('20260929T190000', { TZID: 'Romance Standard Time' });
  assertEquals(aHora(f.instante), '19:00');
  assertEquals(aFecha(f.instante), '2026-09-29');
});

Deno.test('sin TZID ni Z, se toma como hora local', () => {
  const f = leerFechaIcs('20260929T190000', {});
  assertEquals(aHora(f.instante), '19:00');
});

Deno.test('una fecha con formato roto no explota', () => {
  assertEquals(leerFechaIcs('mañana', {}).instante, null);
  assertEquals(leerFechaIcs('', {}).instante, null);
});

// ---------------------------------------------------------------------------
//  Un .ics de Google Calendar
// ---------------------------------------------------------------------------

Deno.test('lee un evento típico de Google Calendar', () => {
  const ics = envolver(
    'X-WR-CALNAME:Colegio San Martín',
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20260929T190000',
    'DTEND;TZID=America/Argentina/Buenos_Aires:20260929T203000',
    'DTSTAMP:20260901T120000Z',
    'UID:abc123@google.com',
    'SUMMARY:Reunión de padres',
    'DESCRIPTION:Traer la autorización firmada',
    'LOCATION:Aula 3\\, primer piso',
    'STATUS:CONFIRMED',
    'END:VEVENT',
  );

  const r = parsearIcs(ics);
  assertEquals(r.nombre, 'Colegio San Martín');
  assertEquals(r.eventos.length, 1);
  assertEquals(r.saltados, 0);

  const e = r.eventos[0];
  assertEquals(e.titulo, 'Reunión de padres');
  assertEquals(e.ics_uid, 'abc123@google.com');
  assertEquals(e.detalle, 'Traer la autorización firmada');
  assertEquals(e.lugar, 'Aula 3, primer piso', 'la coma escapada vuelve entera');
  assertEquals(e.todo_el_dia, false);
  assertEquals(aHora(e.inicio), '19:00');
  assertEquals(aHora(e.fin), '20:30');
  assertEquals(e.repite, 'no');
});

Deno.test('deshace el plegado de líneas largas', () => {
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:x@test',
    'DTSTART:20260929T220000Z',
    'SUMMARY:Reunión de padres del jardín para hablar del acto de',
    '  fin de año y de la colecta',
    'DESCRIPTION:Primera parte de la descripción',
    '  y esto es la continuación',
    'END:VEVENT',
  );

  const e = parsearIcs(ics).eventos[0];
  assertEquals(
    e.titulo,
    'Reunión de padres del jardín para hablar del acto de fin de año y de la colecta',
  );
  assertEquals(e.detalle, 'Primera parte de la descripción y esto es la continuación');
});

Deno.test('un evento de todo el día: el DTEND exclusivo se corrige', () => {
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:feriado@test',
    'DTSTART;VALUE=DATE:20261012',
    'DTEND;VALUE=DATE:20261013', // exclusivo: el evento es solo el 12
    'SUMMARY:Feriado',
    'END:VEVENT',
  );

  const e = parsearIcs(ics).eventos[0];
  assertEquals(e.todo_el_dia, true);
  assertEquals(aFecha(e.inicio), '2026-10-12');
  // Un día de duración quedaría con fin igual al inicio: se descarta el fin.
  assertEquals(e.fin, null);
});

Deno.test('un evento de varios días mantiene el último día correcto', () => {
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:viaje@test',
    'DTSTART;VALUE=DATE:20261012',
    'DTEND;VALUE=DATE:20261016', // exclusivo: termina el 15
    'SUMMARY:Viaje de egresados',
    'END:VEVENT',
  );

  const e = parsearIcs(ics).eventos[0];
  assertEquals(aFecha(e.inicio), '2026-10-12');
  assertEquals(aFecha(e.fin), '2026-10-15', 'el DTEND es exclusivo');
});

Deno.test('DURATION sirve igual que DTEND', () => {
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:x@test',
    'DTSTART:20260929T220000Z',
    'DURATION:PT1H30M',
    'SUMMARY:Natación',
    'END:VEVENT',
  );
  const e = parsearIcs(ics).eventos[0];
  assertEquals(aHora(e.inicio), '19:00');
  assertEquals(aHora(e.fin), '20:30');
});

Deno.test('un fin anterior al inicio se descarta', () => {
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:x@test',
    'DTSTART:20260929T220000Z',
    'DTEND:20260929T210000Z',
    'SUMMARY:Dato roto',
    'END:VEVENT',
  );
  assertEquals(parsearIcs(ics).eventos[0].fin, null);
});

// ---------------------------------------------------------------------------
//  Repeticiones
// ---------------------------------------------------------------------------

Deno.test('leerRrule traduce las frecuencias que la app modela', () => {
  const base = '2026-09-29T22:00:00Z';

  assertEquals(leerRrule('FREQ=DAILY', base).repite, 'diario');
  assertEquals(leerRrule('FREQ=MONTHLY', base).repite, 'mensual');
  assertEquals(leerRrule('FREQ=YEARLY', base).repite, 'anual');
  assertEquals(leerRrule('FREQ=WEEKLY;INTERVAL=2', base).repite, 'quincenal');

  const semanal = leerRrule('FREQ=WEEKLY;BYDAY=TU,TH', base);
  assertEquals(semanal.repite, 'semanal');
  assertEquals(semanal.repite_dias, [2, 4]);

  // BYDAY con número ("segundo lunes") no lo modelamos: se toma el día.
  assertEquals(leerRrule('FREQ=WEEKLY;BYDAY=2MO', base).repite_dias, [1]);
});

Deno.test('lo que la app no modela vuelve como evento suelto', () => {
  const base = '2026-09-29T22:00:00Z';
  // Es mejor importar una sola vez que inventar una repetición equivocada.
  for (const regla of [
    'FREQ=DAILY;INTERVAL=3',
    'FREQ=WEEKLY;INTERVAL=5',
    'FREQ=MONTHLY;INTERVAL=2',
    'FREQ=HOURLY',
    'FREQ=MINUTELY',
    'cualquier cosa',
    '',
  ]) {
    assertEquals(leerRrule(regla, base).repite, 'no', `regla: ${regla}`);
  }
});

Deno.test('UNTIL se lee como fecha de corte', () => {
  const r = leerRrule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261215T235959Z', '2026-09-29T22:00:00Z');
  assertEquals(r.repite_hasta, '2026-12-15');
});

Deno.test('COUNT se estima como fecha de corte', () => {
  // No se puede saber la fecha exacta sin expandir, pero tiene que caer cerca y
  // nunca antes de la última vez.
  const r = leerRrule('FREQ=DAILY;COUNT=10', '2026-09-29T22:00:00Z');
  assert(r.repite_hasta >= '2026-10-08', `quedó corto: ${r.repite_hasta}`);
  assert(r.repite_hasta <= '2026-10-12', `quedó largo: ${r.repite_hasta}`);

  const anual = leerRrule('FREQ=YEARLY;COUNT=3', '2026-10-15T15:00:00Z');
  assertEquals(anual.repite_hasta?.slice(0, 4), '2029');
});

Deno.test('EXDATE se junta, incluso varias en una línea', () => {
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:natacion@test',
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20260929T190000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU',
    'EXDATE;TZID=America/Argentina/Buenos_Aires:20261013T190000',
    'EXDATE;TZID=America/Argentina/Buenos_Aires:20261020T190000,20261027T190000',
    'SUMMARY:Natación',
    'END:VEVENT',
  );
  const e = parsearIcs(ics).eventos[0];
  assertEquals(e.exdates, ['2026-10-13', '2026-10-20', '2026-10-27']);
});

// ---------------------------------------------------------------------------
//  Cosas que hay que ignorar
// ---------------------------------------------------------------------------

Deno.test('la descripción de una VALARM no pisa la del evento', () => {
  // Este es el error clásico: la VALARM trae su propio DESCRIPTION.
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:x@test',
    'DTSTART:20260929T220000Z',
    'SUMMARY:Pediatra',
    'DESCRIPTION:Llevar la libreta',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
  );

  const e = parsearIcs(ics).eventos[0];
  assertEquals(e.detalle, 'Llevar la libreta');
  assertEquals(e.aviso_minutos, 30, 'el trigger se aprovecha como aviso');
});

Deno.test('un TRIGGER en horas y días también se lee', () => {
  const conHoras = envolver(
    'BEGIN:VEVENT',
    'UID:x@test',
    'DTSTART:20260929T220000Z',
    'SUMMARY:x',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
  );
  assertEquals(parsearIcs(conHoras).eventos[0].aviso_minutos, 120);

  const conDias = envolver(
    'BEGIN:VEVENT',
    'UID:y@test',
    'DTSTART:20260929T220000Z',
    'SUMMARY:y',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
  );
  assertEquals(parsearIcs(conDias).eventos[0].aviso_minutos, 1440);
});

Deno.test('el VTIMEZONE del archivo no se confunde con un evento', () => {
  const ics = envolver(
    'BEGIN:VTIMEZONE',
    'TZID:America/Argentina/Buenos_Aires',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:x@test',
    'DTSTART:20260929T220000Z',
    'SUMMARY:El único evento',
    'END:VEVENT',
  );
  const r = parsearIcs(ics);
  assertEquals(r.eventos.length, 1);
  assertEquals(r.eventos[0].titulo, 'El único evento');
});

Deno.test('los eventos cancelados y los incompletos se saltean', () => {
  const ics = envolver(
    'BEGIN:VEVENT',
    'UID:a@test',
    'DTSTART:20260929T220000Z',
    'SUMMARY:Se canceló',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:b@test',
    'SUMMARY:Sin fecha',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:c@test',
    'DTSTART:20260929T220000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:d@test',
    'DTSTART:20260930T220000Z',
    'SUMMARY:Este sí',
    'END:VEVENT',
  );

  const r = parsearIcs(ics);
  assertEquals(r.eventos.length, 1);
  assertEquals(r.eventos[0].titulo, 'Este sí');
  assertEquals(r.saltados, 3);
});

Deno.test('un archivo vacío o basura no rompe nada', () => {
  for (const basura of ['', 'no soy un calendario', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR']) {
    const r = parsearIcs(basura);
    assertEquals(r.eventos.length, 0);
    assert(Array.isArray(r.eventos));
  }
});

Deno.test('aguanta un calendario con muchos eventos', () => {
  const cuerpo = [];
  for (let d = 1; d <= 200; d++) {
    // Se reparten a lo largo de 200 días, uno por día desde el 1/9/2026.
    const fecha = new Date(Date.UTC(2026, 8, 1) + (d - 1) * 86400000)
      .toISOString().slice(0, 10).replace(/-/g, '');
    cuerpo.push(
      'BEGIN:VEVENT',
      `UID:e${d}@test`,
      `DTSTART:${fecha}T120000Z`,
      `SUMMARY:Evento ${d}`,
      'END:VEVENT',
    );
  }
  const r = parsearIcs(envolver(...cuerpo));
  assertEquals(r.eventos.length, 200);
});

// ---------------------------------------------------------------------------
//  Escritura
// ---------------------------------------------------------------------------

Deno.test('eventoAIcs produce algo que el propio parser vuelve a leer', () => {
  const original = {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    titulo: 'Pediatra; control anual',
    detalle: 'Llevar libreta, carnet\ny la orden',
    lugar: 'Sanatorio, piso 3',
    inicio: '2026-09-29T22:00:00.000Z',
    fin: '2026-09-29T23:00:00.000Z',
    todo_el_dia: false,
    aviso_minutos: 60,
  };

  const ics = eventoAIcs(original, { nombrePersona: 'Tomás' });
  const e = parsearIcs(ics).eventos[0];

  assertEquals(e.titulo, 'Pediatra; control anual (Tomás)');
  assertEquals(e.detalle, original.detalle);
  assertEquals(e.lugar, original.lugar);
  assertEquals(e.inicio, original.inicio);
  assertEquals(e.fin, original.fin);
  assertEquals(e.aviso_minutos, 60);
});

Deno.test('eventoAIcs de todo el día vuelve al mismo día', () => {
  const ics = eventoAIcs({
    id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    titulo: 'Cumple de Tomás',
    inicio: '2026-10-15T15:00:00.000Z',
    fin: null,
    todo_el_dia: true,
  });

  const e = parsearIcs(ics).eventos[0];
  assertEquals(e.todo_el_dia, true);
  assertEquals(aFecha(e.inicio), '2026-10-15');
});

Deno.test('eventoAIcs respeta el límite de 75 octetos', () => {
  const ics = eventoAIcs({
    id: 'cccccccc-3333-4333-8333-cccccccccccc',
    titulo: 'Reunión de padres del jardín con la maestra de sala de 5 🎒🧒 ' +
      'para hablar del acto de fin de año',
    inicio: '2026-09-29T22:00:00.000Z',
    fin: null,
    todo_el_dia: false,
  });

  for (const linea of ics.split('\r\n')) {
    assert(
      new TextEncoder().encode(linea).length <= 75,
      `línea larga: ${linea.slice(0, 40)}`,
    );
  }
  assert(parsearIcs(ics).eventos[0].titulo.includes('🎒🧒'));
});

// ---------------------------------------------------------------------------
//  Ida y vuelta con nuestro propio feed
// ---------------------------------------------------------------------------

Deno.test('el parser entiende el .ics que genera nuestro feed', async () => {
  const HOGAR = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const TOKEN = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

  const eventos = [
    {
      id: 'dddddddd-4444-4444-8444-dddddddddddd',
      titulo: 'Natación',
      detalle: 'Llevar ojotas, toalla; y la gorra',
      lugar: 'Club, pileta chica',
      categoria: 'hijo',
      inicio: '2026-09-29T22:00:00Z',
      fin: '2026-09-29T23:00:00Z',
      todo_el_dia: false,
      persona_id: null,
      repite: 'semanal',
      repite_dias: [2, 4],
      repite_hasta: '2026-12-15',
      aviso_minutos: 45,
      updated_at: '2026-09-27T12:00:00Z',
      ag_ocurrencias: [{ fecha: '2026-10-13', estado: 'cancelado' }],
    },
    {
      id: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
      titulo: 'Cumple de Tomás',
      detalle: null,
      lugar: null,
      categoria: 'cumple',
      inicio: '2026-10-15T12:00:00Z',
      fin: null,
      todo_el_dia: true,
      persona_id: null,
      repite: 'anual',
      repite_dias: null,
      repite_hasta: null,
      aviso_minutos: null,
      updated_at: '2026-09-27T12:00:00Z',
    },
  ];

  const consultar = (ruta) => {
    const tabla = ruta.split('?')[0];
    if (tabla === 'ag_hogares') return Promise.resolve([{ id: HOGAR, nombre: 'Casa' }]);
    if (tabla === 'ag_eventos') return Promise.resolve(eventos);
    return Promise.resolve([]);
  };

  const r = await generarFeed(
    new URL(`https://x/?hogar=${HOGAR}&token=${TOKEN}`),
    consultar,
  );
  assertEquals(r.status, 200);

  const leido = parsearIcs(r.cuerpo);
  assertEquals(leido.nombre, 'Casa');
  assertEquals(leido.eventos.length, 2);

  const natacion = leido.eventos.find((e) => e.titulo.includes('Natación'));
  assertEquals(aHora(natacion.inicio), '19:00', 'la hora sobrevive el viaje');
  assertEquals(aHora(natacion.fin), '20:00');
  assertEquals(natacion.repite, 'semanal');
  assertEquals(natacion.repite_dias, [2, 4]);
  assertEquals(natacion.repite_hasta, '2026-12-15');
  assertEquals(natacion.aviso_minutos, 45);
  assertEquals(natacion.exdates, ['2026-10-13'], 'la cancelación vuelve');
  assertEquals(natacion.detalle, 'Llevar ojotas, toalla; y la gorra');
  assertEquals(natacion.lugar, 'Club, pileta chica');

  const cumple = leido.eventos.find((e) => e.titulo.includes('Cumple'));
  assertEquals(cumple.todo_el_dia, true);
  assertEquals(aFecha(cumple.inicio), '2026-10-15');
  assertEquals(cumple.repite, 'anual');
});

// ---------------------------------------------------------------------------
//  Instancias sueltas de un evento que se repite
// ---------------------------------------------------------------------------
//
//  Esto es lo que rompía al importar Google Calendar. Cuando una semana de un
//  evento repetido se mueve o se borra, Google escribe otro VEVENT con EL MISMO
//  UID y un RECURRENCE-ID. Si los dos salen con el mismo ics_uid, el guardado
//  manda dos filas con la misma clave y Postgres corta todo con "ON CONFLICT DO
//  UPDATE command cannot affect row a second time".

const GOOGLE_CON_EXCEPCIONES = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
X-WR-CALNAME:Agenda
BEGIN:VEVENT
UID:abc123@google.com
DTSTART;TZID=America/Argentina/Buenos_Aires:20261006T190000
DTEND;TZID=America/Argentina/Buenos_Aires:20261006T200000
RRULE:FREQ=WEEKLY;BYDAY=TU
SUMMARY:Natación
END:VEVENT
BEGIN:VEVENT
UID:abc123@google.com
RECURRENCE-ID;TZID=America/Argentina/Buenos_Aires:20261013T190000
DTSTART;TZID=America/Argentina/Buenos_Aires:20261013T203000
DTEND;TZID=America/Argentina/Buenos_Aires:20261013T213000
SUMMARY:Natación (más tarde)
END:VEVENT
BEGIN:VEVENT
UID:abc123@google.com
RECURRENCE-ID;TZID=America/Argentina/Buenos_Aires:20261020T190000
DTSTART;TZID=America/Argentina/Buenos_Aires:20261020T190000
STATUS:CANCELLED
SUMMARY:Natación
END:VEVENT
END:VCALENDAR`;

Deno.test('una semana movida no choca con su serie', () => {
  const { eventos } = parsearIcs(GOOGLE_CON_EXCEPCIONES);

  const uids = eventos.map((e) => e.ics_uid);
  assertEquals(
    uids.length,
    new Set(uids).size,
    `dos eventos con el mismo ics_uid rompen la importación: ${uids.join(', ')}`,
  );

  const serie = eventos.find((e) => e.repite === 'semanal');
  const movida = eventos.find((e) => e.titulo.includes('más tarde'));

  assert(serie, 'tiene que quedar la serie');
  assert(movida, 'y la semana movida como evento propio');
  assertEquals(movida.ics_uid, 'abc123@google.com#2026-10-13');
  assertEquals(aHora(movida.inicio), '20:30');
  assertEquals(movida.repite, 'no', 'la instancia suelta no se repite');
});

Deno.test('la serie no dibuja los días que se movieron ni los cancelados', () => {
  const { eventos } = parsearIcs(GOOGLE_CON_EXCEPCIONES);
  const serie = eventos.find((e) => e.repite === 'semanal');

  assertEquals(
    [...serie.exdates].sort(),
    ['2026-10-13', '2026-10-20'],
    'el día movido y el borrado tienen que quedar tapados en la serie',
  );
});

Deno.test('una instancia suelta que viene antes que su serie también tapa', () => {
  // El orden adentro del archivo no está garantizado por el RFC.
  const alReves = GOOGLE_CON_EXCEPCIONES.split('BEGIN:VEVENT');
  const texto = alReves[0] + 'BEGIN:VEVENT' + alReves[2] +
    'BEGIN:VEVENT' + alReves[1].replace('END:VCALENDAR', '') +
    'BEGIN:VEVENT' + alReves[3];

  const { eventos } = parsearIcs(texto);
  const serie = eventos.find((e) => e.repite === 'semanal');
  assert(serie.exdates.includes('2026-10-13'), 'tendría que estar tapado igual');
});
