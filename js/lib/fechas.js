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
