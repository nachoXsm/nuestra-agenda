// ============================================================================
//  Todo lo que habla con Supabase: sesión, datos y tiempo real.
//
//  Es la única puerta a la base. Las vistas no tocan la red directamente, así
//  que si algo cambia (una tabla, la forma de autenticar) se cambia acá y nada
//  más.
// ============================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { CONFIG, configListo } from '../../config.js';

const CLAVE_LOCAL = 'ag_config';

/**
 * La configuración a usar: primero config.js, y si ahí están los valores de
 * ejemplo, lo que se haya cargado a mano en este navegador.
 */
export function configActual() {
  if (configListo(CONFIG)) return CONFIG;
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || 'null');
    if (configListo(guardada)) return guardada;
  } catch { /* localStorage bloqueado o JSON roto */ }
  return null;
}

export function guardarConfig(url, clave) {
  const c = { SUPABASE_URL: String(url).trim(), SUPABASE_ANON_KEY: String(clave).trim() };
  if (!configListo(c)) throw new Error('Esa URL o esa clave no tienen la forma esperada');
  localStorage.setItem(CLAVE_LOCAL, JSON.stringify(c));
  return c;
}

export function olvidarConfig() {
  localStorage.removeItem(CLAVE_LOCAL);
}

// ---------------------------------------------------------------------------

let cliente = null;

/** El cliente de Supabase. Tira error si todavía no hay configuración. */
export function sb() {
  if (cliente) return cliente;
  const c = configActual();
  if (!c) throw new Error('SIN_CONFIG');
  cliente = createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // El link de recuperación de contraseña vuelve con el token en el hash.
      detectSessionInUrl: true,
    },
  });
  return cliente;
}

export function hayConfig() {
  return configActual() !== null;
}

/** La URL base de las Edge Functions. */
export function urlFuncion(nombre) {
  const c = configActual();
  if (!c) throw new Error('SIN_CONFIG');
  return `${c.SUPABASE_URL}/functions/v1/${nombre}`;
}

// ---------------------------------------------------------------------------
//  Errores
// ---------------------------------------------------------------------------

// Supabase habla en inglés y con jerga. Acá se traduce a algo que se entienda.
const MENSAJES = [
  [/invalid login credentials/i, 'El mail o la contraseña no coinciden'],
  [/email not confirmed/i, 'Falta confirmar el mail. Revisá tu casilla.'],
  [/user already registered|already been registered/i,
    'Ese mail ya tiene cuenta. Probá entrar en vez de registrarte.'],
  [/password should be at least (\d+)/i, 'La contraseña necesita al menos $1 caracteres'],
  [/unable to validate email|invalid email/i, 'Ese mail no parece válido'],
  [/signups not allowed|signup is disabled/i,
    'El registro está cerrado en este proyecto de Supabase'],
  [/over_email_send_rate_limit|email rate limit/i,
    'Demasiados intentos seguidos. Esperá un minuto.'],
  [/ese codigo no existe|ese código no existe/i,
    'Ese código de hogar no existe. Revisá las 6 letras.'],
  [/duplicate key value.*ag_menu/i, 'Ya hay algo planificado para ese día y ese momento'],
  [/duplicate key/i, 'Eso ya estaba cargado'],
  [/row-level security|violates row-level/i, 'No tenés permiso para eso'],
  [/jwt expired|invalid token/i, 'Se venció la sesión. Volvé a entrar.'],
  [/failed to fetch|networkerror|load failed/i,
    'No hay conexión con el servidor. Revisá internet.'],
  [/could not find the table '(?:public\.)?([a-z_]+)'/i,
    'Falta la tabla $1 en la base. Hay que volver a correr supabase/schema.sql.'],
  [/relation "(?:public\.)?([a-z_]+)" does not exist/i,
    'Falta la tabla $1 en la base. Hay que volver a correr supabase/schema.sql.'],
  [/SIN_CONFIG/, 'Falta configurar la conexión con Supabase'],
];

// Una tabla que todavía no está. Pasa de verdad: alguien instala la app, más
// adelante se agrega una tabla nueva, y hasta que no vuelve a correr el
// schema.sql esa tabla no existe en su proyecto. PostgREST lo dice con
// PGRST205 y Postgres directo con 42P01.
const FALTA_TABLA = [
  /could not find the table '(?:public\.)?([a-z_]+)'/i,
  /relation "(?:public\.)?([a-z_]+)" does not exist/i,
];

