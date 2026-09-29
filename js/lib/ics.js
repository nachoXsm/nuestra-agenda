// ============================================================================
//  Leer y escribir calendarios .ics en el navegador.
//
//  Leer sirve para importar el calendario del colegio, del club, de Google o de
//  Cokidoo si algún día exporta. Escribir sirve para el botón "agregar al
//  calendario del celular" de un evento suelto.
//
//  No se usa una librería: un .ics real trae sorpresas (líneas plegadas, zonas
//  horarias de Outlook, escapes) y es más corto tratarlas acá que explicar por
//  qué una dependencia de 200 kB no las trata bien. La otra razón es que el
//  parseo corre sobre un archivo que viene de afuera, así que conviene que sea
//  código que se pueda leer entero.
// ============================================================================
import { TZ } from './fechas.js';

// ---------------------------------------------------------------------------
//  Lectura
// ---------------------------------------------------------------------------

/**
 * Deshace el plegado de líneas del RFC 5545: una línea que arranca con espacio
 * o tabulación es la continuación de la anterior.
 */
function desplegar(texto) {
  return String(texto)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');
}

/** Deshace los escapes de un texto del .ics. */
function desescapar(valor) {
  return String(valor)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parte una línea en nombre, parámetros y valor.
 * "DTSTART;TZID=America/Argentina/Buenos_Aires:20260929T190000"
 *   -> { nombre: 'DTSTART', params: { TZID: '...' }, valor: '20260929T190000' }
 */
function partirLinea(linea) {
  const dosPuntos = linea.indexOf(':');
  if (dosPuntos === -1) return null;

  const izquierda = linea.slice(0, dosPuntos);
  const valor = linea.slice(dosPuntos + 1);
  const trozos = izquierda.split(';');
  const nombre = trozos[0].toUpperCase();

  const params = {};
  for (const t of trozos.slice(1)) {
    const igual = t.indexOf('=');
    if (igual === -1) continue;
    params[t.slice(0, igual).toUpperCase()] = t.slice(igual + 1).replace(/^"|"$/g, '');
  }

  return { nombre, params, valor };
}

// El offset de una zona IANA en un instante dado, en milisegundos.
// Se apoya en Intl, que en el navegador trae la base de zonas completa.
function offsetZona(zona, instante) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = {};
  for (const parte of dtf.formatToParts(instante)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }
  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return comoUtc - instante.getTime();
}

/**
 * Una hora de pared en una zona -> el instante real.
 * Dos pasadas: la primera estima el offset, la segunda lo corrige. Con eso
 * alcanza salvo en la hora exacta en que una zona cambia de horario.
 */
function horaDeParedAInstante(y, mes, d, h, mi, s, zona) {
  let estimado = Date.UTC(y, mes - 1, d, h, mi, s);
  for (let i = 0; i < 2; i++) {
    const off = offsetZona(zona, new Date(estimado));
    estimado = Date.UTC(y, mes - 1, d, h, mi, s) - off;
  }
  return new Date(estimado);
}

function zonaValida(zona) {
  if (!zona) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    // Outlook manda cosas como "Romance Standard Time", que no son IANA.
    return false;
  }
}

/**
 * Interpreta un DTSTART / DTEND / EXDATE.
 * @returns {{ instante: Date|null, soloFecha: boolean, fecha: string }}
 */
export function leerFechaIcs(valor, params = {}) {
  const v = String(valor).trim();
  const soloFecha = params.VALUE === 'DATE' || /^\d{8}$/.test(v);

  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { instante: null, soloFecha, fecha: '' };

  const [, y, mes, d, h = '00', mi = '00', s = '00', z] = m;
  const fecha = `${y}-${mes}-${d}`;

  if (soloFecha) {
    // Un evento de todo el día no tiene hora: se ancla al mediodía local para
    // que ningún corrimiento de zona lo pase al día anterior.
    return {
      instante: horaDeParedAInstante(+y, +mes, +d, 12, 0, 0, TZ),
      soloFecha: true,
      fecha,
    };
  }

  if (z) {
    // Ya viene en UTC.
    return {
      instante: new Date(Date.UTC(+y, +mes - 1, +d, +h, +mi, +s)),
      soloFecha: false,
      fecha,
    };
  }

  // Con TZID válido se usa esa zona. Si no (o si es una zona de Outlook que no
  // es IANA), se toma como hora local de Buenos Aires, que es lo más probable
  // para el calendario de un colegio de acá.
  const zona = zonaValida(params.TZID) ? params.TZID : TZ;
  return {
    instante: horaDeParedAInstante(+y, +mes, +d, +h, +mi, +s, zona),
    soloFecha: false,
    fecha,
  };
}

/**
 * Traduce un RRULE del .ics al modelo simple de la app.
 * Lo que no encaja vuelve como 'no': es mejor importar un evento suelto que
 * inventarle una repetición equivocada y llenarle la agenda de cosas falsas.
 */
