// ===========================================================================
//  avisos — TODO EN UN ARCHIVO, para pegar en el editor de Supabase.
//
//  ARCHIVO GENERADO. No lo edites acá: los cambios se pierden.
//  El código de verdad está en supabase/functions/avisos/index.ts y en
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

// ─── _shared/cors.ts ─────────────────────────────────────────────────────

// CORS comun a todas las funciones.
//
// ORIGENES_OK se define con el secreto ORIGENES_PERMITIDOS (lista separada por
// comas) para no dejar la API abierta a cualquier sitio. Si no esta cargado se
// permite todo, que es lo practico mientras se prueba en local.
const ORIGENES_OK = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function cors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? '';
  const permitido = ORIGENES_OK.length === 0
    ? '*'
    : (ORIGENES_OK.includes(origen) ? origen : ORIGENES_OK[0]);

  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(
  req: Request,
  cuerpo: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(req) });
  }
  return null;
}

// ─── _shared/avisos-texto.ts ─────────────────────────────────────────────

// ============================================================================
//  Cómo se redacta un aviso de juntos.
//
//  Esta es la parte que hace que valga la pena tener notificaciones propias en
//  vez de las del calendario. Un calendario avisa una vez por evento, siempre
//  con la misma forma: "Natación, 19:00". Cinco cosas, cinco pings. Y avisa
//  igual cuando no hay nada que decidir.
//
//  Acá el criterio es otro:
//
//   1. UN aviso por momento, no uno por cosa. Lo que llega es el día, no un
//      renglón de una agenda.
//   2. El título dice lo que ROZA, no lo que hay. "Natación 19 y no hay cena"
//      es accionable; "3 eventos hoy" no.
//   3. Si no hay nada, no se manda nada. El silencio también informa, y un
//      aviso diario que a veces dice "no tenés nada" se vuelve ruido y se
//      apaga a la semana.
//
//  Es todo función pura: entra el día ya resuelto, sale el texto. Por eso se
//  puede probar sin base, sin red y sin celular.
// ============================================================================

export interface ActividadAviso {
  titulo: string;
  hora: string | null; // "19:00", o null si es de todo el día
  persona: string | null;
  tarde: boolean; // arranca 17:00 o después
}

export interface TareaAviso {
  titulo: string;
  persona: string | null;
  atrasada: boolean;
}

export interface DiaAviso {
  fecha: string;
  actividades: ActividadAviso[];
  tareas: TareaAviso[];
  /** Qué se decidió comer. null en el momento que no está resuelto. */
  almuerzo: string | null;
  cena: string | null;
  faltanCompras: number;
}

export interface Aviso {
  titulo: string;
  cuerpo: string;
  /** A qué sección lleva al tocarla. */
  ir: string;
  acciones: { accion: string; titulo: string }[];
  etiqueta: string;
}

const y = (partes: string[]): string =>
  partes.length <= 1
    ? (partes[0] ?? '')
    : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;