function detectarTablaQueFalta(error) {
  const texto = typeof error === 'string'
    ? error
    : `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;
  for (const patron of FALTA_TABLA) {
    const m = texto.match(patron);
    if (m) return m[1];
  }
  return null;
}

/**
 * Si el error es "esa tabla no existe", devuelve el nombre de la tabla; si no,
 * null. Sirve para que una sección que todavía no está instalada no se lleve
 * puesta la app entera.
 */
export function tablaQueFalta(e) {
  return e?.tablaQueFalta ?? detectarTablaQueFalta(e);
}

export function mensajeDeError(e) {
  const texto = typeof e === 'string' ? e : (e?.message ?? e?.error_description ?? '');
  for (const [patron, traduccion] of MENSAJES) {
    const m = texto.match(patron);
    if (m) return traduccion.replace('$1', m[1] ?? '');
  }
  return texto || 'Algo salió mal';
}

// Envuelve una respuesta de supabase-js: o devuelve los datos, o tira un error
// ya traducido. Así las vistas no repiten el chequeo de `error` en cada llamada.
function ok({ data, error }) {
  if (error) {
    const err = new Error(mensajeDeError(error));
    // El mensaje ya sale traducido y ahí se pierde el nombre de la tabla, así
    // que se guarda aparte antes de perderlo.
    const falta = detectarTablaQueFalta(error);
    if (falta) err.tablaQueFalta = falta;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
//  Sesión
// ---------------------------------------------------------------------------

export async function sesion() {
  const { data } = await sb().auth.getSession();
  return data?.session ?? null;
}

export async function usuario() {
  return (await sesion())?.user ?? null;
}

export async function registrarse(email, password) {
  return ok(await sb().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  }));
}

export async function entrar(email, password) {
  return ok(await sb().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  }));
}

export async function salir() {
  await sb().auth.signOut();
}

export async function recuperarPassword(email) {
  return ok(await sb().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: location.origin + location.pathname,
  }));
}

export async function cambiarPassword(nueva) {
  return ok(await sb().auth.updateUser({ password: nueva }));
}

export function alCambiarSesion(fn) {
  const { data } = sb().auth.onAuthStateChange((evento, sesion) => fn(evento, sesion));
  return () => data?.subscription?.unsubscribe();
}

// ---------------------------------------------------------------------------
//  Hogar y personas
// ---------------------------------------------------------------------------

/** El hogar del usuario actual, o null si todavía no tiene ninguno. */
export async function miHogar() {
  const personas = ok(
    await sb().from('ag_personas').select('hogar_id').limit(1),
  );
  if (!personas?.length) return null;

  const hogares = ok(
    await sb().from('ag_hogares').select('*').eq('id', personas[0].hogar_id).limit(1),
  );
  return hogares?.[0] ?? null;
}

export async function crearHogar({ nombre, miNombre, color, emoji }) {
  return ok(await sb().rpc('ag_crear_hogar', {
    p_nombre: nombre,
    p_mi_nombre: miNombre,
    p_color: color,
    p_emoji: emoji,
  }));
}

export async function unirseAHogar({ codigo, miNombre, color, emoji }) {
  return ok(await sb().rpc('ag_unirse_a_hogar', {
    p_codigo: codigo,
    p_mi_nombre: miNombre,
    p_color: color,
    p_emoji: emoji,
  }));
}

export async function personas(hogarId) {
  return ok(
    await sb().from('ag_personas').select('*').eq('hogar_id', hogarId)
      .order('orden', { ascending: true }),
  );
}

export async function agregarPersona(hogarId, { nombre, color, emoji }) {
  return ok(await sb().from('ag_personas').insert({
    hogar_id: hogarId,
    user_id: null, // los integrantes sin cuenta, como los chicos
    nombre,
    color,
    emoji,
  }).select().single());
}

export async function editarPersona(id, cambios) {
  return ok(await sb().from('ag_personas').update(cambios).eq('id', id).select().single());
}

export async function borrarPersona(id) {
  return ok(await sb().from('ag_personas').delete().eq('id', id));
}

export async function renombrarHogar(id, nombre) {
  return ok(await sb().from('ag_hogares').update({ nombre }).eq('id', id).select().single());
}

export async function regenerarFeedToken(hogarId) {
  return ok(await sb().rpc('ag_regenerar_feed_token', { p_hogar: hogarId }));
}

// ---------------------------------------------------------------------------
//  Eventos
// ---------------------------------------------------------------------------

/**
 * Los eventos que pueden caer en un rango: los que arrancan dentro, más TODOS
 * los que se repiten (esos se expanden después con ocurrencias(), que es la que
 * sabe si caen o no).
 */
export async function eventos(hogarId, desde, hasta) {
  return ok(
    await sb().from('ag_eventos')
      .select('*, ag_ocurrencias(fecha, estado)')
      .eq('hogar_id', hogarId)
      .or(`and(inicio.gte.${desde}T00:00:00-03:00,inicio.lte.${hasta}T23:59:59-03:00),repite.neq.no`)
      .order('inicio', { ascending: true }),
  );
}

export async function guardarEvento(evento) {
  if (evento.id) {
    const { id, ag_ocurrencias: _o, ...cambios } = evento;
    return ok(await sb().from('ag_eventos').update(cambios).eq('id', id).select().single());
  }
  return ok(await sb().from('ag_eventos').insert(evento).select().single());
}

export async function borrarEvento(id) {
  return ok(await sb().from('ag_eventos').delete().eq('id', id));
}

/** Marca una fecha puntual de un evento como hecha o cancelada. */
export async function marcarOcurrencia(eventoId, fecha, estado) {
  return ok(
    await sb().from('ag_ocurrencias')
      .upsert({ evento_id: eventoId, fecha, estado }, { onConflict: 'evento_id,fecha' })
      .select().single(),
  );
}

export async function desmarcarOcurrencia(eventoId, fecha) {
  return ok(
    await sb().from('ag_ocurrencias').delete()
      .eq('evento_id', eventoId).eq('fecha', fecha),
  );
}

// ---------------------------------------------------------------------------
//  Menú
// ---------------------------------------------------------------------------

export async function menu(hogarId, desde, hasta) {
  return ok(
    await sb().from('ag_menu').select('*')
      .eq('hogar_id', hogarId)
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: true }),
  );
}

/** Guarda una comida. Si ya había algo ese día y ese momento, lo reemplaza. */
export async function guardarComida(comida) {
  return ok(
    await sb().from('ag_menu')
      .upsert(comida, { onConflict: 'hogar_id,fecha,momento' })
      .select().single(),
  );
}

/** Carga varias comidas de una (lo que devuelve el agente). */
export async function guardarComidas(comidas) {
  if (!comidas.length) return [];
  return ok(
    await sb().from('ag_menu')
      .upsert(comidas, { onConflict: 'hogar_id,fecha,momento' })
      .select(),
  );
}

export async function borrarComida(id) {
  return ok(await sb().from('ag_menu').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
//  Lista de compras
// ---------------------------------------------------------------------------

export async function compras(hogarId) {
  return ok(
    await sb().from('ag_compras').select('*')
      .eq('hogar_id', hogarId)
      .order('comprado', { ascending: true })
      .order('created_at', { ascending: true }),
  );
}

export async function agregarCompra(item) {
  return ok(await sb().from('ag_compras').insert(item).select().single());
}

export async function editarCompra(id, cambios) {
  return ok(await sb().from('ag_compras').update(cambios).eq('id', id).select().single());
}

export async function borrarCompra(id) {
  return ok(await sb().from('ag_compras').delete().eq('id', id));
}

export async function borrarComprados(hogarId) {
  return ok(
    await sb().from('ag_compras').delete()
      .eq('hogar_id', hogarId).eq('comprado', true),
  );
}

/** Vuelca los ingredientes del menú de un rango a la lista. Devuelve cuántos sumó. */
export async function menuALaLista(hogarId, desde, hasta) {
  return ok(await sb().rpc('ag_menu_a_compras', {
    p_hogar: hogarId,
    p_desde: desde,
    p_hasta: hasta,
  }));
}

// ---------------------------------------------------------------------------
//  Tareas de la casa
// ---------------------------------------------------------------------------

export async function tareas(hogarId) {
  return ok(
    await sb().from('ag_tareas').select('*')
      .eq('hogar_id', hogarId)
      // Las pendientes primero, y dentro de cada grupo por vencimiento. Las que
      // no tienen fecha van al final: nullsFirst en ascendente las pondría
      // arriba de todo, que es justo al revés de lo que uno espera.
      .order('hecha', { ascending: true })
      .order('vence', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  );
}

export async function guardarTarea(tarea) {
  if (tarea.id) {
    const { id, ...cambios } = tarea;
    return ok(await sb().from('ag_tareas').update(cambios).eq('id', id).select().single());
  }
  return ok(await sb().from('ag_tareas').insert(tarea).select().single());
}

export async function marcarTarea(id, hecha) {
  return ok(
    await sb().from('ag_tareas')
      .update({ hecha, hecha_en: hecha ? new Date().toISOString() : null })
      .eq('id', id).select().single(),
  );
}

export async function borrarTarea(id) {
  return ok(await sb().from('ag_tareas').delete().eq('id', id));
}

/** Borra de una todas las que ya están hechas. */
export async function borrarTareasHechas(hogarId) {
  return ok(
    await sb().from('ag_tareas').delete().eq('hogar_id', hogarId).eq('hecha', true),
  );
}

// ---------------------------------------------------------------------------
//  Preferencias de comida
// ---------------------------------------------------------------------------

export async function preferencias(hogarId) {
  const filas = ok(
    await sb().from('ag_preferencias').select('*').eq('hogar_id', hogarId).limit(1),
  );
  return filas?.[0] ?? null;
}

export async function guardarPreferencias(hogarId, cambios) {
  return ok(
    await sb().from('ag_preferencias')
      .upsert({ hogar_id: hogarId, ...cambios }, { onConflict: 'hogar_id' })
      .select().single(),
  );
}

// ---------------------------------------------------------------------------
//  Calendarios importados
// ---------------------------------------------------------------------------

export async function calendarios(hogarId) {
  return ok(
    await sb().from('ag_calendarios').select('*')
      .eq('hogar_id', hogarId).order('created_at', { ascending: true }),
  );
}

export async function guardarCalendario(cal) {
  if (cal.id) {
    const { id, ...cambios } = cal;
    return ok(
      await sb().from('ag_calendarios').update(cambios).eq('id', id).select().single(),
    );
  }
  return ok(await sb().from('ag_calendarios').insert(cal).select().single());
}

export async function borrarCalendario(id, borrarEventos = true) {
  if (borrarEventos) {
    ok(await sb().from('ag_eventos').delete().eq('calendario_id', id));
  }
  return ok(await sb().from('ag_calendarios').delete().eq('id', id));
}

/**
 * Guarda los eventos de un calendario importado. Usa ics_uid para que
 * reimportar actualice en vez de duplicar.
 */
export async function importarEventos(filas) {
  if (!filas.length) return [];

  // Dos filas con el mismo ics_uid en un solo upsert hacen que Postgres corte
  // todo con "ON CONFLICT DO UPDATE command cannot affect row a second time".
  // Pasa con calendarios de verdad: Google repite el UID en las instancias
  // sueltas de un evento que se repite, y hay exports con eventos duplicados.
  // Las instancias sueltas ya se separan al leer el .ics (ver RECURRENCE-ID en
  // ics.js); esto es la red abajo, para que un archivo raro no voltee la
  // importación entera. Gana la última, que en un .ics suele ser la más nueva.
  const porUid = new Map();
  for (const f of filas) porUid.set(f.ics_uid, f);

  return ok(
    await sb().from('ag_eventos')
      .upsert([...porUid.values()], { onConflict: 'hogar_id,ics_uid' })
      .select(),
  );
}

/** Baja un .ics de una URL a través de la función (el navegador no puede: CORS). */
export async function bajarIcsRemoto(url) {
  const s = await sesion();
  const res = await fetch(urlFuncion('ics-proxy'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s?.access_token ?? configActual().SUPABASE_ANON_KEY}`,
      apikey: configActual().SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ url }),
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(cuerpo?.error || `El servidor respondió ${res.status}`);
  return cuerpo.ics;
}

