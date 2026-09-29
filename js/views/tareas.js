// ============================================================================
//  Tareas de la casa.
//
//  Lo que hay que hacer pero no tiene hora: el gas, el regalo, sacar la ropa
//  de invierno. Va aparte de la agenda a propósito: una tarea no ocupa un
//  horario, y mezclarlas con los eventos ensucia las dos cosas.
//
//  Arriba, cómo viene la semana: el anillo con el porcentaje y una barrita por
//  integrante. Abajo, las tareas agrupadas por quién las tiene.
// ============================================================================
import * as db from '../lib/db.js';
import * as est from '../estado.js';
import { tinte } from '../data/paleta.js';
import { fechaHumana, hoy } from '../lib/fechas.js';
import { icono } from '../lib/iconos.js';
import {
  anillo,
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
  marca,
  pintar,
  vacio,
  vibrar,
} from '../lib/ui.js';

const REPETICIONES_TAREA = [
  ['no', 'Una sola vez'],
  ['diaria', 'Todos los días'],
  ['semanal', 'Cada semana'],
  ['mensual', 'Cada mes'],
];

// ---------------------------------------------------------------------------
//  Una tarea
// ---------------------------------------------------------------------------

/** La marquita de la derecha: hecha, vence hoy, atrasada, o cuándo vence. */
function estadoTarea(t) {
  if (t.hecha) return marca('Hecha', 'hecha');
  switch (est.urgenciaTarea(t)) {
    case 'atrasada':
      // fechaHumana viene con mayúscula ("Ayer") porque casi siempre encabeza
      // algo; acá va en el medio de la frase.
      return marca(`Venció ${fechaHumana(t.vence.slice(0, 10)).toLowerCase()}`, 'hoy');
    case 'hoy':
      return marca('Vence hoy', 'hoy');
    case 'pronto':
      return marca(fechaHumana(t.vence.slice(0, 10)), 'pendiente');
    default:
      return marca('Sin fecha', 'pendiente');
  }
}

export function filaTarea(t) {
  const persona = t.persona_id ? est.persona(t.persona_id) : null;

  const fila = el('button.fila', {
    clase: [t.hecha ? 'hecha' : '', persona ? 'con-tinte' : ''].join(' '),
    type: 'button',
    estilo: persona ? { '--tinte': tinte(persona) } : {},
    'on:click': () => abrirEditorTarea({ tarea: t }),
  }, [
    el('span.cuerpo-fila', {}, [
      el('span.fila-titulo', {}, [
        el('span', { texto: t.titulo }),
        t.repite !== 'no'
          ? icono('repetir', { tamano: 13, trazo: 2.2, titulo: 'Se repite' })
          : null,
      ]),
      el('span.fila-sub', {
        texto: [persona ? persona.nombre : 'De la casa', t.detalle]
          .filter(Boolean).join(' · '),
      }),
    ]),
    estadoTarea(t),
  ]);

  // El tilde marca sin abrir el editor.
  const tilde = el('span.tilde', {
    role: 'button',
    tabindex: '0',
    'aria-label': t.hecha ? `Desmarcar ${t.titulo}` : `Marcar ${t.titulo} como hecha`,
  }, [icono('tilde', { tamano: 14, trazo: 2.6 })]);

  const alternar = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    vibrar();
    // Se anota antes de llamar a la base: t es la fila que está en el estado, y
    // nada garantiza que siga intacta después de guardar.
    const estabaHecha = t.hecha;
    try {
      await db.marcarTarea(t.id, !estabaHecha);
      // Una tarea que se repite deja una nueva para la próxima vuelta: si no,
      // hay que acordarse de volver a cargar "sacar la basura" todas las
      // semanas, que es justo lo que uno no quiere hacer.
      if (!estabaHecha && t.repite !== 'no') await sembrarSiguiente(t);
      await est.recargar('tareas');
    } catch (error) {
      avisoMal(db.mensajeDeError(error));
    }
  };
  tilde.addEventListener('click', alternar);
  tilde.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') alternar(e);
  });
  fila.prepend(tilde);

  return fila;
}

