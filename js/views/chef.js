// ============================================================================
//  Chef: el agente que propone qué comer.
//
//  Dos cosas hace, y la segunda es la que importa:
//    1. Charlar ("¿qué hago con lo que tengo en la heladera?").
//    2. Armar el menú de la semana completo y cargarlo al planificador.
//
//  El contexto que se le manda es lo que lo hace útil: la lista real de lo que
//  está de temporada este mes en Buenos Aires, las restricciones de la casa, lo
//  que comieron hace poco, y LA AGENDA DE LA SEMANA. Con la agenda adelante,
//  el día que hay natación a las 19 propone algo de 20 minutos.
// ============================================================================
import * as db from '../lib/db.js';
import * as est from '../estado.js';
import { icono } from '../lib/iconos.js';
import { temporadaDe } from '../data/temporada.js';
import { RUBROS } from '../data/recetas.js';
import {
  aHora,
  DIAS_LARGOS,
  fechaHumana,
  hoy,
  inicioSemana,
  partes,
  rangoSemanaHumano,
  sumarDias,
} from '../lib/fechas.js';
import {
  areaTexto,
  avisoBien,
  avisoMal,
  campo,
  cargando,
  cerrarHoja,
  confirmar,
  el,
  elegir,
  entrada,
  hoja,
  interruptor,
  pintar,
  textoDelChef,
} from '../lib/ui.js';

const RESTRICCIONES = [
  ['sin_tacc', 'Sin TACC'],
  ['vegetariano', 'Vegetariano'],
  ['vegano', 'Vegano'],
  ['sin_lactosa', 'Sin lactosa'],
  ['sin_frutos_secos', 'Sin frutos secos'],
  ['bajo_sodio', 'Bajo en sodio'],
  ['sin_cerdo', 'Sin cerdo'],
  ['sin_pescado', 'Sin pescado'],
];

const SUGERENCIAS = [
  '¿Qué conviene comprar esta semana?',
  'Algo rápido para hoy a la noche',
  'Una cena sin carne que le guste a un nene',
  '¿Qué hago con lo que tengo en la heladera?',
  'Algo para llevar de vianda',
];

// ---------------------------------------------------------------------------
//  El contexto que viaja al agente
// ---------------------------------------------------------------------------

/**
 * Arma el contexto. La tabla de estacionalidad sale de js/data/temporada.js: es
 * la única fuente, y viaja en cada pedido para que la función no tenga su propia
 * copia que se desincronice.
 */
export function armarContexto({ desdeFecha = hoy(), dias = 7 } = {}) {
  const mes = partes(desdeFecha).mes;
  const p = est.estado.preferencias;

  // La agenda de los días que se van a planificar: es lo que decide cuánto
  // tiempo hay para cocinar cada día.
  const agenda = [];
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(desdeFecha, i);
    const inst = est.instanciasDe(fecha);
    const compromisos = inst
      // Lo de la mañana temprano no compite con la cena.
      .filter((x) => x.evento.todo_el_dia || aHora(x.evento.inicio) >= '11:00')
      .map((x) =>
        x.evento.todo_el_dia
          ? x.evento.titulo
          : `${x.evento.titulo} ${aHora(x.evento.inicio)}`
      );

    agenda.push({
      fecha,
      etiqueta: `${DIAS_LARGOS[new Date(`${fecha}T12:00:00Z`).getUTCDay()]} ${fecha}`,
      compromisos,
    });
  }

  return {
    hoy: hoy(),
    temporada: temporadaDe(mes),
    preferencias: p
      ? {
        restricciones: p.restricciones ?? [],
        no_gusta: p.no_gusta ?? [],
        presupuesto: p.presupuesto,
        tiempo_cocina: p.tiempo_cocina,
        porciones: p.porciones,
        notas: p.notas ?? '',
      }
      : null,
    personas: est.estado.personas.map((x) => x.nombre),
    agenda,
    comidas_recientes: est.comidasRecientes(14),
    menu_actual: est.estado.menu
      .filter((m) => {
        const f = m.fecha?.slice(0, 10);
        return f >= desdeFecha && f <= sumarDias(desdeFecha, dias - 1);
      })
      .map((m) => ({ fecha: m.fecha.slice(0, 10), momento: m.momento, titulo: m.titulo })),
  };
}

