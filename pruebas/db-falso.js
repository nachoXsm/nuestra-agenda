// ============================================================================
//  Supabase de mentira, en memoria.
//
//  Exporta lo mismo que js/lib/db.js. Durante las pruebas el navegador recibe
//  este archivo en lugar del verdadero (ver app.test.mjs), así la interfaz
//  entera se puede manejar sin proyecto de Supabase, sin red y sin claves.
//
//  No es un simulacro de juguete: guarda estado, respeta las claves únicas de
//  las tablas y devuelve los mismos errores, porque si no las pruebas pasarían
//  con cosas que en producción fallan.
// ============================================================================

const uuid = () =>
  ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
  );

// Lo que hay cargado. Las pruebas lo leen desde window.__falso para verificar.
const bd = {
  hogar: {
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    nombre: 'Casa de prueba',
    codigo: 'TR7KM9',
    feed_token: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  },
  personas: [
    {
      id: 'p1',
      hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      user_id: 'u1',
      nombre: 'Ana',
      color: '#4F7A63',
      emoji: '🧉',
      es_admin: true,
      orden: 0,
    },
    {
      id: 'p2',
      hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      user_id: 'u2',
      nombre: 'Bruno',
      color: '#2C5A66',
      emoji: '🌻',
      es_admin: false,
      orden: 1,
    },
    {
      id: 'p3',
      hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      user_id: null,
      nombre: 'Lila',
      color: '#C4674A',
      emoji: '🧒',
      es_admin: false,
      orden: 2,
    },
  ],
  eventos: [],
  ocurrencias: [],
  menu: [],
  compras: [],
  tareas: [],
  calendarios: [],
  preferencias: {
    hogar_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    restricciones: [],
    no_gusta: [],
    presupuesto: 'medio',
    tiempo_cocina: 'medio',
    porciones: 3,
    notas: null,
  },
  chef: [],
  recetas: [],
  // Lo que las pruebas quieran manipular.
  sesion: {
    access_token: 'token-de-prueba',
    user: { id: 'u1', email: 'ana@prueba.local' },
  },
  // Respuestas preparadas para el agente.
  respuestaChat: 'Con el zapallo que está de temporada te sale una crema en 30 minutos.',
  respuestaMenu: null,
  // Para simular un proyecto al que le falta correr el schema.sql de nuevo.
  tablasQueFaltan: [],
  // Lo que contesta "Revisar las funciones". Por defecto, todas arriba.
  estadoFunciones: [
    { nombre: 'chef-ia', estado: 'bien', detalle: 'Responde bien' },
    { nombre: 'ics-proxy', estado: 'bien', detalle: 'Responde bien' },
    { nombre: 'avisos', estado: 'bien', detalle: 'Responde bien' },
  ],
  // Avisos: este navegador puede, todavía no pidió permiso, y no hay aparato.
  puedeAvisar: true,
  permisoAvisos: 'default',
  pushAparato: null,
  pruebasMandadas: 0,
  vueltasEmpujadas: 0,
  // Para verificar qué contexto se le mandó al agente.
  ultimoPedidoChef: null,
  fallarProximo: null,
};

// Las pruebas siembran datos ANTES de que cargue la página (con addInitScript),
// porque recargar vuelve a ejecutar este módulo y se llevaría puesto todo lo que
// se hubiera cargado después. Por eso la semilla se lee acá, al arrancar.
if (globalThis.__semilla) Object.assign(bd, globalThis.__semilla);

globalThis.__falso = bd;

// Un poquito de demora, como una red de verdad: así se ven los estados de carga
// y las pruebas no pasan por accidente gracias a que todo es sincrónico.
const demora = (v) => new Promise((r) => setTimeout(() => r(v), 12));

function quizasFallar(operacion) {
  if (bd.fallarProximo === operacion) {
    bd.fallarProximo = null;
    throw new Error('Falla de prueba en ' + operacion);
  }
}

/**
 * Simula una tabla que no está en la base, como cuando alguien instaló la app
 * antes de que esa tabla existiera y no volvió a correr el schema.sql. El
 * error tiene la misma forma que el de PostgREST, incluida la marca que deja
 * ok() en db.js.
 */
