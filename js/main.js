// ============================================================================
//  Arranque y ruteo.
//
//  El orden de las puertas es: ¿hay configuración? → ¿hay sesión? → ¿hay hogar?
//  Recién con las tres abiertas se carga la app.
// ============================================================================
import * as datos from './lib/db.js';
import * as est from './estado.js';
import { $, avisoMal, el, pintar } from './lib/ui.js';
import { hoy, mesLargo, partes } from './lib/fechas.js';
import {
  pantallaConfig,
  pantallaCuenta,
  pantallaHogar,
  pantallaNuevaPassword,
} from './views/entrar.js';
import { icono, trebol } from './lib/iconos.js';
import { vistaInicio } from './views/inicio.js';
import { vistaAgenda } from './views/agenda.js';
import { vistaComidas } from './views/comidas.js';
import { vistaTareas } from './views/tareas.js';
import { vistaFamilia } from './views/familia.js';
import { vistaChef } from './views/chef.js';

const main = $('#main');
const cabecera = $('#cabecera');
const barra = $('#barra');

// Las cinco secciones de la barra de abajo, en orden.
const SECCIONES = [
  ['inicio', 'Inicio'],
  ['agenda', 'Agenda'],
  ['comidas', 'Comidas'],
  ['tareas', 'Tareas'],
  ['familia', 'Familia'],
];

const VISTAS = {
  inicio: { pintar: vistaInicio, titulo: () => 'juntos' },
  agenda: { pintar: vistaAgenda, titulo: () => 'Agenda' },
  comidas: { pintar: vistaComidas, titulo: () => 'Comidas' },
  tareas: { pintar: vistaTareas, titulo: () => 'Tareas' },
  familia: { pintar: vistaFamilia, titulo: () => 'Familia' },
  // El Chef no ocupa lugar en la barra: se entra desde Comidas y la barra
  // sigue marcando Comidas, que es de donde se vino.
  chef: { pintar: vistaChef, titulo: () => 'Chef', barra: 'comidas' },
};

// Los nombres viejos de las secciones, para que un link guardado o un acceso
// directo de la pantalla de inicio del celular no caiga en la nada.
const ALIAS = {
  hoy: 'inicio',
  menu: 'comidas',
  compras: 'comidas',
  ajustes: 'familia',
};

const resolver = (clave) => (VISTAS[clave] ? clave : (ALIAS[clave] ?? 'inicio'));

// La barra se arma acá y no en el HTML para que cada icono esté dibujado en un
// solo lugar: js/lib/iconos.js.
for (const [clave, nombre] of SECCIONES) {
  barra.append(el('button', {
    type: 'button',
    datos: { vista: clave },
  }, [icono(clave, { tamano: 24 }), el('span', { texto: nombre })]));
}

let fabActual = null;

// ---------------------------------------------------------------------------
//  Pintado
// ---------------------------------------------------------------------------

function pintarApp() {
  const clave = resolver(est.estado.vista);
  const vista = VISTAS[clave];

  cabecera.classList.remove('oculto');
  barra.classList.remove('oculto');

  // Encabezado: el trébol y el nombre de la sección. En Inicio dice "juntos",
  // que es la única pantalla donde la marca tiene lugar.
  const oscuro = est.temaGuardado() === 'oscuro';
  pintar(cabecera,
    el('span.marca-mini', {}, [trebol({ tamano: 26 })]),
    el('h1', { id: 'titulo', texto: vista.titulo() }),
    el('div', { id: 'acciones-cabecera' }, [
      ...(vista.acciones?.() ?? []),
      // El cambio de tema va en todas las pantallas y no escondido en Familia:
      // se usa según la hora del día, no una vez y nunca más.
      el('button.btn-icono', {
        type: 'button',
        'aria-label': oscuro ? 'Pasar al tema claro' : 'Pasar al tema oscuro',
        'aria-pressed': String(oscuro),
        'on:click': () => est.alternarTema(),
      }, [icono(oscuro ? 'sol' : 'luna', { tamano: 20 })]),
    ]),
  );

  // Marca en la barra qué sección está abierta.
  const activa = vista.barra ?? clave;
  for (const b of barra.children) {
    if (b.dataset.vista === activa) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }

  fabActual?.remove();
  fabActual = null;

  const fab = vista.pintar(main);
  if (fab) {
    fabActual = fab;
    document.getElementById('app').append(fab);
  }
}

// ---------------------------------------------------------------------------
//  Navegación
// ---------------------------------------------------------------------------

// La navegación en sí está en estado.js, para que las vistas que mandan a otra
// sección (Hoy → compras, Menú → chef) usen exactamente el mismo camino.
function irA(vista) {
  est.irA(resolver(vista));
}

for (const b of barra.children) {
  b.addEventListener('click', () => irA(b.dataset.vista));
}

// El botón de atrás del celular tiene que funcionar.
addEventListener('popstate', (e) => {
  const vista = e.state?.vista ?? location.hash.slice(1) ?? 'inicio';
  if (est.estado.hogar) est.poner({ vista: resolver(vista) });
});

// ---------------------------------------------------------------------------
//  Arranque
// ---------------------------------------------------------------------------

function ocultarCascara() {
  cabecera.classList.add('oculto');
  barra.classList.add('oculto');
  fabActual?.remove();
  fabActual = null;
}

/** ¿Volvimos del link de "olvidé mi contraseña"? */
function esRecuperacion() {
  const hash = new URLSearchParams(location.hash.slice(1));
  return hash.get('type') === 'recovery';
}

