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

// ───  ────────────────────────────────────────────────────────────────────

// ============================================================================
//  Fechas y horas, siempre en hora de Buenos Aires.
//
//  Decision de fondo: la agenda vive en Buenos Aires, no en la zona del
//  dispositivo. Si alguien abre la app desde un viaje, tiene que ver "natación
//  19:00", no "natación 15:00". Asi que:
//    - para MOSTRAR se formatea con Intl fijando timeZone,
//    - para GUARDAR se arma el ISO con el offset -03:00 escrito a mano.
//
//  Se puede escribir el offset fijo porque Argentina no usa horario de verano
//  desde 2009. Si algun dia volviera, lo unico que cambia es OFFSET y la forma
//  de armar el ISO en combinarFechaHora().
// ============================================================================

export const TZ = 'America/Argentina/Buenos_Aires';
const OFFSET = '-03:00';

export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const DIAS_LARGOS = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
];
export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const fmtFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const fmtHora = new Intl.DateTimeFormat('es-AR', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// ---------------------------------------------------------------------------
//  Conversiones basicas
//  Una "fecha" en este archivo es siempre el texto YYYY-MM-DD. Nunca un Date:
//  los Date arrastran hora y zona, y ahi empiezan los dias corridos.
// ---------------------------------------------------------------------------

/** Un instante (Date o ISO) -> la fecha YYYY-MM-DD que era en Buenos Aires. */
export function aFecha(instante) {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA formatea como YYYY-MM-DD, que es justo lo que queremos.
  return fmtFecha.format(d);
}

/** La fecha de hoy en Buenos Aires. */
export function hoy() {
  return aFecha(new Date());
}

/** Un instante -> "19:00" en hora de Buenos Aires. */
export function aHora(instante) {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  return fmtHora.format(d).replace('24:', '00:');
}

/**
 * Fecha + hora local -> ISO con offset, listo para guardar en timestamptz.
 * combinarFechaHora('2026-09-29', '19:00') -> '2026-09-29T19:00:00-03:00'
 */
export function combinarFechaHora(fecha, hora) {
  const hhmm = /^\d{1,2}:\d{2}$/.test(hora || '') ? hora : '00:00';
  const [h, m] = hhmm.split(':');
  return `${fecha}T${h.padStart(2, '0')}:${m}:00${OFFSET}`;
}

/** Partes numericas de una fecha YYYY-MM-DD. */
export function partes(fecha) {
  const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  return { anio: a, mes: m, dia: d };
}

// Las cuentas de dias se hacen sobre un Date en UTC al mediodia: asi ningun
// corrimiento de zona horaria puede cambiar el dia del resultado.
function aUtc(fecha) {
  const { anio, mes, dia } = partes(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia, 12));
}

