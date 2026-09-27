// ============================================================================
//  Generacion del feed .ics del hogar.
//
//  La logica vive aca, separada de la capa HTTP, y recibe la funcion de consulta
//  inyectada. Asi se puede probar el archivo que sale sin levantar una base ni
//  un servidor (ver feed.test.ts), que es justo lo que hace falta: un .ics mal
//  armado no da error, simplemente el celular no muestra nada.
// ============================================================================
import {
  armarIcs,
  armarRrule,
  esc,
  fechaHoraIcs,
  fechaIcs,
  fechaSueltaIcs,
  partesLocales,
  TZ,
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

export async function generarFeed(
  url: URL,
  consultar: Consultar,
): Promise<Resultado> {
  const hogarId = url.searchParams.get('hogar') ?? '';
  const token = url.searchParams.get('token') ?? '';
  const incluir = (url.searchParams.get('incluir') ?? '').split(',');
  const personaFiltro = url.searchParams.get('persona') ?? '';

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
    'PRODID:-//Nuestra Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(hogar.nombre)}`,
    `X-WR-CALDESC:${esc('Agenda familiar de ' + hogar.nombre)}`,
    `X-WR-TIMEZONE:${TZ}`,
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
      lineas.push(`DTSTART;TZID=${TZ}:${fechaHoraIcs(inicio)}`);
      const fin = e.fin
        ? partesLocales(e.fin)
        // Sin hora de fin, una hora por defecto, que es lo que espera
        // cualquier calendario.
        : partesLocales(new Date(new Date(e.inicio).getTime() + 3600_000));
      lineas.push(`DTEND;TZID=${TZ}:${fechaHoraIcs(fin)}`);
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
            `EXDATE;TZID=${TZ}:${
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