function quizasFaltaLaTabla(tabla) {
  if (!(bd.tablasQueFaltan ?? []).includes(tabla)) return;
  const e = new Error(
    `Falta la tabla ${tabla} en la base. Hay que volver a correr supabase/schema.sql.`,
  );
  e.tablaQueFalta = tabla;
  throw e;
}

export function tablaQueFalta(e) {
  return e?.tablaQueFalta ?? null;
}

// --- configuración ----------------------------------------------------------

export function configActual() {
  return { SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'clave-de-prueba-larga' };
}
export function guardarConfig() {
  return configActual();
}
export function olvidarConfig() {}
export function hayConfig() {
  return true;
}
export function sb() {
  throw new Error('El cliente real no se usa en las pruebas');
}
export function urlFuncion(nombre) {
  return `https://prueba.supabase.co/functions/v1/${nombre}`;
}

export function mensajeDeError(e) {
  return typeof e === 'string' ? e : (e?.message ?? 'Algo salió mal');
}

// --- sesión -----------------------------------------------------------------

export async function sesion() {
  return demora(bd.sesion);
}
export async function usuario() {
  return (await sesion())?.user ?? null;
}
export async function registrarse(email) {
  bd.sesion = { access_token: 't', user: { id: 'u1', email } };
  return demora({ session: bd.sesion });
}
export async function entrar(email, password) {
  await demora();
  if (password === 'mal') throw new Error('El mail o la contraseña no coinciden');
  bd.sesion = { access_token: 't', user: { id: 'u1', email } };
  return { session: bd.sesion };
}
export async function salir() {
  bd.sesion = null;
  return demora();
}
export async function recuperarPassword() {
  return demora({});
}
export async function cambiarPassword() {
  return demora({});
}
export function alCambiarSesion() {
  return () => {};
}

// --- hogar ------------------------------------------------------------------

export async function miHogar() {
  return demora(bd.sesion ? bd.hogar : null);
}
export async function crearHogar({ nombre, miNombre, color, emoji }) {
  bd.hogar = { ...bd.hogar, nombre };
  bd.personas = [{
    id: 'p1',
    hogar_id: bd.hogar.id,
    user_id: bd.sesion.user.id,
    nombre: miNombre,
    color,
    emoji,
    es_admin: true,
    orden: 0,
  }];
  return demora(bd.hogar);
}
export async function unirseAHogar({ codigo, miNombre, color, emoji }) {
  await demora();
  if (codigo !== bd.hogar.codigo) throw new Error('Ese código no existe');
  bd.personas.push({
    id: uuid(),
    hogar_id: bd.hogar.id,
    user_id: bd.sesion.user.id,
    nombre: miNombre,
    color,
    emoji,
    es_admin: false,
    orden: bd.personas.length,
  });
  return bd.hogar;
}
export async function personas() {
  return demora([...bd.personas]);
}
export async function agregarPersona(hogarId, p) {
  const fila = {
    id: uuid(),
    hogar_id: hogarId,
    user_id: null,
    es_admin: false,
    orden: bd.personas.length,
    ...p,
  };
  bd.personas.push(fila);
  return demora(fila);
}
export async function editarPersona(id, cambios) {
  const p = bd.personas.find((x) => x.id === id);
  Object.assign(p, cambios);
  return demora(p);
}
export async function borrarPersona(id) {
  bd.personas = bd.personas.filter((x) => x.id !== id);
  return demora();
}
export async function renombrarHogar(id, nombre) {
  bd.hogar = { ...bd.hogar, nombre };
  return demora(bd.hogar);
}
export async function regenerarFeedToken() {
  bd.hogar = { ...bd.hogar, feed_token: uuid() };
  return demora(bd.hogar.feed_token);
}

// --- eventos ----------------------------------------------------------------

function conOcurrencias(e) {
  return {
    ...e,
    ag_ocurrencias: bd.ocurrencias
      .filter((o) => o.evento_id === e.id)
      .map((o) => ({ fecha: o.fecha, estado: o.estado })),
  };
}

export async function eventos() {
  // Se devuelven todos: el filtro por rango lo hace el expandidor de fechas, y
  // acá interesa probar la interfaz, no el WHERE de PostgREST.
  return demora(bd.eventos.map(conOcurrencias));
}

