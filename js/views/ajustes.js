// ============================================================================
//  Más: hogar, personas, calendario del celular, importar .ics, tema.
//
//  La parte más valiosa de esta pantalla es "Avisos en el celular": ahí se copia
//  el link del feed .ics y se suscribe desde el calendario del teléfono. Eso es
//  lo que hace que la app avise sin push, sin claves VAPID y sin servidor propio.
// ============================================================================
import * as db from '../lib/db.js';
import * as est from '../estado.js';
import { CATEGORIAS } from '../data/categorias.js';
import { parsearIcs } from '../lib/ics.js';
import { aFecha, fechaHumana, hoy } from '../lib/fechas.js';
import {
  avisoBien,
  avisoMal,
  campo,
  cerrarHoja,
  confirmar,
  copiar,
  el,
  elegir,
  entrada,
  hoja,
  pintar,
} from '../lib/ui.js';
import { abrirPreferencias, olvidarChat } from './chef.js';

const COLORES = [
  '#8b7cff', '#ff9f68', '#ff6b9d', '#5bc8ff',
  '#3ddc97', '#ffd166', '#ff6b6b', '#c3a3ff',
];
const EMOJIS = ['🙂', '😎', '🌻', '🧉', '🐧', '🦊', '🧒', '👶', '🐱', '🐶', '⚽', '🎸'];

// ---------------------------------------------------------------------------
//  Invitar
// ---------------------------------------------------------------------------