export function leerRrule(rrule, inicio) {
  const partes = {};
  for (const trozo of String(rrule).split(';')) {
    const [k, v] = trozo.split('=');
    if (k) partes[k.toUpperCase()] = v ?? '';
  }

  const freq = (partes.FREQ ?? '').toUpperCase();
  const intervalo = Number(partes.INTERVAL || 1);
  const DIAS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  let repite = 'no';
  let dias = [];

  if (freq === 'DAILY' && intervalo === 1) {
    repite = 'diario';
  } else if (freq === 'WEEKLY' && (intervalo === 1 || intervalo === 2)) {
    repite = intervalo === 2 ? 'quincenal' : 'semanal';
    if (partes.BYDAY && intervalo === 1) {
      dias = partes.BYDAY.split(',')
        // Se ignora el número de un "2MO" (segundo lunes): eso no lo modelamos.
        .map((d) => DIAS[d.replace(/^[+-]?\d+/, '').toUpperCase()])
        .filter((d) => d !== undefined);
    }
  } else if (freq === 'MONTHLY' && intervalo === 1) {
    repite = 'mensual';
  } else if (freq === 'YEARLY' && intervalo === 1) {
    repite = 'anual';
  }

  if (repite === 'no') return { repite: 'no', repite_dias: [], repite_hasta: null };

  // Hasta cuándo: UNTIL es una fecha, COUNT es una cantidad de veces.
  let hasta = null;
  if (partes.UNTIL) {
    const f = leerFechaIcs(partes.UNTIL, {});
    hasta = f.fecha || null;
  } else if (partes.COUNT) {
    const n = Math.max(Number(partes.COUNT) || 1, 1);
    const d = new Date(inicio);
    // Aproximación: con COUNT no se puede saber la fecha exacta sin expandir la
    // serie, y para un calendario importado alcanza con acertar el orden de
    // magnitud. Se estira un poco a propósito, para no cortar de menos.
    if (repite === 'diario') d.setDate(d.getDate() + n);
    else if (repite === 'semanal') d.setDate(d.getDate() + Math.ceil(n / Math.max(dias.length, 1)) * 7);
    else if (repite === 'quincenal') d.setDate(d.getDate() + n * 14);
    else if (repite === 'mensual') d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    hasta = d.toISOString().slice(0, 10);
  }

  return { repite, repite_dias: dias, repite_hasta: hasta };
}

/**
 * Parsea un .ics completo.
 * @returns {{ nombre: string, eventos: Array, saltados: number }}
 */
