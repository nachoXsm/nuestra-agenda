// ============================================================================
//  El estado de la app: lo que hay cargado y quién quiere enterarse si cambia.
//
//  Un objeto y una lista de suscriptores. No hace falta más: las vistas se
//  vuelven a pintar enteras cuando algo cambia, y en una pantalla de celular
//  con unas decenas de filas eso es instantáneo.
// ============================================================================
import * as db from './lib/db.js';
import {
  aFecha,
  diasEntre,
  hoy,
  inicioSemana,
  ocurrencias,
  sumarDias,
  sumarMeses,
} from './lib/fechas.js';

export const estado = {
  // sesión
  sesion: null,
  hogar: null,
  personas: [],
  yo: null, // la fila de ag_personas del usuario actual

  // datos
  eventos: [],
  menu: [],
  compras: [],
  tareas: [],
  preferencias: null,
  calendarios: [],

  // navegación
  vista: 'inicio',
  fechaElegida: hoy(),
  mesVisible: null, // { anio, mes }
  semanaVisible: null, // fecha de cualquier día de la semana

  // cómo se está mirando cada sección
  modoAgenda: 'mes', // mes | semana | dia
  filtroPersona: 'todos', // 'todos' o el id de un integrante
  tabComidas: 'menu', // menu | compras

  // banderas
  cargando: true,
  rango: null, // { desde, hasta } de lo que está cargado
};

const suscriptores = new Set();

