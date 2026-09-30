// ============================================================================
//  Generacion del feed .ics del hogar.
//
//  La logica vive aca, separada de la capa HTTP, y recibe la funcion de consulta
//  inyectada. Asi se puede probar el archivo que sale sin levantar una base ni
//  un servidor (ver feed.test.ts), que es justo lo que hace falta: un .ics mal
//  armado no da error, simplemente el celular no muestra nada.
// ============================================================================
// El expansor de repeticiones se reusa TAL CUAL del frontend, no se copia: es
// la misma función que dibuja el calendario en la app, y ya tiene una prueba
// que la compara contra ICAL.js caso por caso. Una segunda implementación acá
// sería una tercera cosa que mantener sincronizada.
import { ocurrencias } from '../../../js/lib/fechas.js';
import {
  armarIcs,
  armarRrule,
  esc,
  fechaHoraIcs,
  fechaIcs,
  fechaSueltaIcs,
  partesLocales,
  ZONA,
  utcIcs,
  VTIMEZONE,
} from './ics-build.ts';

export const ES_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMOJI_CATEGORIA: Record<string, string> = {
  hijo: '🧒',
  colegio: '🎒',
  salud: '🩺',
  pareja: '❤️',
  trabajo: '💼',
  cumple: '🎂',
  tramite: '📄',
  familia: '🏠',
  otro: '📌',
};

export interface Evento {
  id: string;
  titulo: string;
  detalle: string | null;
  lugar: string | null;
  categoria: string;
  inicio: string;
  fin: string | null;
  todo_el_dia: boolean;
  persona_id: string | null;
  repite: string;
  repite_dias: number[] | null;
  repite_hasta: string | null;
  aviso_minutos: number | null;
  updated_at: string;
  ag_ocurrencias?: { fecha: string; estado: string }[];
}

export interface Persona {
  id: string;
  nombre: string;
  emoji: string;
}

export interface ComidaMenu {
  id: string;
  fecha: string;
  momento: string;
  titulo: string;
}

// Lo unico que el feed necesita del mundo exterior: una funcion que resuelva una
// ruta de PostgREST. En produccion pega contra Supabase; en las pruebas devuelve
// datos de mentira.
export type Consultar = <T>(ruta: string) => Promise<T>;

export interface Resultado {
  status: number;
  cuerpo: string;
  headers: Record<string, string>;
}

function textoPlano(status: number, cuerpo: string): Resultado {
  return {
    status,
    cuerpo,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  };
}

// ---------------------------------------------------------------------------
//  Resúmenes: el aviso de los lunes y el de cada día
//
//  Son eventos de todo el día, inventados por el feed, que no existen en la
//  base. Sirven para lo que un calendario no sabe hacer solo: juntar en un
//  renglón "esta semana tenés esto" y "hoy hay que hacer esto".
//
//  El título es lo que se ve en la notificación del celular, así que lleva la
//  cuenta adelante. El detalle va en DESCRIPTION, que es lo que se ve al
//  abrirlo.
// ---------------------------------------------------------------------------

export interface Tarea {
  id: string;
  titulo: string;
  vence: string | null;
  hecha: boolean;
  persona_id: string | null;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** aaaa-mm-dd de un Date, en hora de Buenos Aires. */
function diaDe(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);
}

function sumar(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** El lunes de la semana de esa fecha. */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  return sumar(fecha, dow === 0 ? -6 : 1 - dow);
}

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MES_CORTO = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function diaYMes(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number);
  return `${d} ${MES_CORTO[m - 1]}`;
}

/**
 * Un evento de todo el día con alarma, para los resúmenes.
 *
 * El TRIGGER es positivo y relativo al arranque: un evento de todo el día
 * empieza a la medianoche, así que PT8H cae a las 8 de la mañana. Con un
 * trigger negativo la alarma sonaría la noche anterior.
 */
