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
