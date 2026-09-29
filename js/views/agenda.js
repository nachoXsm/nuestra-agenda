// ============================================================================
//  Agenda: el calendario, en tres alturas de vuelo.
//
//    Mes     — todo el mes de un vistazo. Cada día muestra los eventos
//              escritos, no puntitos: la idea es no tener que tocar para
//              enterarse de que el martes hay natación.
//    Semana  — los siete días abiertos, uno abajo del otro, con todo lo que
//              tiene cada uno.
//    Día     — un día entero con las horas a la izquierda, más lo que se come
//              y las tareas que vencen.
//
//  Arriba de todo hay un filtro por integrante: "Todos" o una persona. Con
//  tres personas cargadas el mes se llena, y poder mirar solo lo del nene es
//  media agenda.
//
//  El editor de eventos se exporta porque también se abre desde Inicio.
// ============================================================================
import * as db from '../lib/db.js';
import * as est from '../estado.js';
import { AVISOS, categoria, CATEGORIAS, REPETICIONES } from '../data/categorias.js';
import { tinte } from '../data/paleta.js';
import {
  aHora,
  combinarFechaHora,
  DIAS_CORTOS,
  DIAS_LARGOS,
  diaSemana,
  duracionMin,
  fechaHumana,
  fechaLarga,
  grillaMes,
  hoy,
  inicioSemana,
  mesLargo,
  partes,
  rangoSemanaHumano,
  sumarDias,
} from '../lib/fechas.js';
import { descargarIcs, eventoAIcs } from '../lib/ics.js';
import { icono } from '../lib/iconos.js';
import {
  areaTexto,
  avatar,
  avisoBien,
  avisoMal,
  campo,
  cerrarHoja,
  confirmar,
  el,
  elegir,
  entrada,
  hoja,
  interruptor,
  marca,
  pintar,
  segmentado,
  vacio,
  vibrar,
} from '../lib/ui.js';

// ---------------------------------------------------------------------------
//  Color
// ---------------------------------------------------------------------------

/**
 * El color con el que se pinta un evento. Si tiene dueño, el de la persona:
 * en una agenda compartida lo primero que uno busca es de quién es. Si es de
 * toda la familia, el de la categoría.
 */
export function tinteDe(inst) {
  if (inst.persona) return tinte(inst.persona);
  return categoria(inst.evento.categoria).color;
}

// ---------------------------------------------------------------------------
//  Filtro por integrante
// ---------------------------------------------------------------------------

function filtroIntegrantes() {
  const actual = est.estado.filtroPersona ?? 'todos';
  const cont = el('div.chips.scroll', { role: 'group', 'aria-label': 'Filtrar por integrante' });

  const chip = (valor, texto, color) => el('button.chip', {
    type: 'button',
    texto,
    'aria-pressed': String(valor === actual),
    estilo: color ? { '--tinte': color } : {},
    'on:click': () => est.poner({ filtroPersona: valor }),
  });

  cont.append(chip('todos', 'Todos'));
  for (const p of est.estado.personas) {
    cont.append(chip(p.id, `${p.emoji ?? ''} ${p.nombre}`.trim(), tinte(p)));
  }
  return cont;
}

/** Aplica el filtro de arriba a una lista de instancias. */
function filtrar(instancias) {
  const f = est.estado.filtroPersona ?? 'todos';
  if (f === 'todos') return instancias;
  // Lo que es de toda la familia le toca a todos, así que queda siempre.
  return instancias.filter((i) => i.evento.persona_id === f || !i.evento.persona_id);
}

// ---------------------------------------------------------------------------
//  Una fila de evento
// ---------------------------------------------------------------------------

/**
 * @param {object} inst  instancia de est.instanciasEnRango
 * @param {object} opciones  { mostrarFecha }
 */
