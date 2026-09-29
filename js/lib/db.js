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
  [/SIN_CONFIG/, 'Falta configurar la conexión con Supabase'],
];

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
  if (error) throw new Error(mensajeDeError(error));
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
  return ok(
    await sb().from('ag_eventos')
      .upsert(filas, { onConflict: 'hogar_id,ics_uid' })
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