function deUtc(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${
    String(d.getUTCDate()).padStart(2, '0')
  }`;
}

/** ¿Es una fecha que existe de verdad? El 31 de febrero no. */
export function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ''))) return false;
  const { anio, mes, dia } = partes(fecha);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia;
}

export function sumarDias(fecha, n) {
  const d = aUtc(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return deUtc(d);
}

export function sumarMeses(fecha, n) {
  const { anio, mes, dia } = partes(fecha);
  const d = new Date(Date.UTC(anio, mes - 1 + n, 1, 12));
  // Si el dia no existe en el mes destino (31 de abril), se usa el ultimo.
  const ultimo = diasDelMes(d.getUTCFullYear(), d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(dia, ultimo));
  return deUtc(d);
}

/** 0 = domingo, 1 = lunes, ... 6 = sabado. */
export function diaSemana(fecha) {
  return aUtc(fecha).getUTCDay();
}

export function diasDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Diferencia en dias entre dos fechas (b - a). */
export function diasEntre(a, b) {
  return Math.round((aUtc(b) - aUtc(a)) / 86400000);
}

/** El lunes de la semana de esa fecha. */
export function inicioSemana(fecha) {
  const ds = diaSemana(fecha);
  // Domingo cuenta como final de semana, no como principio.
  return sumarDias(fecha, ds === 0 ? -6 : 1 - ds);
}

export function finSemana(fecha) {
  return sumarDias(inicioSemana(fecha), 6);
}

/** Las 7 fechas de la semana de esa fecha, de lunes a domingo. */
export function semanaDe(fecha) {
  const lunes = inicioSemana(fecha);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/**
 * La grilla del mes para el calendario: siempre semanas completas de lunes a
 * domingo, con los dias de los meses vecinos para rellenar.
 */
export function grillaMes(anio, mes) {
  const primero = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const desde = inicioSemana(primero);
  const ultimo = `${anio}-${String(mes).padStart(2, '0')}-${diasDelMes(anio, mes)}`;
  const hasta = finSemana(ultimo);

  const dias = [];
  for (let f = desde; diasEntre(f, hasta) >= 0; f = sumarDias(f, 1)) {
    dias.push({ fecha: f, delMes: partes(f).mes === mes });
  }
  return dias;
}

// ---------------------------------------------------------------------------
//  Texto para mostrar
// ---------------------------------------------------------------------------

/** "Hoy", "Mañana", "Ayer", o "mar 29 de sep". */
export function fechaHumana(fecha, referencia = hoy()) {
  const d = diasEntre(referencia, fecha);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  if (d === 2) return 'Pasado mañana';

  const { mes, dia } = partes(fecha);
  const dow = DIAS_CORTOS[diaSemana(fecha)];
  const texto = `${dow} ${dia} de ${MESES_CORTOS[mes - 1]}`;
  // Si cae en otro año, se aclara.
  return partes(fecha).anio !== partes(referencia).anio
    ? `${texto} de ${partes(fecha).anio}`
    : texto;
}

/** Mayúscula en la primera letra y nada más. */
export function conMayuscula(texto) {
  const t = String(texto ?? '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "martes 29 de septiembre". */
export function fechaLarga(fecha) {
  const { mes, dia } = partes(fecha);
  return `${DIAS_LARGOS[diaSemana(fecha)]} ${dia} de ${MESES[mes - 1]}`;
}

/** "septiembre 2026". */
export function mesLargo(anio, mes) {
  return `${MESES[mes - 1]} ${anio}`;
}

/** "29 sep - 5 oct" para el encabezado de la semana. */
export function rangoSemanaHumano(fecha) {
  const dias = semanaDe(fecha);
  const a = partes(dias[0]);
  const b = partes(dias[6]);
  const ma = MESES_CORTOS[a.mes - 1];
  const mb = MESES_CORTOS[b.mes - 1];
  return a.mes === b.mes
    ? `${a.dia} al ${b.dia} de ${ma}`
    : `${a.dia} ${ma} al ${b.dia} ${mb}`;
}

/** Cuánto falta, en texto corto: "en 20 min", "en 2 h", "ya pasó". */
export function faltaPara(instante, ahora = new Date()) {
  const min = Math.round((new Date(instante) - ahora) / 60000);
  if (min < -60) return 'ya pasó';
  if (min < 0) return 'arrancó hace un rato';
  if (min < 1) return 'ahora';
  if (min < 60) return `en ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `en ${horas} h`;
  return `en ${Math.round(horas / 24)} días`;
}

// ---------------------------------------------------------------------------
//  Repeticiones
//
//  Tiene que dar EXACTAMENTE lo mismo que el RRULE que arma el feed .ics
//  (supabase/functions/_shared/ics-build.js). Si los dos no coinciden, la app
//  muestra una cosa y el calendario del celular otra, que es el peor resultado
//  posible. Por eso ocurrencias() esta cubierta con pruebas.
// ---------------------------------------------------------------------------

/**
 * Las fechas en que cae un evento dentro de un rango.
 * @param {object} evento  con inicio, repite, repite_dias, repite_hasta
 * @param {string} desde   YYYY-MM-DD inclusive
 * @param {string} hasta   YYYY-MM-DD inclusive
 * @returns {string[]} fechas YYYY-MM-DD ordenadas
 */