/** Crea la próxima vuelta de una tarea que se repite. */
async function sembrarSiguiente(t) {
  const base = t.vence?.slice(0, 10) ?? hoy();
  const [a, m, d] = base.split('-').map(Number);
  const prox = new Date(Date.UTC(a, m - 1, d, 12));

  if (t.repite === 'diaria') prox.setUTCDate(prox.getUTCDate() + 1);
  else if (t.repite === 'semanal') prox.setUTCDate(prox.getUTCDate() + 7);
  else if (t.repite === 'mensual') prox.setUTCMonth(prox.getUTCMonth() + 1);
  else return;

  await db.guardarTarea({
    hogar_id: t.hogar_id,
    titulo: t.titulo,
    detalle: t.detalle,
    persona_id: t.persona_id,
    vence: prox.toISOString().slice(0, 10),
    repite: t.repite,
    creado_por: est.estado.sesion?.user?.id ?? null,
  });
}

// ---------------------------------------------------------------------------
//  Editor
// ---------------------------------------------------------------------------

export function abrirEditorTarea({ tarea = null, personaSugerida = '' } = {}) {
  const esNueva = !tarea;
  const b = {
    titulo: tarea?.titulo ?? '',
    detalle: tarea?.detalle ?? '',
    persona_id: tarea?.persona_id ?? personaSugerida ?? '',
    vence: tarea?.vence?.slice(0, 10) ?? '',
    repite: tarea?.repite ?? 'no',
  };

  const campoTitulo = entrada({
    value: b.titulo,
    placeholder: 'Pagar el gas',
    required: true,
    maxlength: 200,
    'on:input': (e) => (b.titulo = e.target.value),
  });

  const selPersona = elegir(
    [['', 'De la casa'], ...est.estado.personas.map((p) => [p.id, `${p.emoji ?? ''} ${p.nombre}`.trim()])],
    b.persona_id,
    { 'on:change': (e) => (b.persona_id = e.target.value) },
  );

  const campoVence = entrada({
    type: 'date',
    value: b.vence,
    'on:change': (e) => (b.vence = e.target.value),
  });

  const selRepite = elegir(REPETICIONES_TAREA, b.repite, {
    'on:change': (e) => (b.repite = e.target.value),
  });

  const campoDetalle = areaTexto({
    value: b.detalle,
    placeholder: 'Vence el 10',
    maxlength: 2000,
    'on:input': (e) => (b.detalle = e.target.value),
  });

  const error = el('p.error-campo');
  const btnGuardar = el('button.btn.primario', { type: 'submit', texto: 'Guardar' });

  const form = el('form', { novalidate: true }, [
    campo('¿Qué hay que hacer?', campoTitulo),
    campo('¿Quién la tiene?', selPersona),
    campo('¿Para cuándo?', campoVence, 'Podés dejarlo vacío: queda como "alguna vez".'),
    campo('¿Se repite?', selRepite, 'Al tildarla se crea sola la de la próxima vuelta.'),
    campo('Nota', campoDetalle),
    error,
    el('div.acciones', {}, [
      el('button.btn.linea', {
        type: 'button',
        texto: 'Cancelar',
        'on:click': () => cerrarHoja(),
      }),
      btnGuardar,
    ]),
  ]);

  const extras = el('div', { estilo: { marginTop: '14px' } });
  if (!esNueva) {
    extras.append(el('button.btn.peligro.ancho.chico', {
      type: 'button',
      'on:click': async () => {
        const ok = await confirmar({
          titulo: `¿Borrar "${tarea.titulo}"?`,
          bajada: 'No se puede deshacer.',
          siTexto: 'Sí, borrar',
          peligroso: true,
        });
        if (!ok) return;
        try {
          await db.borrarTarea(tarea.id);
          await est.recargar('tareas');
          cerrarHoja();
          avisoBien('Borrada');
        } catch (e) {
          avisoMal(db.mensajeDeError(e));
        }
      },
    }, [icono('basura', { tamano: 15 }), 'Borrar']));
  }

  let guardando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardando) return;

    error.textContent = '';
    if (!b.titulo.trim()) {
      error.textContent = 'Falta decir qué hay que hacer';
      campoTitulo.focus();
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
        persona_id: b.persona_id || null,
        vence: b.vence || null,
        repite: b.repite,
      };
      if (esNueva) fila.creado_por = est.estado.sesion?.user?.id ?? null;
      else fila.id = tarea.id;

      await db.guardarTarea(fila);
      await est.recargar('tareas');
      cerrarHoja();
      avisoBien(esNueva ? 'Anotada' : 'Guardada');
    } catch (err) {
      error.textContent = db.mensajeDeError(err);
    } finally {
      guardando = false;
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Guardar';
    }
  });

  hoja({
    titulo: esNueva ? 'Anotar una tarea' : 'Editar la tarea',
    contenido: [form, extras],
  });
}

// ---------------------------------------------------------------------------
//  La vista
// ---------------------------------------------------------------------------

