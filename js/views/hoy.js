// ============================================================================
//  Hoy: la pantalla que se abre primero.
//
//  Contesta cuatro preguntas y nada más: qué falta hoy, qué hay mañana (que es
//  lo que uno se olvida), qué se come, y qué falta comprar. Mañana está a la
//  vista a propósito: enterarse el mismo día de que hay que llevar algo al
//  colegio ya es tarde.
// ============================================================================
import * as est from '../estado.js';
import { categoria } from '../data/categorias.js';
import { faltaPara, fechaLarga, hoy, sumarDias } from '../lib/fechas.js';
import { esDeTemporada } from '../data/temporada.js';
import { el, pintar, vacio } from '../lib/ui.js';
import { abrirEditorEvento, filaEvento } from './agenda.js';
import { abrirEditorComida } from './menu.js';

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

/** La tarjeta grande de lo que sigue, con la cuenta de cuánto falta. */
function loQueSigue(instancias) {
  const ahora = new Date();

  // La próxima cosa con hora que todavía no pasó y no está hecha.
  const siguiente = instancias.find((i) =>
    !i.hecho && !i.evento.todo_el_dia && new Date(i.evento.inicio) > ahora
  );

  if (!siguiente) return null;

  const cat = categoria(siguiente.evento.categoria);
  const inicioHoy = new Date(siguiente.evento.inicio);

  return el('button.tarjeta', {
    type: 'button',
    estilo: {
      width: '100%',
      textAlign: 'left',
      borderLeft: `3px solid ${cat.color}`,
      display: 'block',
    },
    'on:click': () => abrirEditorEvento({
      evento: siguiente.evento,
      fecha: siguiente.fecha,
    }),
  }, [
    el('p', {
      estilo: {
        fontSize: '0.68rem',
        fontWeight: '800',
        letterSpacing: '1.2px',
        textTransform: 'uppercase',
        color: 'var(--suave)',
      },
      texto: 'Lo que sigue',
    }),
    el('p', {
      estilo: { fontSize: '1.15rem', fontWeight: '800', marginTop: '6px' },
    }, [
      el('span', { 'aria-hidden': 'true', texto: cat.emoji + ' ' }),
      siguiente.evento.titulo,
    ]),
    el('p', {
      estilo: { fontSize: '0.85rem', color: cat.color, fontWeight: '700', marginTop: '4px' },
      texto: faltaPara(inicioHoy, ahora) +
        (siguiente.persona ? ` · ${siguiente.persona.nombre}` : '') +
        (siguiente.evento.lugar ? ` · ${siguiente.evento.lugar}` : ''),
    }),
  ]);
}

/** Una comida del día, con el aviso de si usa cosas fuera de temporada. */
function tarjetaComida(fecha, momento, comida) {
  const mes = Number(fecha.slice(5, 7));

  if (!comida) {
    return el('button.comida-slot.vacia', {
      type: 'button',
      'on:click': () => abrirEditorComida({ fecha, momento }),
    }, [
      el('span.momento', { texto: momento }),
      el('span.plato', { texto: 'Sin decidir — tocá para elegir' }),
      el('span', { 'aria-hidden': 'true', texto: '+' }),
    ]);
  }

  const ings = comida.ingredientes ?? [];
  const fuera = ings.filter((i) => i.item && !esDeTemporada(i.item, mes)).length;

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
  ]);
}

export function vistaHoy(destino) {
  const h = hoy();
  const manana = sumarDias(h, 1);

  const instHoy = est.instanciasDe(h);
  const instManana = est.instanciasDe(manana);
  const pendientesHoy = instHoy.filter((i) => !i.hecho);
  const comidasHoy = est.comidasDe(h);
  const porComprar = est.comprasPendientes();

  const yo = est.estado.yo;

  // --- encabezado ---
  const encabezado = el('section.seccion', {}, [
    el('p', {
      estilo: { fontSize: '1.35rem', fontWeight: '800', letterSpacing: '-0.4px' },
      texto: yo?.nombre ? `${saludo()}, ${yo.nombre}` : saludo(),
    }),
    el('p.cap', {
      estilo: { color: 'var(--suave)', fontSize: '0.85rem', marginTop: '2px' },
      texto: fechaLarga(h),
    }),
  ]);

  // --- lo que sigue ---
  const siguiente = loQueSigue(instHoy);

  // --- hoy ---
  const seccionHoy = el('section.seccion', {}, [
    el('h2', {}, [
      'Hoy',
      pendientesHoy.length
        ? el('span.contador', {
          texto: `${pendientesHoy.length} ${pendientesHoy.length === 1 ? 'pendiente' : 'pendientes'}`,
        })
        : null,
    ]),
    instHoy.length
      ? el('div', {}, instHoy.map((i) => filaEvento(i)))
      : vacio('☕', 'Hoy no hay nada anotado. Disfrutalo.'),
  ]);

  // --- mañana: lo importante de esta pantalla ---
  const seccionManana = el('section.seccion', {}, [
    el('h2', {}, [
      'Mañana',
      instManana.length
        ? el('span.contador', { texto: String(instManana.length) })
        : null,
    ]),
    instManana.length
      ? el('div', {}, instManana.map((i) => filaEvento(i)))
      : el('p', {
        estilo: { fontSize: '0.85rem', color: 'var(--suave)', paddingLeft: '2px' },
        texto: 'Mañana está libre.',
      }),
  ]);

  // --- comida ---
  const seccionComida = el('section.seccion', {}, [
    el('h2', {}, ['Qué se come hoy']),
    el('div', {}, [
      tarjetaComida(h, 'almuerzo', comidasHoy.almuerzo),
      tarjetaComida(h, 'cena', comidasHoy.cena),
    ]),
  ]);

  // --- compras ---
  const seccionCompras = porComprar.length
    ? el('section.seccion', {}, [
      el('h2', {}, ['Falta comprar', el('span.contador', { texto: String(porComprar.length) })]),
      el('button.tarjeta.plana', {
        type: 'button',
        estilo: { width: '100%', textAlign: 'left' },
        'on:click': () => est.irA('compras'),
      }, [
        el('p', {
          estilo: { fontSize: '0.88rem', fontWeight: '600' },
          // Los primeros nombres, para que se sepa de qué va sin abrir la lista.
          texto: porComprar.slice(0, 5).map((c) => c.item).join(', ') +
            (porComprar.length > 5 ? ` y ${porComprar.length - 5} más` : ''),
        }),
        el('p', {
          estilo: {
            fontSize: '0.75rem',
            color: 'var(--primary)',
            fontWeight: '700',
            marginTop: '6px',
          },
          texto: 'Ver la lista →',
        }),
      ]),
    ])
    : null;

  pintar(destino,
    encabezado,
    siguiente ? el('section.seccion', {}, [siguiente]) : null,
    seccionHoy,
    seccionManana,
    seccionComida,
    seccionCompras,
  );

  return el('button.fab', {
    type: 'button',
    'aria-label': 'Anotar algo nuevo',
    texto: '+',
    'on:click': () => abrirEditorEvento({ fechaSugerida: h }),
  });
}