async function arrancar() {
  ocultarCascara();

  // 1. Configuración de Supabase.
  if (!datos.hayConfig()) {
    pantallaConfig(main, () => location.reload());
    return;
  }

  // 2. Sesión.
  let sesion;
  try {
    sesion = await datos.sesion();
  } catch (e) {
    // Una configuración mal escrita se ve acá y no en una pantalla en blanco.
    pintar(main, el('div.entrada', {}, [
      el('div.tarjeta', {}, [
        el('p', {
          estilo: { fontWeight: '800', marginBottom: '8px' },
          texto: 'No se pudo conectar con Supabase',
        }),
        el('p.ayuda', { texto: datos.mensajeDeError(e) }),
        el('button.btn.ancho', {
          type: 'button',
          texto: 'Cargar la conexión de nuevo',
          estilo: { marginTop: '14px' },
          'on:click': () => {
            datos.olvidarConfig();
            location.reload();
          },
        }),
      ]),
    ]));
    return;
  }

  if (esRecuperacion() && sesion) {
    pantallaNuevaPassword(main, () => arrancar());
    return;
  }

  if (!sesion) {
    pantallaCuenta(main, () => arrancar());
    return;
  }

  est.estado.sesion = sesion;

  // 3. Hogar.
  let hogar;
  try {
    hogar = await datos.miHogar();
  } catch (e) {
    avisoMal(datos.mensajeDeError(e));
    pantallaCuenta(main, () => arrancar());
    return;
  }

  if (!hogar) {
    pantallaHogar(main, async (nuevo) => {
      est.estado.hogar = nuevo;
      await entrarALaApp();
    });
    return;
  }

  est.estado.hogar = hogar;
  await entrarALaApp();
}

async function entrarALaApp() {
  pintar(main, el('div.cargando', {}, [el('span.ruedita'), 'Trayendo la agenda…']));

  const h = hoy();
  est.estado.fechaElegida = h;
  est.estado.mesVisible = { anio: partes(h).anio, mes: partes(h).mes };
  est.estado.semanaVisible = h;
  est.estado.modoAgenda = 'mes';
  est.estado.filtroPersona = 'todos';
  est.estado.tabComidas = 'menu';

  try {
    await est.cargarTodo();
  } catch (e) {
    pintar(main, el('div.entrada', {}, [
      el('div.tarjeta', {}, [
        el('p', {
          estilo: { fontWeight: '800', marginBottom: '8px' },
          texto: 'No se pudieron traer los datos',
        }),
        el('p.ayuda', { texto: datos.mensajeDeError(e) }),
        el('p.ayuda', {
          estilo: { marginTop: '10px' },
          texto: 'Si es la primera vez, puede faltar correr supabase/schema.sql en ' +
            'el SQL Editor de Supabase.',
        }),
        el('button.btn.primario.ancho', {
          type: 'button',
          texto: 'Probar de nuevo',
          estilo: { marginTop: '14px' },
          'on:click': () => arrancar(),
        }),
      ]),
    ]));
    return;
  }

  est.escuchar();

  // La vista inicial sale del hash, así un link a #comidas abre Comidas.
  const delHash = location.hash.slice(1);
  est.estado.vista = resolver(delHash);
  if (!location.hash) history.replaceState({ vista: est.estado.vista }, '', `#${est.estado.vista}`);

  est.suscribir(pintarApp);
  pintarApp();
}

// Si se cierra la sesión desde otra pestaña, esta también vuelve al login.
datos.alCambiarSesion((evento) => {
  if (evento === 'SIGNED_OUT') {
    est.dejarDeEscuchar();
    ocultarCascara();
    arrancar();
  }
});

// Al volver a la app después de un rato, se refresca: puede haber cambiado algo
// desde el otro teléfono mientras estaba cerrada.
let salioA = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    salioA = Date.now();
    return;
  }
  if (!est.estado.hogar) return;
  // Más de dos minutos afuera: vale la pena ir a buscar.
  if (Date.now() - salioA > 120_000) {
    est.recargar(['eventos', 'menu', 'compras', 'tareas']).catch(() => {});
  }
});

// Al tocar una notificación con la app ya abierta, el service worker manda a
// qué sección ir. Sin esto, la app se trae al frente pero se queda donde estaba.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.tipo === 'ir' && est.estado.hogar) irA(e.data.vista);
  });
}

// ---------------------------------------------------------------------------
//  Service worker (para que ande sin conexión)
// ---------------------------------------------------------------------------

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Sin service worker la app funciona igual, solo pierde el modo offline.
    });
  });
}

// ---------------------------------------------------------------------------

arrancar().catch((e) => {
  console.error('No se pudo arrancar', e);
  pintar(main, el('div.entrada', {}, [
    el('div.tarjeta', {}, [
      el('p', { estilo: { fontWeight: '800' }, texto: 'Algo se rompió al abrir' }),
      el('p.ayuda', { estilo: { marginTop: '8px' }, texto: String(e?.message ?? e) }),
      el('button.btn.primario.ancho', {
        type: 'button',
        texto: 'Recargar',
        estilo: { marginTop: '14px' },
        'on:click': () => location.reload(),
      }),
    ]),
  ]));
});

// Se exporta para poder trastear desde la consola del navegador.
globalThis.juntos = { estado: est.estado, datos, irA, mesLargo };