function eventoResumen(opciones: {
  uid: string;
  fecha: string;
  titulo: string;
  detalle: string;
  horaAviso: number;
  ahora: string;
  categoria: string;
}): string[] {
  const { uid, fecha, titulo, detalle, horaAviso, ahora, categoria } = opciones;
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${ahora}`,
    `DTSTART;VALUE=DATE:${fechaSueltaIcs(fecha)}`,
    `DTEND;VALUE=DATE:${fechaSueltaIcs(sumar(fecha, 1))}`,
    `SUMMARY:${esc(titulo)}`,
    `DESCRIPTION:${esc(detalle)}`,
    `CATEGORIES:${esc(categoria)}`,
    // No ocupa el día: es un recordatorio, no un compromiso.
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(titulo)}`,
    `TRIGGER:PT${horaAviso}H`,
    'END:VALARM',
    'END:VEVENT',
  ];
}

export async function generarFeed(
  url: URL,
  consultar: Consultar,
): Promise<Resultado> {
  const hogarId = url.searchParams.get('hogar') ?? '';
  const token = url.searchParams.get('token') ?? '';
  const incluir = (url.searchParams.get('incluir') ?? '').split(',');
  const personaFiltro = url.searchParams.get('persona') ?? '';
  // A qué hora suenan los resúmenes. Entre las 0 y las 23; por defecto a las 8.
  const horaAviso = Math.min(
    Math.max(Number(url.searchParams.get('hora') ?? 8) || 8, 0),
    23,
  );

  if (!ES_UUID.test(hogarId) || !ES_UUID.test(token)) {
    return textoPlano(400, 'Faltan o están mal los parámetros hogar y token.');
  }

  // ---- el token es la credencial -------------------------------------------
  const hogares = await consultar<{ id: string; nombre: string }[]>(
    `ag_hogares?id=eq.${hogarId}&feed_token=eq.${token}&select=id,nombre&limit=1`,
  );
  if (!hogares.length) {
    // Mismo mensaje para hogar inexistente y token equivocado: no conviene
    // confirmarle a nadie que un id de hogar existe.
    return textoPlano(404, 'Ese calendario no existe o el link ya no es válido.');
  }
  const hogar = hogares[0];

  // ---- eventos --------------------------------------------------------------
  // Se traen los de los ultimos 6 meses (algo de historia ayuda a que el
  // calendario no se vea vacio) y todos los que se repiten, sin importar cuando
  // arrancaron.
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 6);
  // Sin milisegundos: PostgREST corta el valor en el segundo punto y
  // "...00.000Z" le deja un punto de mas.
  const desdeIso = desde.toISOString().slice(0, 19) + 'Z';

  // Todas las condiciones van dentro de un solo and=(...): si se mandan dos
  // parametros or= por separado, PostgREST se queda con uno y el filtro por
  // persona no tendria efecto.
  const condiciones = [`or(inicio.gte.${desdeIso},repite.neq.no)`];
  if (ES_UUID.test(personaFiltro)) {
    // Lo de esa persona, mas lo que es de toda la casa (sin persona asignada).
    condiciones.push(`or(persona_id.eq.${personaFiltro},persona_id.is.null)`);
  }

  const [eventos, personas] = await Promise.all([
    consultar<Evento[]>(
      `ag_eventos?hogar_id=eq.${hogarId}` +
        `&and=(${condiciones.join(',')})` +
        `&select=id,titulo,detalle,lugar,categoria,inicio,fin,todo_el_dia,persona_id,` +
        `repite,repite_dias,repite_hasta,aviso_minutos,updated_at,ag_ocurrencias(fecha,estado)` +
        `&order=inicio.asc&limit=2000`,
    ),
    consultar<Persona[]>(
      `ag_personas?hogar_id=eq.${hogarId}&select=id,nombre,emoji`,
    ),
  ]);

  const porId = new Map(personas.map((p) => [p.id, p]));

  // ---- armado ---------------------------------------------------------------
  const ahora = utcIcs(new Date());
  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//juntos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(hogar.nombre)}`,
    `X-WR-CALDESC:${esc('Agenda familiar de ' + hogar.nombre)}`,
    `X-WR-TIMEZONE:${ZONA}`,
    // Cada cuanto conviene que el cliente vuelva a mirar.
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
    'X-PUBLISHED-TTL:PT2H',
    ...VTIMEZONE,
  ];

  for (const e of eventos) {
    const inicio = partesLocales(e.inicio);
    const persona = e.persona_id ? porId.get(e.persona_id) : undefined;
    const emoji = EMOJI_CATEGORIA[e.categoria] ?? '📌';

    // El titulo dice de quien es: en el calendario del celular esto se mezcla
    // con todo lo demas, asi que "🧒 Natación (Tomás)" se entiende de una.
    const titulo = persona
      ? `${emoji} ${e.titulo} (${persona.nombre})`
      : `${emoji} ${e.titulo}`;

    lineas.push('BEGIN:VEVENT');
    lineas.push(`UID:${e.id}@nuestra-agenda`);
    lineas.push(`DTSTAMP:${ahora}`);
    // SEQUENCE sube en cada edicion para que el calendario del celular
    // actualice el evento en vez de ignorarlo. En minutos, asi el numero no se
    // acerca al techo de los enteros de 32 bits.
    lineas.push(
      `SEQUENCE:${Math.floor(new Date(e.updated_at).getTime() / 60000)}`,
    );

    if (e.todo_el_dia) {
      lineas.push(`DTSTART;VALUE=DATE:${fechaIcs(inicio)}`);
      // En un evento de todo el dia el DTEND es EXCLUSIVO: va el dia siguiente.
      const finDia = e.fin ? partesLocales(e.fin) : inicio;
      const d = new Date(Date.UTC(finDia.anio, finDia.mes - 1, finDia.dia));
      d.setUTCDate(d.getUTCDate() + 1);
      lineas.push(`DTEND;VALUE=DATE:${fechaSueltaIcs(d.toISOString())}`);
    } else {
      lineas.push(`DTSTART;TZID=${ZONA}:${fechaHoraIcs(inicio)}`);
      const fin = e.fin
        ? partesLocales(e.fin)
        // Sin hora de fin, una hora por defecto, que es lo que espera
        // cualquier calendario.
        : partesLocales(new Date(new Date(e.inicio).getTime() + 3600_000));
      lineas.push(`DTEND;TZID=${ZONA}:${fechaHoraIcs(fin)}`);
    }

    const rrule = armarRrule(
      e.repite,
      e.repite_dias,
      e.repite_hasta,
      e.todo_el_dia,
      inicio,
    );
    if (rrule) {
      lineas.push(`RRULE:${rrule}`);

      // Las veces que se cancelaron puntualmente salen como EXDATE, con el
      // mismo tipo y la misma hora que el DTSTART.
      const canceladas = (e.ag_ocurrencias ?? [])
        .filter((o) => o.estado === 'cancelado')
        .map((o) => o.fecha.slice(0, 10))
        .sort();

      for (const fecha of canceladas) {
        if (e.todo_el_dia) {
          lineas.push(`EXDATE;VALUE=DATE:${fechaSueltaIcs(fecha)}`);
        } else {
          const [a, m, d] = fecha.split('-').map(Number);
          lineas.push(
            `EXDATE;TZID=${ZONA}:${
              fechaHoraIcs({ ...inicio, anio: a, mes: m, dia: d })
            }`,
          );
        }
      }
    }

    lineas.push(`SUMMARY:${esc(titulo)}`);
    if (e.lugar) lineas.push(`LOCATION:${esc(e.lugar)}`);
    if (e.detalle) lineas.push(`DESCRIPTION:${esc(e.detalle)}`);
    lineas.push(`CATEGORIES:${esc(e.categoria)}`);
    lineas.push('TRANSP:OPAQUE');

    // El recordatorio: esto es lo que hace sonar el celular.
    if (e.aviso_minutos && e.aviso_minutos > 0) {
      lineas.push('BEGIN:VALARM');
      lineas.push('ACTION:DISPLAY');
      lineas.push(`DESCRIPTION:${esc(titulo)}`);
      lineas.push(`TRIGGER:-PT${Math.round(e.aviso_minutos)}M`);
      lineas.push('END:VALARM');
    }

    lineas.push('END:VEVENT');
  }

  // ---- tareas y resúmenes ---------------------------------------------------
  // Las tareas se traen si hace falta para alguno de los dos avisos.
  const quiereTareas = incluir.includes('tareas') || incluir.includes('diario');
  const quiereSemanal = incluir.includes('semanal');

  let tareas: Tarea[] = [];
  if (quiereTareas || quiereSemanal) {
    const desdeTareas = sumar(diaDe(new Date()), -7);
    tareas = await consultar<Tarea[]>(
      `ag_tareas?hogar_id=eq.${hogarId}&vence=gte.${desdeTareas}` +
        `&select=id,titulo,vence,hecha,persona_id&order=vence.asc&limit=600`,
    );
  }

  const hoyStr = diaDe(new Date());

  // --- cada tarea con fecha, como evento del día ---
  if (incluir.includes('tareas')) {
    for (const t of tareas) {
      if (!t.vence) continue;
      const fecha = t.vence.slice(0, 10);
      const duena = t.persona_id ? porId.get(t.persona_id) : undefined;
      const titulo = `${t.hecha ? '✅' : '☑️'} ${t.titulo}` +
        (duena ? ` (${duena.nombre})` : '');

      lineas.push('BEGIN:VEVENT');
      lineas.push(`UID:tarea-${t.id}@nuestra-agenda`);
      lineas.push(`DTSTAMP:${ahora}`);
      lineas.push(`DTSTART;VALUE=DATE:${fechaSueltaIcs(fecha)}`);
      lineas.push(`DTEND;VALUE=DATE:${fechaSueltaIcs(sumar(fecha, 1))}`);
      lineas.push(`SUMMARY:${esc(titulo)}`);
      lineas.push('CATEGORIES:tarea');
      lineas.push('TRANSP:TRANSPARENT');
      lineas.push('END:VEVENT');
    }
  }

  // --- el aviso de cada día: las tareas que vencen hoy ---
  if (incluir.includes('diario')) {
    // Solo los días que tienen algo: un aviso vacío todos los días deja de
    // avisar nada a la semana.
    const porDia = new Map<string, Tarea[]>();
    for (const t of tareas) {
      if (!t.vence || t.hecha) continue;
      const f = t.vence.slice(0, 10);
      // Ni el pasado lejano ni más de dos meses adelante.
      if (f < hoyStr || f > sumar(hoyStr, 60)) continue;
      if (!porDia.has(f)) porDia.set(f, []);
      porDia.get(f)!.push(t);
    }

    for (const [fecha, delDia] of [...porDia.entries()].sort()) {
      const n = delDia.length;
      const titulo = n === 1
        ? `☑️ Hoy: ${delDia[0].titulo}`
        : `☑️ Hoy hay ${n} tareas`;
      const detalle = delDia
        .map((t) => {
          const duena = t.persona_id ? porId.get(t.persona_id) : undefined;
          return `• ${t.titulo}${duena ? ` — ${duena.nombre}` : ''}`;
        })
        .join('\n');

      lineas.push(...eventoResumen({
        uid: `dia-${fecha}@nuestra-agenda`,
        fecha,
        titulo,
        detalle,
        horaAviso,
        ahora,
        categoria: 'resumen',
      }));
    }
  }

  // --- el aviso de los lunes: todo lo de la semana ---
  if (quiereSemanal) {
    // Ocho semanas alcanzan: el calendario vuelve a pedir el feed cada dos
    // horas, así que siempre hay resumen para adelante.
    for (let n = 0; n < 8; n++) {
      const lunes = sumar(lunesDe(hoyStr), n * 7);
      const domingo = sumar(lunes, 6);

      // Las veces que cae cada evento en esa semana, con el mismo expansor que
      // usa la app para dibujar el calendario.
      const delaSemana: { fecha: string; texto: string }[] = [];
      for (const e of eventos) {
        for (const fecha of ocurrencias(e, lunes, domingo) as string[]) {
          const cancelada = (e.ag_ocurrencias ?? []).some(
            (o) => o.fecha.slice(0, 10) === fecha && o.estado === 'cancelado',
          );
          if (cancelada) continue;
          const p = e.persona_id ? porId.get(e.persona_id) : undefined;
          const hora = e.todo_el_dia
            ? ''
            : `${pad2(partesLocales(e.inicio).hora)}:${pad2(partesLocales(e.inicio).minuto)} `;
          const [, , d] = fecha.split('-').map(Number);
          const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
          delaSemana.push({
            fecha,
            texto: `• ${DIA_CORTO[dow]} ${d} · ${hora}${e.titulo}` +
              (p ? ` (${p.nombre})` : ''),
          });
        }
      }
      delaSemana.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

      const pendientes = tareas.filter(
        (t) => !t.hecha && t.vence && t.vence.slice(0, 10) >= lunes &&
          t.vence.slice(0, 10) <= domingo,
      );

      const partesTitulo = [];
      if (delaSemana.length) {
        partesTitulo.push(
          `${delaSemana.length} ${delaSemana.length === 1 ? 'actividad' : 'actividades'}`,
        );
      }
      if (pendientes.length) {
        partesTitulo.push(
          `${pendientes.length} ${pendientes.length === 1 ? 'tarea' : 'tareas'}`,
        );
      }

      const titulo = partesTitulo.length
        ? `📋 La semana: ${partesTitulo.join(' y ')}`
        : '📋 La semana viene tranquila';

      const detalle = [
        `Del ${diaYMes(lunes)} al ${diaYMes(domingo)}.`,
        '',
        delaSemana.length ? 'AGENDA' : 'Sin nada anotado en la agenda.',
        ...delaSemana.map((x) => x.texto),
        ...(pendientes.length
          ? ['', 'TAREAS', ...pendientes.map((t) => {
            const duena = t.persona_id ? porId.get(t.persona_id) : undefined;
            return `• ${t.titulo}${duena ? ` — ${duena.nombre}` : ''}`;
          })]
          : []),
      ].join('\n');

      lineas.push(...eventoResumen({
        uid: `semana-${lunes}@nuestra-agenda`,
        fecha: lunes,
        titulo,
        detalle,
        horaAviso,
        ahora,
        categoria: 'resumen',
      }));
    }
  }

  // ---- menu de la semana (opcional) -----------------------------------------
  if (incluir.includes('menu')) {
    const hace7 = new Date();
    hace7.setDate(hace7.getDate() - 7);
    const menu = await consultar<ComidaMenu[]>(
      `ag_menu?hogar_id=eq.${hogarId}&fecha=gte.${
        hace7.toISOString().slice(0, 10)
      }&select=id,fecha,momento,titulo&order=fecha.asc&limit=400`,
    );

    for (const m of menu) {
      const siguiente = new Date(`${m.fecha.slice(0, 10)}T12:00:00Z`);
      siguiente.setUTCDate(siguiente.getUTCDate() + 1);

      lineas.push('BEGIN:VEVENT');
      lineas.push(`UID:menu-${m.id}@nuestra-agenda`);
      lineas.push(`DTSTAMP:${ahora}`);
      lineas.push(`DTSTART;VALUE=DATE:${fechaSueltaIcs(m.fecha)}`);
      lineas.push(`DTEND;VALUE=DATE:${fechaSueltaIcs(siguiente.toISOString())}`);
      lineas.push(
        `SUMMARY:${
          esc(`🍽 ${m.momento === 'almuerzo' ? 'Almuerzo' : 'Cena'}: ${m.titulo}`)
        }`,
      );
      lineas.push('CATEGORIES:menu');
      // TRANSPARENT: no ocupa el dia como si fuera un compromiso.
      lineas.push('TRANSP:TRANSPARENT');
      lineas.push('END:VEVENT');
    }
  }

  lineas.push('END:VCALENDAR');

  return {
    status: 200,
    cuerpo: armarIcs(lineas),
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="nuestra-agenda.ics"',
      // Los calendarios consultan seguido; media hora de cache alcanza y evita
      // golpear la base todo el tiempo.
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
    },
  };
}
