// ===========================================================================
//  ics-feed — TODO EN UN ARCHIVO, para pegar en el editor de Supabase.
//
//  ARCHIVO GENERADO. No lo edites acá: los cambios se pierden.
//  El código de verdad está en supabase/functions/ics-feed/index.ts y en
//  supabase/functions/_shared/. Después de tocar cualquiera de los dos:
//
//      node supabase/armar-funciones.mjs
//
//  Es el mismo código, con los archivos de _shared pegados adelante. No pasó
//  por ningún bundler, así que los tipos y los comentarios están intactos.
// ===========================================================================

// ─── _shared/ics-build.ts ────────────────────────────────────────────────

// ============================================================================
//  Armado de archivos .ics (RFC 5545).
//
//  Buenos Aires no usa horario de verano desde 2009, asi que alcanza con una
//  VTIMEZONE de un solo tramo en -03:00. Se emiten las horas como hora local
//  con TZID en vez de pasarlas a UTC: asi las excepciones (EXDATE) coinciden
//  exacto con las ocurrencias, que es donde estos archivos se suelen romper.
// ============================================================================

export const TZ = 'America/Argentina/Buenos_Aires';

export const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'X-LIC-LOCATION:America/Argentina/Buenos_Aires',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0300',
  'TZOFFSETTO:-0300',
  'TZNAME:-03',
  'DTSTART:19700101T000000',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// Texto libre dentro de un .ics: hay que escapar \ ; , y los saltos de linea.
