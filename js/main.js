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
import { vistaHoy } from './views/hoy.js';
import { vistaAgenda } from './views/agenda.js';
import { vistaCompras, vistaMenu } from './views/menu.js';
import { vistaChef } from './views/chef.js';
import { vistaAjustes } from './views/ajustes.js';

const main = $('#main');
const cabecera = $('#cabecera');
const barra = $('#barra');
const titulo = $('#titulo');

// Las vistas que tienen lugar en la barra de abajo.
const VISTAS = {
  hoy: { pintar: vistaHoy, titulo: () => 'Hoy' },
  agenda: { pintar: vistaAgenda, titulo: () => 'Agenda' },
  menu: { pintar: vistaMenu, titulo: () => 'Menú de la semana' },
  chef: { pintar: vistaChef, titulo: () => 'Chef' },
  ajustes: { pintar: vistaAjustes, titulo: () => 'Más' },
  // Compras no está en la barra: se llega desde Hoy, Menú o Más.
  compras: { pintar: vistaCompras, titulo: () => 'Lista de compras', barra: 'menu' },
};

let fabActual = null;

// ---------------------------------------------------------------------------
//  Pintado
// ---------------------------------------------------------------------------

function pintarApp() {
  const clave = VISTAS[est.estado.vista] ? est.estado.vista : 'hoy';
  const vista = VISTAS[clave];

  cabecera.classList.remove('oculto');
  barra.classList.remove('oculto');

  // Encabezado: el nombre del hogar arriba y la sección abajo.
  pintar(titulo,
    vista.titulo(),
    el('span.sub', { texto: est.estado.hogar?.nombre ?? '' }),
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
  est.irA(VISTAS[vista] ? vista : 'hoy');
}

for (const b of barra.children) {
  b.addEventListener('click', () => irA(b.dataset.vista));
}

// El botón de atrás del celular tiene que funcionar.
addEventListener('popstate', (e) => {
  const vista = e.state?.vista ?? location.hash.slice(1) ?? 'hoy';
  if (est.estado.hogar) est.poner({ vista: VISTAS[vista] ? vista : 'hoy' });
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

  // La vista inicial sale del hash, así un link a #menu abre el menú.
  const delHash = location.hash.slice(1);
  est.estado.vista = VISTAS[delHash] ? delHash : 'hoy';
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
    est.recargar(['eventos', 'menu', 'compras']).catch(() => {});
  }
});

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
globalThis.NuestraAgenda = { estado: est.estado, datos, irA, mesLargo };
