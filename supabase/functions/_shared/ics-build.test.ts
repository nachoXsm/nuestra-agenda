// Pruebas del armado de .ics.  deno test supabase/functions/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  armarIcs,
  armarRrule,
  esc,
  fechaHoraIcs,
  fechaIcs,
  fechaSueltaIcs,
  partesLocales,
  plegar,
  utcIcs,
} from './ics-build.ts';

Deno.test('esc escapa lo que rompe un .ics', () => {
  assertEquals(esc('Turno; pediatra, 10hs'), 'Turno\\; pediatra\\, 10hs');
  assertEquals(esc('linea1\nlinea2'), 'linea1\\nlinea2');
  assertEquals(esc('c:\\ruta'), 'c:\\\\ruta');
  assertEquals(esc('linea1\r\nlinea2'), 'linea1\\nlinea2');
});

Deno.test('plegar respeta el limite de 75 octetos', () => {
  const corta = 'SUMMARY:Natación';
  assertEquals(plegar(corta), corta, 'una linea corta no se toca');

  const larga = 'DESCRIPTION:' + 'a'.repeat(200);
  const plegada = plegar(larga);
  for (const linea of plegada.split('\r\n')) {
    const bytes = new TextEncoder().encode(linea).length;
    assert(bytes <= 75, `linea de ${bytes} octetos: "${linea}"`);
  }
  // Al desplegar tiene que volver a ser lo mismo.
  assertEquals(plegada.split('\r\n ').join(''), larga);
});

Deno.test('plegar no corta un acento ni un emoji al medio', () => {
  // Los acentos y los emoji ocupan 2 y 4 bytes: si se cortara contando
  // caracteres, quedaria un byte suelto y el archivo se vuelve invalido.
  const linea = 'SUMMARY:' + 'á'.repeat(60) + '🧒'.repeat(10);
  const plegada = plegar(linea);

  for (const parte of plegada.split('\r\n')) {
    assert(new TextEncoder().encode(parte).length <= 75);
  }
  const rearmada = plegada.split('\r\n ').join('');
  assertEquals(rearmada, linea);
  // Y no aparecio ningun caracter de reemplazo.
  assert(!rearmada.includes('\uFFFD'));
});

Deno.test('armarIcs usa CRLF y cierra con salto de linea', () => {
  const salida = armarIcs(['BEGIN:VCALENDAR', 'END:VCALENDAR']);
  assertEquals(salida, 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
});

Deno.test('partesLocales pasa a hora de Buenos Aires', () => {
  // 2026-09-27T22:30:00Z son las 19:30 del 27 en Buenos Aires (-03:00)
  const p = partesLocales('2026-09-27T22:30:00Z');
  assertEquals([p.anio, p.mes, p.dia, p.hora, p.minuto], [2026, 9, 27, 19, 30]);
});

Deno.test('partesLocales cruza bien el cambio de dia', () => {
  // 2026-09-28T01:00:00Z son las 22:00 del 27 en Buenos Aires: dia anterior.
  const p = partesLocales('2026-09-28T01:00:00Z');
  assertEquals([p.anio, p.mes, p.dia, p.hora], [2026, 9, 27, 22]);
});

Deno.test('medianoche local se escribe 000000, no 240000', () => {
  // 03:00Z = 00:00 en Buenos Aires. Algunos runtimes devuelven "24" acá.
  const p = partesLocales('2026-09-28T03:00:00Z');
  assertEquals(p.hora, 0);
  assertEquals(fechaHoraIcs(p), '20260928T000000');
});

Deno.test('formatos de fecha', () => {
  const p = partesLocales('2026-01-05T15:04:09Z'); // 12:04:09 local
  assertEquals(fechaIcs(p), '20260105');
  assertEquals(fechaHoraIcs(p), '20260105T120409');
  assertEquals(utcIcs(new Date('2026-01-05T15:04:09.123Z')), '20260105T150409Z');
});

Deno.test('fechaSueltaIcs no se corre un dia', () => {
  // Pasar "2026-03-01" por Date lo interpreta en UTC y al mostrarlo en hora
  // local de Buenos Aires da el 28 de febrero. Por eso no se usa Date acá.
  assertEquals(fechaSueltaIcs('2026-03-01'), '20260301');
  assertEquals(fechaSueltaIcs('2026-01-01T00:00:00Z'), '20260101');
});

Deno.test('armarRrule para cada tipo de repeticion', () => {
  const inicio = partesLocales('2026-09-27T22:30:00Z'); // 19:30 local

  assertEquals(armarRrule('no', null, null, false, inicio), null);
  assertEquals(armarRrule('diario', null, null, false, inicio), 'FREQ=DAILY');
  // El día y el mes van explícitos en la regla: ver el comentario en
  // armarRrule. Sin eso, cada cliente decide solo qué hacer con el 31 de un mes
  // que no lo tiene, o con un 29 de febrero.
  assertEquals(
    armarRrule('mensual', null, null, false, inicio),
    'FREQ=MONTHLY;BYMONTHDAY=27',
  );
  assertEquals(
    armarRrule('anual', null, null, false, inicio),
    'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=27',
  );
  assertEquals(
    armarRrule('quincenal', null, null, false, inicio),
    'FREQ=WEEKLY;INTERVAL=2',
  );
  // 2=martes, 4=jueves
  assertEquals(
    armarRrule('semanal', [2, 4], null, false, inicio),
    'FREQ=WEEKLY;BYDAY=TU,TH',
  );
  // Semanal sin días: cae en la semana del DTSTART, sin BYDAY.
  assertEquals(armarRrule('semanal', [], null, false, inicio), 'FREQ=WEEKLY');
  // Días fuera de rango se descartan.
  assertEquals(
    armarRrule('semanal', [0, 9, -1, 6], null, false, inicio),
    'FREQ=WEEKLY;BYDAY=SU,SA',
  );
});

Deno.test('el UNTIL usa el mismo tipo que el DTSTART', () => {
  const conHora = partesLocales('2026-09-27T22:30:00Z'); // 19:30 local

  // Evento de todo el día: UNTIL como DATE.
  assertEquals(
    armarRrule('semanal', [1], '2026-12-20', true, conHora),
    'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261220',
  );

  // Evento con hora: UNTIL como instante UTC. 19:30 local = 22:30Z.
  assertEquals(
    armarRrule('semanal', [1], '2026-12-20', false, conHora),
    'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261220T223000Z',
  );
});

Deno.test('el UNTIL cruza bien la medianoche UTC', () => {
  // 22:00 local = 01:00Z del dia siguiente: el UNTIL tiene que saltar de dia.
  const tarde = partesLocales('2026-09-28T01:00:00Z'); // 22:00 del 27 local
  assertEquals(tarde.hora, 22);
  const regla = armarRrule('diario', null, '2026-12-20', false, tarde);
  assertEquals(regla, 'FREQ=DAILY;UNTIL=20261221T010000Z');
});
