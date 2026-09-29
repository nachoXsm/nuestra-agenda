// ============================================================================
//  Todo lo de antes de entrar: configuración, cuenta y hogar.
//
//  Son tres puertas seguidas y la app las abre en orden:
//    1. ¿Hay conexión a Supabase configurada?
//    2. ¿Hay sesión?
//    3. ¿Esta cuenta pertenece a algún hogar?
// ============================================================================
import * as db from '../lib/db.js';
import { TINTES } from '../data/paleta.js';
import { trebol } from '../lib/iconos.js';
import { aviso, avisoBien, campo, el, entrada, pintar } from '../lib/ui.js';

const COLORES = TINTES;

const EMOJIS = ['🙂', '😎', '🌻', '🧉', '🐧', '🦊', '🧒', '👶', '🐱', '🐶', '⚽', '🎸'];

/** Elige un color y un emoji para la persona. */
function elegirAvatar(inicial = {}) {
  const valor = {
    color: inicial.color ?? COLORES[0],
    emoji: inicial.emoji ?? EMOJIS[0],
  };

  const muestra = el('span.avatar.grande', {
    texto: valor.emoji,
    estilo: { '--tinte': valor.color },
  });

  const filaColores = el('div.chips', {},
    COLORES.map((c) =>
      el('button', {
        type: 'button',
        'aria-label': `Color ${c}`,
        'aria-pressed': String(c === valor.color),
        estilo: {
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          background: c,
          border: c === valor.color ? '3px solid var(--texto)' : '3px solid transparent',
          flex: 'none',
        },
        'on:click': (e) => {
          valor.color = c;
          for (const b of filaColores.children) {
            b.style.border = '3px solid transparent';
            b.setAttribute('aria-pressed', 'false');
          }
          e.currentTarget.style.border = '3px solid var(--texto)';
          e.currentTarget.setAttribute('aria-pressed', 'true');
          muestra.style.setProperty('--tinte', c);
        },
      })
    ));

  const filaEmojis = el('div.chips.scroll', {},
    EMOJIS.map((em) =>
      el('button.chip', {
        type: 'button',
        texto: em,
        'aria-label': `Emoji ${em}`,
        'aria-pressed': String(em === valor.emoji),
        'on:click': () => {
          valor.emoji = em;
          for (const b of filaEmojis.children) b.setAttribute('aria-pressed', 'false');
          filaEmojis.querySelector(`[aria-label="Emoji ${em}"]`)
            ?.setAttribute('aria-pressed', 'true');
          muestra.textContent = em;
        },
      })
    ));

  const nodo = el('div', {}, [
    el('div', {
      estilo: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '12px' },
    }, [
      muestra,
      el('div', { estilo: { flex: '1' } }, [filaColores]),
    ]),
    filaEmojis,
  ]);

  return { nodo, valor };
}

// Envuelve el submit de un formulario: bloquea el botón, muestra el error donde
// se ve, y no deja mandar dos veces por un doble toque.
function alEnviar(form, boton, cajaError, accion) {
  let ocupado = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ocupado) return;

    ocupado = true;
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Un segundo…';
    cajaError.textContent = '';

    try {
      await accion();
    } catch (error) {
      cajaError.textContent = db.mensajeDeError(error);
    } finally {
      ocupado = false;
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  });
}

/**
 * El trébol, el nombre y una línea. El nombre va siempre en minúscula: es
 * parte de la marca, no un descuido.
 */
function cabeceraMarca(titulo, bajada) {
  return el('div.marca-grande', {}, [
    trebol({ tamano: 56 }),
    el('p.nombre', { texto: 'juntos' }),
    el('h1.solo-lectores', { texto: titulo }),
    el('p', { texto: bajada }),
  ]);
}

// ---------------------------------------------------------------------------
//  1. Configuración de Supabase
// ---------------------------------------------------------------------------