export function filaEvento(inst, { mostrarFecha = false } = {}) {
  const { evento, fecha, hecho, persona } = inst;
  const cat = categoria(evento.categoria);

  const detalles = [];
  if (mostrarFecha) detalles.push(fechaHumana(fecha));
  detalles.push(cat.nombre);
  if (persona) detalles.push(persona.nombre);
  if (evento.lugar) detalles.push(evento.lugar);
  if (evento.calendario_id) {
    const cal = est.estado.calendarios.find((c) => c.id === evento.calendario_id);
    if (cal) detalles.push(cal.nombre);
  }

  // Solo se muestra la duración si el evento la tiene de verdad: duracionMin
  // devuelve una hora por defecto, y poner "1 h" en todo sería inventar.
  const minutos = evento.fin ? duracionMin(evento) : 0;

  const fila = el('button.fila.con-tinte', {
    clase: hecho ? 'hecha' : '',
    type: 'button',
    estilo: { '--tinte': tinteDe(inst) },
    'on:click': () => abrirEditorEvento({ evento, fecha }),
  }, [
    el('span.horas', {}, evento.todo_el_dia
      ? [el('span', { texto: 'todo' }), el('span', { texto: 'el día' })]
      : [
        aHora(evento.inicio),
        minutos ? el('span', { texto: minutosHumanos(minutos) }) : null,
      ]),
    el('span.cuerpo-fila', {}, [
      el('span.fila-titulo', {}, [
        el('span', { texto: evento.titulo }),
        evento.repite !== 'no'
          ? icono('repetir', { tamano: 13, trazo: 2.2, titulo: 'Se repite' })
          : null,
        evento.aviso_minutos
          ? icono('campana', { tamano: 13, trazo: 2.2, titulo: 'Tiene aviso' })
          : null,
      ]),
      el('span.fila-sub', { texto: detalles.join(' · ') }),
    ]),
  ]);

  // El tilde de "ya está" no abre el editor.
  const tilde = el('span.tilde', {
    role: 'button',
    tabindex: '0',
    'aria-label': hecho ? `Desmarcar ${evento.titulo}` : `Marcar ${evento.titulo} como hecho`,
  }, [icono('tilde', { tamano: 14, trazo: 2.6 })]);

  const alternar = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    vibrar();
    try {
      if (hecho) await db.desmarcarOcurrencia(evento.id, fecha);
      else await db.marcarOcurrencia(evento.id, fecha, 'hecho');
      await est.recargar('eventos');
    } catch (error) {
      avisoMal(db.mensajeDeError(error));
    }
  };
  tilde.addEventListener('click', alternar);
  tilde.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') alternar(e);
  });
  fila.append(tilde);

  return fila;
}

function minutosHumanos(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** Lista de eventos, con su estado vacío. */
export function listaEventos(instancias, { mostrarFecha = false, vacioTexto } = {}) {
  if (!instancias.length) {
    return vacio('planta', vacioTexto ?? 'No hay nada anotado. Día libre.');
  }
  return el('div', {}, instancias.map((i) => filaEvento(i, { mostrarFecha })));
}

// ---------------------------------------------------------------------------
//  Vista de mes
// ---------------------------------------------------------------------------

/** Cuántas tiritas entran en una celda del mes sin que se desborde. */
const MINIS_POR_CELDA = 3;

function vistaMes(elegida) {
  const visible = est.estado.mesVisible ?? {
    anio: partes(elegida).anio,
    mes: partes(elegida).mes,
  };

  const irAlMes = async (delta) => {
    let { anio, mes } = visible;
    mes += delta;
    if (mes > 12) {
      mes = 1;
      anio++;
    }
    if (mes < 1) {
      mes = 12;
      anio--;
    }
    est.estado.mesVisible = { anio, mes };
    await est.asegurarRango(`${anio}-${String(mes).padStart(2, '0')}-15`);
    est.avisar();
  };

  const nav = el('div.mes-nav', {}, [
    el('button', {
      type: 'button',
      'aria-label': 'Mes anterior',
      'on:click': () => irAlMes(-1),
    }, [icono('izq')]),
    el('span.titulo.cap', { texto: mesLargo(visible.anio, visible.mes) }),
    el('button', {
      type: 'button',
      'aria-label': 'Mes siguiente',
      'on:click': () => irAlMes(1),
    }, [icono('der')]),
  ]);

  const grilla = el('div.grilla-mes', { role: 'grid' });
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    grilla.append(el('div.dow', { texto: DIAS_CORTOS[d], 'aria-hidden': 'true' }));
  }

  for (const { fecha, delMes } of grillaMes(visible.anio, visible.mes)) {
    const inst = filtrar(est.instanciasDe(fecha));
    const comidas = est.comidasDe(fecha);
    const algoDeComer = comidas.almuerzo ?? comidas.cena;

    const minis = inst.slice(0, MINIS_POR_CELDA).map((i) =>
      el('span.mini', {
        estilo: { '--tinte': tinteDe(i) },
        // Solo el título: la celda tiene unos 50 px y metiendo también la hora
        // no entra ni la primera palabra ("19 Cl…").
        texto: i.evento.titulo,
        title: i.evento.todo_el_dia
          ? i.evento.titulo
          : `${aHora(i.evento.inicio)} · ${i.evento.titulo}`,
      })
    );
    if (inst.length > MINIS_POR_CELDA) {
      minis.push(el('span.mini.mas', { texto: `+${inst.length - MINIS_POR_CELDA}` }));
    }

    grilla.append(el('button.dia-celda', {
      type: 'button',
      clase: [delMes ? '' : 'otro-mes', fecha === hoy() ? 'hoy' : ''].join(' '),
      'aria-pressed': String(fecha === elegida),
      'aria-label': `${fechaLarga(fecha)}, ${inst.length} ${inst.length === 1 ? 'cosa' : 'cosas'}`,
      'on:click': () => est.poner({ fechaElegida: fecha }),
    }, [
      el('span.num', { texto: String(partes(fecha).dia) }),
      ...minis,
      // Si ya se decidió qué se come, un renglón chiquito con el plato.
      algoDeComer && !minis.length
        ? el('span.comida', { texto: algoDeComer.titulo })
        : null,
    ]));
  }

  return [
    el('section.seccion', {}, [nav, grilla]),
    diaAmpliado(elegida, { conComidas: true }),
  ];
}

