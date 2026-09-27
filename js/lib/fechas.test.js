// ============================================================================
//  Pruebas de fechas.js
//
//  La parte importante es el ultimo bloque: compara la expansion de
//  repeticiones del frontend contra la expansion del RRULE que arma el feed,
//  usando ICAL.js como juez. Si las dos no dan lo mismo, la app muestra una
//  cosa y el calendario del celular otra, que es el peor bug posible en una
//  agenda compartida.
//
//  Se corre con:  deno test --allow-net --allow-env --allow-read js/
// ============================================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import ICAL from 'npm:ical.js@2';
import {
  aFecha,
  aHora,
  combinarFechaHora,
  diaSemana,
  diasEntre,
  duracionMin,
  faltaPara,
  fechaHumana,
  fechaLarga,
  fechaValida,
  finSemana,
  grillaMes,
  inicioSemana,
  ocurrencias,
  rangoSemanaHumano,
  semanaDe,
  sumarDias,
  sumarMeses,
} from './fechas.js';
import { armarRrule, partesLocales } from '../../supabase/functions/_shared/ics-build.ts';

// ---------------------------------------------------------------------------
//  Conversiones
// ---------------------------------------------------------------------------

Deno.test('aFecha da el día que era en Buenos Aires, no en UTC', () => {
  // 01:00Z del 28 son las 22:00 del 27 acá: el día es el 27.
  assertEquals(aFecha('2026-09-28T01:00:00Z'), '2026-09-27');
  assertEquals(aFecha('2026-09-28T03:00:00Z'), '2026-09-28'); // 00:00 local
  assertEquals(aFecha('2026-09-28T02:59:00Z'), '2026-09-27'); // 23:59 local
});

Deno.test('aHora muestra la hora local y la medianoche como 00:00', () => {
  assertEquals(aHora('2026-09-29T22:00:00Z'), '19:00');
  assertEquals(aHora('2026-09-28T03:00:00Z'), '00:00');
  assertEquals(aHora('2026-09-28T02:30:00Z'), '23:30');
});

Deno.test('combinarFechaHora escribe el offset de Buenos Aires', () => {
  assertEquals(combinarFechaHora('2026-09-29', '19:00'), '2026-09-29T19:00:00-03:00');
  // Y el instante resultante es el correcto.
  assertEquals(
    new Date(combinarFechaHora('2026-09-29', '19:00')).toISOString(),
    '2026-09-29T22:00:00.000Z',
  );
  // Rellena la hora con cero adelante.
  assertEquals(combinarFechaHora('2026-09-29', '9:05'), '2026-09-29T09:05:00-03:00');
  // Sin hora válida, medianoche.
  assertEquals(combinarFechaHora('2026-09-29', ''), '2026-09-29T00:00:00-03:00');
  assertEquals(combinarFechaHora('2026-09-29', 'cualquiera'), '2026-09-29T00:00:00-03:00');
});

Deno.test('ida y vuelta: guardar y volver a mostrar da lo mismo', () => {
  for (const hora of ['00:00', '07:30', '12:00', '19:45', '23:59']) {
    const iso = combinarFechaHora('2026-07-15', hora);
    assertEquals(aHora(iso), hora, `se perdió la hora ${hora}`);
    assertEquals(aFecha(iso), '2026-07-15', `se corrió el día con ${hora}`);
  }
});

Deno.test('fechaValida rechaza lo que no existe', () => {
  assert(fechaValida('2026-02-28'));
  assert(fechaValida('2028-02-29'), '2028 es bisiesto');
  assert(!fechaValida('2026-02-29'), '2026 no es bisiesto');
  assert(!fechaValida('2026-02-31'));
  assert(!fechaValida('2026-13-01'));
  assert(!fechaValida('2026-00-10'));
  assert(!fechaValida('mañana'));
  assert(!fechaValida(''));
  assert(!fechaValida(null));
});

// ---------------------------------------------------------------------------
//  Cuentas de días
// ---------------------------------------------------------------------------

