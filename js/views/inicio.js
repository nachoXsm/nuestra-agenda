// ============================================================================
//  Inicio: la pantalla que se abre primero.
//
//  Contesta de arriba a abajo lo que uno se pregunta al agarrar el teléfono:
//  cómo viene el día, qué hay hoy, qué se viene, qué se come, qué falta hacer.
//  Mañana está a la vista a propósito: enterarse el mismo día de que hay que
//  llevar algo al colegio ya es tarde.
// ============================================================================
import * as est from '../estado.js';
import { esDeTemporada } from '../data/temporada.js';
import { fechaLarga, hoy, partes, sumarDias } from '../lib/fechas.js';
import { icono } from '../lib/iconos.js';
import { avatar, el, pila, pintar, vacio } from '../lib/ui.js';
import { abrirEditorEvento, filaEvento } from './agenda.js';
import { abrirEditorComida } from './comidas.js';
import { filaTarea } from './tareas.js';

function saludo() {
  const hora = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  ) % 24;

  if (hora < 6) return 'Buenas noches';
  if (hora < 13) return 'Buen día';
  if (hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Una frase sobre cómo viene el día. Es lo único de la pantalla que resume en
 * vez de listar, así que tiene que decir algo cierto y corto.
 */
function comoViene({ eventos, tareas, compras }) {
  const trozos = [];
  if (eventos) {
    trozos.push(`${eventos} ${eventos === 1 ? 'cosa' : 'cosas'} en la agenda`);
  }
  if (tareas) {
    trozos.push(`${tareas} ${tareas === 1 ? 'tarea' : 'tareas'} por hacer`);
  }
  if (compras) {
    trozos.push(`${compras} en la lista`);
  }
  if (!trozos.length) return 'El día está despejado.';
  if (trozos.length === 1) return `Hoy: ${trozos[0]}.`;
  return `Hoy: ${trozos.slice(0, -1).join(', ')} y ${trozos.at(-1)}.`;
}

/** Una comida del día, con el aviso de si usa cosas fuera de temporada. */
function slotComida(fecha, momento, comida) {
  const mes = partes(fecha).mes;

  if (!comida) {
    return el('button.comida-slot.vacia', {
      type: 'button',
      'on:click': () => abrirEditorComida({ fecha, momento }),
    }, [
      el('span.momento', { texto: momento }),
      el('span.plato', { texto: 'Sin decidir — tocá para elegir' }),
      icono('mas', { tamano: 16 }),
    ]);
  }

  const ings = comida.ingredientes ?? [];
  const fuera = ings.filter((i) => i.item && !esDeTemporada(i.item, mes)).length;
  const aCargo = comida.a_cargo ? est.persona(comida.a_cargo) : null;

  return el('button.comida-slot', {
    type: 'button',
    'on:click': () => abrirEditorComida({ fecha, momento, comida }),
  }, [
    el('span.momento', { texto: momento }),
    el('span.plato', {}, [
      comida.titulo,
      ings.length
        ? el('span.meta', {
          texto: `${ings.length} ingredientes` +
            (fuera ? ` · ${fuera} fuera de temporada` : ' · todo de temporada'),
        })
        : null,
    ]),
    aCargo ? avatar(aCargo, { tamano: 'chico' }) : null,
  ]);
}

// ---------------------------------------------------------------------------

export function vistaInicio(destino) {
  const h = hoy();
  const manana = sumarDias(h, 1);

  const instHoy = est.instanciasDe(h);
  const pendientesHoy = instHoy.filter((i) => !i.hecho);
  const comidasHoy = est.comidasDe(h);
  const porComprar = est.comprasPendientes();
  const tareasPendientes = est.tareasPendientes();
  const atrasadas = tareasPendientes.filter((t) => est.urgenciaTarea(t) === 'atrasada');
  const venceHoy = tareasPendientes.filter((t) => est.urgenciaTarea(t) === 'hoy');

  const yo = est.estado.yo;

  // --- saludo -------------------------------------------------------------
  const encabezado = el('section.seccion', {}, [
    el('p.sobretitulo.cap', { texto: fechaLarga(h) }),
    el('p.saludo', {
      estilo: { marginTop: '6px' },
      texto: yo?.nombre ? `${saludo()}, ${yo.nombre}` : saludo(),
    }),
  ]);

  // --- hoy en familia -----------------------------------------------------
  const tarjetaFamilia = el('section.seccion', {}, [
    el('div.tarjeta.pino', {}, [
      el('div', {
        estilo: { display: 'flex', alignItems: 'center', gap: 'var(--e3)' },
      }, [
        el('p.sobretitulo', { estilo: { flex: '1' }, texto: 'Hoy en familia' }),
        est.estado.personas.length ? pila(est.estado.personas, { max: 4 }) : null,
      ]),
      el('p.cuerpo', {
        estilo: { marginTop: 'var(--e3)' },
        texto: comoViene({
          eventos: pendientesHoy.length,
          tareas: venceHoy.length + atrasadas.length,
          compras: porComprar.length,
        }),
      }),
      el('div.estadisticas', { estilo: { marginTop: 'var(--e4)' } }, [
        el('div.dato', {}, [
          el('p.n', { texto: String(instHoy.length) }),
          el('p.q', { texto: instHoy.length === 1 ? 'evento' : 'eventos' }),
        ]),
        el('div.dato', {}, [
          el('p.n', { texto: String(tareasPendientes.length) }),
          el('p.q', { texto: tareasPendientes.length === 1 ? 'tarea' : 'tareas' }),
        ]),
        el('div.dato', {}, [
          el('p.n', { texto: String(porComprar.length) }),
          el('p.q', { texto: 'por comprar' }),
        ]),
      ]),
    ]),
  ]);

  // --- lo que hay que mirar hoy -------------------------------------------
  // Solo aparece si hay algo urgente de verdad: si sale siempre, se vuelve
  // parte del fondo y deja de avisar nada.
  const urgente = atrasadas.length
    ? `${atrasadas.length} ${atrasadas.length === 1 ? 'tarea venció' : 'tareas vencieron'} y ${
      atrasadas.length === 1 ? 'sigue' : 'siguen'} sin hacer.`
    : venceHoy.length
      ? `${venceHoy.length} ${venceHoy.length === 1 ? 'tarea vence' : 'tareas vencen'} hoy.`
      : null;

  const aviso = urgente
    ? el('section.seccion', {}, [
      el('button.tarjeta', {
        type: 'button',
        estilo: {
          width: '100%',
          textAlign: 'left',
          background: 'var(--terracota-claro)',
          borderColor: 'transparent',
          display: 'flex',
          gap: 'var(--e3)',
          alignItems: 'flex-start',
        },
        'on:click': () => est.irA('tareas'),
      }, [
        el('span', { estilo: { color: 'var(--terracota-texto)', flex: 'none' } },
          [icono('alerta', { tamano: 20 })]),
        el('span', {}, [
          el('p.sobretitulo', {
            estilo: { color: 'var(--terracota-texto)' },
            texto: 'Importante',
          }),
          el('p.cuerpo-chico', {
            estilo: { color: 'var(--terracota-texto)', marginTop: '2px' },
            texto: urgente,
          }),
        ]),
      ]),
    ])
    : null;

  // --- actividades de hoy --------------------------------------------------
  const seccionHoy = el('section.seccion', {}, [
    el('header', {}, [
      el('h2', { texto: 'Actividades de hoy' }),
      pendientesHoy.length
        ? el('span.etiqueta', {
          texto: `${pendientesHoy.length} ${pendientesHoy.length === 1 ? 'pendiente' : 'pendientes'}`,
        })
        : null,
    ]),
    instHoy.length
      ? el('div', {}, instHoy.map((i) => filaEvento(i)))
      : vacio('taza', 'Hoy no hay nada anotado. Disfrutalo.'),
  ]);

  // --- lo que viene --------------------------------------------------------
  const proximas = est.instanciasEnRango(manana, sumarDias(h, 14)).slice(0, 4);

  const seccionProximas = el('section.seccion', {}, [
    el('header', {}, [
      el('h2', { texto: 'Lo que se viene' }),
      el('button.accion', {
        type: 'button',
        texto: 'Ver la agenda',
        'on:click': () => est.irA('agenda'),
      }),
    ]),
    proximas.length
      ? el('div', {}, proximas.map((i) => filaEvento(i, { mostrarFecha: true })))
      : el('p.cuerpo-chico', { texto: 'Las próximas dos semanas están libres.' }),
  ]);

  // --- qué se come ---------------------------------------------------------
  const seccionComida = el('section.seccion', {}, [
    el('header', {}, [
      el('h2', { texto: 'Qué se come hoy' }),
      el('button.accion', {
        type: 'button',
        texto: 'La semana',
        'on:click': () => est.irA('comidas', { tabComidas: 'menu' }),
      }),
    ]),
    el('div.tarjeta', {}, [
      slotComida(h, 'almuerzo', comidasHoy.almuerzo),
      slotComida(h, 'cena', comidasHoy.cena),
    ]),
  ]);

  // --- tareas --------------------------------------------------------------
  const seccionTareas = tareasPendientes.length
    ? el('section.seccion', {}, [
      el('header', {}, [
        el('h2', { texto: 'Tareas pendientes' }),
        el('button.accion', {
          type: 'button',
          texto: 'Ver todas',
          'on:click': () => est.irA('tareas'),
        }),
      ]),
      el('div', {}, tareasPendientes.slice(0, 4).map(filaTarea)),
    ])
    : null;

  // --- compras -------------------------------------------------------------
  const seccionCompras = porComprar.length
    ? el('section.seccion', {}, [
      el('header', {}, [
        el('h2', { texto: 'Falta comprar' }),
        el('span.etiqueta', { texto: String(porComprar.length) }),
      ]),
      el('button.tarjeta.plana', {
        type: 'button',
        estilo: { width: '100%', textAlign: 'left' },
        'on:click': () => est.irA('comidas', { tabComidas: 'compras' }),
      }, [
        // Los primeros nombres, para saber de qué va sin abrir la lista.
        el('p.cuerpo', {
          texto: porComprar.slice(0, 5).map((c) => c.item).join(', ') +
            (porComprar.length > 5 ? ` y ${porComprar.length - 5} más` : ''),
        }),
        el('p.etiqueta', {
          estilo: { color: 'var(--primario)', marginTop: '6px' },
          texto: 'Ver la lista →',
        }),
      ]),
    ])
    : null;

  pintar(destino,
    encabezado,
    tarjetaFamilia,
    aviso,
    seccionHoy,
    seccionProximas,
    seccionComida,
    seccionTareas,
    seccionCompras,
  );

  return el('button.fab', {
    type: 'button',
    'aria-label': 'Anotar algo nuevo',
    'on:click': () => abrirEditorEvento({ fechaSugerida: h }),
  }, [icono('mas', { tamano: 26, trazo: 2.2 })]);
}