export async function guardarEvento(evento) {
  quizasFallar('guardarEvento');
  await demora();
  if (evento.id) {
    const i = bd.eventos.findIndex((x) => x.id === evento.id);
    bd.eventos[i] = { ...bd.eventos[i], ...evento, updated_at: new Date().toISOString() };
    return conOcurrencias(bd.eventos[i]);
  }
  const fila = {
    id: uuid(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    repite: 'no',
    repite_dias: [],
    repite_hasta: null,
    todo_el_dia: false,
    ...evento,
  };
  bd.eventos.push(fila);
  return conOcurrencias(fila);
}

export async function borrarEvento(id) {
  bd.eventos = bd.eventos.filter((x) => x.id !== id);
  bd.ocurrencias = bd.ocurrencias.filter((o) => o.evento_id !== id);
  return demora();
}

export async function marcarOcurrencia(eventoId, fecha, estado) {
  const ya = bd.ocurrencias.find((o) => o.evento_id === eventoId && o.fecha === fecha);
  if (ya) ya.estado = estado;
  else bd.ocurrencias.push({ id: uuid(), evento_id: eventoId, fecha, estado });
  return demora();
}

export async function desmarcarOcurrencia(eventoId, fecha) {
  bd.ocurrencias = bd.ocurrencias.filter(
    (o) => !(o.evento_id === eventoId && o.fecha === fecha),
  );
  return demora();
}

// --- menú -------------------------------------------------------------------

export async function menu() {
  quizasFaltaLaTabla('ag_menu');
  return demora([...bd.menu]);
}

export async function guardarComida(c) {
  await demora();
  // Se respeta la clave única (hogar, fecha, momento), igual que la tabla.
  const i = bd.menu.findIndex((m) => m.fecha === c.fecha && m.momento === c.momento);
  if (i >= 0) {
    bd.menu[i] = { ...bd.menu[i], ...c };
    return bd.menu[i];
  }
  const fila = { id: uuid(), ...c };
  bd.menu.push(fila);
  return fila;
}

export async function guardarComidas(lista) {
  const salida = [];
  for (const c of lista) salida.push(await guardarComida(c));
  return salida;
}

export async function borrarComida(id) {
  bd.menu = bd.menu.filter((m) => m.id !== id);
  return demora();
}

// --- compras ----------------------------------------------------------------

export async function compras() {
  quizasFaltaLaTabla('ag_compras');
  return demora([...bd.compras]);
}
export async function agregarCompra(item) {
  const fila = { id: uuid(), comprado: false, created_at: new Date().toISOString(), ...item };
  bd.compras.push(fila);
  return demora(fila);
}
export async function editarCompra(id, cambios) {
  const c = bd.compras.find((x) => x.id === id);
  Object.assign(c, cambios);
  return demora(c);
}
export async function borrarCompra(id) {
  bd.compras = bd.compras.filter((x) => x.id !== id);
  return demora();
}
export async function borrarComprados() {
  bd.compras = bd.compras.filter((x) => !x.comprado);
  return demora();
}

export async function menuALaLista(hogarId, desde, hasta) {
  await demora();
  // Misma lógica que ag_menu_a_compras: junta por nombre en minúscula y no
  // repite lo que ya está sin comprar.
  const porClave = new Map();
  for (const m of bd.menu) {
    const f = m.fecha?.slice(0, 10);
    if (f < desde || f > hasta) continue;
    for (const ing of m.ingredientes ?? []) {
      const item = (ing.item ?? '').trim();
      if (!item) continue;
      const clave = item.toLowerCase();
      if (!porClave.has(clave)) {
        porClave.set(clave, { item, cantidades: [], rubro: ing.rubro || 'otros' });
      }
      if (ing.cantidad) porClave.get(clave).cantidades.push(ing.cantidad);
    }
  }

  let nuevos = 0;
  for (const [clave, v] of porClave) {
    const ya = bd.compras.some((c) => !c.comprado && c.item.toLowerCase() === clave);
    if (ya) continue;
    bd.compras.push({
      id: uuid(),
      hogar_id: hogarId,
      item: v.item,
      cantidad: v.cantidades.join(' + ') || null,
      rubro: v.rubro,
      comprado: false,
      origen: 'menu',
      created_at: new Date().toISOString(),
    });
    nuevos++;
  }
  return nuevos;
}

// --- preferencias -----------------------------------------------------------

export async function preferencias() {
  quizasFaltaLaTabla('ag_preferencias');
  return demora({ ...bd.preferencias });
}
export async function guardarPreferencias(hogarId, cambios) {
  bd.preferencias = { ...bd.preferencias, ...cambios };
  return demora(bd.preferencias);
}

export async function revisarFunciones() {
  return demora(bd.estadoFunciones.map((f) => ({ ...f })));
}

// --- tareas -----------------------------------------------------------------

export async function tareas() {
  quizasFaltaLaTabla('ag_tareas');
  // Mismo orden que la consulta real: pendientes primero, después por
  // vencimiento, y las que no tienen fecha al final.
  const orden = [...bd.tareas].sort((a, b) => {
    if (a.hecha !== b.hecha) return a.hecha ? 1 : -1;
    if (!a.vence && !b.vence) return 0;
    if (!a.vence) return 1;
    if (!b.vence) return -1;
    return a.vence < b.vence ? -1 : (a.vence > b.vence ? 1 : 0);
  });
  return demora(orden);
}

export async function guardarTarea(t) {
  await demora();
  if (t.id) {
    const i = bd.tareas.findIndex((x) => x.id === t.id);
    if (i >= 0) bd.tareas[i] = { ...bd.tareas[i], ...t };
    return bd.tareas[i];
  }
  const fila = {
    id: uuid(),
    hecha: false,
    hecha_en: null,
    repite: 'no',
    detalle: null,
    persona_id: null,
    vence: null,
    created_at: new Date().toISOString(),
    ...t,
  };
  bd.tareas.push(fila);
  return fila;
}

export async function marcarTarea(id, hecha) {
  await demora();
  const t = bd.tareas.find((x) => x.id === id);
  if (t) {
    t.hecha = hecha;
    t.hecha_en = hecha ? new Date().toISOString() : null;
  }
  return t;
}

export async function borrarTarea(id) {
  await demora();
  bd.tareas = bd.tareas.filter((t) => t.id !== id);
}

export async function borrarTareasHechas() {
  await demora();
  bd.tareas = bd.tareas.filter((t) => !t.hecha);
}

// --- avisos propios (Web Push) ----------------------------------------------
// El navegador de las pruebas no tiene servicio de push de verdad, así que esto
// imita lo que la app necesita saber: si hay permiso, si este aparato ya está
// registrado, y qué pasa al prenderlo.

export function puedeAvisar() {
  return bd.puedeAvisar !== false;
}

export function permisoAvisos() {
  return bd.permisoAvisos ?? 'default';
}

export async function avisosDeEsteAparato() {
  await demora();
  return bd.pushAparato ? { ...bd.pushAparato } : null;
}

export async function prenderAvisos(hogarId, personaId, { hora = 8 } = {}) {
  await demora();
  if (bd.permisoAvisos === 'denied') {
    throw new Error(
      'Los avisos están bloqueados para este sitio. Se cambia en los ajustes del navegador.',
    );
  }
  bd.permisoAvisos = 'granted';
  bd.pushAparato = {
    id: 'push-1',
    hogar_id: hogarId,
    persona_id: personaId,
    hora,
    diario: true,
    semanal: true,
  };
  return { ...bd.pushAparato };
}

export async function apagarAvisos() {
  await demora();
  bd.pushAparato = null;
}

export async function cambiarAvisos(id, cambios) {
  await demora();
  bd.pushAparato = { ...bd.pushAparato, ...cambios };
  return { ...bd.pushAparato };
}

export async function probarAvisos() {
  await demora();
  bd.pruebasMandadas = (bd.pruebasMandadas ?? 0) + 1;
  return { ok: true, enviados: 1 };
}

export async function empujarAvisos() {
  await demora();
  bd.vueltasEmpujadas = (bd.vueltasEmpujadas ?? 0) + 1;
  // El null lo devuelve la de verdad cuando la función no está subida: con
  // fallarProximo se puede probar que entonces no se marca el día.
  if (bd.fallarProximo === 'empujarAvisos') {
    bd.fallarProximo = null;
    return null;
  }
  return { ok: true, mirados: 0, enviados: 0, errores: 0 };
}

// --- calendarios ------------------------------------------------------------

export async function calendarios() {
  quizasFaltaLaTabla('ag_calendarios');
  return demora([...bd.calendarios]);
}
export async function guardarCalendario(cal) {
  await demora();
  if (cal.id) {
    const i = bd.calendarios.findIndex((c) => c.id === cal.id);
    if (i >= 0) {
      bd.calendarios[i] = { ...bd.calendarios[i], ...cal };
      return bd.calendarios[i];
    }
  }
  const fila = { id: uuid(), eventos_importados: 0, ultima_sync: null, ...cal };
  bd.calendarios.push(fila);
  return fila;
}
export async function borrarCalendario(id, borrarEventos = true) {
  if (borrarEventos) bd.eventos = bd.eventos.filter((e) => e.calendario_id !== id);
  bd.calendarios = bd.calendarios.filter((c) => c.id !== id);
  return demora();
}
export async function importarEventos(filas) {
  await demora();

  // Postgres corta el upsert entero si el mismo lote toca dos veces la misma
  // fila. Acá se imita el error tal cual, porque si el doble fuera más
  // permisivo que la base, la prueba pasaría y la app se rompería con un
  // calendario de verdad. Es lo que pasó al importar Google Calendar.
  const vistos = new Set();
  for (const f of filas) {
    if (f.ics_uid && vistos.has(f.ics_uid)) {
      throw new Error('ON CONFLICT DO UPDATE command cannot affect row a second time');
    }
    if (f.ics_uid) vistos.add(f.ics_uid);
  }

  const salida = [];
  for (const f of filas) {
    const i = bd.eventos.findIndex((e) => e.ics_uid && e.ics_uid === f.ics_uid);
    if (i >= 0) {
      bd.eventos[i] = { ...bd.eventos[i], ...f, updated_at: new Date().toISOString() };
      salida.push(bd.eventos[i]);
    } else {
      const fila = { id: uuid(), updated_at: new Date().toISOString(), ...f };
      bd.eventos.push(fila);
      salida.push(fila);
    }
  }
  return salida;
}
export async function bajarIcsRemoto(url) {
  await demora();
  if (bd.icsRemoto) return bd.icsRemoto;
  throw new Error('No se pudo bajar ' + url);
}

// --- agente -----------------------------------------------------------------

export async function chefChat(mensajes, contexto) {
  bd.ultimoPedidoChef = { modo: 'chat', mensajes, contexto };
  await demora();
  if (bd.fallarProximo === 'chefChat') {
    bd.fallarProximo = null;
    throw new Error('El agente no está disponible');
  }
  return bd.respuestaChat;
}

export async function chefMenu(pedido) {
  bd.ultimoPedidoChef = { modo: 'menu', ...pedido };
  await demora();
  if (bd.fallarProximo === 'chefMenu') {
    bd.fallarProximo = null;
    throw new Error('El agente no está disponible');
  }
  return bd.respuestaMenu ?? { resumen: 'Semana de prueba', menu: [] };
}

export async function mensajesChef() {
  return demora([...bd.chef]);
}
export async function guardarMensajeChef(hogarId, rol, contenido) {
  const fila = { id: uuid(), hogar_id: hogarId, rol, contenido };
  bd.chef.push(fila);
  return demora(fila);
}
export async function limpiarChatChef() {
  bd.chef = [];
  return demora();
}

// --- recetas guardadas ------------------------------------------------------

export async function recetasGuardadas() {
  return demora([...bd.recetas]);
}
export async function guardarReceta(r) {
  const fila = { id: uuid(), ...r };
  bd.recetas.push(fila);
  return demora(fila);
}
export async function borrarReceta(id) {
  bd.recetas = bd.recetas.filter((r) => r.id !== id);
  return demora();
}

// --- tiempo real ------------------------------------------------------------

export function escucharHogar() {
  // En las pruebas no hay websocket; cada acción recarga sola.
  return () => {};
}