// ---------------------------------------------------------------------------
//  Vista de semana
// ---------------------------------------------------------------------------

function vistaSemana(elegida) {
  const lunes = inicioSemana(est.estado.semanaVisible ?? elegida);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));

  const irALaSemana = async (delta) => {
    const nueva = sumarDias(lunes, delta * 7);
    est.estado.semanaVisible = nueva;
    await est.asegurarRango(nueva);
    est.avisar();
  };

  const nav = el('div.mes-nav', {}, [
    el('button', {
      type: 'button',
      'aria-label': 'Semana anterior',
      'on:click': () => irALaSemana(-1),
    }, [icono('izq')]),
    el('span.titulo.cap', { texto: rangoSemanaHumano(lunes) }),
    el('button', {
      type: 'button',
      'aria-label': 'Semana siguiente',
      'on:click': () => irALaSemana(1),
    }, [icono('der')]),
  ]);

  // La tira de arriba: sirve para saltar a un día sin perder de vista la
  // semana entera, y para ver de un golpe qué día está cargado.
  const tira = el('div.tira-semana', {});
  for (const f of dias) {
    const inst = filtrar(est.instanciasDe(f));
    const colores = [...new Set(inst.map((i) => tinteDe(i)))].slice(0, 4);
    tira.append(el('button', {
      type: 'button',
      clase: f === hoy() ? 'hoy' : '',
      'aria-pressed': String(f === elegida),
      'aria-label': `${fechaLarga(f)}, ${inst.length} ${inst.length === 1 ? 'cosa' : 'cosas'}`,
      'on:click': () => est.poner({ fechaElegida: f, modoAgenda: 'dia' }),
    }, [
      el('span.d', { texto: DIAS_CORTOS[diaSemana(f)] }),
      el('span.n', { texto: String(partes(f).dia) }),
      el('span.puntos', {}, colores.map((c) => el('i', { estilo: { '--tinte': c } }))),
    ]));
  }

  // Y abajo los siete días abiertos, que es lo que se pidió: ver todo sin
  // tocar nada.
  const grupos = dias.map((f) => {
    const inst = filtrar(est.instanciasDe(f));
    const comidas = est.comidasDe(f);
    const platos = [comidas.almuerzo?.titulo, comidas.cena?.titulo].filter(Boolean);

    return el('section.dia-grupo', {}, [
      el('header', {}, [
        el('span.nombre', {
          texto: `${DIAS_LARGOS[diaSemana(f)]} ${partes(f).dia}`,
        }),
        f === hoy() ? marca('Hoy', 'hoy') : null,
        el('span.cuantos', {
          texto: inst.length ? `${inst.length}` : 'libre',
        }),
      ]),
      inst.length
        ? el('div', {}, inst.map((i) => filaEvento(i)))
        : el('p.cuerpo-chico', { texto: 'Sin nada anotado.' }),
      platos.length
        ? el('p.cuerpo-chico', {
          estilo: { marginTop: '8px' },
          texto: `Se come: ${platos.join(' · ')}`,
        })
        : null,
    ]);
  });

  return [el('section.seccion', {}, [nav, tira]), ...grupos];
}