// ---------------------------------------------------------------------------
//  Armar el menú de la semana
// ---------------------------------------------------------------------------

export function abrirArmarMenu() {
  // Por defecto, el lunes que viene (o esta semana si recién arrancó).
  const lunesDeEstaSemana = inicioSemana(hoy());
  const refSemana = est.estado.semanaVisible ?? hoy();
  const arranque = inicioSemana(refSemana);

  const b = {
    desde: arranque,
    dias: 7,
    almuerzo: true,
    cena: true,
    instruccion: '',
  };

  const campoDesde = entrada({
    type: 'date',
    value: b.desde,
    'on:change': (e) => (b.desde = e.target.value),
  });

  const selDias = elegir(
    [['3', '3 días'], ['5', '5 días (lunes a viernes)'], ['7', 'Toda la semana']],
    '7',
    { 'on:change': (e) => (b.dias = Number(e.target.value)) },
  );

  const campoInstruccion = areaTexto({
    placeholder: 'El viernes somos cinco a cenar. ' +
      'Y el finde queremos algo más tranquilo.',
    maxlength: 500,
    estilo: { minHeight: '70px' },
    'on:input': (e) => (b.instruccion = e.target.value),
  });

  const error = el('p.error-campo');
  const btn = el('button.btn.primario', { type: 'submit', texto: 'Armar el menú' });

  const form = el('form', { novalidate: true }, [
    el('p.bajada', {
      texto: 'El agente mira lo que está de temporada, las preferencias de la casa, ' +
        'lo que comieron hace poco y la agenda de esos días.',
    }),
    campo('¿Desde cuándo?', campoDesde),
    campo('¿Cuántos días?', selDias),
    interruptor('Incluir almuerzos', b.almuerzo, (v) => (b.almuerzo = v)),
    interruptor('Incluir cenas', b.cena, (v) => (b.cena = v)),
    campo('¿Algo especial esta semana?', campoInstruccion),
    error,
  ]);

  form.append(el('div.acciones', {}, [
    el('button.btn.linea', {
      type: 'button',
      texto: 'Cancelar',
      'on:click': () => cerrarHoja(),
    }),
    btn,
  ]));

  let pidiendo = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pidiendo) return;

    error.textContent = '';
    const momentos = [b.almuerzo && 'almuerzo', b.cena && 'cena'].filter(Boolean);
    if (!momentos.length) {
      error.textContent = 'Elegí al menos almuerzos o cenas';
      return;
    }

    pidiendo = true;
    btn.disabled = true;
    btn.textContent = 'Pensando…';

    try {
      const r = await db.chefMenu({
        contexto: armarContexto({ desdeFecha: b.desde, dias: b.dias }),
        desde: b.desde,
        dias: b.dias,
        momentos,
        instruccion: b.instruccion.trim() || undefined,
      });
      cerrarHoja();
      mostrarPropuesta(r);
    } catch (err) {
      error.textContent = db.mensajeDeError(err);
    } finally {
      pidiendo = false;
      btn.disabled = false;
      btn.textContent = 'Armar el menú';
    }
  });

  hoja({
    titulo: 'Armar el menú',
    bajada: arranque === lunesDeEstaSemana ? null : `Arranca el ${fechaHumana(arranque)}.`,
    contenido: form,
  });
}

/**
 * Muestra lo que propuso el agente antes de guardarlo.
 * Nunca se escribe en el menú sin que lo vean: es su comida, no la del modelo.
 */