export function vistaTareas(destino) {
  const p = est.progresoTareas();
  const todas = est.estado.tareas;
  const pendientes = todas.filter((t) => !t.hecha);
  const hechas = todas.filter((t) => t.hecha);

  // --- cómo viene la semana ---
  const frase = p.total === 0
    ? 'Todavía no hay tareas anotadas esta semana.'
    : `${p.hechas} de ${p.total} ${p.total === 1 ? 'tarea hecha' : 'tareas hechas'} esta semana`;

  const resumen = el('section.seccion', {}, [
    el('div.tarjeta', {}, [
      anillo(p.porcentaje, [
        el('p.t3', { texto: frase }),
        p.porcentaje === 100 && p.total > 0
          ? el('p.cuerpo-chico', {
            estilo: { marginTop: '4px' },
            texto: 'No queda nada pendiente. Bien ahí.',
          })
          : el('p.cuerpo-chico', {
            estilo: { marginTop: '4px' },
            texto: `${pendientes.length} ${pendientes.length === 1 ? 'pendiente' : 'pendientes'} en total`,
          }),
      ]),
      p.porPersona.some((x) => x.total > 0)
        ? el('div', {
          estilo: {
            display: 'flex',
            gap: 'var(--e3)',
            marginTop: 'var(--e4)',
            paddingTop: 'var(--e4)',
            borderTop: '1px solid var(--linea)',
          },
        }, p.porPersona.filter((x) => x.total > 0).map((x) =>
          el('div.progreso-persona', { estilo: { '--tinte': tinte(x.persona) } }, [
            avatar(x.persona, { tamano: 'chico' }),
            el('span.barra-mini', {}, [
              el('i', { estilo: { width: `${(x.hechas / x.total) * 100}%` } }),
            ]),
            el('span.cuenta', { texto: `${x.hechas}/${x.total}` }),
          ])
        ))
        : null,
    ]),
  ]);

  // --- las tareas, agrupadas por quién las tiene ---
  const grupos = [];
  const conDueno = est.estado.personas
    .map((persona) => ({
      persona,
      lista: pendientes.filter((t) => t.persona_id === persona.id),
    }))
    .filter((g) => g.lista.length);

  const deLaCasa = pendientes.filter((t) => !t.persona_id);

  for (const g of conDueno) {
    grupos.push(el('section.seccion', {}, [
      el('header', {}, [
        el('h2', {}, [avatar(g.persona, { tamano: 'chico' }), ` ${g.persona.nombre}`]),
        el('button.btn.chico.texto', {
          type: 'button',
          texto: '+ Sumar',
          'on:click': () => abrirEditorTarea({ personaSugerida: g.persona.id }),
        }),
      ]),
      el('div', {}, g.lista.map(filaTarea)),
    ]));
  }

  if (deLaCasa.length) {
    grupos.push(el('section.seccion', {}, [
      el('header', {}, [el('h2', { texto: 'De la casa' })]),
      el('div', {}, deLaCasa.map(filaTarea)),
    ]));
  }

  if (!pendientes.length) {
    grupos.push(el('section.seccion', {}, [
      vacio(
        'tareas',
        todas.length
          ? 'No queda nada pendiente. Está todo hecho.'
          : 'Todavía no hay tareas. Anotá la primera con el botón de abajo.',
      ),
    ]));
  }

  // --- las hechas, plegadas al final ---
  const yaEstan = hechas.length
    ? el('section.seccion', {}, [
      el('header', {}, [
        el('h2', { texto: `Ya están (${hechas.length})` }),
        el('button.btn.chico.texto', {
          type: 'button',
          texto: 'Limpiar',
          'on:click': async () => {
            const ok = await confirmar({
              titulo: '¿Borrar las tareas hechas?',
              bajada: `Se borran ${hechas.length}. Las pendientes quedan.`,
              siTexto: 'Sí, limpiar',
              peligroso: true,
            });
            if (!ok) return;
            try {
              await db.borrarTareasHechas(est.estado.hogar.id);
              await est.recargar('tareas');
              avisoBien('Listo');
            } catch (e) {
              avisoMal(db.mensajeDeError(e));
            }
          },
        }),
      ]),
      el('div', {}, hechas.slice(0, 12).map(filaTarea)),
    ])
    : null;

  pintar(destino, resumen, ...grupos, yaEstan);

  return el('button.fab', {
    type: 'button',
    'aria-label': 'Anotar una tarea',
    'on:click': () => abrirEditorTarea({}),
  }, [icono('mas', { tamano: 26, trazo: 2.2 })]);
}