const plural = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`;

function conHora(a: ActividadAviso): string {
  return a.hora ? `${a.hora} ${a.titulo}` : a.titulo;
}

/**
 * El aviso de la mañana. Devuelve null si no hay nada que valga interrumpir.
 */
export function avisoDelDia(dia: DiaAviso): Aviso | null {
  const { actividades, tareas } = dia;
  const atrasadas = tareas.filter((t) => t.atrasada);
  const delDia = tareas.filter((t) => !t.atrasada);

  if (!actividades.length && !tareas.length) return null;

  // --- el título: lo primero que roza ---------------------------------------
  let titulo: string;

  if (atrasadas.length) {
    // Lo vencido manda: es lo único que ya salió mal.
    titulo = atrasadas.length === 1
      ? `Se pasó: ${atrasadas[0].titulo}`
      : `Se pasaron ${plural(atrasadas.length, 'tarea', 'tareas')}`;
  } else if (actividades.length) {
    const primera = actividades[0];
    const resto = actividades.length - 1;
    titulo = resto > 0
      ? `${conHora(primera)} y ${plural(resto, 'cosa más', 'cosas más')}`
      : conHora(primera);
  } else {
    titulo = delDia.length === 1
      ? delDia[0].titulo
      : `${plural(delDia.length, 'tarea', 'tareas')} para hoy`;
  }

  // --- el cuerpo: el resto, y el roce de la noche ----------------------------
  const lineas: string[] = [];

  if (actividades.length > 1 || (atrasadas.length && actividades.length)) {
    lineas.push(actividades.map(conHora).join(' · '));
  }
  if (delDia.length && (atrasadas.length || actividades.length)) {
    lineas.push(`Para hacer: ${y(delDia.map((t) => t.titulo))}`);
  }
  if (atrasadas.length > 1) {
    lineas.push(`Vencidas: ${y(atrasadas.map((t) => t.titulo))}`);
  }

  // Lo que ningún calendario sabe: que hay algo a la tarde Y que no hay cena
  // pensada es un problema de hoy, no de dos cosas separadas.
  const hayTarde = actividades.some((a) => a.tarde);
  if (hayTarde && !dia.cena) {
    lineas.push('Se hace tarde y no hay cena pensada.');
  } else if (!dia.cena && !dia.almuerzo && !actividades.length) {
    lineas.push('Tampoco hay nada decidido para comer.');
  }

  return {
    titulo,
    cuerpo: lineas.join('\n') || 'Tocá para ver el día.',
    // Si el día no tiene más que tareas, abrir en Inicio obliga a buscarlas.
    ir: !actividades.length && tareas.length ? 'tareas' : 'inicio',
    acciones: [
      { accion: 'agenda', titulo: 'Ver el día' },
      ...(tareas.length ? [{ accion: 'tareas', titulo: 'Tareas' }] : []),
    ],
    etiqueta: `diario-${dia.fecha}`,
  };
}

/**
 * El aviso de los lunes. Este sí se manda aunque la semana esté vacía: que
 * esté vacía es justamente la noticia.
 */
export function avisoDeLaSemana(
  dias: DiaAviso[],
  nombresDia: string[],
): Aviso | null {
  const actividades = dias.flatMap((d) =>
    d.actividades.map((a) => ({ ...a, fecha: d.fecha }))
  );
  const tareas = dias.flatMap((d) => d.tareas);

  const partes: string[] = [];
  if (actividades.length) {
    partes.push(plural(actividades.length, 'cosa', 'cosas'));
  }
  if (tareas.length) partes.push(plural(tareas.length, 'tarea', 'tareas'));

  const titulo = partes.length
    ? `La semana: ${y(partes)}`
    : 'La semana viene despejada';

  const lineas: string[] = [];
  for (const d of dias) {
    if (!d.actividades.length) continue;
    const i = new Date(`${d.fecha}T12:00:00Z`).getUTCDay();
    lineas.push(`${nombresDia[i]}: ${d.actividades.map(conHora).join(' · ')}`);
  }
  if (tareas.length) {
    lineas.push(`Tareas: ${y(tareas.map((t) => t.titulo))}`);
  }
  if (!lineas.length) {
    lineas.push('Nada anotado. Buen momento para planear algo.');
  }

  return {
    titulo,
    cuerpo: lineas.join('\n'),
    ir: 'agenda',
    acciones: [
      { accion: 'agenda', titulo: 'Ver la semana' },
      { accion: 'comidas', titulo: 'Armar el menú' },
    ],
    etiqueta: `semanal-${dias[0]?.fecha ?? ''}`,
  };
}

// ─── _shared/webpush.ts ──────────────────────────────────────────────────

// ============================================================================
//  Web Push a mano, con Web Crypto. Sin librerías.
//
//  Mandar una notificación push no es "hacer un POST": el contenido va cifrado
//  de punta a punta con las claves del navegador que se suscribió (RFC 8291),
//  y el pedido va firmado con VAPID (RFC 8292) para que el servicio de push
//  sepa quién lo manda. Nada de eso lo hace fetch solo.
//
//  Se escribe acá en vez de traer una librería por dos razones. Una: las
//  librerías de web push son de Node y usan su módulo crypto, que en el
//  runtime de Supabase no está garantizado. La otra: es una dependencia más
//  que se puede pudrir en un proyecto que tiene que seguir andando en tres
//  años, y esto son cien líneas de algoritmo que no va a cambiar.
//
//  La prueba lo corre contra el vector del RFC 8291 §5: mismas claves, misma
//  sal, y el cuerpo cifrado tiene que dar byte por byte lo que dice el
//  documento. Si algo de esto estuviera mal, el celular no mostraría nada y no
//  habría ningún error que lo delate.
// ============================================================================

// --- base64url --------------------------------------------------------------

export function aB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64Url(texto: string): Uint8Array {
  const s = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function pegar(...trozos: Uint8Array[]): Uint8Array {
  const total = trozos.reduce((n, t) => n + t.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    salida.set(t, i);
    i += t.length;
  }
  return salida;
}

// --- HKDF (RFC 5869), que es de lo que está hecho todo lo de abajo -----------

async function hmac(clave: Uint8Array, datos: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    clave as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, datos as BufferSource));
}

/** Una sola vuelta de expand alcanza: nunca se piden más de 32 bytes. */
async function hkdf(
  sal: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  largo: number,
): Promise<Uint8Array> {
  const prk = await hmac(sal, ikm);
  const bloque = await hmac(prk, pegar(info, new Uint8Array([1])));
  return bloque.slice(0, largo);
}

// --- cifrado del contenido (RFC 8291) ---------------------------------------

export interface Suscripcion {
  endpoint: string;
  p256dh: string; // clave pública del navegador, base64url
  auth: string; // secreto de autenticación, base64url
}

/**
 * Cifra el cuerpo de la notificación para una suscripción.
 *
 * Los dos últimos parámetros existen solo para la prueba: en producción la
 * clave efímera y la sal se generan al azar en cada envío, que es justamente
 * lo que hace que el mismo texto no viaje nunca dos veces igual.
 */
export async function cifrar(
  sus: Suscripcion,
  cuerpo: string,
  efimeras?: CryptoKeyPair,
  salFija?: Uint8Array,
): Promise<Uint8Array> {
  const uaPublica = deB64Url(sus.p256dh);
  const authSecreto = deB64Url(sus.auth);

  const par = efimeras ?? await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  ) as CryptoKeyPair;

  const asPublica = new Uint8Array(
    await crypto.subtle.exportKey('raw', par.publicKey),
  );

  const uaImportada = await crypto.subtle.importKey(
    'raw',
    uaPublica as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const compartido = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaImportada },
      par.privateKey,
      256,
    ),
  );

  // El "info" ata el secreto a las dos claves públicas: sin esto, un secreto
  // robado serviría para cualquier par de puntas.
  const infoAuth = pegar(
    utf8('WebPush: info'),
    new Uint8Array([0]),
    uaPublica,
    asPublica,
  );
  const ikm = await hkdf(authSecreto, compartido, infoAuth, 32);

  const sal = salFija ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const llave = await crypto.subtle.importKey(
    'raw',
    cek as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  // El 0x02 marca que este es el último registro. Sin ese byte el navegador
  // descarta el mensaje entero.
  const plano = pegar(utf8(cuerpo), new Uint8Array([2]));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      llave,
      plano as BufferSource,
    ),
  );

  // Cabecera de RFC 8188: sal, tamaño de registro, largo del id, id (que acá
  // es la clave pública efímera), y atrás el contenido cifrado.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return pegar(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

// --- firma VAPID (RFC 8292) -------------------------------------------------

export interface ClavesVapid {
  publica: string; // base64url del punto sin comprimir (65 bytes)
  privada: string; // base64url del escalar (32 bytes)
}

/** Un par de claves nuevo. Se genera una vez y se guarda. */
export async function generarClavesVapid(): Promise<ClavesVapid> {
  const par = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  return { publica: aB64Url(publica), privada: jwk.d! };
}

async function importarPrivada(claves: ClavesVapid): Promise<CryptoKey> {
  const p = deB64Url(claves.publica);
  // El punto sin comprimir es 0x04 || X (32) || Y (32).
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: claves.privada,
    x: aB64Url(p.slice(1, 33)),
    y: aB64Url(p.slice(33, 65)),
    ext: true,
  };
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * El encabezado Authorization del pedido de push.
 * @param audiencia  el origen del servicio de push (https://fcm.googleapis.com)
 * @param contacto   un mailto: o https: para que puedan avisar si algo molesta
 */
export async function cabeceraVapid(
  claves: ClavesVapid,
  audiencia: string,
  contacto: string,
  ahora = Date.now(),
): Promise<string> {
  const encabezado = { typ: 'JWT', alg: 'ES256' };
  const cuerpo = {
    aud: audiencia,
    // Doce horas: el máximo que acepta la especificación es 24.
    exp: Math.floor(ahora / 1000) + 12 * 3600,
    sub: contacto,
  };
  const sinFirma = `${aB64Url(utf8(JSON.stringify(encabezado)))}.${
    aB64Url(utf8(JSON.stringify(cuerpo)))
  }`;

  const firma = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await importarPrivada(claves),
      utf8(sinFirma) as BufferSource,
    ),
  );
  return `vapid t=${sinFirma}.${aB64Url(firma)}, k=${claves.publica}`;
}

// --- envío ------------------------------------------------------------------

export interface Resultado {
  ok: boolean;
  status: number;
  /** true si la suscripción ya no existe y hay que borrarla de la base. */
  vencida: boolean;
  detalle?: string;
}

export async function enviarPush(
  sus: Suscripcion,
  cuerpo: unknown,
  claves: ClavesVapid,
  contacto: string,
): Promise<Resultado> {
  let cifrado: Uint8Array;
  try {
    cifrado = await cifrar(sus, JSON.stringify(cuerpo));
  } catch (e) {
    // Una suscripción con claves rotas no se puede cifrar: no tiene arreglo.
    return { ok: false, status: 0, vencida: true, detalle: String(e) };
  }

  const origen = new URL(sus.endpoint).origin;
  const res = await fetch(sus.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabeceraVapid(claves, origen, contacto),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // Cuánto puede esperar el servicio de push si el celular está apagado.
      TTL: '86400',
      Urgency: 'normal',
    },
    body: cifrado as BufferSource,
  });

  // 404 y 410: el navegador se desuscribió o desinstaló la app. Hay que sacarla
  // de la base o se le sigue mandando a un endpoint muerto para siempre.
  const vencida = res.status === 404 || res.status === 410;
  return {
    ok: res.ok,
    status: res.status,
    vencida,
    detalle: res.ok ? undefined : (await res.text().catch(() => '')).slice(0, 300),
  };
}

// ─── avisos/index.ts ─────────────────────────────────────────────────────

// ============================================================================
//  avisos — las notificaciones propias de juntos.
//
//  Corre cada hora, disparada por pg_cron desde el mismo proyecto. Mira quién
//  pidió que le avisen a esta hora, arma el día (o la semana, si es lunes) y
//  manda UNA notificación por persona, cifrada con Web Push.
//
//  Por qué no alcanzaba con publicar el calendario: ahí los recordatorios los
//  da el calendario del sistema, con su cara y su formato, uno por evento y
//  siempre igual. Esto es de la app: el trébol, el texto escrito para lo que
//  pasa ese día, y botones que llevan a la pantalla que corresponde.
//
//  Cómo no manda dos veces lo mismo: cada fila de ag_push guarda la última
//  fecha en que se le mandó cada tipo de aviso. Si el disparador corre de más
//  —o si alguien lo llama a mano— la segunda vuelta no hace nada.
//
//  OJO: necesita verify_jwt = false. La llama pg_net, que no manda un JWT; lo
//  que la autoriza es el token de ag_avisos_config, que vive en la base y no
//  sale del proyecto.
// ============================================================================
// Fechas: las mismas del frontend, no una copia. Redeclararlas acá rompía el
// archivo de un solo pegue, donde fechas.js queda arriba en el mismo alcance.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ZONA = 'America/Argentina/Buenos_Aires';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

async function rest<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opciones.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Base de datos: ${res.status} ${await res.text()}`);
  return res.status === 204 ? (null as T) : await res.json() as T;
}