function mostrarPropuesta(r) {
  const seleccionadas = new Set(r.menu.map((_, i) => i));

  const lista = el('div');
  r.menu.forEach((c, i) => {
    const fila = el('button.comida-slot', {
      type: 'button',
      estilo: { marginBottom: '6px', alignItems: 'flex-start' },
      'aria-pressed': 'true',
      'on:click': (e) => {
        const dentro = seleccionadas.has(i);
        if (dentro) seleccionadas.delete(i);
        else seleccionadas.add(i);
        e.currentTarget.setAttribute('aria-pressed', String(!dentro));
        e.currentTarget.style.opacity = dentro ? '0.4' : '1';
        actualizarBoton();
      },
    }, [
      el('span.momento', {
        texto: `${fechaHumana(c.fecha).slice(0, 8)}\n${c.momento === 'almuerzo' ? 'alm' : 'cena'}`,
        estilo: { whiteSpace: 'pre-line', lineHeight: '1.25' },
      }),
      el('span.plato', {}, [
        c.titulo,
        el('span.meta', {
          texto: [
            c.tiempo_min ? `${c.tiempo_min} min` : null,
            ...(c.etiquetas ?? []).slice(0, 2),
            c.ingredientes?.length ? `${c.ingredientes.length} ingredientes` : null,
          ].filter(Boolean).join(' · '),
        }),
        c.nota ? el('span.meta', { texto: c.nota }) : null,
      ]),
    ]);
    lista.append(fila);
  });

  const btn = el('button.btn.primario', { type: 'button' });
  const actualizarBoton = () => {
    btn.textContent = seleccionadas.size
      ? `Cargar ${seleccionadas.size} ${seleccionadas.size === 1 ? 'comida' : 'comidas'}`
      : 'No elegiste ninguna';
    btn.disabled = seleccionadas.size === 0;
  };
  actualizarBoton();

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const filas = [...seleccionadas].map((i) => {
        const c = r.menu[i];
        return {
          hogar_id: est.estado.hogar.id,
          fecha: c.fecha,
          momento: c.momento,
          titulo: c.titulo,
          receta_id: null,
          notas: c.nota ?? null,
          ingredientes: (c.ingredientes ?? []).map((x) => ({
            item: x.item,
            cantidad: x.cantidad ?? '',
            rubro: RUBROS[x.rubro] ? x.rubro : 'otros',
          })),
          etiquetas: c.etiquetas ?? [],
        };
      });

      await db.guardarComidas(filas);
      await est.recargar('menu');
      cerrarHoja();
      avisoBien(`${filas.length} ${filas.length === 1 ? 'comida cargada' : 'comidas cargadas'}`);
      est.irA('comidas', { semanaVisible: r.menu[0]?.fecha ?? hoy(), tabComidas: 'menu' });
    } catch (e) {
      avisoMal(db.mensajeDeError(e));
      btn.disabled = false;
      actualizarBoton();
    }
  });

  hoja({
    titulo: 'Lo que propone',
    bajada: r.resumen || 'Tocá una comida para sacarla antes de cargar.',
    contenido: [
      lista,
      el('div.acciones', {}, [
        el('button.btn.linea', {
          type: 'button',
          texto: 'Descartar',
          'on:click': () => cerrarHoja(),
        }),
        btn,
      ]),
    ],
  });
}

// ---------------------------------------------------------------------------
//  Preferencias de la casa
// ---------------------------------------------------------------------------