export function pantallaConfig(destino, alListo) {
  const url = entrada({
    type: 'url',
    placeholder: 'https://abcdefgh.supabase.co',
    autocomplete: 'off',
    required: true,
  });
  const clave = entrada({
    placeholder: 'sb_publishable_… o eyJhbGci…',
    autocomplete: 'off',
    required: true,
  });
  const error = el('p.error-campo');
  const boton = el('button.btn.primario.ancho', { type: 'submit', texto: 'Conectar' });

  const form = el('form.tarjeta', { novalidate: true }, [
    campo('URL del proyecto', url, 'Supabase → Project Settings → Data API'),
    campo(
      'Clave pública (anon / publishable)',
      clave,
      'La que dice anon o publishable. Nunca la service_role: esa saltea la ' +
        'seguridad del esquema y da acceso a todo.',
    ),
    error,
    boton,
  ]);

  alEnviar(form, boton, error, () => {
    db.guardarConfig(url.value, clave.value);
    avisoBien('Conectado');
    alListo();
  });

  pintar(destino, el('div.entrada', {}, [
    cabeceraMarca('juntos', 'Falta conectar la app con tu proyecto de Supabase.'),
    form,
    el('p.cambiar', {}, [
      'Si escribís estos datos en ',
      el('code', { texto: 'config.js' }),
      ' y los subís al repo, no hay que cargarlos de nuevo en cada teléfono.',
    ]),
  ]));
}

// ---------------------------------------------------------------------------
//  2. Cuenta
// ---------------------------------------------------------------------------

export function pantallaCuenta(destino, alEntrar) {
  let modo = 'entrar'; // entrar | registrarse | recuperar

  function pintarPantalla() {
    const esRegistro = modo === 'registrarse';
    const esRecuperar = modo === 'recuperar';

    const email = entrada({
      type: 'email',
      placeholder: 'vos@mail.com',
      autocomplete: 'email',
      required: true,
      inputmode: 'email',
    });
    const clave = entrada({
      type: 'password',
      placeholder: '••••••••',
      autocomplete: esRegistro ? 'new-password' : 'current-password',
      required: true,
      minlength: 6,
    });

    const error = el('p.error-campo');
    const boton = el('button.btn.primario.ancho', {
      type: 'submit',
      texto: esRecuperar
        ? 'Mandame el link'
        : (esRegistro ? 'Crear mi cuenta' : 'Entrar'),
    });

    const form = el('form.tarjeta', { novalidate: true }, [
      campo('Tu mail', email),
      esRecuperar ? null : campo(
        'Contraseña',
        clave,
        esRegistro ? 'Mínimo 6 caracteres.' : null,
      ),
      error,
      boton,
    ]);

    alEnviar(form, boton, error, async () => {
      if (esRecuperar) {
        await db.recuperarPassword(email.value);
        avisoBien('Si ese mail tiene cuenta, va a llegar el link');
        modo = 'entrar';
        pintarPantalla();
        return;
      }

      if (esRegistro) {
        const r = await db.registrarse(email.value, clave.value);
        // Con la confirmación por mail activada, Supabase no devuelve sesión.
        if (!r?.session) {
          aviso('Te mandamos un mail para confirmar la cuenta');
          modo = 'entrar';
          pintarPantalla();
          return;
        }
      } else {
        await db.entrar(email.value, clave.value);
      }
      await alEntrar();
    });

    const cambiar = el('p.cambiar');
    if (esRecuperar) {
      cambiar.append(
        el('button', {
          type: 'button',
          texto: 'Volver',
          'on:click': () => {
            modo = 'entrar';
            pintarPantalla();
          },
        }),
      );
    } else {
      cambiar.append(
        esRegistro ? '¿Ya tenés cuenta? ' : '¿Todavía no tenés cuenta? ',
        el('button', {
          type: 'button',
          texto: esRegistro ? 'Entrá' : 'Creá una',
          'on:click': () => {
            modo = esRegistro ? 'entrar' : 'registrarse';
            pintarPantalla();
          },
        }),
      );
      if (!esRegistro) {
        cambiar.append(
          el('br'),
          el('button', {
            type: 'button',
            texto: 'Me olvidé la contraseña',
            estilo: { marginTop: '8px', fontWeight: '600' },
            'on:click': () => {
              modo = 'recuperar';
              pintarPantalla();
            },
          }),
        );
      }
    }

    pintar(destino, el('div.entrada', {}, [
      cabeceraMarca(
        'juntos',
        esRecuperar
          ? 'Poné tu mail y te mandamos un link para cambiar la contraseña.'
          : 'La agenda de la familia, el menú de la semana y lo que hay que hacer, en un solo lugar.',
      ),
      form,
      cambiar,
    ]));
  }

  pintarPantalla();
}