// --- fechas, todas en hora de Buenos Aires ----------------------------------

const hoyEn = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);

const horaEn = (d = new Date()) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false })
      .format(d),
  ) % 24;

// --- las claves VAPID, que se generan solas la primera vez -------------------

async function clavesVapid(): Promise<ClavesVapid & { contacto: string }> {
  const filas = await rest<
    { publica: string; privada: string; contacto: string }[]
  >('ag_vapid?select=publica,privada,contacto&limit=1');
  if (filas.length) return filas[0];

  // Nadie las cargó: se generan acá. Así no hay que pegar ninguna clave a mano
  // en ningún lado, que es donde siempre se traba la instalación.
  const nuevas = await generarClavesVapid();
  const guardadas = await rest<{ publica: string; privada: string; contacto: string }[]>(
    'ag_vapid',
    { method: 'POST', body: JSON.stringify({ id: true, ...nuevas }) },
  );
  return guardadas[0];
}

// --- armado del día ---------------------------------------------------------

interface EventoFila {
  id: string;
  titulo: string;
  inicio: string;
  todo_el_dia: boolean;
  persona_id: string | null;
  repite: string;
  repite_dias: number[] | null;
  repite_hasta: string | null;
  ag_ocurrencias?: { fecha: string; estado: string }[];
}