// ---------------------------------------------------------------------------
//  Vista de día
// ---------------------------------------------------------------------------

function vistaDia(elegida) {
  const irAlDia = async (delta) => {
    const nueva = sumarDias(elegida, delta);
    await est.asegurarRango(nueva);
    est.poner({ fechaElegida: nueva, semanaVisible: nueva });
  };

  const nav = el('div.mes-nav', {}, [
    el('button', {
      type: 'button',
      'aria-label': 'Día anterior',
      'on:click': () => irAlDia(-1),
    }, [icono('izq')]),
    el('span.titulo.cap', { texto: fechaHumana(elegida) }),
    el('button', {
      type: 'button',
      'aria-label': 'Día siguiente',
      'on:click': () => irAlDia(1),
    }, [icono('der')]),
  ]);

  return [
    el('section.seccion', {}, [
      nav,
      el('p.cuerpo-chico.cap', {
        estilo: { textAlign: 'center', marginTop: '-4px' },
        texto: fechaLarga(elegida),
      }),
    ]),
    diaAmpliado(elegida, { conComidas: true, conTareas: true, sinTitulo: true }),
  ];
}

// ---------------------------------------------------------------------------
//  El bloque del día elegido, que usan Mes y Día
// ---------------------------------------------------------------------------

function diaAmpliado(fecha, { conComidas = false, conTareas = false, sinTitulo = false } = {}) {
  const inst = filtrar(est.instanciasDe(fecha));
  const comidas = est.comidasDe(fecha);
  const tareas = est.estado.tareas.filter((t) => t.vence?.slice(0, 10) === fecha);

  const bloques = [];

  bloques.push(el('section.seccion', {}, [
    sinTitulo ? null : el('header', {}, [
      el('h2.cap', { texto: fechaHumana(fecha) }),
      el('span.etiqueta', {
        texto: inst.length
          ? `${inst.length} ${inst.length === 1 ? 'cosa' : 'cosas'}`
          : 'libre',
      }),
    ]),
    listaEventos(inst, {
      vacioTexto: fecha === hoy()
        ? 'Hoy no hay nada anotado. Disfrutalo.'
        : 'Ese día está libre.',
    }),
  ]));

  if (conComidas && (comidas.almuerzo || comidas.cena)) {
    bloques.push(el('section.seccion', {}, [
      el('header', {}, [el('h2', { texto: 'Ese día se come' })]),
      el('div.tarjeta.plana', {}, [
        comidas.almuerzo
          ? el('p.cuerpo', {}, [
            el('strong', { texto: 'Almuerzo: ' }),
            comidas.almuerzo.titulo,
          ])
          : null,
        comidas.cena
          ? el('p.cuerpo', {
            estilo: { marginTop: comidas.almuerzo ? '6px' : '0' },
          }, [el('strong', { texto: 'Cena: ' }), comidas.cena.titulo])
          : null,
      ]),
    ]));
  }

  if (conTareas && tareas.length) {
    bloques.push(el('section.seccion', {}, [
      el('header', {}, [el('h2', { texto: 'Tareas que vencen ese día' })]),
      el('div', {}, tareas.map((t) => {
        const p = t.persona_id ? est.persona(t.persona_id) : null;
        return el('div.fila', {
          clase: t.hecha ? 'hecha' : '',
          estilo: p ? { '--tinte': tinte(p) } : {},
        }, [
          p ? avatar(p) : icono('tareas', { tamano: 22 }),
          el('span.cuerpo-fila', {}, [
            el('span.fila-titulo', { texto: t.titulo }),
            el('span.fila-sub', { texto: p ? p.nombre : 'De la casa' }),
          ]),
          t.hecha ? marca('Hecha', 'hecha') : null,
        ]);
      })),
    ]));
  }

  return bloques;
}