Deno.test('sumarDias cruza meses y años', () => {
  assertEquals(sumarDias('2026-09-29', 1), '2026-09-30');
  assertEquals(sumarDias('2026-09-30', 1), '2026-10-01');
  assertEquals(sumarDias('2026-12-31', 1), '2027-01-01');
  assertEquals(sumarDias('2026-01-01', -1), '2025-12-31');
  assertEquals(sumarDias('2028-02-28', 1), '2028-02-29');
  assertEquals(sumarDias('2026-02-28', 1), '2026-03-01');
  assertEquals(sumarDias('2026-03-01', 0), '2026-03-01');
});

Deno.test('sumarMeses recorta al último día cuando el mes es más corto', () => {
  assertEquals(sumarMeses('2026-01-31', 1), '2026-02-28');
  assertEquals(sumarMeses('2028-01-31', 1), '2028-02-29');
  assertEquals(sumarMeses('2026-03-31', 1), '2026-04-30');
  assertEquals(sumarMeses('2026-12-15', 1), '2027-01-15');
  assertEquals(sumarMeses('2026-01-15', -1), '2025-12-15');
});

Deno.test('diaSemana con 0 = domingo', () => {
  assertEquals(diaSemana('2026-09-27'), 0); // domingo
  assertEquals(diaSemana('2026-09-28'), 1); // lunes
  assertEquals(diaSemana('2026-09-29'), 2); // martes
  assertEquals(diaSemana('2026-10-03'), 6); // sábado
});

Deno.test('diasEntre cuenta bien en los dos sentidos', () => {
  assertEquals(diasEntre('2026-09-01', '2026-09-08'), 7);
  assertEquals(diasEntre('2026-09-08', '2026-09-01'), -7);
  assertEquals(diasEntre('2026-09-01', '2026-09-01'), 0);
  assertEquals(diasEntre('2025-12-31', '2026-01-01'), 1);
});

Deno.test('la semana arranca el lunes y el domingo la cierra', () => {
  // Domingo 27/9: su semana es la del lunes 21.
  assertEquals(inicioSemana('2026-09-27'), '2026-09-21');
  assertEquals(finSemana('2026-09-27'), '2026-09-27');
  // Lunes 28/9.
  assertEquals(inicioSemana('2026-09-28'), '2026-09-28');
  assertEquals(finSemana('2026-09-28'), '2026-10-04');
  // Miércoles 30/9.
  assertEquals(inicioSemana('2026-09-30'), '2026-09-28');
});

Deno.test('semanaDe devuelve los 7 días de lunes a domingo', () => {
  assertEquals(semanaDe('2026-09-30'), [
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01',
    '2026-10-02', '2026-10-03', '2026-10-04',
  ]);
});

Deno.test('grillaMes da semanas completas y marca los días del mes', () => {
  const g = grillaMes(2026, 10); // octubre 2026: arranca jueves 1
  assertEquals(g.length % 7, 0, 'siempre semanas completas');
  assertEquals(g[0].fecha, '2026-09-28', 'empieza el lunes anterior');
  assertEquals(g[0].delMes, false);
  assertEquals(g.at(-1).fecha, '2026-11-01', 'termina el domingo siguiente');
  assertEquals(g.filter((d) => d.delMes).length, 31, 'octubre tiene 31 días');

  // Febrero de un año bisiesto que arranca justo un lunes es el caso borde.
  const f = grillaMes(2027, 2);
  assertEquals(f.length % 7, 0);
  assertEquals(f.filter((d) => d.delMes).length, 28);
});

// ---------------------------------------------------------------------------
//  Textos
// ---------------------------------------------------------------------------

Deno.test('fechaHumana usa palabras para los días cercanos', () => {
  const ref = '2026-09-29';
  assertEquals(fechaHumana('2026-09-29', ref), 'Hoy');
  assertEquals(fechaHumana('2026-09-30', ref), 'Mañana');
  assertEquals(fechaHumana('2026-09-28', ref), 'Ayer');
  assertEquals(fechaHumana('2026-10-01', ref), 'Pasado mañana');
  assertEquals(fechaHumana('2026-10-05', ref), 'lun 5 de oct');
  // Otro año: se aclara.
  assertEquals(fechaHumana('2027-01-05', ref), 'mar 5 de ene de 2027');
});