export function ocurrencias(evento, desde, hasta) {
  const primera = aFecha(evento.inicio);
  if (!primera) return [];

  const tope = evento.repite_hasta
    ? (diasEntre(evento.repite_hasta, hasta) > 0 ? evento.repite_hasta : hasta)
    : hasta;

  // Nada que expandir si el rango termina antes de que el evento exista.
  if (diasEntre(primera, tope) < 0) return [];

  const repite = evento.repite || 'no';

  if (repite === 'no') {
    return (diasEntre(desde, primera) >= 0 && diasEntre(primera, hasta) >= 0)
      ? [primera]
      : [];
  }

  const salida = [];
  // Nunca antes de la primera vez: un evento no existe antes de empezar.
  const arranque = diasEntre(desde, primera) > 0 ? primera : desde;

  // diasEntre(a, b) devuelve b - a, asi que "f no pasa el tope" es
  // diasEntre(f, tope) >= 0. Estaba al revés y vaciaba todas las series.
  const dentro = (f) =>
    diasEntre(primera, f) >= 0 && // no antes de la primera vez
    diasEntre(f, tope) >= 0 && // no despues del tope
    diasEntre(desde, f) >= 0; // dentro del rango pedido

  switch (repite) {
    case 'diario': {
      for (let f = arranque; diasEntre(f, tope) >= 0; f = sumarDias(f, 1)) {
        if (dentro(f)) salida.push(f);
      }
      break;
    }

    case 'semanal': {
      const dias = (evento.repite_dias?.length ? evento.repite_dias : [diaSemana(primera)])
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      // Se recorre semana por semana desde la semana de la primera vez.
      let lunes = inicioSemana(arranque);
      while (diasEntre(lunes, tope) >= 0) {
        for (const ds of dias) {
          // El lunes es el dia 1; el domingo cierra la semana (dia 7).
          const f = sumarDias(lunes, ds === 0 ? 6 : ds - 1);
          if (dentro(f)) salida.push(f);
        }
        lunes = sumarDias(lunes, 7);
      }
      break;
    }

    case 'quincenal': {
      // Cada 14 dias contados desde la primera vez, para no descolgarse.
      let f = primera;
      while (diasEntre(f, tope) >= 0) {
        if (dentro(f)) salida.push(f);
        f = sumarDias(f, 14);
      }
      break;
    }

    case 'mensual': {
      const dia = partes(primera).dia;
      let cursor = primera;
      while (diasEntre(cursor, tope) >= 0) {
        const p = partes(cursor);
        // Si el mes no llega a ese dia (el 31 en febrero), ese mes se saltea,
        // igual que hace FREQ=MONTHLY.
        if (dia <= diasDelMes(p.anio, p.mes)) {
          const f = `${p.anio}-${String(p.mes).padStart(2, '0')}-${
            String(dia).padStart(2, '0')
          }`;
          if (dentro(f)) salida.push(f);
        }
        const sig = new Date(Date.UTC(p.anio, p.mes, 1, 12));
        cursor = deUtc(sig);
      }
      break;
    }

    case 'anual': {
      const { mes, dia } = partes(primera);
      for (let a = partes(arranque).anio; a <= partes(tope).anio; a++) {
        // El 29 de febrero solo existe en año bisiesto: los demas se saltean.
        if (dia > diasDelMes(a, mes)) continue;
        const f = `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        if (dentro(f)) salida.push(f);
      }
      break;
    }
  }

  return salida.sort();
}

/** La hora del evento aplicada a otra fecha, para las repeticiones. */
export function inicioEnFecha(evento, fecha) {
  if (evento.todo_el_dia) return combinarFechaHora(fecha, '00:00');
  return combinarFechaHora(fecha, aHora(evento.inicio));
}

/** Duración del evento en minutos (una hora si no tiene fin). */
export function duracionMin(evento) {
  if (!evento.fin) return 60;
  const min = Math.round((new Date(evento.fin) - new Date(evento.inicio)) / 60000);
  return min > 0 ? min : 60;
}

// ─── _shared/ics-build.ts ────────────────────────────────────────────────

// ============================================================================
//  Armado de archivos .ics (RFC 5545).
//
//  Buenos Aires no usa horario de verano desde 2009, asi que alcanza con una
//  VTIMEZONE de un solo tramo en -03:00. Se emiten las horas como hora local
//  con TZID en vez de pasarlas a UTC: asi las excepciones (EXDATE) coinciden
//  exacto con las ocurrencias, que es donde estos archivos se suelen romper.
// ============================================================================

// Se llama ZONA y no TZ porque armar-funciones.mjs pega todos los módulos en
// un solo archivo, y js/lib/fechas.js —que se reusa acá para expandir las
// repeticiones— ya exporta un TZ. Dos declaraciones con el mismo nombre en el
// archivo pegado no compilan.
export const ZONA = 'America/Argentina/Buenos_Aires';

export const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${ZONA}`,
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
  timeZone: ZONA,
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
// El expansor de repeticiones se reusa TAL CUAL del frontend, no se copia: es
// la misma función que dibuja el calendario en la app, y ya tiene una prueba
// que la compara contra ICAL.js caso por caso. Una segunda implementación acá
// sería una tercera cosa que mantener sincronizada.

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