/** Se entera cuando cambia el estado. Devuelve la función para desuscribirse. */
export function suscribir(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

export function avisar() {
  for (const fn of suscriptores) {
    try {
      fn(estado);
    } catch (e) {
      // Un suscriptor que falla no puede dejar sin avisar a los demás.
      console.error('Un suscriptor falló al repintar', e);
    }
  }
}

/** Cambia el estado y avisa. */
export function poner(cambios) {
  Object.assign(estado, cambios);
  avisar();
}

// ---------------------------------------------------------------------------
//  Carga
// ---------------------------------------------------------------------------

const MESES_ATRAS = 3;
const MESES_ADELANTE = 12;

function rangoPorDefecto() {
  const h = hoy();
  return { desde: sumarMeses(h, -MESES_ATRAS), hasta: sumarMeses(h, MESES_ADELANTE) };
}

/**
 * Una sección cuya tabla puede no estar todavía.
 *
 * La app se instala una vez y después se le agregan cosas. Si alguien instaló
 * antes de que existiera ag_tareas y no volvió a correr el schema.sql, esa
 * tabla no está en su proyecto. Sin esto, ese único error tumbaba el
 * Promise.all entero y la app no abría: ni agenda, ni menú, ni nada. Un pedazo
 * que falta tiene que costar ese pedazo y nada más.
 *
 * Solo se traga el error de "esa tabla no existe". Cualquier otro (sin
 * permiso, sin red, sesión vencida) sigue de largo, porque esos sí tienen que
 * frenar la carga y mostrarse.
 */
async function opcional(promesa, siFalta) {
  try {
    return await promesa;
  } catch (e) {
    const tabla = db.tablaQueFalta(e);
    if (!tabla) throw e;
    faltanEnLaBase.add(tabla);
    return siFalta;
  }
}

// Las tablas que la base todavía no tiene. Las vistas la consultan para decir
// qué hay que hacer en vez de mostrar una sección vacía sin explicación.
const faltanEnLaBase = new Set();

/** ¿Falta esta tabla en la base? */
export function faltaEnLaBase(tabla) {
  return faltanEnLaBase.has(tabla);
}

/**
 * Carga todo lo del hogar. Se llama al entrar y cuando hace falta refrescar.
 * El rango es amplio a propósito: una familia carga decenas de eventos, no
 * miles, así que traer un año de una vez sale más barato que ir pidiendo de a
 * pedazos cada vez que se cambia de mes.
 */
export async function cargarTodo() {
  if (!estado.hogar) return;
  const rango = estado.rango ?? rangoPorDefecto();

  poner({ cargando: true });
  try {
    // El hogar, las personas y los eventos son la app: si falta alguna de esas
    // tablas no hay nada que mostrar y el error tiene que verse. El resto son
    // secciones, y cada una se puede caer sola.
    const [personas, eventos, menu, compras, tareas, preferencias, calendarios] =
      await Promise.all([
        db.personas(estado.hogar.id),
        db.eventos(estado.hogar.id, rango.desde, rango.hasta),
        opcional(db.menu(estado.hogar.id, sumarDias(rango.desde, 0), rango.hasta), []),
        opcional(db.compras(estado.hogar.id), []),
        opcional(db.tareas(estado.hogar.id), []),
        opcional(db.preferencias(estado.hogar.id), null),
        opcional(db.calendarios(estado.hogar.id), []),
      ]);

    const miId = estado.sesion?.user?.id;
    Object.assign(estado, {
      personas,
      yo: personas.find((p) => p.user_id === miId) ?? null,
      eventos,
      menu,
      compras,
      tareas,
      preferencias,
      calendarios,
      rango,
    });
  } finally {
    poner({ cargando: false });
  }
}

/** Vuelve a traer solo una parte, para después de guardar algo. */
export async function recargar(que) {
  if (!estado.hogar) return;
  const id = estado.hogar.id;
  const rango = estado.rango ?? rangoPorDefecto();

  const traer = {
    eventos: () => db.eventos(id, rango.desde, rango.hasta).then((v) => ({ eventos: v })),
    menu: () => opcional(db.menu(id, rango.desde, rango.hasta), []).then((v) => ({ menu: v })),
    compras: () => opcional(db.compras(id), []).then((v) => ({ compras: v })),
    tareas: () => opcional(db.tareas(id), []).then((v) => ({ tareas: v })),
    personas: () =>
      db.personas(id).then((v) => ({
        personas: v,
        yo: v.find((p) => p.user_id === estado.sesion?.user?.id) ?? null,
      })),
    preferencias: () => opcional(db.preferencias(id), null).then((v) => ({ preferencias: v })),
    calendarios: () => opcional(db.calendarios(id), []).then((v) => ({ calendarios: v })),
  };

  const cuales = [].concat(que).filter((k) => traer[k]);
  const resultados = await Promise.all(cuales.map((k) => traer[k]()));
  poner(Object.assign({}, ...resultados));
}

/** Si se navegó fuera de lo cargado, se estira el rango y se trae de nuevo. */
export async function asegurarRango(fecha) {
  const r = estado.rango ?? rangoPorDefecto();
  if (diasEntre(r.desde, fecha) >= 0 && diasEntre(fecha, r.hasta) >= 0) return;

  estado.rango = {
    desde: diasEntre(r.desde, fecha) < 0 ? sumarMeses(fecha, -2) : r.desde,
    hasta: diasEntre(fecha, r.hasta) < 0 ? sumarMeses(fecha, 2) : r.hasta,
  };
  await recargar(['eventos', 'menu']);
}

// ---------------------------------------------------------------------------
//  Tiempo real
// ---------------------------------------------------------------------------

let cortarEscucha = null;
let relojRefresco = null;

/**
 * Escucha los cambios del hogar. Lo que carga uno le aparece al otro sin
 * recargar, que es la mitad del sentido de una agenda compartida.
 *
 * Se agrupan los avisos: guardar un menú de 14 comidas dispara 14 eventos, y no
 * tiene sentido recargar 14 veces.
 */
export function escuchar() {
  cortarEscucha?.();
  if (!estado.hogar) return;

  const pendientes = new Set();

  cortarEscucha = db.escucharHogar(estado.hogar.id, (tabla) => {
    const mapa = {
      ag_eventos: 'eventos',
      ag_ocurrencias: 'eventos',
      ag_menu: 'menu',
      ag_compras: 'compras',
      ag_tareas: 'tareas',
      ag_personas: 'personas',
    };
    const que = mapa[tabla];
    if (!que) return;

    pendientes.add(que);
    clearTimeout(relojRefresco);
    relojRefresco = setTimeout(() => {
      const lista = [...pendientes];
      pendientes.clear();
      recargar(lista).catch((e) => console.error('No se pudo refrescar', e));
    }, 400);
  });
}

export function dejarDeEscuchar() {
  cortarEscucha?.();
  cortarEscucha = null;
  clearTimeout(relojRefresco);
}

// ---------------------------------------------------------------------------
//  Consultas sobre lo cargado
// ---------------------------------------------------------------------------

export function persona(id) {
  return estado.personas.find((p) => p.id === id) ?? null;
}

/** El estado de una fecha puntual de un evento: 'hecho', 'cancelado' o null. */
function estadoOcurrencia(evento, fecha) {
  return (evento.ag_ocurrencias ?? []).find((o) => o.fecha?.slice(0, 10) === fecha)?.estado ?? null;
}

/**
 * Las veces que un evento cae en un rango, ya como instancias listas para
 * mostrar. Una instancia es "este evento, este día": un evento semanal genera
 * una instancia por semana, cada una con su propio estado de hecho.
 */
export function instanciasEnRango(desde, hasta, { incluirCanceladas = false } = {}) {
  const salida = [];

  for (const evento of estado.eventos) {
    for (const fecha of ocurrencias(evento, desde, hasta)) {
      const est = estadoOcurrencia(evento, fecha);
      if (est === 'cancelado' && !incluirCanceladas) continue;

      salida.push({
        evento,
        fecha,
        // La hora sale del evento original; la fecha, de la ocurrencia.
        hora: evento.todo_el_dia ? null : evento.inicio,
        hecho: est === 'hecho',
        cancelado: est === 'cancelado',
        persona: evento.persona_id ? persona(evento.persona_id) : null,
      });
    }
  }

  return ordenarInstancias(salida);
}

/** Las de un día. */
export function instanciasDe(fecha, opciones) {
  return instanciasEnRango(fecha, fecha, opciones);
}

function ordenarInstancias(lista) {
  return lista.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    // Lo de todo el día va primero: es el marco del día.
    if (a.evento.todo_el_dia !== b.evento.todo_el_dia) {
      return a.evento.todo_el_dia ? -1 : 1;
    }
    if (a.evento.todo_el_dia) return a.evento.titulo.localeCompare(b.evento.titulo, 'es');
    // Por hora del día, no por el instante completo: dos ocurrencias del mismo
    // evento en fechas distintas ya se separaron arriba.
    const ha = aHoraOrdenable(a.evento.inicio);
    const hb = aHoraOrdenable(b.evento.inicio);
    return ha === hb ? a.evento.titulo.localeCompare(b.evento.titulo, 'es') : ha - hb;
  });
}