export function esc(texto: string): string {
  return String(texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Las lineas no pueden pasar de 75 octetos: se parten y siguen con un espacio.
// Se corta contando BYTES (no caracteres) para no romper un acento o un emoji
// al medio, que es lo que hace que algunos calendarios rechacen el archivo.
export function plegar(linea: string): string {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;

  const partes: string[] = [];
  let actual = '';
  let largo = 0;
  // La primera linea admite 75; las siguientes 74, porque arrancan con espacio.
  let tope = 75;

  for (const caracter of linea) {
    const n = new TextEncoder().encode(caracter).length;
    if (largo + n > tope) {
      partes.push(actual);
      actual = caracter;
      largo = n;
      tope = 74;
    } else {
      actual += caracter;
      largo += n;
    }
  }
  if (actual) partes.push(actual);

  return partes.join('\r\n ');
}

export function armarIcs(lineas: string[]): string {
  // CRLF es obligatorio, y el archivo cierra con un salto de linea.
  return lineas.map(plegar).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
//  Fechas
// ---------------------------------------------------------------------------

export interface PartesLocales {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// Pasa un instante a sus componentes de hora local de Buenos Aires.
export function partesLocales(iso: string | Date): PartesLocales {
  const d = iso instanceof Date ? iso : new Date(iso);
  const partes: Record<string, string> = {};
  for (const p of FORMATO.formatToParts(d)) {
    if (p.type !== 'literal') partes[p.type] = p.value;
  }
  return {
    anio: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    // Algunos runtimes devuelven "24" para la medianoche.
    hora: Number(partes.hour) % 24,
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
  };
}

const pad = (n: number, largo = 2) => String(n).padStart(largo, '0');

export function fechaIcs(p: PartesLocales): string {
  return `${p.anio}${pad(p.mes)}${pad(p.dia)}`;
}

export function fechaHoraIcs(p: PartesLocales): string {
  return `${fechaIcs(p)}T${pad(p.hora)}${pad(p.minuto)}${pad(p.segundo)}`;
}

// Marca UTC, para DTSTAMP y para los UNTIL de las repeticiones con hora.
export function utcIcs(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// "2026-09-27" -> 20260927 (sin pasar por Date, para no correrse un dia por
// zona horaria, que es el error clasico con las fechas sueltas)
export function fechaSueltaIcs(fecha: string): string {
  return fecha.slice(0, 10).replace(/-/g, '');
}

// ---------------------------------------------------------------------------
//  Repeticiones
// ---------------------------------------------------------------------------

const DIAS_ICS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function armarRrule(
  repite: string,
  repiteDias: number[] | null,
  repiteHasta: string | null,
  todoElDia: boolean,
  inicioLocal: PartesLocales,
): string | null {
  let regla: string;

  switch (repite) {
    case 'diario':
      regla = 'FREQ=DAILY';
      break;
    case 'semanal': {
      const dias = (repiteDias ?? [])
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .map((d) => DIAS_ICS[d]);
      regla = dias.length
        ? `FREQ=WEEKLY;BYDAY=${dias.join(',')}`
        : 'FREQ=WEEKLY';
      break;
    }
    case 'quincenal':
      regla = 'FREQ=WEEKLY;INTERVAL=2';
      break;
    // El dia y el mes van escritos en la regla a proposito. Sin BYMONTHDAY, cada
    // cliente decide por su cuenta que hacer con una fecha que no existe: para un
    // cumpleaños el 29 de febrero, ICAL.js lo corre al 1 de marzo y otros lo
    // saltean. Con la regla explicita todos hacen lo mismo — saltear — y la app
    // y el calendario del celular muestran siempre lo mismo.
    case 'mensual':
      regla = `FREQ=MONTHLY;BYMONTHDAY=${inicioLocal.dia}`;
      break;
    case 'anual':
      regla = `FREQ=YEARLY;BYMONTH=${inicioLocal.mes};BYMONTHDAY=${inicioLocal.dia}`;
      break;
    default:
      return null;
  }

  if (repiteHasta) {
    // El UNTIL tiene que ser del mismo tipo que el DTSTART: DATE si el evento
    // es de todo el dia, y si tiene hora, un instante UTC.
    if (todoElDia) {
      regla += `;UNTIL=${fechaSueltaIcs(repiteHasta)}`;
    } else {
      const [a, m, d] = repiteHasta.slice(0, 10).split('-').map(Number);
      // Fin del dia local -> UTC. Buenos Aires es -03:00 todo el año.
      const finUtc = new Date(Date.UTC(
        a,
        m - 1,
        d,
        inicioLocal.hora + 3,
        inicioLocal.minuto,
        inicioLocal.segundo,
      ));
      regla += `;UNTIL=${utcIcs(finUtc)}`;
    }
  }

  return regla;
}

// ─── _shared/feed.ts ─────────────────────────────────────────────────────

// ============================================================================
//  Generacion del feed .ics del hogar.
//
//  La logica vive aca, separada de la capa HTTP, y recibe la funcion de consulta
//  inyectada. Asi se puede probar el archivo que sale sin levantar una base ni
//  un servidor (ver feed.test.ts), que es justo lo que hace falta: un .ics mal
//  armado no da error, simplemente el celular no muestra nada.
// ============================================================================

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
    'PRODID:-//juntos//ES',
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

// ─── ics-feed/index.ts ───────────────────────────────────────────────────

// ============================================================================
//  ics-feed — publica la agenda del hogar como calendario suscribible.
//
//  Esta es la pieza que hace que la app sirva para no olvidarse las cosas. En vez
//  de armar notificaciones push (que piden servidor propio, claves VAPID, y en
//  iPhone no andan si la app no esta instalada como PWA), se publica un .ics y
//  cada uno lo suscribe en el calendario del celular. Desde ahi avisa el sistema
//  operativo, con la confiabilidad del calendario nativo, y se ve mezclado con el
//  resto de los compromisos de cada uno.
//
//    GET /functions/v1/ics-feed?hogar=<uuid>&token=<uuid>
//    GET ...&incluir=menu     -> suma el menu de la semana como eventos del dia
//    GET ...&persona=<uuid>   -> solo lo de esa persona (+ lo de toda la familia)
//
//  El token es el secreto: quien tiene el link ve la agenda. Se rota desde
//  Ajustes (ag_regenerar_feed_token) si se compartio de mas.
//
//  OJO: necesita verify_jwt = false en config.toml. Los clientes de calendario no
//  saben mandar un JWT, asi que la autenticacion es el token del link.
//
//  La logica esta en _shared/feed.ts para poder probarla sin base ni servidor.
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// El feed lee con la clave de servicio: RLS no aplica porque no hay usuario
// logueado del otro lado. Lo que autoriza es el token del hogar, que ya se
// verifico antes de llegar a cualquier dato.
const consultar: Consultar = async <T>(ruta: string): Promise<T> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Base de datos: ${res.status} ${await res.text()}`);
  }
  return await res.json() as T;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    });
  }

  try {
    const r = await generarFeed(new URL(req.url), consultar);
    return new Response(r.cuerpo, { status: r.status, headers: r.headers });
  } catch (e) {
    console.error('ics-feed', e);
    return new Response('No se pudo generar el calendario.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
});