// ---------------------------------------------------------------------------
//  Avisos propios de la app (Web Push)
// ---------------------------------------------------------------------------

/** El navegador puede, y estamos en un contexto donde tiene sentido pedirlo. */
export function puedeAvisar() {
  return typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
}

export const permisoAvisos = () =>
  typeof Notification === 'undefined' ? 'no-se-puede' : Notification.permission;

async function llamarAvisos(cuerpo) {
  const s = await sesion();
  const res = await fetch(urlFuncion('avisos'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s?.access_token ?? configActual().SUPABASE_ANON_KEY}`,
      apikey: configActual().SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Los avisos respondieron ${res.status}`);
  return data;
}

/**
 * Prende los avisos en ESTE dispositivo.
 *
 * Pide permiso, se suscribe al servicio de push del navegador y guarda la
 * suscripción. La clave pública la trae la función, que la genera sola la
 * primera vez: no hay ninguna clave que pegar a mano en ningún lado.
 */
export async function prenderAvisos(hogarId, personaId, { hora = 8 } = {}) {
  if (!puedeAvisar()) throw new Error('Este navegador no puede mostrar avisos');

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    throw new Error(
      permiso === 'denied'
        ? 'Los avisos están bloqueados para este sitio. Se cambia en los ajustes del navegador.'
        : 'Hace falta permitir los avisos',
    );
  }

  const reg = await navigator.serviceWorker.ready;
  const { clave } = await llamarAvisos({ modo: 'clave' });
  if (!clave) throw new Error('No se pudo preparar la clave de los avisos');

  // El navegador quiere la clave como bytes, no como texto.
  const bytes = Uint8Array.from(
    atob(clave.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );

  const sus = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  const j = sus.toJSON();

  const fila = {
    hogar_id: hogarId,
    user_id: (await usuario())?.id,
    persona_id: personaId || null,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    hora,
  };
  // El endpoint es único: si este navegador ya estaba, se actualiza.
  const guardado = ok(
    await sb().from('ag_push').upsert(fila, { onConflict: 'endpoint' }).select().single(),
  );

  // Que el disparador horario sepa a qué dirección pegar. Es idempotente y la
  // función SQL solo acepta la URL de esta misma función.
  await sb().rpc('ag_registrar_url_avisos', { p_url: urlFuncion('avisos') })
    .then(({ error }) => {
      // Que falle esto no tiene que romper el alta: los avisos se pueden
      // disparar igual desde la app.
      if (error) console.warn('No se pudo registrar la URL de avisos', error.message);
    });

  return guardado;
}