interface TareaFila {
  id: string;
  titulo: string;
  vence: string | null;
  hecha: boolean;
  persona_id: string | null;
}

function partesHora(iso: string): { hora: string; tarde: boolean } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return { hora: f, tarde: Number(f.slice(0, 2)) >= 17 };
}

/** Junta todo lo que pasa un día, ya resuelto y listo para redactar. */
function armarDia(
  fecha: string,
  eventos: EventoFila[],
  tareas: TareaFila[],
  menu: { fecha: string; momento: string; titulo: string }[],
  personas: Map<string, string>,
  hoy: string,
): DiaAviso {
  const actividades: ActividadAviso[] = [];
  for (const e of eventos) {
    for (const f of ocurrencias(e, fecha, fecha) as string[]) {
      const cancelada = (e.ag_ocurrencias ?? []).some(
        (o) => o.fecha.slice(0, 10) === f && o.estado === 'cancelado',
      );
      const hecha = (e.ag_ocurrencias ?? []).some(
        (o) => o.fecha.slice(0, 10) === f && o.estado === 'hecho',
      );
      if (cancelada || hecha) continue;
      const h = e.todo_el_dia ? null : partesHora(e.inicio);
      actividades.push({
        titulo: e.titulo,
        hora: h?.hora ?? null,
        persona: e.persona_id ? personas.get(e.persona_id) ?? null : null,
        tarde: h?.tarde ?? false,
      });
    }
  }
  actividades.sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''));

  const delDia: TareaAviso[] = tareas
    .filter((t) => !t.hecha && t.vence)
    .filter((t) => {
      const v = t.vence!.slice(0, 10);
      // En el día de hoy entran también las que ya vencieron: siguen siendo
      // trabajo de hoy.
      return v === fecha || (fecha === hoy && v < hoy);
    })
    .map((t) => ({
      titulo: t.titulo,
      persona: t.persona_id ? personas.get(t.persona_id) ?? null : null,
      atrasada: t.vence!.slice(0, 10) < fecha,
    }));

  const comida = (momento: string) =>
    menu.find((m) => m.fecha.slice(0, 10) === fecha && m.momento === momento)?.titulo ??
      null;

  return {
    fecha,
    actividades,
    tareas: delDia,
    almuerzo: comida('almuerzo'),
    cena: comida('cena'),
    faltanCompras: 0,
  };
}