export function parsearIcs(texto) {
  const lineas = desplegar(texto).split('\n');

  let nombreCalendario = '';
  const eventos = [];
  let saltados = 0;
  let actual = null;
  let dentroDeAlarma = false;

  for (const cruda of lineas) {
    const linea = cruda.trimEnd();
    if (!linea) continue;

    const p = partirLinea(linea);
    if (!p) continue;
    const { nombre, params, valor } = p;

    // Las VALARM traen su propio DESCRIPTION y TRIGGER: hay que saltearlas o
    // pisan la descripción del evento.
    if (nombre === 'BEGIN' && valor.toUpperCase() === 'VALARM') {
      dentroDeAlarma = true;
      continue;
    }
    if (nombre === 'END' && valor.toUpperCase() === 'VALARM') {
      dentroDeAlarma = false;
      continue;
    }
    if (dentroDeAlarma) {
      // Un TRIGGER negativo en minutos se puede aprovechar como aviso.
      if (nombre === 'TRIGGER' && actual) {
        const m = valor.match(/^-P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i);
        if (m) {
          const min = (Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
          if (min > 0 && min <= 40320) actual.aviso_minutos = min;
        }
      }
      continue;
    }

    if (nombre === 'BEGIN' && valor.toUpperCase() === 'VEVENT') {
      actual = { exdates: [] };
      continue;
    }

    if (nombre === 'END' && valor.toUpperCase() === 'VEVENT') {
      if (actual && actual.inicio && actual.titulo) eventos.push(actual);
      else saltados++;
      actual = null;
      continue;
    }

    if (!actual) {
      // Propiedades del calendario, no de un evento.
      if (nombre === 'X-WR-CALNAME') nombreCalendario = desescapar(valor).trim();
      continue;
    }

    switch (nombre) {
      case 'UID':
        actual.ics_uid = valor.trim();
        break;
      case 'SUMMARY':
        actual.titulo = desescapar(valor).trim().slice(0, 200);
        break;
      case 'DESCRIPTION':
        actual.detalle = desescapar(valor).trim().slice(0, 2000) || null;
        break;
      case 'LOCATION':
        actual.lugar = desescapar(valor).trim().slice(0, 300) || null;
        break;
      case 'DTSTART': {
        const f = leerFechaIcs(valor, params);
        if (f.instante) {
          actual.inicio = f.instante.toISOString();
          actual.todo_el_dia = f.soloFecha;
        }
        break;
      }
      case 'DTEND': {
        const f = leerFechaIcs(valor, params);
        if (f.instante) actual._fin = { instante: f.instante, soloFecha: f.soloFecha };
        break;
      }
      case 'DURATION': {
        // Alternativa a DTEND: PT1H30M, P1D...
        const m = valor.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
        if (m) {
          actual._duracionMin = (Number(m[1] || 0) * 1440) +
            (Number(m[2] || 0) * 60) + Number(m[3] || 0);
        }
        break;
      }
      case 'RRULE':
        actual._rrule = valor.trim();
        break;
      case 'EXDATE': {
        // Puede traer varias fechas separadas por coma.
        for (const v of valor.split(',')) {
          const f = leerFechaIcs(v, params);
          if (f.fecha) actual.exdates.push(f.fecha);
        }
        break;
      }
      case 'STATUS':
        if (valor.toUpperCase() === 'CANCELLED') actual._cancelado = true;
        break;
    }
  }

  // Segunda pasada: resolver fines, duraciones y repeticiones.
  const listos = [];
  for (const e of eventos) {
    if (e._cancelado) {
      saltados++;
      continue;
    }

    let fin = null;
    if (e._fin) {
      // En un evento de todo el día el DTEND es exclusivo: se resta un día para
      // volver al último día que realmente ocupa.
      fin = e._fin.soloFecha
        ? new Date(e._fin.instante.getTime() - 86400000).toISOString()
        : e._fin.instante.toISOString();
    } else if (e._duracionMin) {
      fin = new Date(new Date(e.inicio).getTime() + e._duracionMin * 60000).toISOString();
    }

    // Un fin anterior o igual al inicio no sirve de nada.
    if (fin && new Date(fin) <= new Date(e.inicio)) fin = null;

    const rep = e._rrule
      ? leerRrule(e._rrule, e.inicio)
      : { repite: 'no', repite_dias: [], repite_hasta: null };

    listos.push({
      ics_uid: e.ics_uid || null,
      titulo: e.titulo,
      detalle: e.detalle ?? null,
      lugar: e.lugar ?? null,
      inicio: e.inicio,
      fin,
      todo_el_dia: !!e.todo_el_dia,
      aviso_minutos: e.aviso_minutos ?? null,
      ...rep,
      exdates: e.exdates,
    });
  }

  return { nombre: nombreCalendario, eventos: listos, saltados };
}

// ---------------------------------------------------------------------------
//  Escritura (un evento suelto, para mandarlo al calendario del celular)
// ---------------------------------------------------------------------------

function esc(texto) {
  return String(texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function plegar(linea) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;

  const partes = [];
  let actual = '';
  let largo = 0;
  let tope = 75;
  for (const c of linea) {
    const n = new TextEncoder().encode(c).length;
    if (largo + n > tope) {
      partes.push(actual);
      actual = c;
      largo = n;
      tope = 74;
    } else {
      actual += c;
      largo += n;
    }
  }
  if (actual) partes.push(actual);
  return partes.join('\r\n ');
}

function utc(d) {
  return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Un .ics de un solo evento, para el botón "agregar al calendario".
 * Se escribe en UTC: un archivo que se abre una vez y se copia al calendario no
 * necesita VTIMEZONE, y así no hay forma de que la zona quede mal.
 */
export function eventoAIcs(evento, { nombrePersona } = {}) {
  const titulo = nombrePersona ? `${evento.titulo} (${nombrePersona})` : evento.titulo;
  const inicio = new Date(evento.inicio);
  const fin = evento.fin ? new Date(evento.fin) : new Date(inicio.getTime() + 3600000);

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//juntos//ES',
    'BEGIN:VEVENT',
    `UID:${evento.id ?? crypto.randomUUID()}@nuestra-agenda`,
    `DTSTAMP:${utc(new Date())}`,
  ];

  if (evento.todo_el_dia) {
    const soloFecha = (d) => utc(d).slice(0, 8);
    lineas.push(`DTSTART;VALUE=DATE:${soloFecha(inicio)}`);
    lineas.push(`DTEND;VALUE=DATE:${soloFecha(new Date(fin.getTime() + 86400000))}`);
  } else {
    lineas.push(`DTSTART:${utc(inicio)}`);
    lineas.push(`DTEND:${utc(fin)}`);
  }

  lineas.push(`SUMMARY:${esc(titulo)}`);
  if (evento.lugar) lineas.push(`LOCATION:${esc(evento.lugar)}`);
  if (evento.detalle) lineas.push(`DESCRIPTION:${esc(evento.detalle)}`);

  if (evento.aviso_minutos > 0) {
    lineas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(titulo)}`);
    lineas.push(`TRIGGER:-PT${Math.round(evento.aviso_minutos)}M`, 'END:VALARM');
  }

  lineas.push('END:VEVENT', 'END:VCALENDAR');
  return lineas.map(plegar).join('\r\n') + '\r\n';
}

/** Dispara la descarga de un .ics. */
export function descargarIcs(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo.endsWith('.ics') ? nombreArchivo : `${nombreArchivo}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después, que si no Safari a veces cancela la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