// ---------------------------------------------------------------------------
//  3. Hogar
// ---------------------------------------------------------------------------

export function pantallaHogar(destino, alListo) {
  let modo = 'elegir'; // elegir | crear | unirse

  function pintarPantalla() {
    if (modo === 'elegir') return pintarElegir();
    if (modo === 'crear') return pintarCrear();
    return pintarUnirse();
  }

  function pintarElegir() {
    pintar(destino, el('div.entrada', {}, [
      cabeceraMarca('Ya casi', 'Un hogar es el espacio compartido: la agenda, el menú y la lista de compras viven ahí.'),
      el('div.tarjeta', {}, [
        el('button.btn.primario.ancho', {
          type: 'button',
          texto: 'Crear nuestro hogar',
          'on:click': () => {
            modo = 'crear';
            pintarPantalla();
          },
        }),
        el('p.ayuda', {
          estilo: { marginTop: '8px', marginBottom: '18px' },
          texto: 'Elegí esto si sos el primero. Después compartís un código de 6 letras.',
        }),
        el('button.btn.suave.ancho', {
          type: 'button',
          texto: 'Tengo un código',
          'on:click': () => {
            modo = 'unirse';
            pintarPantalla();
          },
        }),
        el('p.ayuda', {
          estilo: { marginTop: '8px' },
          texto: 'Si tu pareja ya creó el hogar, te pasa el código y entrás acá.',
        }),
      ]),
      el('p.cambiar', {}, [
        el('button', {
          type: 'button',
          texto: 'Salir de esta cuenta',
          'on:click': async () => {
            await db.salir();
            location.reload();
          },
        }),
      ]),
    ]));
  }

  function pintarCrear() {
    // Los textos de ejemplo de los campos van genéricos a propósito. Si dijeran
    // un nombre que se parezca al de quien está usando la app, parece que la
    // app ya sabe quién sos, y eso asusta con razón.
    const nombreHogar = entrada({
      placeholder: 'Nuestra casa',
      required: true,
      maxlength: 60,
      autocomplete: 'off',
    });
    const miNombre = entrada({
      placeholder: 'Tu nombre',
      required: true,
      maxlength: 40,
      autocomplete: 'given-name',
    });
    const avatar = elegirAvatar();
    const error = el('p.error-campo');
    const boton = el('button.btn.primario.ancho', { type: 'submit', texto: 'Crear el hogar' });

    const form = el('form.tarjeta', { novalidate: true }, [
      campo('¿Cómo se llama el hogar?', nombreHogar, 'Es solo para ustedes dos, ponele lo que quieras.'),
      campo('¿Cómo te llamás?', miNombre),
      campo('Tu color y tu emoji', avatar.nodo, 'Con esto se distingue de quién es cada cosa en la agenda.'),
      error,
      boton,
    ]);

    alEnviar(form, boton, error, async () => {
      const hogar = await db.crearHogar({
        nombre: nombreHogar.value.trim(),
        miNombre: miNombre.value.trim(),
        color: avatar.valor.color,
        emoji: avatar.valor.emoji,
      });
      await alListo(hogar, { recienCreado: true });
    });

    pintar(destino, el('div.entrada', {}, [
      cabeceraMarca('Tu hogar', 'Dos datos y listo.'),
      form,
      volver(),
    ]));
  }

  function pintarUnirse() {
    const codigo = entrada({
      clase: 'codigo-entrada',
      placeholder: '······',
      required: true,
      maxlength: 6,
      minlength: 6,
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: false,
    });
    // Se normaliza mientras se escribe: mayúsculas y nada más que el alfabeto
    // del código. Las letras que se confunden al dictar (O, I, L) y sus números
    // (0, 1) no existen en ese alfabeto, así que se descartan en vez de
    // adivinar por cuál cambiarlas: adivinar mal es peor que no aceptar la letra.
    codigo.addEventListener('input', () => {
      const cursor = codigo.selectionStart;
      const limpio = codigo.value
        .toUpperCase()
        .replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '')
        .slice(0, 6);
      const seCayoAlgo = limpio.length < codigo.value.length;
      codigo.value = limpio;
      // Si se descartó un carácter, el cursor va al final; si no, se queda.
      const pos = seCayoAlgo ? limpio.length : cursor;
      codigo.setSelectionRange(pos, pos);
    });

    const miNombre = entrada({
      placeholder: 'Tu nombre',
      required: true,
      maxlength: 40,
      autocomplete: 'given-name',
    });
    const avatar = elegirAvatar({ color: '#ff9f68', emoji: '🌻' });
    const error = el('p.error-campo');
    const boton = el('button.btn.primario.ancho', { type: 'submit', texto: 'Entrar al hogar' });

    const form = el('form.tarjeta', { novalidate: true }, [
      campo('El código de 6 letras', codigo, 'Lo encuentra en Más → Invitar.'),
      campo('¿Cómo te llamás?', miNombre),
      campo('Tu color y tu emoji', avatar.nodo),
      error,
      boton,
    ]);

    alEnviar(form, boton, error, async () => {
      if (codigo.value.length !== 6) throw new Error('El código tiene 6 letras');
      const hogar = await db.unirseAHogar({
        codigo: codigo.value,
        miNombre: miNombre.value.trim(),
        color: avatar.valor.color,
        emoji: avatar.valor.emoji,
      });
      await alListo(hogar, { recienCreado: false });
    });

    pintar(destino, el('div.entrada', {}, [
      cabeceraMarca('Entrar a un hogar', 'Pedile el código a quien ya está adentro.'),
      form,
      volver(),
    ]));
  }

  function volver() {
    return el('p.cambiar', {}, [
      el('button', {
        type: 'button',
        texto: '← Volver',
        'on:click': () => {
          modo = 'elegir';
          pintarPantalla();
        },
      }),
    ]);
  }

  pintarPantalla();
}

// ---------------------------------------------------------------------------
//  Cambio de contraseña, cuando se vuelve del link del mail
// ---------------------------------------------------------------------------

export function pantallaNuevaPassword(destino, alListo) {
  const clave = entrada({
    type: 'password',
    placeholder: '••••••••',
    autocomplete: 'new-password',
    required: true,
    minlength: 6,
  });
  const error = el('p.error-campo');
  const boton = el('button.btn.primario.ancho', { type: 'submit', texto: 'Guardar' });

  const form = el('form.tarjeta', { novalidate: true }, [
    campo('Tu contraseña nueva', clave, 'Mínimo 6 caracteres.'),
    error,
    boton,
  ]);

  alEnviar(form, boton, error, async () => {
    await db.cambiarPassword(clave.value);
    avisoBien('Contraseña cambiada');
    // Se limpia el token del link para que no quede en el historial.
    history.replaceState(null, '', location.pathname);
    await alListo();
  });

  pintar(destino, el('div.entrada', {}, [
    cabeceraMarca('Contraseña nueva', 'Elegí una nueva y entrás derecho.'),
    form,
  ]));
}