function abrirInvitar() {
  const h = est.estado.hogar;

  hoja({
    titulo: 'Sumar a alguien',
    bajada: 'Que se cree una cuenta en la app y ponga este código. Desde ese ' +
      'momento ven y editan lo mismo.',
    contenido: [
      el('div.codigo', { texto: h.codigo, 'aria-label': `Código ${h.codigo.split('').join(' ')}` }),
      el('div.btn-fila', { estilo: { marginTop: '14px' } }, [
        el('button.btn', {
          type: 'button',
          texto: '📋 Copiar',
          'on:click': async () => {
            const ok = await copiar(h.codigo);
            ok ? avisoBien('Código copiado') : avisoMal('No se pudo copiar');
          },
        }),
        el('button.btn.primario', {
          type: 'button',
          texto: '📤 Compartir',
          'on:click': async () => {
            const texto = `Entrá a nuestra agenda con el código ${h.codigo}: ${location.origin}${location.pathname}`;
            try {
              // En el celular abre el menú de compartir del sistema.
              if (navigator.share) await navigator.share({ text: texto });
              else {
                const ok = await copiar(texto);
                ok ? avisoBien('Mensaje copiado') : avisoMal('No se pudo copiar');
              }
            } catch { /* si cancela el menú de compartir, no es un error */ }
          },
        }),
      ]),
      el('p.ayuda', {
        estilo: { marginTop: '14px' },
        texto: 'El código no caduca. Si querés cortar el acceso de alguien, por ' +
          'ahora hay que sacarlo desde Supabase.',
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
//  Avisos en el celular (el feed .ics)
// ---------------------------------------------------------------------------

function abrirAvisos() {
  const h = est.estado.hogar;
  const base = db.urlFuncion('ics-feed');
  const url = `${base}?hogar=${h.id}&token=${h.feed_token}`;
  const urlConMenu = `${url}&incluir=menu`;

  let incluirMenu = false;
  const cajaUrl = el('div.link-feed', { texto: url });

  const paso = (n, texto) =>
    el('div.paso', {}, [el('span.n', { texto: String(n) }), el('span', { texto })]);

  hoja({
    titulo: 'Avisos en el celular',
    bajada: 'La app no manda notificaciones por su cuenta: publica la agenda como ' +
      'calendario y lo suscribís en el calendario del teléfono. Los avisos los da ' +
      'el sistema, que para eso es mucho más confiable, y los eventos se ven ' +
      'mezclados con el resto de tus cosas.',
    contenido: [
      el('div.chips', { estilo: { marginBottom: '10px' } }, [
        el('button.chip', {
          type: 'button',
          texto: '🍽 Incluir el menú de la semana',
          'aria-pressed': 'false',
          'on:click': (e) => {
            incluirMenu = !incluirMenu;
            e.currentTarget.setAttribute('aria-pressed', String(incluirMenu));
            cajaUrl.textContent = incluirMenu ? urlConMenu : url;
          },
        }),
      ]),
      cajaUrl,
      el('button.btn.primario.ancho', {
        type: 'button',
        texto: '📋 Copiar el link',
        estilo: { marginTop: '10px' },
        'on:click': async () => {
          const ok = await copiar(cajaUrl.textContent);
          ok ? avisoBien('Link copiado') : avisoMal('No se pudo copiar');
        },
      }),

      el('h3', {
        estilo: {
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
          color: 'var(--suave)',
          margin: '20px 0 10px',
        },
        texto: 'En iPhone',
      }),
      paso(1, 'Ajustes → Calendario → Cuentas → Añadir cuenta → Otra'),
      paso(2, 'Añadir suscripción de calendario'),
      paso(3, 'Pegá el link y guardá'),

      el('h3', {
        estilo: {
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
          color: 'var(--suave)',
          margin: '20px 0 10px',
        },
        texto: 'En Android',
      }),
      paso(1, 'Abrí calendar.google.com en la computadora (desde el celular no se puede)'),
      paso(2, 'Otros calendarios → + → Desde URL'),
      paso(3, 'Pegá el link. Aparece en Google Calendar del teléfono en unos minutos'),

      el('p.ayuda', {
        estilo: { marginTop: '18px' },
        texto: 'Los calendarios suscritos se actualizan solos, pero cada uno decide ' +
          'cada cuánto: Google puede tardar unas horas en traer un evento nuevo. ' +
          'Para algo de hoy mismo, usá "Agregar al calendario" desde el evento.',
      }),

      el('button.btn.peligro.ancho.chico', {
        type: 'button',
        texto: '🔄 Cambiar el link',
        estilo: { marginTop: '16px' },
        'on:click': async () => {
          const ok = await confirmar({
            titulo: '¿Cambiar el link del calendario?',
            bajada: 'El link viejo deja de funcionar. Hay que suscribirse de nuevo ' +
              'en todos los teléfonos. Sirve si se compartió de más.',
            siTexto: 'Sí, cambiarlo',
            peligroso: true,
          });
          if (!ok) return;
          try {
            const nuevo = await db.regenerarFeedToken(h.id);
            est.poner({ hogar: { ...h, feed_token: nuevo } });
            cerrarHoja();
            avisoBien('Link nuevo listo');
          } catch (e) {
            avisoMal(db.mensajeDeError(e));
          }
        },
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
//  Personas
// ---------------------------------------------------------------------------

function abrirPersona(persona = null) {
  const esNueva = !persona;
  const b = {
    nombre: persona?.nombre ?? '',
    color: persona?.color ?? COLORES[est.estado.personas.length % COLORES.length],
    emoji: persona?.emoji ?? '🧒',
  };

  const campoNombre = entrada({
    value: b.nombre,
    placeholder: 'Tomás',
    required: true,
    maxlength: 40,
    'on:input': (e) => (b.nombre = e.target.value),
  });

  const muestra = el('div.avatar', {
    texto: b.emoji,
    estilo: {
      background: b.color + '28',
      borderColor: b.color,
      width: '46px',
      height: '46px',
    },
  });

  const filaColores = el('div.chips', {}, COLORES.map((c) =>
    el('button', {
      type: 'button',
      'aria-label': `Color ${c}`,
      'aria-pressed': String(c === b.color),
      estilo: {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: c,
        border: c === b.color ? '3px solid var(--texto)' : '3px solid transparent',
        flex: 'none',
      },
      'on:click': (e) => {
        b.color = c;
        for (const x of filaColores.children) {
          x.style.border = '3px solid transparent';
          x.setAttribute('aria-pressed', 'false');
        }
        e.currentTarget.style.border = '3px solid var(--texto)';
        e.currentTarget.setAttribute('aria-pressed', 'true');
        muestra.style.background = c + '28';
        muestra.style.borderColor = c;
      },
    })
  ));

  const filaEmojis = el('div.chips.scroll', {}, EMOJIS.map((em) =>
    el('button.chip', {
      type: 'button',
      texto: em,
      'aria-label': `Emoji ${em}`,
      'aria-pressed': String(em === b.emoji),
      'on:click': (e) => {
        b.emoji = em;
        for (const x of filaEmojis.children) x.setAttribute('aria-pressed', 'false');
        e.currentTarget.setAttribute('aria-pressed', 'true');
        muestra.textContent = em;
      },
    })
  ));

  const error = el('p.error-campo');
  const btn = el('button.btn.primario', { type: 'submit', texto: 'Guardar' });

  const form = el('form', { novalidate: true }, [
    campo('Nombre', campoNombre),
    campo(
      'Color y emoji',
      el('div', {}, [
        el('div', {
          estilo: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px' },
        }, [muestra, el('div', { estilo: { flex: '1' } }, [filaColores])]),
        filaEmojis,
      ]),
    ),
    error,
  ]);

  form.append(el('div.acciones', {}, [
    el('button.btn.fantasma', {
      type: 'button',
      texto: 'Cancelar',
      'on:click': () => cerrarHoja(),
    }),
    btn,
  ]));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!b.nombre.trim()) {
      error.textContent = 'Falta el nombre';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      if (esNueva) {
        await db.agregarPersona(est.estado.hogar.id, {
          nombre: b.nombre.trim(),
          color: b.color,
          emoji: b.emoji,
        });
      } else {
        await db.editarPersona(persona.id, {
          nombre: b.nombre.trim(),
          color: b.color,
          emoji: b.emoji,
        });
      }
      await est.recargar('personas');
      cerrarHoja();
      avisoBien('Guardado');
    } catch (err) {
      error.textContent = db.mensajeDeError(err);
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });

  const extras = el('div');
  // Solo se puede borrar a quien no tiene cuenta, y solo si no es uno mismo.
  if (!esNueva && !persona.user_id) {
    extras.append(el('button.btn.peligro.ancho.chico', {
      type: 'button',
      texto: '🗑  Sacar del hogar',
      estilo: { marginTop: '12px' },
      'on:click': async () => {
        const ok = await confirmar({
          titulo: `¿Sacar a ${persona.nombre}?`,
          bajada: 'Los eventos que eran suyos quedan, pero sin dueño.',
          siTexto: 'Sí, sacar',
          peligroso: true,
        });
        if (!ok) return;
        try {
          await db.borrarPersona(persona.id);
          await est.recargar(['personas', 'eventos']);
          cerrarHoja();
          avisoBien('Listo');
        } catch (e) {
          avisoMal(db.mensajeDeError(e));
        }
      },
    }));
  }

  hoja({
    titulo: esNueva ? 'Sumar a la familia' : `Editar ${persona.nombre}`,
    bajada: esNueva
      ? 'Para los chicos, que no tienen cuenta pero sí eventos propios. Si querés ' +
        'sumar a otro adulto con cuenta, usá el código de invitación.'
      : null,
    contenido: [form, extras],
  });
}

// ---------------------------------------------------------------------------
//  Importar un calendario .ics
// ---------------------------------------------------------------------------

function abrirImportar(calendario = null) {
  const b = {
    nombre: calendario?.nombre ?? '',
    url: calendario?.url ?? '',
    categoria: calendario?.categoria ?? 'colegio',
    persona_id: calendario?.persona_id ?? '',
    color: calendario?.color ?? '#6c63ff',
  };

  const campoNombre = entrada({
    value: b.nombre,
    placeholder: 'Colegio de Tomás',
    required: true,
    maxlength: 60,
    'on:input': (e) => (b.nombre = e.target.value),
  });

  const campoUrl = entrada({
    type: 'url',
    value: b.url,
    placeholder: 'https://… .ics  o  webcal://…',
    'on:input': (e) => (b.url = e.target.value),
  });

  const selCategoria = elegir(
    Object.entries(CATEGORIAS).map(([k, v]) => [k, `${v.emoji} ${v.nombre}`]),
    b.categoria,
    { 'on:change': (e) => (b.categoria = e.target.value) },
  );

  const selPersona = elegir(
    [['', 'De toda la familia'], ...est.estado.personas.map((p) => [p.id, `${p.emoji} ${p.nombre}`])],
    b.persona_id,
    { 'on:change': (e) => (b.persona_id = e.target.value) },
  );

  const archivo = el('input', {
    type: 'file',
    accept: '.ics,text/calendar',
    estilo: { marginTop: '4px' },
  });

  const estado = el('p.ayuda');
  const error = el('p.error-campo');
  const btn = el('button.btn.primario', { type: 'submit', texto: 'Importar' });

  const form = el('form', { novalidate: true }, [
    campo('¿Cómo le ponemos?', campoNombre),
    campo('Dirección del calendario', campoUrl,
      'Buscá la opción "suscribirse", "exportar" o "iCal" en el sitio del colegio, ' +
      'del club o en Google Calendar.'),
    campo('O subí el archivo .ics', archivo, 'Si no hay link, sirve el archivo.'),
    campo('Categoría', selCategoria),
    campo('¿De quién es?', selPersona),
    estado,
    error,
  ]);

  form.append(el('div.acciones', {}, [
    el('button.btn.fantasma', {
      type: 'button',
      texto: 'Cancelar',
      'on:click': () => cerrarHoja(),
    }),
    btn,
  ]));

  async function traerTexto() {
    const f = archivo.files?.[0];
    if (f) {
      if (f.size > 8 * 1024 * 1024) throw new Error('El archivo pesa más de 8 MB');
      return await f.text();
    }
    if (!b.url.trim()) throw new Error('Poné el link o subí el archivo');
    // Va por la función: el navegador no puede bajar un .ics de otro dominio.
    return await db.bajarIcsRemoto(b.url.trim());
  }

  let importando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (importando) return;

    error.textContent = '';
    estado.textContent = '';

    if (!b.nombre.trim()) {
      error.textContent = 'Falta el nombre';
      return;
    }

    importando = true;
    btn.disabled = true;
    btn.textContent = 'Importando…';

    try {
      estado.textContent = 'Bajando el calendario…';
      const texto = await traerTexto();

      estado.textContent = 'Leyendo los eventos…';
      const leido = parsearIcs(texto);

      if (!leido.eventos.length) {
        throw new Error(
          'No encontré eventos en ese calendario' +
            (leido.saltados ? ` (salteé ${leido.saltados} sin fecha o cancelados)` : ''),
        );
      }

      // Se guarda o actualiza el calendario.
      const cal = await db.guardarCalendario({
        ...(calendario ? { id: calendario.id } : {}),
        hogar_id: est.estado.hogar.id,
        nombre: b.nombre.trim(),
        url: b.url.trim() || null,
        categoria: b.categoria,
        persona_id: b.persona_id || null,
        color: b.color,
      });

      estado.textContent = `Guardando ${leido.eventos.length} eventos…`;

      // El ics_uid lleva el id del calendario adelante: dos calendarios
      // distintos pueden traer el mismo UID y no tienen que pisarse.
      const filas = leido.eventos.map((ev) => ({
        hogar_id: est.estado.hogar.id,
        titulo: ev.titulo,
        detalle: ev.detalle,
        lugar: ev.lugar,
        categoria: b.categoria,
        persona_id: b.persona_id || null,
        inicio: ev.inicio,
        fin: ev.fin,
        todo_el_dia: ev.todo_el_dia,
        repite: ev.repite,
        repite_dias: ev.repite_dias,
        repite_hasta: ev.repite_hasta,
        aviso_minutos: ev.aviso_minutos,
        calendario_id: cal.id,
        ics_uid: `${cal.id}:${ev.ics_uid ?? `${ev.titulo}-${ev.inicio}`}`,
        creado_por: est.estado.sesion?.user?.id ?? null,
      }));

      const guardados = await db.importarEventos(filas);

      // Las fechas canceladas del .ics se traen como ocurrencias canceladas.
      const porUid = new Map(guardados.map((g) => [g.ics_uid, g.id]));
      const cancelaciones = [];
      for (const ev of leido.eventos) {
        if (!ev.exdates?.length) continue;
        const uid = `${cal.id}:${ev.ics_uid ?? `${ev.titulo}-${ev.inicio}`}`;
        const id = porUid.get(uid);
        if (!id) continue;
        for (const fecha of ev.exdates) cancelaciones.push({ id, fecha });
      }
      if (cancelaciones.length) {
        await Promise.allSettled(
          cancelaciones.map((c) => db.marcarOcurrencia(c.id, c.fecha, 'cancelado')),
        );
      }

      await db.guardarCalendario({
        id: cal.id,
        hogar_id: est.estado.hogar.id,
        ultima_sync: new Date().toISOString(),
        eventos_importados: guardados.length,
      });

      await est.recargar(['eventos', 'calendarios']);
      cerrarHoja();
      avisoBien(
        `${guardados.length} ${guardados.length === 1 ? 'evento' : 'eventos'} importados`,
      );
    } catch (err) {
      error.textContent = db.mensajeDeError(err);
      estado.textContent = '';
    } finally {
      importando = false;
      btn.disabled = false;
      btn.textContent = 'Importar';
    }
  });

  hoja({
    titulo: calendario ? `Sincronizar ${calendario.nombre}` : 'Importar un calendario',
    bajada: calendario
      ? 'Se vuelven a traer los eventos. Los que ya estaban se actualizan, no se duplican.'
      : 'Sirve para el calendario del colegio, del club o de Google. Si Cokidoo ' +
        'exporta un calendario, también entra por acá.',
    contenido: form,
  });
}

// ---------------------------------------------------------------------------
//  La vista
// ---------------------------------------------------------------------------

export function vistaAjustes(destino) {
  const h = est.estado.hogar;
  const yo = est.estado.yo;
  const tema = est.temaGuardado();

  // --- hogar ---
  const seccionHogar = el('section.seccion', {}, [
    el('h2', {}, ['El hogar']),
    el('div.lista-ajustes', {}, [
      el('button', {
        type: 'button',
        'on:click': () => {
          const campoNombre = entrada({ value: h.nombre, maxlength: 60, required: true });
          const btn = el('button.btn.primario', { type: 'submit', texto: 'Guardar' });
          const err = el('p.error-campo');
          const form = el('form', { novalidate: true }, [
            campo('Nombre del hogar', campoNombre),
            err,
            el('div.acciones', {}, [
              el('button.btn.fantasma', {
                type: 'button',
                texto: 'Cancelar',
                'on:click': () => cerrarHoja(),
              }),
              btn,
            ]),
          ]);
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const n = campoNombre.value.trim();
            if (!n) {
              err.textContent = 'Falta el nombre';
              return;
            }
            btn.disabled = true;
            try {
              const nuevo = await db.renombrarHogar(h.id, n);
              est.poner({ hogar: nuevo });
              cerrarHoja();
              avisoBien('Cambiado');
            } catch (e2) {
              err.textContent = db.mensajeDeError(e2);
              btn.disabled = false;
            }
          });
          hoja({ titulo: 'Nombre del hogar', contenido: form });
        },
      }, [
        el('span.ico', { 'aria-hidden': 'true', texto: '🏠' }),
        el('span', { texto: 'Nombre' }),
        el('span.valor', { texto: h.nombre }),
      ]),
      el('button', { type: 'button', 'on:click': abrirInvitar }, [
        el('span.ico', { 'aria-hidden': 'true', texto: '🔑' }),
        el('span', { texto: 'Invitar' }),
        el('span.valor', { texto: h.codigo }),
      ]),
    ]),
  ]);

  // --- avisos: lo más importante de esta pantalla ---
  const seccionAvisos = el('section.seccion', {}, [
    el('h2', {}, ['Que el celular avise']),
    el('button.tarjeta', {
      type: 'button',
      estilo: { width: '100%', textAlign: 'left', borderColor: 'var(--primary)' },
      'on:click': abrirAvisos,
    }, [
      el('p', {
        estilo: { fontWeight: '800', fontSize: '0.98rem' },
        texto: '🔔 Suscribir el calendario del teléfono',
      }),
      el('p', {
        estilo: { fontSize: '0.82rem', color: 'var(--suave)', marginTop: '5px' },
        texto: 'La agenda aparece en el calendario del celular y los recordatorios ' +
          'los da el sistema. Es lo que hay que hacer una sola vez para no ' +
          'olvidarse más nada.',
      }),
    ]),
  ]);

  // --- personas ---
  const seccionPersonas = el('section.seccion', {}, [
    el('h2', {}, ['La familia', el('span.contador', { texto: String(est.estado.personas.length) })]),
    el('div.tarjeta', {}, [
      ...est.estado.personas.map((p) =>
        el('button.persona-fila', {
          type: 'button',
          estilo: { width: '100%', textAlign: 'left' },
          'on:click': () => abrirPersona(p),
        }, [
          el('span.avatar', {
            texto: p.emoji,
            estilo: { background: p.color + '28', borderColor: p.color },
          }),
          el('span.nombre', {}, [
            p.nombre,
            el('span.rol', {
              texto: p.user_id
                ? (p.id === yo?.id ? 'vos' : 'tiene cuenta')
                : 'sin cuenta',
            }),
          ]),
          el('span.flecha', { 'aria-hidden': 'true', texto: '›' }),
        ])
      ),
      el('button.btn.fantasma.ancho.chico', {
        type: 'button',
        texto: '+ Sumar a alguien de la familia',
        estilo: { marginTop: '10px' },
        'on:click': () => abrirPersona(),
      }),
    ]),
  ]);

  // --- calendarios importados ---
  const seccionCalendarios = el('section.seccion', {}, [
    el('h2', {}, ['Calendarios importados']),
    el('div.tarjeta', {}, [
      ...(est.estado.calendarios.length
        ? est.estado.calendarios.map((c) =>
          el('div.persona-fila', {}, [
            el('span.avatar', {
              texto: CATEGORIAS[c.categoria]?.emoji ?? '📅',
              estilo: { background: c.color + '28', borderColor: c.color },
            }),
            el('span.nombre', {}, [
              c.nombre,
              el('span.rol', {
                texto: c.ultima_sync
                  ? `${c.eventos_importados} eventos · ${fechaHumana(aFecha(c.ultima_sync))}`
                  : 'sin sincronizar',
              }),
            ]),
            el('button.btn.chico.fantasma', {
              type: 'button',
              texto: '🔄',
              'aria-label': `Sincronizar ${c.nombre}`,
              estilo: { flex: 'none', minHeight: '34px', padding: '0 10px' },
              'on:click': () => abrirImportar(c),
            }),
            el('button.btn.chico.fantasma', {
              type: 'button',
              texto: '🗑',
              'aria-label': `Borrar ${c.nombre}`,
              estilo: { flex: 'none', minHeight: '34px', padding: '0 10px' },
              'on:click': async () => {
                const ok = await confirmar({
                  titulo: `¿Borrar ${c.nombre}?`,
                  bajada: `Se borran también los ${c.eventos_importados} eventos que trajo.`,
                  siTexto: 'Sí, borrar',
                  peligroso: true,
                });
                if (!ok) return;
                try {
                  await db.borrarCalendario(c.id, true);
                  await est.recargar(['eventos', 'calendarios']);
                  avisoBien('Borrado');
                } catch (e) {
                  avisoMal(db.mensajeDeError(e));
                }
              },
            }),
          ])
        )
        : [
          el('p.ayuda', {
            texto: 'Todavía no importaste ninguno. Sirve para el calendario del ' +
              'colegio, del club, o de Google.',
          }),
        ]),
      el('button.btn.fantasma.ancho.chico', {
        type: 'button',
        texto: '+ Importar un calendario',
        estilo: { marginTop: '10px' },
        'on:click': () => abrirImportar(),
      }),
    ]),
  ]);

  // --- comida y app ---
  const seccionApp = el('section.seccion', {}, [
    el('h2', {}, ['La app']),
    el('div.lista-ajustes', {}, [
      el('button', { type: 'button', 'on:click': abrirPreferencias }, [
        el('span.ico', { 'aria-hidden': 'true', texto: '🍽' }),
        el('span', { texto: 'Cómo comen en casa' }),
        el('span.flecha', { 'aria-hidden': 'true', texto: '›' }),
      ]),
      el('button', {
        type: 'button',
        'on:click': () => est.irA('compras'),
      }, [
        el('span.ico', { 'aria-hidden': 'true', texto: '🛒' }),
        el('span', { texto: 'Lista de compras' }),
        el('span.valor', { texto: String(est.comprasPendientes().length) }),
      ]),
      el('div.fila-ajuste', {}, [
        el('span.ico', { 'aria-hidden': 'true', texto: '🎨' }),
        el('span', { texto: 'Tema' }),
        el('div', { estilo: { marginLeft: 'auto', maxWidth: '150px' } }, [
          elegir(
            [['auto', 'Como el sistema'], ['oscuro', 'Oscuro'], ['claro', 'Claro']],
            tema,
            { 'on:change': (e) => est.ponerTema(e.target.value) },
          ),
        ]),
      ]),
    ]),
  ]);

  // --- cuenta ---
  const seccionCuenta = el('section.seccion', {}, [
    el('h2', {}, ['Tu cuenta']),
    el('div.lista-ajustes', {}, [
      el('div.fila-ajuste', {}, [
        el('span.ico', { 'aria-hidden': 'true', texto: '📧' }),
        el('span', {
          texto: est.estado.sesion?.user?.email ?? '—',
          estilo: { fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis' },
        }),
      ]),
      el('button', {
        type: 'button',
        'on:click': async () => {
          const ok = await confirmar({
            titulo: '¿Cerrar sesión?',
            bajada: 'Los datos quedan en el hogar; volvés a entrar con tu mail cuando quieras.',
            siTexto: 'Sí, salir',
          });
          if (!ok) return;
          olvidarChat();
          await est.cerrarSesion();
        },
      }, [
        el('span.ico', { 'aria-hidden': 'true', texto: '🚪' }),
        el('span', { texto: 'Cerrar sesión', estilo: { color: 'var(--peligro)' } }),
      ]),
    ]),
    el('p.ayuda', {
      estilo: { textAlign: 'center', marginTop: '16px' },
      texto: `Nuestra Agenda · ${hoy().slice(0, 4)}`,
    }),
  ]);

  pintar(destino,
    seccionAvisos,
    seccionHogar,
    seccionPersonas,
    seccionCalendarios,
    seccionApp,
    seccionCuenta,
  );

  return null;
}