export function abrirPreferencias() {
  const p = est.estado.preferencias ?? {};
  const b = {
    restricciones: [...(p.restricciones ?? [])],
    no_gusta: (p.no_gusta ?? []).join(', '),
    presupuesto: p.presupuesto ?? 'medio',
    tiempo_cocina: p.tiempo_cocina ?? 'medio',
    porciones: p.porciones ?? Math.max(est.estado.personas.length, 2),
    notas: p.notas ?? '',
  };

  const chipsRestr = el('div.chips', { role: 'group', 'aria-label': 'Restricciones' });
  for (const [valor, texto] of RESTRICCIONES) {
    const chip = el('button.chip', {
      type: 'button',
      texto,
      'aria-pressed': String(b.restricciones.includes(valor)),
      'on:click': () => {
        const i = b.restricciones.indexOf(valor);
        if (i === -1) b.restricciones.push(valor);
        else b.restricciones.splice(i, 1);
        chip.setAttribute('aria-pressed', String(b.restricciones.includes(valor)));
      },
    });
    chipsRestr.append(chip);
  }

  const campoNoGusta = entrada({
    value: b.no_gusta,
    placeholder: 'hígado, remolacha, coliflor',
    'on:input': (e) => (b.no_gusta = e.target.value),
  });

  const selPresupuesto = elegir(
    [['bajo', 'Ajustado'], ['medio', 'Normal'], ['alto', 'Holgado']],
    b.presupuesto,
    { 'on:change': (e) => (b.presupuesto = e.target.value) },
  );

  const selTiempo = elegir(
    [
      ['rapido', 'Poco: hasta 30 minutos'],
      ['medio', 'Normal: hasta 45 minutos'],
      ['sin_apuro', 'Nos gusta cocinar, sin apuro'],
    ],
    b.tiempo_cocina,
    { 'on:change': (e) => (b.tiempo_cocina = e.target.value) },
  );

  const campoPorciones = entrada({
    type: 'number',
    value: String(b.porciones),
    min: '1',
    max: '12',
    'on:input': (e) => (b.porciones = Number(e.target.value)),
  });

  const campoNotas = areaTexto({
    value: b.notas,
    placeholder: 'No nos gusta nada con salsa. Los domingos comemos afuera.',
    maxlength: 500,
    estilo: { minHeight: '70px' },
    'on:input': (e) => (b.notas = e.target.value),
  });

  const error = el('p.error-campo');
  const btn = el('button.btn.primario', { type: 'submit', texto: 'Guardar' });

  const form = el('form', { novalidate: true }, [
    campo('Restricciones', chipsRestr, 'El agente no las va a romper nunca.'),
    campo('Lo que no les gusta', campoNoGusta, 'Separado por comas.'),
    campo('Presupuesto', selPresupuesto),
    campo('Tiempo para cocinar', selTiempo),
    campo('¿Para cuántos?', campoPorciones),
    campo('Algo más que tenga en cuenta', campoNotas),
    error,
  ]);

  form.append(el('div.acciones', {}, [
    el('button.btn.linea', {
      type: 'button',
      texto: 'Cancelar',
      'on:click': () => cerrarHoja(),
    }),
    btn,
  ]));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      await db.guardarPreferencias(est.estado.hogar.id, {
        restricciones: b.restricciones,
        no_gusta: b.no_gusta.split(',').map((x) => x.trim()).filter(Boolean),
        presupuesto: b.presupuesto,
        tiempo_cocina: b.tiempo_cocina,
        porciones: Math.min(Math.max(b.porciones || 2, 1), 12),
        notas: b.notas.trim() || null,
      });
      await est.recargar('preferencias');
      cerrarHoja();
      avisoBien('Guardado');
    } catch (err) {
      error.textContent = db.mensajeDeError(err);
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });

  hoja({
    titulo: 'Cómo comen en casa',
    bajada: 'Esto lo tiene en cuenta el agente en cada propuesta.',
    contenido: form,
  });
}

// ---------------------------------------------------------------------------
//  La vista
// ---------------------------------------------------------------------------

let mensajes = null; // se cachea para no ir a la base en cada repintado
let cargandoMensajes = false;
let escribiendo = false;