// Minutos desde la medianoche en hora de Buenos Aires.
function aHoraOrdenable(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).split(':');
  return (Number(partes[0]) % 24) * 60 + Number(partes[1]);
}

/** La comida de un día y un momento. */
export function comida(fecha, momento) {
  return estado.menu.find((m) => m.fecha?.slice(0, 10) === fecha && m.momento === momento) ?? null;
}

/** Las comidas de un día. */
export function comidasDe(fecha) {
  return {
    almuerzo: comida(fecha, 'almuerzo'),
    cena: comida(fecha, 'cena'),
  };
}

/** Los títulos de lo último que se comió, para que el agente no repita. */
export function comidasRecientes(dias = 14) {
  const desde = sumarDias(hoy(), -dias);
  const h = hoy();
  return estado.menu
    .filter((m) => {
      const f = m.fecha?.slice(0, 10);
      return f >= desde && f <= h;
    })
    .map((m) => m.titulo)
    .filter(Boolean);
}

export function comprasPendientes() {
  return estado.compras.filter((c) => !c.comprado);
}

/** Cuántos minutos de compromisos tiene un día: sirve para saber si hay tiempo de cocinar. */
export function cargaDelDia(fecha) {
  const inst = instanciasDe(fecha);
  const conHora = inst.filter((i) => !i.evento.todo_el_dia);
  // Lo que pasa de las 17 es lo que come el tiempo de cocinar.
  const tarde = conHora.filter((i) => aHoraOrdenable(i.evento.inicio) >= 17 * 60);
  return { total: inst.length, conHora: conHora.length, tarde: tarde.length };
}

// ---------------------------------------------------------------------------
//  Tareas
// ---------------------------------------------------------------------------