// ---------------------------------------------------------------------------
//  La vista
// ---------------------------------------------------------------------------

export function vistaAgenda(destino) {
  const elegida = est.estado.fechaElegida ?? hoy();
  const modo = est.estado.modoAgenda ?? 'mes';

  const control = el('section.seccion', {}, [
    segmentado(
      [
        { valor: 'mes', texto: 'Mes' },
        { valor: 'semana', texto: 'Semana' },
        { valor: 'dia', texto: 'Día' },
      ],
      modo,
      (v) => est.poner({ modoAgenda: v, semanaVisible: elegida }),
      { etiqueta: 'Cómo ver la agenda' },
    ),
    est.estado.personas.length > 1
      ? el('div', { estilo: { marginTop: '12px' } }, [filtroIntegrantes()])
      : null,
  ]);

  const cuerpo = modo === 'semana'
    ? vistaSemana(elegida)
    : modo === 'dia'
      ? vistaDia(elegida)
      : vistaMes(elegida);

  pintar(destino, control, ...cuerpo);

  return el('button.fab', {
    type: 'button',
    'aria-label': 'Anotar algo nuevo',
    'on:click': () => abrirEditorEvento({ fechaSugerida: elegida }),
  }, [icono('mas', { tamano: 26, trazo: 2.2 })]);
}

// ---------------------------------------------------------------------------
//  Editor de eventos
// ---------------------------------------------------------------------------

/**
 * Abre la hoja para crear o editar un evento.
 * @param {object} opciones
 *   evento  el evento a editar, o nada para uno nuevo
 *   fecha   la ocurrencia concreta que se tocó (importa en los que se repiten)
 *   fechaSugerida  para uno nuevo
 */