Deno.test('fechaLarga y rangoSemanaHumano', () => {
  assertEquals(fechaLarga('2026-09-29'), 'martes 29 de septiembre');
  assertEquals(rangoSemanaHumano('2026-09-30'), '28 sep al 4 oct');
  assertEquals(rangoSemanaHumano('2026-10-07'), '5 al 11 de oct');
});

Deno.test('faltaPara redondea en lenguaje natural', () => {
  const ahora = new Date('2026-09-29T12:00:00-03:00');
  const en = (min) => new Date(ahora.getTime() + min * 60000);
  assertEquals(faltaPara(en(0), ahora), 'ahora');
  assertEquals(faltaPara(en(20), ahora), 'en 20 min');
  assertEquals(faltaPara(en(120), ahora), 'en 2 h');
  assertEquals(faltaPara(en(60 * 48), ahora), 'en 2 días');
  assertEquals(faltaPara(en(-10), ahora), 'arrancó hace un rato');
  assertEquals(faltaPara(en(-120), ahora), 'ya pasó');
});

Deno.test('duracionMin sale del inicio y el fin, o una hora', () => {
  assertEquals(duracionMin({ inicio: '2026-09-29T22:00:00Z', fin: '2026-09-29T23:30:00Z' }), 90);
  assertEquals(duracionMin({ inicio: '2026-09-29T22:00:00Z', fin: null }), 60);
  // Un fin anterior al inicio es un dato roto: se ignora.
  assertEquals(duracionMin({ inicio: '2026-09-29T22:00:00Z', fin: '2026-09-29T21:00:00Z' }), 60);
});

// ---------------------------------------------------------------------------
//  Repeticiones
// ---------------------------------------------------------------------------

const MARTES = '2026-09-29T22:00:00Z'; // martes 29/9 19:00 local

function ev(extra = {}) {
  return {
    inicio: MARTES,
    todo_el_dia: false,
    repite: 'no',
    repite_dias: [],
    repite_hasta: null,
    ...extra,
  };
}

Deno.test('un evento que no se repite aparece solo si cae en el rango', () => {
  assertEquals(ocurrencias(ev(), '2026-09-01', '2026-10-31'), ['2026-09-29']);
  assertEquals(ocurrencias(ev(), '2026-09-29', '2026-09-29'), ['2026-09-29']);
  assertEquals(ocurrencias(ev(), '2026-10-01', '2026-10-31'), []);
  assertEquals(ocurrencias(ev(), '2026-08-01', '2026-08-31'), []);
});