export function vistaChef(destino) {
  const refSemana = est.estado.semanaVisible ?? hoy();

  // --- lo de arriba: las dos acciones grandes ---
  const cabecera = el('section.seccion', {}, [
    el('div.tarjeta', {}, [
      el('p.t3', {}, [
        icono('chispas', { tamano: 18 }),
        ' Armar el menú de la semana',
      ]),
      el('p.cuerpo-chico', {
        estilo: { margin: '5px 0 13px' },
        texto: `Lo de temporada en Buenos Aires, lo que comieron hace poco y ` +
          `la agenda de ${rangoSemanaHumano(refSemana)}.`,
      }),
      el('button.btn.primario.ancho', {
        type: 'button',
        texto: 'Armar',
        'on:click': abrirArmarMenu,
      }),
    ]),
    el('button.btn.linea.ancho.chico', {
      type: 'button',
      estilo: { marginTop: '8px' },
      'on:click': abrirPreferencias,
    }, [icono('ajustes', { tamano: 15 }), 'Cómo comen en casa']),
  ]);

  // --- el chat ---
  const chat = el('div.chat');

  function pintarChat() {
    const nodos = [];

    if (!mensajes?.length) {
      nodos.push(el('div.burbuja.chef', {
        texto: '¡Hola! Preguntame lo que quieras sobre la comida de la semana. ' +
          'Sé lo que está de temporada acá y cómo comen en tu casa.',
      }));
    } else {
      for (const m of mensajes) {
        nodos.push(el('div.burbuja', {
          clase: m.rol === 'user' ? 'yo' : 'chef',
          // Del lado del chef se permite negrita y listas; el texto se escapa
          // antes en textoDelChef, porque viene de un modelo.
          ...(m.rol === 'user'
            ? { texto: m.contenido }
            : { html: textoDelChef(m.contenido) }),
        }));
      }
    }

    if (escribiendo) {
      nodos.push(el('div.burbuja.chef', {}, [
        el('span.ruedita', { estilo: { display: 'inline-block', verticalAlign: '-3px' } }),
        ' pensando…',
      ]));
    }

    pintar(chat, ...nodos);
  }

  // --- sugerencias ---
  const sugerencias = el('div.chips.scroll', { estilo: { marginBottom: '10px' } },
    SUGERENCIAS.map((s) =>
      el('button.chip', {
        type: 'button',
        texto: s,
        'on:click': () => enviar(s),
      })
    ));

  // --- la caja de escribir ---
  const caja = areaTexto({
    placeholder: 'Preguntale algo…',
    rows: 1,
    'aria-label': 'Mensaje para el chef',
    'on:input': (e) => {
      // Crece con el texto, hasta el tope del CSS.
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
    },
    'on:keydown': (e) => {
      // Enter manda; Shift+Enter hace un salto de línea.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviar(caja.value);
      }
    },
  });

  const btnEnviar = el('button', {
    type: 'button',
    'aria-label': 'Enviar',
    'on:click': () => enviar(caja.value),
  }, [icono('enviar', { tamano: 18 })]);

  const entradaChat = el('div.chat-entrada', {}, [caja, btnEnviar]);

  async function enviar(texto) {
    const t = String(texto ?? '').trim();
    if (!t || escribiendo) return;

    caja.value = '';
    caja.style.height = 'auto';

    mensajes = [...(mensajes ?? []), { rol: 'user', contenido: t }];
    escribiendo = true;
    pintarChat();
    chat.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });

    try {
      // Se guarda la pregunta para que el otro vea la conversación.
      db.guardarMensajeChef(est.estado.hogar.id, 'user', t).catch(() => {});

      const respuesta = await db.chefChat(
        mensajes.map((m) => ({ rol: m.rol, contenido: m.contenido })),
        armarContexto({ desdeFecha: hoy(), dias: 7 }),
      );

      mensajes = [...mensajes, { rol: 'assistant', contenido: respuesta }];
      db.guardarMensajeChef(est.estado.hogar.id, 'assistant', respuesta).catch(() => {});
    } catch (e) {
      avisoMal(db.mensajeDeError(e));
      // La pregunta que falló no se deja colgada en la pantalla.
      mensajes = mensajes.slice(0, -1);
    } finally {
      escribiendo = false;
      pintarChat();
      chat.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }

  // Historial: se trae una sola vez por sesión de vista.
  if (mensajes === null && !cargandoMensajes) {
    cargandoMensajes = true;
    pintar(chat, cargando('Buscando la conversación…'));
    db.mensajesChef(est.estado.hogar.id)
      .then((filas) => {
        mensajes = filas.map((f) => ({ rol: f.rol, contenido: f.contenido }));
      })
      .catch(() => {
        mensajes = [];
      })
      .finally(() => {
        cargandoMensajes = false;
        pintarChat();
      });
  } else {
    pintarChat();
  }

  const btnLimpiar = (mensajes?.length ?? 0) > 0
    ? el('button.btn.linea.ancho.chico', {
      type: 'button',
      texto: 'Borrar la conversación',
      estilo: { marginTop: '14px' },
      'on:click': async () => {
        const ok = await confirmar({
          titulo: '¿Borrar la conversación?',
          bajada: 'El menú que ya cargaste queda igual.',
          siTexto: 'Sí, borrar',
          peligroso: true,
        });
        if (!ok) return;
        try {
          await db.limpiarChatChef(est.estado.hogar.id);
          mensajes = [];
          est.avisar();
        } catch (e) {
          avisoMal(db.mensajeDeError(e));
        }
      },
    })
    : null;

  pintar(destino,
    cabecera,
    el('section.seccion', {}, [
      el('h2', {}, ['Preguntale']),
      sugerencias,
      chat,
      entradaChat,
      btnLimpiar,
    ]),
  );

  return null;
}

/** Se llama al salir del hogar, para no mezclar conversaciones. */
export function olvidarChat() {
  mensajes = null;
  escribiendo = false;
}