/** Apaga los avisos en este dispositivo. */
export async function apagarAvisos() {
  const reg = await navigator.serviceWorker.ready;
  const sus = await reg.pushManager.getSubscription();
  if (!sus) return;
  const endpoint = sus.endpoint;
  await sus.unsubscribe().catch(() => {});
  await sb().from('ag_push').delete().eq('endpoint', endpoint);
}

/** La configuración de ESTE dispositivo, o null si nunca se prendieron. */
export async function avisosDeEsteAparato() {
  if (!puedeAvisar()) return null;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  const sus = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sus) return null;
  const filas = ok(
    await sb().from('ag_push').select('*').eq('endpoint', sus.endpoint).limit(1),
  );
  return filas[0] ?? null;
}

export async function cambiarAvisos(id, cambios) {
  return ok(await sb().from('ag_push').update(cambios).eq('id', id).select().single());
}

/**
 * Manda una notificación de prueba a este dispositivo, ahora mismo.
 * Va con la sesión de quien la pide: la función verifica que el aparato sea
 * suyo antes de mandar nada.
 */
export async function probarAvisos(id) {
  return await llamarAvisos({ modo: 'prueba', push_id: id });
}

/**
 * Empuja la vuelta de avisos del hogar de quien está usando la app.
 *
 * Es la red de seguridad para los proyectos donde no se puede prender pg_cron:
 * sin disparador, los avisos no saldrían nunca solos. Así salen igual —tarde,
 * pero salen— cuando alguien de la casa abre la app.
 *
 * Mandar dos veces lo mismo no puede: la función marca en cada aparato qué día
 * le mandó cada aviso, y la segunda vuelta no hace nada.
 *
 * No tira error nunca, y devuelve null si no se pudo: que la función no esté
 * subida no es un problema de quien está abriendo la app. Quien la llama usa
 * ese null para volver a intentar más tarde.
 */
