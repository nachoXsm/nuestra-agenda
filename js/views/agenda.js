// ============================================================================
//  Agenda: el calendario del mes, el día elegido, y el editor de eventos.
//
//  El editor se exporta porque también se abre desde Hoy.
// ============================================================================
import * as db from '../lib/db.js';
import * as est from '../estado.js';
import { AVISOS, categoria, CATEGORIAS, REPETICIONES } from '../data/categorias.js';
import {
  aHora,
  combinarFechaHora,
  conMayuscula,
  DIAS_CORTOS,
  fechaHumana,
  fechaLarga,
  grillaMes,
  hoy,
  mesLargo,
  partes,
  sumarDias,
} from '../lib/fechas.js';
import { descargarIcs, eventoAIcs } from '../lib/ics.js';
import {
  areaTexto,
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
  pintar,
  vacio,
  vibrar,
} from '../lib/ui.js';

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
  if (evento.lugar) detalles.push(evento.lugar);
  if (evento.repite !== 'no') detalles.push('se repite');
  if (evento.calendario_id) {
    const cal = est.estado.calendarios.find((c) => c.id === evento.calendario_id);
    if (cal) detalles.push(cal.nombre);
  }

  const fila = el('button.evento', {
    clase: hecho ? 'hecho' : '',
    type: 'button',
    'on:click': () => abrirEditorEvento({ evento, fecha }),
  }, [
    el('span.hora', {
      texto: evento.todo_el_dia ? 'todo el día' : aHora(evento.inicio),
      estilo: evento.todo_el_dia ? { fontSize: '0.64rem', lineHeight: '1.2' } : {},
    }),
    el('span.cuerpo', {}, [
      el('span.titulo', {}, [
        el('span', { 'aria-hidden': 'true', texto: cat.emoji }),
        el('span', { texto: evento.titulo }),
        persona
          ? el('span.persona-punto', {
            estilo: { background: persona.color },
            title: persona.nombre,
          })
          : null,
      ]),
      detalles.length
        ? el('span.detalle', {}, [detalles.join(' · ')])
        : null,
    ]),
  ]);

  fila.style.borderLeftColor = cat.color;

  // El tilde de "ya está" no abre el editor.
  const tilde = el('span.tilde', {
    role: 'button',
    tabindex: '0',
    'aria-label': hecho ? `Desmarcar ${evento.titulo}` : `Marcar ${evento.titulo} como hecho`,
    texto: '✓',
  });
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

