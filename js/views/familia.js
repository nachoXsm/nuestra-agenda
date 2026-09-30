// ============================================================================
//  Familia: quiénes son, cómo se suma alguien, y los ajustes de la casa.
//
//  Empieza por la gente porque es lo que se toca seguido —sumar al nene, ponerle
//  color a alguien— y sigue con lo que se toca una vez.
//
//  La parte más valiosa de esta pantalla es "Que el celular avise": ahí se copia
//  el link del feed .ics y se suscribe desde el calendario del teléfono. Eso es
//  lo que hace que la app avise sin push, sin claves VAPID y sin servidor propio.
// ============================================================================
import * as db from '../lib/db.js';
import * as est from '../estado.js';
import { CATEGORIAS } from '../data/categorias.js';
import { TINTES, tinte } from '../data/paleta.js';
import { parsearIcs } from '../lib/ics.js';
import { aFecha, fechaHumana, hoy } from '../lib/fechas.js';
import { icono } from '../lib/iconos.js';
import {
  avatar,
  avisoBien,
  cargando,
  avisoMal,
  campo,
  cerrarHoja,
  confirmar,
  copiar,
  el,
  elegir,
  entrada,
  hoja,
  marca,
  pintar,
} from '../lib/ui.js';
import { abrirPreferencias, olvidarChat } from './chef.js';

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
        el('button.btn.suave', {
          type: 'button',
          'on:click': async () => {
            const ok = await copiar(h.codigo);
            ok ? avisoBien('Código copiado') : avisoMal('No se pudo copiar');
          },
        }, [icono('copiar', { tamano: 16 }), 'Copiar']),
        el('button.btn.primario', {
          type: 'button',
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
        }, [icono('compartir', { tamano: 16 }), 'Compartir']),
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
          texto: 'Incluir el menú de la semana',
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
        estilo: { marginTop: '10px' },
        'on:click': async () => {
          const ok = await copiar(cajaUrl.textContent);
          ok ? avisoBien('Link copiado') : avisoMal('No se pudo copiar');
        },
      }, [icono('copiar', { tamano: 16 }), 'Copiar el link']),

      el('h3.sobretitulo', {
        estilo: { margin: '20px 0 10px' },
        texto: 'En iPhone',
      }),
      paso(1, 'Ajustes → Calendario → Cuentas → Añadir cuenta → Otra'),
      paso(2, 'Añadir suscripción de calendario'),
      paso(3, 'Pegá el link y guardá'),

      el('h3.sobretitulo', {
        estilo: { margin: '20px 0 10px' },
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
      }, [icono('repetir', { tamano: 15 }), 'Cambiar el link']),
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
    color: persona?.color ?? TINTES[est.estado.personas.length % TINTES.length],
    emoji: persona?.emoji ?? '🧒',
  };

  const campoNombre = entrada({
    value: b.nombre,
    placeholder: 'El nombre',
    required: true,
    maxlength: 40,
    'on:input': (e) => (b.nombre = e.target.value),
  });

  const muestra = el('span.avatar.grande', {
    texto: b.emoji,
    estilo: { '--tinte': b.color },
  });

  const filaColores = el('div.chips', {}, TINTES.map((c) =>
    el('button', {
      type: 'button',
      'aria-label': `Color ${c}`,
      'aria-pressed': String(c === b.color),
      estilo: {
        width: '30px',
        height: '30px',
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
        muestra.style.setProperty('--tinte', c);
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
    el('button.btn.linea', {
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
    }, [icono('basura', { tamano: 15 }), 'Sacar del hogar']));
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
    placeholder: 'Calendario del colegio',
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
    Object.entries(CATEGORIAS).map(([k, v]) => [k, v.nombre]),
    b.categoria,
    { 'on:change': (e) => (b.categoria = e.target.value) },
  );

  const selPersona = elegir(
    [
      ['', 'De toda la familia'],
      ...est.estado.personas.map((p) => [p.id, `${p.emoji ?? ''} ${p.nombre}`.trim()]),
    ],
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
    el('button.btn.linea', {
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
//  ¿Quedaron bien subidas las funciones?
// ---------------------------------------------------------------------------

const QUE_HACE = {
  'chef-ia': 'El Chef: propone el menú y contesta preguntas.',
  'ics-proxy': 'Importar calendarios por link (.ics del colegio, del club).',
};

const MARCA_ESTADO = {
  bien: ['Anda', 'hecha'],
  'sin-clave': ['Falta la clave', 'hoy'],
  'no-esta': ['No está', 'hoy'],
  mal: ['Algo falla', 'hoy'],
};

function abrirRevision() {
  const lista = el('div');
  const h = est.estado.hogar;
  const urlFeed = `${db.urlFuncion('ics-feed')}?hogar=${h.id}&token=${h.feed_token}`;

  async function revisar() {
    pintar(lista, cargando('Preguntándole a las funciones…'));
    let filas;
    try {
      filas = await db.revisarFunciones();
    } catch (e) {
      pintar(lista, el('p.cuerpo-chico', { texto: db.mensajeDeError(e) }));
      return;
    }

    pintar(lista, ...filas.map((f) => {
      const [texto, tipo] = MARCA_ESTADO[f.estado] ?? MARCA_ESTADO.mal;
      return el('div.fila', {}, [
        el('span.cuerpo-fila', {}, [
          el('span.fila-titulo', { texto: f.nombre }),
          el('span.fila-sub', {
            texto: f.estado === 'bien' ? QUE_HACE[f.nombre] : f.detalle,
          }),
        ]),
        marca(texto, tipo),
      ]);
    }));

    // ics-feed no se puede probar desde acá (ver revisarFunciones en db.js):
    // se prueba abriendo el link, que es lo que haría el celular.
    lista.append(el('div.fila', { estilo: { marginTop: 'var(--e2)' } }, [
      el('span.cuerpo-fila', {}, [
        el('span.fila-titulo', { texto: 'ics-feed' }),
        el('span.fila-sub', { texto: 'Se prueba abriendo el link, como el celular' }),
      ]),
      el('a.btn.chico.suave', {
        href: urlFeed,
        target: '_blank',
        rel: 'noopener',
        texto: 'Probar',
      }),
    ]));
  }

  hoja({
    titulo: 'Revisar las funciones',
    bajada: 'Las tres funciones de Supabase son un paso aparte de la instalación. ' +
      'Acá se ve cuáles están arriba. Preguntar no gasta nada: no llaman al ' +
      'modelo ni salen a la red.',
    contenido: [
      lista,
      el('button.btn.linea.ancho.chico', {
        type: 'button',
        estilo: { marginTop: 'var(--e4)' },
        'on:click': () => revisar(),
      }, [icono('repetir', { tamano: 15 }), 'Revisar de nuevo']),
      el('p.cuerpo-chico', {
        estilo: { marginTop: 'var(--e4)' },
        texto: 'Si alguna dice que no está: Supabase → Edge Functions → Deploy a ' +
          'new function → Via Editor, con ese mismo nombre, y pegás el archivo ' +
          'de supabase/funciones-para-pegar/ que se llama igual. A ics-feed, ' +
          'además, hay que ponerle Verify JWT en off.',
      }),
      el('p.cuerpo-chico', {
        estilo: { marginTop: 'var(--e2)' },
        texto: 'Si "Probar" de ics-feed baja un archivo o muestra texto que ' +
          'arranca con BEGIN:VCALENDAR, está bien. Si muestra un error de ' +
          'autorización, le quedó el Verify JWT prendido.',
      }),
    ],
  });

  revisar();
}

// ---------------------------------------------------------------------------
//  La vista
// ---------------------------------------------------------------------------

/** Una fila de la lista de ajustes: icono, texto, y a la derecha un valor. */
function filaAjuste(nombreIcono, texto, valor, alTocar) {
  const hijos = [
    icono(nombreIcono, { tamano: 20 }),
    el('span', { texto }),
    typeof valor === 'string'
      ? el('span.valor', { texto: valor })
      : (valor ?? el('span.valor', {}, [icono('der', { tamano: 16 })])),
  ];
  return alTocar
    ? el('button', { type: 'button', 'on:click': alTocar }, hijos)
    : el('div.fila-ajuste', {}, hijos);
}

export function vistaFamilia(destino) {
  const h = est.estado.hogar;
  const yo = est.estado.yo;
  const tema = est.temaGuardado();

  // --- la gente, que es lo que uno viene a buscar acá ---
  const seccionPersonas = el('section.seccion', {}, [
    el('header', {}, [
      el('h2', { texto: 'Quiénes somos' }),
      el('span.etiqueta', { texto: String(est.estado.personas.length) }),
    ]),
    el('div.tarjeta', {}, [
      ...est.estado.personas.map((p) =>
        el('button.persona-fila', {
          type: 'button',
          estilo: { '--tinte': tinte(p) },
          'on:click': () => abrirPersona(p),
        }, [
          avatar(p, { tamano: 'grande' }),
          el('span.nombre', {}, [
            p.nombre,
            el('span.rol', {
              texto: p.user_id
                ? (p.id === yo?.id ? 'vos' : 'tiene cuenta')
                : 'sin cuenta',
            }),
          ]),
          icono('der', { tamano: 18 }),
        ])
      ),
      el('button.btn.linea.ancho.chico', {
        type: 'button',
        estilo: { marginTop: '10px' },
        'on:click': () => abrirPersona(),
      }, [icono('sumarPersona', { tamano: 15 }), 'Sumar a alguien de la familia']),
    ]),
  ]);

  // --- avisos: lo más importante de esta pantalla ---
  const seccionAvisos = el('section.seccion', {}, [
    el('header', {}, [el('h2', { texto: 'Que el celular avise' })]),
    el('button.tarjeta', {
      type: 'button',
      estilo: {
        width: '100%',
        textAlign: 'left',
        borderColor: 'var(--primario)',
        display: 'flex',
        gap: 'var(--e3)',
        alignItems: 'flex-start',
      },
      'on:click': abrirAvisos,
    }, [
      el('span', { estilo: { color: 'var(--primario)', flex: 'none' } },
        [icono('campana', { tamano: 22 })]),
      el('span', {}, [
        el('p.t3', { texto: 'Suscribir el calendario del teléfono' }),
        el('p.cuerpo-chico', {
          estilo: { marginTop: '4px' },
          texto: 'La agenda aparece en el calendario del celular y los recordatorios ' +
            'los da el sistema. Se hace una sola vez y no te olvidás más nada.',
        }),
      ]),
    ]),
  ]);

  // --- hogar ---
  const seccionHogar = el('section.seccion', {}, [
    el('header', {}, [el('h2', { texto: 'El hogar' })]),
    el('div.lista-ajustes', {}, [
      filaAjuste('inicio', 'Nombre', h.nombre, () => {
        const campoNombre = entrada({ value: h.nombre, maxlength: 60, required: true });
        const btn = el('button.btn.primario', { type: 'submit', texto: 'Guardar' });
        const err = el('p.error-campo');
        const form = el('form', { novalidate: true }, [
          campo('Nombre del hogar', campoNombre),
          err,
          el('div.acciones', {}, [
            el('button.btn.linea', {
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
      }),
      filaAjuste('sumarPersona', 'Invitar', h.codigo, abrirInvitar),
    ]),
  ]);

  // --- calendarios importados ---
  const seccionCalendarios = el('section.seccion', {}, [
    el('header', {}, [el('h2', { texto: 'Calendarios importados' })]),
    el('div.tarjeta', {}, [
      ...(est.estado.calendarios.length
        ? est.estado.calendarios.map((c) =>
          el('div.persona-fila', { estilo: { '--tinte': c.color } }, [
            el('span.avatar', {}, [icono('agenda', { tamano: 18 })]),
            el('span.nombre', {}, [
              c.nombre,
              el('span.rol', {
                texto: c.ultima_sync
                  ? `${c.eventos_importados} eventos · ${fechaHumana(aFecha(c.ultima_sync))}`
                  : 'sin sincronizar',
              }),
            ]),
            el('button.btn.chico.linea', {
              type: 'button',
              'aria-label': `Sincronizar ${c.nombre}`,
              estilo: { flex: 'none', minHeight: '34px', padding: '0 10px' },
              'on:click': () => abrirImportar(c),
            }, [icono('repetir', { tamano: 15 })]),
            el('button.btn.chico.linea', {
              type: 'button',
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
            }, [icono('basura', { tamano: 15 })]),
          ])
        )
        : [
          el('p.cuerpo-chico', {
            texto: 'Todavía no importaste ninguno. Sirve para el calendario del ' +
              'colegio, del club, o de Google.',
          }),
        ]),
      el('button.btn.linea.ancho.chico', {
        type: 'button',
        estilo: { marginTop: '10px' },
        'on:click': () => abrirImportar(),
      }, [icono('mas', { tamano: 15 }), 'Importar un calendario']),
    ]),
  ]);

  // --- comida y app ---
  const seccionApp = el('section.seccion', {}, [
    el('header', {}, [el('h2', { texto: 'La app' })]),
    el('div.lista-ajustes', {}, [
      filaAjuste('comidas', 'Cómo comen en casa', null, abrirPreferencias),
      filaAjuste('alerta', 'Revisar las funciones', null, abrirRevision),
      filaAjuste('chispas', 'Chef', null, () => est.irA('chef')),
      filaAjuste(
        'carrito',
        'Lista de compras',
        String(est.comprasPendientes().length),
        () => est.irA('comidas', { tabComidas: 'compras' }),
      ),
      // El mismo cambio que el botón de la cabecera, por si alguien lo busca acá.
      filaAjuste(
        tema === 'oscuro' ? 'luna' : 'sol',
        'Tema',
        el('div', { estilo: { marginLeft: 'auto', maxWidth: '130px' } }, [
          elegir(
            [['claro', 'Claro'], ['oscuro', 'Oscuro']],
            tema,
            { 'on:change': (e) => est.ponerTema(e.target.value) },
          ),
        ]),
      ),
    ]),
  ]);

  // --- cuenta ---
  const seccionCuenta = el('section.seccion', {}, [
    el('header', {}, [el('h2', { texto: 'Tu cuenta' })]),
    el('div.lista-ajustes', {}, [
      filaAjuste('info', est.estado.sesion?.user?.email ?? '—', ' '),
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
        icono('salir', { tamano: 20 }),
        el('span', { texto: 'Cerrar sesión', estilo: { color: 'var(--terracota-texto)' } }),
      ]),
    ]),
    el('p.cuerpo-chico', {
      estilo: { textAlign: 'center', marginTop: '16px' },
      texto: `juntos · ${hoy().slice(0, 4)}`,
    }),
  ]);

  pintar(destino,
    seccionPersonas,
    seccionAvisos,
    seccionHogar,
    seccionCalendarios,
    seccionApp,
    seccionCuenta,
  );

  return null;
}