export function abrirEditorEvento({ evento = null, fecha = null, fechaSugerida = null } = {}) {
  const esNuevo = !evento;
  const fechaBase = fecha ?? fechaSugerida ?? est.estado.fechaElegida ?? hoy();

  // El borrador arranca con lo que ya había, o con algo razonable.
  const b = {
    titulo: evento?.titulo ?? '',
    detalle: evento?.detalle ?? '',
    lugar: evento?.lugar ?? '',
    categoria: evento?.categoria ?? 'familia',
    persona_id: evento?.persona_id ?? '',
    fecha: evento ? est.aFecha(evento.inicio) : fechaBase,
    hora: evento && !evento.todo_el_dia ? aHora(evento.inicio) : '19:00',
    horaFin: evento?.fin && !evento.todo_el_dia ? aHora(evento.fin) : '',
    todo_el_dia: evento?.todo_el_dia ?? false,
    repite: evento?.repite ?? 'no',
    repite_dias: [...(evento?.repite_dias ?? [])],
    repite_hasta: evento?.repite_hasta?.slice(0, 10) ?? '',
    aviso_minutos: evento?.aviso_minutos ? String(evento.aviso_minutos) : '',
  };

  const titulo = entrada({
    value: b.titulo,
    placeholder: 'Clase de natación',
    required: true,
    maxlength: 200,
    'on:input': (e) => (b.titulo = e.target.value),
  });

  // --- categoría ---
  const chipsCat = el('div.chips.scroll', { role: 'group', 'aria-label': 'Categoría' });
  for (const [clave, cat] of Object.entries(CATEGORIAS)) {
    const chip = el('button.chip', {
      type: 'button',
      texto: cat.nombre,
      estilo: { '--tinte': cat.color },
      'aria-pressed': String(clave === b.categoria),
      'on:click': () => {
        b.categoria = clave;
        for (const c of chipsCat.children) c.setAttribute('aria-pressed', 'false');
        chip.setAttribute('aria-pressed', 'true');
      },
    });
    chipsCat.append(chip);
  }

  // --- fecha y hora ---
  const campoFecha = entrada({
    type: 'date',
    value: b.fecha,
    required: true,
    'on:change': (e) => (b.fecha = e.target.value),
  });
  const campoHora = entrada({
    type: 'time',
    value: b.hora,
    'on:change': (e) => (b.hora = e.target.value),
  });
  const campoHoraFin = entrada({
    type: 'time',
    value: b.horaFin,
    'on:change': (e) => (b.horaFin = e.target.value),
  });

  const filaHoras = el('div.dos', {}, [
    campo('Empieza', campoHora),
    campo('Termina', campoHoraFin),
  ]);

  const swTodoElDia = interruptor('Todo el día', b.todo_el_dia, (v) => {
    b.todo_el_dia = v;
    filaHoras.classList.toggle('oculto', v);
  });
  filaHoras.classList.toggle('oculto', b.todo_el_dia);

  // --- repetición ---
  const selDias = el('div.chips', { role: 'group', 'aria-label': 'Días de la semana' });
  // Se muestra de lunes a domingo, que es como se piensa la semana, pero el
  // valor guardado usa 0=domingo, igual que el RRULE del .ics.
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const chip = el('button.chip', {
      type: 'button',
      texto: DIAS_CORTOS[d],
      'aria-pressed': String(b.repite_dias.includes(d)),
      'on:click': () => {
        const i = b.repite_dias.indexOf(d);
        if (i === -1) b.repite_dias.push(d);
        else b.repite_dias.splice(i, 1);
        chip.setAttribute('aria-pressed', String(b.repite_dias.includes(d)));
      },
    });
    selDias.append(chip);
  }

  const campoHasta = entrada({
    type: 'date',
    value: b.repite_hasta,
    'on:change': (e) => (b.repite_hasta = e.target.value),
  });

  const cajaDias = campo('¿Qué días?', selDias, 'Si no elegís ninguno, repite el mismo día de la semana.');
  const cajaHasta = campo('¿Hasta cuándo?', campoHasta, 'Dejalo vacío si no tiene fin.');

  function actualizarRepeticion() {
    cajaDias.classList.toggle('oculto', b.repite !== 'semanal');
    cajaHasta.classList.toggle('oculto', b.repite === 'no');
  }

  const selRepite = elegir(REPETICIONES, b.repite, {
    'on:change': (e) => {
      b.repite = e.target.value;
      actualizarRepeticion();
    },
  });
  actualizarRepeticion();

  // --- de quién es ---
  const opcionesPersona = [
    ['', 'De toda la familia'],
    ...est.estado.personas.map((p) => [p.id, `${p.emoji ?? ''} ${p.nombre}`.trim()]),
  ];
  const selPersona = elegir(opcionesPersona, b.persona_id, {
    'on:change': (e) => (b.persona_id = e.target.value),
  });

  const selAviso = elegir(AVISOS, b.aviso_minutos, {
    'on:change': (e) => (b.aviso_minutos = e.target.value),
  });

  const campoLugar = entrada({
    value: b.lugar,
    placeholder: 'Club, pileta chica',
    maxlength: 300,
    'on:input': (e) => (b.lugar = e.target.value),
  });

  const campoDetalle = areaTexto({
    value: b.detalle,
    placeholder: 'Llevar ojotas y toalla',
    maxlength: 2000,
    'on:input': (e) => (b.detalle = e.target.value),
  });

  const error = el('p.error-campo');
  const btnGuardar = el('button.btn.primario', { type: 'submit', texto: 'Guardar' });

  const form = el('form', { novalidate: true }, [
    campo('¿Qué es?', titulo),
    campo('Categoría', chipsCat),
    campo('¿De quién es?', selPersona),
    campo('¿Qué día?', campoFecha),
    swTodoElDia,
    filaHoras,
    campo('¿Se repite?', selRepite),
    cajaDias,
    cajaHasta,
    campo('Avisame', selAviso, 'El aviso llega por el calendario del celular, si lo suscribiste en Familia.'),
    campo('¿Dónde?', campoLugar),
    campo('Nota', campoDetalle),
    error,
  ]);

  // Acciones de abajo.
  form.append(el('div.acciones', {}, [
    el('button.btn.linea', {
      type: 'button',
      texto: 'Cancelar',
      'on:click': () => cerrarHoja(),
    }),
    btnGuardar,
  ]));

  // Extras para un evento que ya existe.
  const extras = el('div', { estilo: { marginTop: '14px' } });
  if (!esNuevo) {
    extras.append(
      el('button.btn.linea.ancho.chico', {
        type: 'button',
        estilo: { marginBottom: '8px' },
        'on:click': () => {
          const p = evento.persona_id ? est.persona(evento.persona_id) : null;
          descargarIcs(
            evento.titulo.slice(0, 40).replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '') || 'evento',
            eventoAIcs(
              { ...evento, inicio: combinarFechaHora(fecha ?? b.fecha, aHora(evento.inicio)) },
              { nombrePersona: p?.nombre },
            ),
          );
        },
      }, [icono('bajar', { tamano: 15 }), 'Agregar al calendario del celular']),
    );

    if (evento.repite !== 'no' && fecha) {
      extras.append(
        el('button.btn.linea.ancho.chico', {
          type: 'button',
          estilo: { marginBottom: '8px' },
          'on:click': async () => {
            try {
              await db.marcarOcurrencia(evento.id, fecha, 'cancelado');
              await est.recargar('eventos');
              cerrarHoja();
              avisoBien('Esa vez queda cancelada');
            } catch (e) {
              avisoMal(db.mensajeDeError(e));
            }
          },
        }, [icono('cerrar', { tamano: 15 }), `Esta vez no va (${fechaHumana(fecha)})`]),
      );
    }

    extras.append(
      el('button.btn.peligro.ancho.chico', {
        type: 'button',
        'on:click': async () => {
          const ok = await confirmar({
            titulo: `¿Borrar "${evento.titulo}"?`,
            bajada: evento.repite !== 'no'
              ? 'Se borra la serie completa, no solo este día. Si querés saltear ' +
                'una sola vez, usá "Esta vez no va".'
              : 'No se puede deshacer.',
            siTexto: 'Sí, borrar',
            peligroso: true,
          });
          if (!ok) return;
          try {
            await db.borrarEvento(evento.id);
            await est.recargar('eventos');
            cerrarHoja();
            avisoBien('Borrado');
          } catch (e) {
            avisoMal(db.mensajeDeError(e));
          }
        },
      }, [
        icono('basura', { tamano: 15 }),
        evento.repite !== 'no' ? 'Borrar todas las veces' : 'Borrar',
      ]),
    );
  }

  let guardando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardando) return;

    error.textContent = '';
    if (!b.titulo.trim()) {
      error.textContent = 'Falta decir qué es';
      titulo.focus();
      return;
    }
    if (!b.fecha) {
      error.textContent = 'Falta la fecha';
      return;
    }
    if (!b.todo_el_dia && b.horaFin && b.horaFin <= b.hora) {
      error.textContent = 'La hora de fin tiene que ser posterior a la de inicio';
      return;
    }
    if (b.repite !== 'no' && b.repite_hasta && b.repite_hasta < b.fecha) {
      error.textContent = 'La repetición no puede terminar antes de empezar';
      return;
    }

    guardando = true;
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando…';

    try {
      const fila = {
        hogar_id: est.estado.hogar.id,
        titulo: b.titulo.trim(),
        detalle: b.detalle.trim() || null,
        lugar: b.lugar.trim() || null,
        categoria: b.categoria,
        persona_id: b.persona_id || null,
        inicio: combinarFechaHora(b.fecha, b.todo_el_dia ? '00:00' : b.hora),
        fin: (!b.todo_el_dia && b.horaFin) ? combinarFechaHora(b.fecha, b.horaFin) : null,
        todo_el_dia: b.todo_el_dia,
        repite: b.repite,
        repite_dias: b.repite === 'semanal' ? b.repite_dias : [],
        repite_hasta: b.repite !== 'no' && b.repite_hasta ? b.repite_hasta : null,
        aviso_minutos: b.aviso_minutos ? Number(b.aviso_minutos) : null,
      };

      if (esNuevo) fila.creado_por = est.estado.sesion?.user?.id ?? null;
      else fila.id = evento.id;

      await db.guardarEvento(fila);
      await est.recargar('eventos');
      // Que el calendario salte al día del evento recién guardado.
      est.poner({ fechaElegida: b.fecha });
      cerrarHoja();
      avisoBien(esNuevo ? 'Anotado' : 'Guardado');
    } catch (err) {
      error.textContent = db.mensajeDeError(err);
    } finally {
      guardando = false;
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Guardar';
    }
  });

  hoja({
    titulo: esNuevo ? 'Anotar algo' : 'Editar',
    bajada: esNuevo ? null : (evento.calendario_id
      ? 'Este evento vino de un calendario importado: si volvés a sincronizar, ' +
        'los cambios se pierden.'
      : null),
    contenido: [form, extras],
  });
}