/** Lista de eventos, con su estado vacío. */
export function listaEventos(instancias, { mostrarFecha = false, vacioTexto } = {}) {
  if (!instancias.length) {
    return vacio('🌤', vacioTexto ?? 'No hay nada anotado. Día libre.');
  }
  return el('div', {}, instancias.map((i) => filaEvento(i, { mostrarFecha })));
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
    placeholder: 'Natación de Tomás',
    required: true,
    maxlength: 200,
    'on:input': (e) => (b.titulo = e.target.value),
  });

  // --- categoría ---
  const chipsCat = el('div.chips.scroll', { role: 'group', 'aria-label': 'Categoría' });
  for (const [clave, cat] of Object.entries(CATEGORIAS)) {
    const chip = el('button.chip', {
      type: 'button',
      'aria-pressed': String(clave === b.categoria),
      'on:click': () => {
        b.categoria = clave;
        for (const c of chipsCat.children) {
          c.setAttribute('aria-pressed', 'false');
          c.style.borderColor = '';
          c.style.color = '';
        }
        chip.setAttribute('aria-pressed', 'true');
        chip.style.borderColor = cat.color;
        chip.style.color = cat.color;
      },
    }, [`${cat.emoji} ${cat.nombre}`]);
    if (clave === b.categoria) {
      chip.style.borderColor = cat.color;
      chip.style.color = cat.color;
    }
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

  const filaHoras = el('div.fila', {}, [
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
    ...est.estado.personas.map((p) => [p.id, `${p.emoji} ${p.nombre}`]),
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
    campo('Avisame', selAviso, 'El aviso llega por el calendario del celular, si lo suscribiste en Más.'),
    campo('¿Dónde?', campoLugar),
    campo('Nota', campoDetalle),
    error,
  ]);

  // Acciones de abajo.
  const acciones = el('div.acciones', {}, [
    el('button.btn.fantasma', {
      type: 'button',
      texto: 'Cancelar',
      'on:click': () => cerrarHoja(),
    }),
    btnGuardar,
  ]);
  form.append(acciones);

  // Extras para un evento que ya existe.
  const extras = el('div', { estilo: { marginTop: '14px' } });
  if (!esNuevo) {
    extras.append(
      el('button.btn.fantasma.ancho.chico', {
        type: 'button',
        texto: '📲  Agregar al calendario del celular',
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
      }),
    );

    if (evento.repite !== 'no' && fecha) {
      extras.append(
        el('button.btn.fantasma.ancho.chico', {
          type: 'button',
          texto: `🚫  Esta vez no va (${fechaHumana(fecha)})`,
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
        }),
      );
    }

    extras.append(
      el('button.btn.peligro.ancho.chico', {
        type: 'button',
        texto: evento.repite !== 'no' ? '🗑  Borrar todas las veces' : '🗑  Borrar',
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
      }),
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

// ---------------------------------------------------------------------------
//  La vista
// ---------------------------------------------------------------------------

export function vistaAgenda(destino) {
  const elegida = est.estado.fechaElegida ?? hoy();
  const visible = est.estado.mesVisible ?? {
    anio: partes(elegida).anio,
    mes: partes(elegida).mes,
  };

  // --- navegación del mes ---
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
    el('button', { type: 'button', 'aria-label': 'Mes anterior', texto: '‹', 'on:click': () => irAlMes(-1) }),
    el('span.titulo', { texto: conMayuscula(mesLargo(visible.anio, visible.mes)) }),
    el('button', { type: 'button', 'aria-label': 'Mes siguiente', texto: '›', 'on:click': () => irAlMes(1) }),
  ]);

  // --- grilla ---
  const grilla = el('div.grilla', { role: 'grid' });
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    grilla.append(el('div.dow', { texto: DIAS_CORTOS[d], 'aria-hidden': 'true' }));
  }

  const dias = grillaMes(visible.anio, visible.mes);
  for (const { fecha, delMes } of dias) {
    const inst = est.instanciasDe(fecha);
    const tieneComida = !!(est.comida(fecha, 'almuerzo') || est.comida(fecha, 'cena'));

    // Un punto por categoría presente, hasta tres, que es lo que entra prolijo.
    const cats = [...new Set(inst.map((i) => i.evento.categoria))].slice(0, 3);

    const boton = el('button.dia', {
      type: 'button',
      clase: [delMes ? '' : 'otro-mes', fecha === hoy() ? 'hoy' : ''].join(' '),
      'aria-pressed': String(fecha === elegida),
      'aria-label': `${fechaLarga(fecha)}, ${inst.length} ${inst.length === 1 ? 'cosa' : 'cosas'}`,
      'on:click': () => est.poner({ fechaElegida: fecha }),
    }, [
      el('span', { texto: String(partes(fecha).dia) }),
      el('span.puntos', {}, cats.map((c) =>
        el('span.punto', { estilo: { background: categoria(c).color } })
      )),
      tieneComida ? el('span.comida', { 'aria-hidden': 'true', texto: '🍽' }) : null,
    ]);
    grilla.append(boton);
  }

  // --- el día elegido ---
  const instDia = est.instanciasDe(elegida);
  const comidas = est.comidasDe(elegida);

  const cabeceraDia = el('h2', {}, [
    fechaHumana(elegida),
    instDia.length
      ? el('span.contador', { texto: String(instDia.length) })
      : null,
    el('button.btn.chico.fantasma', {
      type: 'button',
      texto: '+ Anotar',
      estilo: { marginLeft: 'auto' },
      'on:click': () => abrirEditorEvento({ fechaSugerida: elegida }),
    }),
  ]);

  const seccionDia = el('section.seccion', {}, [
    cabeceraDia,
    el('p.cap', {
      estilo: {
        fontSize: '0.78rem',
        color: 'var(--suave)',
        marginTop: '-4px',
        marginBottom: '10px',
      },
      texto: fechaLarga(elegida),
    }),
    listaEventos(instDia),
  ]);

  // Qué se come ese día, como recordatorio en la misma pantalla.
  const seccionComida = (comidas.almuerzo || comidas.cena)
    ? el('section.seccion', {}, [
      el('h2', {}, ['Ese día se come']),
      el('div.tarjeta.plana', {}, [
        comidas.almuerzo
          ? el('p', { estilo: { fontSize: '0.88rem' } }, [
            el('strong', { texto: 'Almuerzo: ' }),
            comidas.almuerzo.titulo,
          ])
          : null,
        comidas.cena
          ? el('p', {
            estilo: { fontSize: '0.88rem', marginTop: comidas.almuerzo ? '6px' : '0' },
          }, [
            el('strong', { texto: 'Cena: ' }),
            comidas.cena.titulo,
          ])
          : null,
      ]),
    ])
    : null;

  // --- lo que viene ---
  const desdeManana = sumarDias(hoy(), 1);
  const proximas = est.instanciasEnRango(desdeManana, sumarDias(hoy(), 14))
    .filter((i) => i.fecha !== elegida)
    .slice(0, 6);

  const seccionProximas = proximas.length
    ? el('section.seccion', {}, [
      el('h2', {}, ['Las próximas dos semanas']),
      el('div', {}, proximas.map((i) => filaEvento(i, { mostrarFecha: true }))),
    ])
    : null;

  pintar(destino,
    el('section.seccion', {}, [nav, grilla]),
    seccionDia,
    seccionComida,
    seccionProximas,
  );

  // Botón flotante para anotar rápido.
  return el('button.fab', {
    type: 'button',
    'aria-label': 'Anotar algo nuevo',
    texto: '+',
    'on:click': () => abrirEditorEvento({ fechaSugerida: elegida }),
  });
}