export async function empujarAvisos() {
  try {
    return await llamarAvisos({ modo: 'vuelta' });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
//  ¿Están subidas las Edge Functions?
// ---------------------------------------------------------------------------

/**
 * Le pregunta a una función si está viva, sin hacerle hacer nada.
 *
 * Las tres entienden { modo: 'ping' } y contestan sin salir a la red ni llamar
 * al modelo, así que esto no gasta cuota ni cuesta plata.
 *
 * @returns {Promise<{estado: string, detalle: string}>}
 *   'bien'      — responde como corresponde
 *   'sin-clave' — está subida pero le falta el secreto GROQ_KEY
 *   'no-esta'   — no está subida (404)
 *   'mal'       — está pero contestó cualquier cosa
 */
async function pingFuncion(nombre) {
  let res;
  try {
    const s = await sesion();
    res = await fetch(urlFuncion(nombre), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s?.access_token ?? configActual().SUPABASE_ANON_KEY}`,
        apikey: configActual().SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ modo: 'ping' }),
    });
  } catch (e) {
    // Sin red, o el navegador cortó el pedido. No se puede saber más.
    return { estado: 'mal', detalle: mensajeDeError(e) };
  }

  if (res.status === 404) {
    return { estado: 'no-esta', detalle: 'Todavía no está subida' };
  }
  if (res.status === 401 || res.status === 403) {
    return { estado: 'mal', detalle: 'Rechazó la autorización' };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    return { estado: 'mal', detalle: data?.error || `Respondió ${res.status}` };
  }
  // Solo chef-ia informa si tiene la clave; para las demás, groq viene undefined.
  if (data.groq === false) {
    return { estado: 'sin-clave', detalle: 'Está subida, pero le falta el secreto GROQ_KEY' };
  }
  return { estado: 'bien', detalle: 'Responde bien' };
}

/**
 * Revisa las funciones que se pueden revisar desde acá.
 *
 * ics-feed queda afuera a propósito: para probarla de verdad hay que pedirla
 * SIN token de sesión, como haría el calendario del celular, y si quedó con
 * Verify JWT prendido el rechazo lo hace Supabase antes de la función, sin
 * encabezados de CORS. El navegador no deja leer esa respuesta, así que desde
 * la app no se distingue "no está" de "está pero con JWT". Se prueba abriendo
 * el link del feed en una pestaña, que es lo que dice la pantalla de avisos.
 */
export async function revisarFunciones() {
  const nombres = ['chef-ia', 'ics-proxy', 'avisos'];
  const resultados = await Promise.all(nombres.map((n) => pingFuncion(n)));
  return nombres.map((nombre, i) => ({ nombre, ...resultados[i] }));
}

// ---------------------------------------------------------------------------
//  Agente de IA
// ---------------------------------------------------------------------------

async function llamarChef(cuerpo) {
  const s = await sesion();
  const res = await fetch(urlFuncion('chef-ia'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s?.access_token ?? configActual().SUPABASE_ANON_KEY}`,
      apikey: configActual().SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `El agente respondió ${res.status}`);
  return data;
}

export async function chefChat(mensajes, contexto) {
  const r = await llamarChef({ modo: 'chat', mensajes, contexto });
  return r.respuesta;
}

export function chefMenu({ contexto, desde, dias, momentos, instruccion }) {
  return llamarChef({ modo: 'menu', contexto, desde, dias, momentos, instruccion });
}

export async function mensajesChef(hogarId, limite = 60) {
  const filas = ok(
    await sb().from('ag_chef_mensajes').select('*')
      .eq('hogar_id', hogarId)
      .order('created_at', { ascending: false })
      .limit(limite),
  );
  return (filas ?? []).reverse();
}

export async function guardarMensajeChef(hogarId, rol, contenido) {
  return ok(
    await sb().from('ag_chef_mensajes')
      .insert({ hogar_id: hogarId, rol, contenido }).select().single(),
  );
}

export async function limpiarChatChef(hogarId) {
  return ok(await sb().from('ag_chef_mensajes').delete().eq('hogar_id', hogarId));
}

// ---------------------------------------------------------------------------
//  Recetas guardadas
// ---------------------------------------------------------------------------

export async function recetasGuardadas(hogarId) {
  return ok(
    await sb().from('ag_recetas').select('*')
      .eq('hogar_id', hogarId).order('created_at', { ascending: false }),
  );
}

export async function guardarReceta(receta) {
  return ok(await sb().from('ag_recetas').insert(receta).select().single());
}

export async function borrarReceta(id) {
  return ok(await sb().from('ag_recetas').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
//  Tiempo real
// ---------------------------------------------------------------------------

/**
 * Escucha los cambios del hogar para que lo que carga uno le aparezca al otro
 * sin recargar. Devuelve una función para cortar la suscripción.
 */
export function escucharHogar(hogarId, alCambio) {
  const canal = sb().channel(`hogar-${hogarId}`);

  for (const tabla of ['ag_eventos', 'ag_menu', 'ag_compras', 'ag_personas', 'ag_tareas']) {
    canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tabla, filter: `hogar_id=eq.${hogarId}` },
      (carga) => alCambio(tabla, carga),
    );
  }

  // ag_ocurrencias no tiene hogar_id, así que llega sin filtrar; son pocas y el
  // RLS ya garantiza que solo vengan las del hogar propio.
  canal.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'ag_ocurrencias' },
    (carga) => alCambio('ag_ocurrencias', carga),
  );

  canal.subscribe();
  return () => sb().removeChannel(canal);
}