/** Las que faltan hacer, en el orden en que llegaron de la base. */
export function tareasPendientes() {
  return estado.tareas.filter((t) => !t.hecha);
}

/**
 * Si una tarea está atrasada, vence hoy, o todavía falta.
 * @returns {'atrasada'|'hoy'|'pronto'|'sinfecha'}
 */
export function urgenciaTarea(tarea) {
  if (!tarea.vence) return 'sinfecha';
  const v = tarea.vence.slice(0, 10);
  const h = hoy();
  if (v < h) return 'atrasada';
  if (v === h) return 'hoy';
  return 'pronto';
}

/**
 * Cómo viene la semana de tareas: el total, cuántas se hicieron, y el desglose
 * por integrante para las barritas.
 */
export function progresoTareas() {
  const desde = inicioSemana(hoy());
  const hasta = sumarDias(desde, 6);

  // Cuentan las de esta semana y las que quedaron colgadas de antes: una tarea
  // atrasada sigue siendo trabajo pendiente de esta semana.
  const deLaSemana = estado.tareas.filter((t) => {
    if (!t.vence) return !t.hecha;
    const v = t.vence.slice(0, 10);
    return v <= hasta && (v >= desde || !t.hecha);
  });

  const hechas = deLaSemana.filter((t) => t.hecha).length;
  const total = deLaSemana.length;

  const porPersona = estado.personas.map((p) => {
    const suyas = deLaSemana.filter((t) => t.persona_id === p.id);
    return {
      persona: p,
      total: suyas.length,
      hechas: suyas.filter((t) => t.hecha).length,
    };
  });

  return {
    total,
    hechas,
    porcentaje: total ? (hechas / total) * 100 : 0,
    porPersona,
    // Las que no son de nadie en particular.
    deLaCasa: deLaSemana.filter((t) => !t.persona_id),
    lista: deLaSemana,
  };
}

// ---------------------------------------------------------------------------
//  Navegación
// ---------------------------------------------------------------------------

/**
 * Cambia de sección y deja constancia en el historial, para que el botón de
 * atrás del celular funcione.
 *
 * Está acá y no en main.js porque varias pantallas navegan por su cuenta (Hoy
 * manda a la lista de compras, Menú manda al Chef). Si cada una hiciera
 * `poner({ vista })` a mano, el historial se quedaría atrás y el botón de atrás
 * saltearía pantallas o cerraría la app.
 */
export function irA(vista, extra = {}) {
  Object.assign(estado, extra);

  if (estado.vista !== vista) {
    try {
      history.pushState({ vista }, '', `#${vista}`);
    } catch {
      // Algunos navegadores bloquean pushState en contextos raros. La app
      // navega igual, solo se pierde el botón de atrás.
    }
  }

  poner({ vista });
  // Al cambiar de sección se vuelve arriba: si no, se entra a la mitad.
  try {
    scrollTo({ top: 0 });
  } catch { /* fuera del navegador */ }
}

// ---------------------------------------------------------------------------
//  Tema
// ---------------------------------------------------------------------------

export function temaGuardado() {
  try {
    return localStorage.getItem('ag_tema') ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function ponerTema(tema) {
  try {
    if (tema === 'auto') {
      localStorage.removeItem('ag_tema');
      document.documentElement.removeAttribute('data-tema');
    } else {
      localStorage.setItem('ag_tema', tema);
      document.documentElement.dataset.tema = tema;
    }
  } catch { /* localStorage bloqueado */ }
  avisar();
}

// ---------------------------------------------------------------------------
//  Salir
// ---------------------------------------------------------------------------

export async function cerrarSesion() {
  dejarDeEscuchar();
  await db.salir();
  Object.assign(estado, {
    sesion: null,
    hogar: null,
    personas: [],
    yo: null,
    eventos: [],
    menu: [],
    compras: [],
    tareas: [],
    preferencias: null,
    calendarios: [],
    rango: null,
    vista: 'inicio',
    fechaElegida: hoy(),
  });
  avisar();
}

// Se usa en varias vistas para saber si una fecha ISO es de hoy.
export const esHoy = (fecha) => fecha === hoy();
export { aFecha };