// --- la vuelta --------------------------------------------------------------

interface FilaPush {
  id: string;
  hogar_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  hora: number;
  diario: boolean;
  semanal: boolean;
  ultimo_diario: string | null;
  ultimo_semanal: string | null;
}

interface Vuelta {
  /** Una sola fila: la prueba que se pide desde la app. */
  soloPush?: string;
  /** Limita la vuelta a un hogar: la empuja alguien de esa casa. */
  hogar?: string;
  /**
   * Toma tambien las horas que ya pasaron hoy, no solo la hora en punto.
   * Es para la vuelta que empuja la app: si el disparador no corrio a las 8,
   * quien abre la app a las 11 igual recibe lo de la manana.
   */
  atrasadas?: boolean;
}

async function darLaVuelta({ soloPush, hogar, atrasadas }: Vuelta = {}): Promise<{
  mirados: number;
  enviados: number;
  errores: number;
}> {
  const hoy = hoyEn();
  const hora = horaEn();
  const esLunes = diaSemana(hoy) === 1;

  const filtro = soloPush
    ? `id=eq.${soloPush}`
    : `hora=${atrasadas ? 'lte' : 'eq'}.${hora}&or=(diario.eq.true,semanal.eq.true)` +
      (hogar ? `&hogar_id=eq.${hogar}` : '');
  const suscripciones = await rest<FilaPush[]>(
    `ag_push?${filtro}&select=id,hogar_id,endpoint,p256dh,auth,hora,diario,semanal,` +
      `ultimo_diario,ultimo_semanal&limit=200`,
  );
  if (!suscripciones.length) return { mirados: 0, enviados: 0, errores: 0 };

  const claves = await clavesVapid();
  let enviados = 0;
  let errores = 0;

  // Se agrupa por hogar: los datos son los mismos para todos los de la casa.
  const porHogar = new Map<string, FilaPush[]>();
  for (const s of suscripciones) {
    if (!porHogar.has(s.hogar_id)) porHogar.set(s.hogar_id, []);
    porHogar.get(s.hogar_id)!.push(s);
  }

  for (const [hogarId, suyas] of porHogar) {
    const hasta = sumarDias(hoy, 8);
    const [eventos, tareas, menu, personas] = await Promise.all([
      rest<EventoFila[]>(
        `ag_eventos?hogar_id=eq.${hogarId}&select=id,titulo,inicio,todo_el_dia,` +
          `persona_id,repite,repite_dias,repite_hasta,ag_ocurrencias(fecha,estado)` +
          `&limit=1000`,
      ),
      rest<TareaFila[]>(
        `ag_tareas?hogar_id=eq.${hogarId}&hecha=eq.false` +
          `&select=id,titulo,vence,hecha,persona_id&limit=400`,
      ),
      rest<{ fecha: string; momento: string; titulo: string }[]>(
        `ag_menu?hogar_id=eq.${hogarId}&fecha=gte.${hoy}&fecha=lte.${hasta}` +
          `&select=fecha,momento,titulo&limit=60`,
      ),
      rest<{ id: string; nombre: string }[]>(
        `ag_personas?hogar_id=eq.${hogarId}&select=id,nombre`,
      ),
    ]);
    const nombres = new Map(personas.map((p) => [p.id, p.nombre]));

    const diaDeHoy = armarDia(hoy, eventos, tareas, menu, nombres, hoy);
    const semana = Array.from({ length: 7 }, (_, i) =>
      armarDia(sumarDias(hoy, i), eventos, tareas, menu, nombres, hoy));

    for (const s of suyas) {
      // Forzado (la prueba desde la app) manda el del día sí o sí.
      const forzado = !!soloPush;
      const mandarSemanal = !forzado && s.semanal && esLunes &&
        s.ultimo_semanal !== hoy;
      const mandarDiario = forzado ||
        (s.diario && s.ultimo_diario !== hoy && !mandarSemanal);

      let aviso: Aviso | null = null;
      if (mandarSemanal) aviso = avisoDeLaSemana(semana, DIAS);
      else if (mandarDiario) aviso = avisoDelDia(diaDeHoy);

      if (!aviso) {
        // Nada que decir. Igual se marca el día: sin esto, un día tranquilo
        // se reintenta en cada vuelta de la hora siguiente.
        if (mandarDiario) {
          await rest(`ag_push?id=eq.${s.id}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ ultimo_diario: hoy }),
          });
        }
        continue;
      }

      const sus: Suscripcion = {
        endpoint: s.endpoint,
        p256dh: s.p256dh,
        auth: s.auth,
      };
      const r = await enviarPush(sus, aviso, claves, claves.contacto);

      if (r.vencida) {
        // El navegador se desuscribió o borró la app: si no se saca, se le
        // sigue mandando a un endpoint muerto para siempre.
        await rest(`ag_push?id=eq.${s.id}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
        errores++;
        continue;
      }

      const cambios: Record<string, unknown> = {
        ultimo_error: r.ok ? null : `${r.status} ${r.detalle ?? ''}`.slice(0, 300),
      };
      if (r.ok && !forzado) {
        if (mandarSemanal) cambios.ultimo_semanal = hoy;
        if (mandarDiario) cambios.ultimo_diario = hoy;
      }
      await rest(`ag_push?id=eq.${s.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(cambios),
      });

      if (r.ok) enviados++;
      else errores++;
    }
  }

  return { mirados: suscripciones.length, enviados, errores };
}

// ---------------------------------------------------------------------------

/** Quien esta pidiendo esto, segun SU sesion. null si no hay sesion valida. */
async function quienEs(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const yo = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: auth },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return yo?.id ?? null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') return json(req, { error: 'Usá POST' }, 405);

  let pedido: { modo?: string; push_id?: string } = {};
  try {
    pedido = await req.json();
  } catch { /* el disparador manda un cuerpo vacío */ }

  // Existe y anda: lo usa "Revisar las funciones".
  if (pedido.modo === 'ping') {
    return json(req, { ok: true, funcion: 'avisos' });
  }

  // La clave pública es pública por definición: con ella el navegador se
  // suscribe, y sin ella no puede.
  if (pedido.modo === 'clave') {
    try {
      const c = await clavesVapid();
      return json(req, { ok: true, clave: c.publica });
    } catch (e) {
      console.error('avisos/clave', e);
      return json(req, { error: 'No se pudieron preparar las claves' }, 500);
    }
  }

  // La prueba la pide una persona desde la app, así que se autoriza con SU
  // sesión. No con el token del disparador: ese no tiene por qué salir nunca
  // de la base, y un token que viaja al navegador es un token filtrado.
  if (pedido.modo === 'prueba') {
    const yo = await quienEs(req);
    if (!yo) return json(req, { error: 'Hay que estar logueado' }, 401);

    // Y solo puede probar SU propio dispositivo.
    const filas = await rest<{ id: string }[]>(
      `ag_push?id=eq.${pedido.push_id ?? ''}&user_id=eq.${yo}&select=id&limit=1`,
    ).catch(() => []);
    if (!filas.length) return json(req, { error: 'Ese aparato no es tuyo' }, 403);

    try {
      const r = await darLaVuelta({ soloPush: pedido.push_id });
      return json(req, { ok: true, ...r });
    } catch (e) {
      console.error('avisos/prueba', e);
      return json(req, { error: String((e as Error)?.message ?? e) }, 500);
    }
  }

  // La red de seguridad: si el proyecto no deja prender pg_cron, la vuelta la
  // empuja quien abre la app. Va con SU sesion y solo alcanza a SU hogar, y
  // toma tambien las horas que ya pasaron hoy, porque nadie la disparo a la
  // hora justa. Mandar dos veces lo mismo no puede: eso lo corta ultimo_diario.
  if (pedido.modo === 'vuelta') {
    const yo = await quienEs(req);
    if (!yo) return json(req, { error: 'Hay que estar logueado' }, 401);

    const casas = await rest<{ hogar_id: string }[]>(
      `ag_personas?user_id=eq.${yo}&select=hogar_id&limit=10`,
    ).catch(() => []);
    if (!casas.length) return json(req, { ok: true, mirados: 0, enviados: 0, errores: 0 });

    try {
      let total = { mirados: 0, enviados: 0, errores: 0 };
      for (const c of casas) {
        const r = await darLaVuelta({ hogar: c.hogar_id, atrasadas: true });
        total = {
          mirados: total.mirados + r.mirados,
          enviados: total.enviados + r.enviados,
          errores: total.errores + r.errores,
        };
      }
      return json(req, { ok: true, ...total });
    } catch (e) {
      console.error('avisos/vuelta', e);
      return json(req, { error: String((e as Error)?.message ?? e) }, 500);
    }
  }

  // La vuelta horaria la dispara pg_cron con el token que vive en la base.
  const token = req.headers.get('x-avisos-token') ?? '';
  const config = await rest<{ token: string }[]>(
    'ag_avisos_config?select=token&limit=1',
  ).catch(() => []);
  if (!config.length || !token || token !== config[0].token) {
    return json(req, { error: 'No autorizado' }, 401);
  }

  try {
    const r = await darLaVuelta();
    return json(req, { ok: true, ...r });
  } catch (e) {
    console.error('avisos', e);
    return json(req, { error: String((e as Error)?.message ?? e) }, 500);
  }
});