Deno.test('no hay ocurrencias antes de la primera vez', () => {
  const r = ocurrencias(ev({ repite: 'diario' }), '2026-09-01', '2026-10-02');
  assertEquals(r, ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
});

Deno.test('semanal con días elegidos', () => {
  const r = ocurrencias(
    ev({ repite: 'semanal', repite_dias: [2, 4] }), // martes y jueves
    '2026-09-28',
    '2026-10-15',
  );
  assertEquals(r, [
    '2026-09-29', '2026-10-01', '2026-10-06',
    '2026-10-08', '2026-10-13', '2026-10-15',
  ]);
});

Deno.test('semanal sin días elegidos usa el día de la primera vez', () => {
  const r = ocurrencias(ev({ repite: 'semanal' }), '2026-09-28', '2026-10-20');
  assertEquals(r, ['2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20']);
});

Deno.test('semanal que incluye el domingo lo pone al final de la semana', () => {
  // Un evento que arranca el lunes 28 y repite lunes (1) y domingo (0).
  const r = ocurrencias(
    ev({ inicio: '2026-09-28T15:00:00Z', repite: 'semanal', repite_dias: [1, 0] }),
    '2026-09-28',
    '2026-10-11',
  );
  // El domingo cierra la semana del lunes, no la abre.
  assertEquals(r, ['2026-09-28', '2026-10-04', '2026-10-05', '2026-10-11']);
});

Deno.test('repite_hasta corta la serie', () => {
  const r = ocurrencias(
    ev({ repite: 'diario', repite_hasta: '2026-10-02' }),
    '2026-09-01',
    '2026-12-31',
  );
  assertEquals(r, ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
});

Deno.test('quincenal cuenta de 14 en 14 desde la primera vez', () => {
  const r = ocurrencias(ev({ repite: 'quincenal' }), '2026-09-01', '2026-11-30');
  assertEquals(r, ['2026-09-29', '2026-10-13', '2026-10-27', '2026-11-10', '2026-11-24']);
});

Deno.test('quincenal no se descoloca si el rango arranca tarde', () => {
  // Mirando solo noviembre, las fechas tienen que seguir la serie del 29/9.
  const r = ocurrencias(ev({ repite: 'quincenal' }), '2026-11-01', '2026-11-30');
  assertEquals(r, ['2026-11-10', '2026-11-24']);
});

Deno.test('mensual repite el mismo número de día', () => {
  const r = ocurrencias(ev({ repite: 'mensual' }), '2026-09-01', '2027-01-31');
  assertEquals(r, ['2026-09-29', '2026-10-29', '2026-11-29', '2026-12-29', '2027-01-29']);
});

Deno.test('mensual saltea los meses que no tienen ese día', () => {
  // Un evento el 31: febrero, abril, junio... no lo tienen.
  const r = ocurrencias(
    ev({ inicio: '2026-01-31T15:00:00Z', repite: 'mensual' }),
    '2026-01-01',
    '2026-06-30',
  );
  assertEquals(r, ['2026-01-31', '2026-03-31', '2026-05-31']);
});

Deno.test('anual, y el 29 de febrero solo en año bisiesto', () => {
  const cumple = ocurrencias(
    ev({ inicio: '2026-10-15T15:00:00Z', repite: 'anual', todo_el_dia: true }),
    '2026-01-01',
    '2029-12-31',
  );
  assertEquals(cumple, ['2026-10-15', '2027-10-15', '2028-10-15', '2029-10-15']);

  const bisiesto = ocurrencias(
    ev({ inicio: '2028-02-29T15:00:00Z', repite: 'anual', todo_el_dia: true }),
    '2028-01-01',
    '2033-12-31',
  );
  assertEquals(bisiesto, ['2028-02-29', '2032-02-29']);
});

Deno.test('un inicio inválido no rompe nada', () => {
  assertEquals(ocurrencias({ inicio: 'cualquiera', repite: 'diario' }, '2026-09-01', '2026-09-30'), []);
  assertEquals(ocurrencias({ inicio: null, repite: 'no' }, '2026-09-01', '2026-09-30'), []);
});

Deno.test('días de la semana fuera de rango se descartan', () => {
  const r = ocurrencias(
    ev({ repite: 'semanal', repite_dias: [2, 99, -3] }),
    '2026-09-28',
    '2026-10-06',
  );
  assertEquals(r, ['2026-09-29', '2026-10-06']);
});

// ---------------------------------------------------------------------------
//  Lo importante: la app y el celular tienen que coincidir
// ---------------------------------------------------------------------------

// Expande el evento como lo haria un cliente de calendario: se arma el mismo
// RRULE que pone el feed y se deja que ICAL.js lo expanda.
function expandirComoCalendario(evento, hasta) {
  const inicio = partesLocales(evento.inicio);
  const rrule = armarRrule(
    evento.repite,
    evento.repite_dias ?? null,
    evento.repite_hasta ?? null,
    !!evento.todo_el_dia,
    inicio,
  );

  const p = (n) => String(n).padStart(2, '0');
  const dtstart = `${inicio.anio}${p(inicio.mes)}${p(inicio.dia)}` +
    (evento.todo_el_dia ? '' : `T${p(inicio.hora)}${p(inicio.minuto)}00`);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//ES',
    'BEGIN:VEVENT',
    'UID:x@test',
    'DTSTAMP:20260101T000000Z',
    evento.todo_el_dia
      ? `DTSTART;VALUE=DATE:${dtstart}`
      : `DTSTART;TZID=America/Argentina/Buenos_Aires:${dtstart}`,
    ...(rrule ? [`RRULE:${rrule}`] : []),
    'SUMMARY:test',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const comp = new ICAL.Component(ICAL.parse(ics));
  const vevent = comp.getAllSubcomponents('vevent')[0];
  const ev = new ICAL.Event(vevent);

  const fechas = [];
  if (!ev.isRecurring()) {
    const d = ev.startDate;
    return [`${d.year}-${p(d.month)}-${p(d.day)}`];
  }

  const it = ev.iterator();
  for (let n = it.next(); n; n = it.next()) {
    const f = `${n.year}-${p(n.month)}-${p(n.day)}`;
    if (f > hasta) break;
    fechas.push(f);
    if (fechas.length > 400) break; // red de seguridad
  }
  return fechas;
}

const CASOS = [
  ['sin repetición', ev()],
  ['diario', ev({ repite: 'diario', repite_hasta: '2026-10-20' })],
  ['semanal martes y jueves', ev({ repite: 'semanal', repite_dias: [2, 4], repite_hasta: '2026-11-30' })],
  ['semanal sin días', ev({ repite: 'semanal', repite_hasta: '2026-12-31' })],
  ['semanal lunes a viernes', ev({
    inicio: '2026-09-28T11:00:00Z',
    repite: 'semanal',
    repite_dias: [1, 2, 3, 4, 5],
    repite_hasta: '2026-10-31',
  })],
  ['semanal con domingo', ev({
    inicio: '2026-09-28T15:00:00Z',
    repite: 'semanal',
    repite_dias: [0, 1],
    repite_hasta: '2026-11-01',
  })],
  ['quincenal', ev({ repite: 'quincenal', repite_hasta: '2027-01-31' })],
  ['mensual', ev({ repite: 'mensual', repite_hasta: '2027-06-30' })],
  ['mensual el día 31', ev({
    inicio: '2026-01-31T15:00:00Z',
    repite: 'mensual',
    repite_hasta: '2026-12-31',
  })],
  ['anual todo el día', ev({
    inicio: '2026-10-15T15:00:00Z',
    todo_el_dia: true,
    repite: 'anual',
    repite_hasta: '2031-12-31',
  })],
  ['anual 29 de febrero', ev({
    inicio: '2028-02-29T15:00:00Z',
    todo_el_dia: true,
    repite: 'anual',
    repite_hasta: '2040-12-31',
  })],
  ['evento de noche (cruza el día en UTC)', ev({
    inicio: '2026-09-30T02:30:00Z', // 23:30 del 29 local
    repite: 'semanal',
    repite_dias: [2],
    repite_hasta: '2026-11-30',
  })],
  ['evento a medianoche', ev({
    inicio: '2026-09-29T03:00:00Z', // 00:00 del 29 local
    repite: 'diario',
    repite_hasta: '2026-10-10',
  })],
];

for (const [nombre, evento] of CASOS) {
  Deno.test(`la app y el calendario del celular coinciden: ${nombre}`, () => {
    // Un rango bien amplio, para que el que corte sea el repite_hasta.
    const desde = '2020-01-01';
    const hasta = '2041-12-31';

    const enLaApp = ocurrencias(evento, desde, hasta);
    const enElCelular = expandirComoCalendario(evento, hasta);

    assertEquals(
      enLaApp,
      enElCelular,
      `divergen.\n  app:      ${enLaApp.slice(0, 8).join(', ')} (${enLaApp.length})\n` +
        `  celular:  ${enElCelular.slice(0, 8).join(', ')} (${enElCelular.length})`,
    );
    assert(enLaApp.length > 0, 'el caso tiene que generar al menos una fecha');
  });
}
