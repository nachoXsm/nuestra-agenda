// ============================================================================
//  Piezas de interfaz: armar nodos, avisos, hojas emergentes.
//
//  Sin framework a propósito: la app se sirve como archivos estáticos desde
//  GitHub Pages, sin paso de build. Menos partes móviles, y no hay nada acá que
//  necesite un framework para resolverse.
//
//  Regla que se cumple en todo el archivo: NUNCA se arma HTML pegando texto que
//  vino de la base. Todo lo que escribió una persona entra por textContent. Si
//  alguien llama a un hijo "<script>", tiene que verse ese nombre, no ejecutarse.
// ============================================================================
import { iniciales, tinte } from '../data/paleta.js';
import { icono } from './iconos.js';

/**
 * Crea un elemento.
 * @param {string} etiqueta  'div', o 'div.clase.otra' como atajo
 * @param {object} props     clases, texto, atributos, eventos (on:click)
 * @param {Array}  hijos     nodos o textos
 */
export function el(etiqueta, props = {}, hijos = []) {
  const [tag, ...clases] = etiqueta.split('.');
  const nodo = document.createElement(tag || 'div');

  if (clases.length) nodo.classList.add(...clases);

  for (const [clave, valor] of Object.entries(props)) {
    if (valor === null || valor === undefined || valor === false) continue;

    if (clave === 'clase') {
      nodo.classList.add(...String(valor).split(' ').filter(Boolean));
    } else if (clave === 'texto') {
      // textContent, no innerHTML: es la línea que evita el XSS.
      nodo.textContent = valor;
    } else if (clave === 'html') {
      // Solo para marcado que armamos nosotros, nunca para datos de la base.
      nodo.innerHTML = valor;
    } else if (clave === 'estilo') {
      for (const [prop, v] of Object.entries(valor)) {
        // Las variables CSS (--tinte) NO se pueden asignar como propiedad del
        // objeto style: hay que pasar por setProperty. Con Object.assign se
        // pierden en silencio, que es peor que fallar.
        if (prop.startsWith('--')) nodo.style.setProperty(prop, v);
        else nodo.style[prop] = v;
      }
    } else if (clave === 'datos') {
      Object.assign(nodo.dataset, valor);
    } else if (clave.startsWith('on:')) {
      nodo.addEventListener(clave.slice(3), valor);
    } else if (clave in nodo && clave !== 'list') {
      nodo[clave] = valor;
    } else {
      nodo.setAttribute(clave, valor === true ? '' : valor);
    }
  }

  for (const hijo of [].concat(hijos)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }

  return nodo;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Reemplaza el contenido de un nodo. */
export function pintar(nodo, ...contenido) {
  nodo.replaceChildren(...contenido.flat().filter((x) => x !== null && x !== undefined && x !== false));
  return nodo;
}

// ---------------------------------------------------------------------------
//  Avisos
// ---------------------------------------------------------------------------

let avisoActual = null;
let avisoReloj = null;

/** Un cartelito abajo que se va solo. */
export function aviso(texto, tipo = '') {
  if (avisoActual) avisoActual.remove();
  clearTimeout(avisoReloj);

  avisoActual = el('div.aviso', {
    clase: tipo,
    texto,
    role: tipo === 'mal' ? 'alert' : 'status',
    'aria-live': tipo === 'mal' ? 'assertive' : 'polite',
  });
  document.getElementById('capas').append(avisoActual);

  // Un error se lee más despacio que un "listo".
  avisoReloj = setTimeout(() => {
    avisoActual?.remove();
    avisoActual = null;
  }, tipo === 'mal' ? 5200 : 2800);
}

export const avisoBien = (t) => aviso(t, 'bien');
export const avisoMal = (t) => aviso(t, 'mal');

// ---------------------------------------------------------------------------
//  Hoja emergente
// ---------------------------------------------------------------------------

let cerrarHojaActual = null;

/**
 * Abre una hoja desde abajo.
 * @param {object} opciones  { titulo, bajada, contenido, alCerrar }
 * @returns {{ cerrar: Function, cuerpo: HTMLElement }}
 */
export function hoja({ titulo, bajada, contenido, alCerrar } = {}) {
  cerrarHojaActual?.();

  const cuerpo = el('div.hoja', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': titulo ?? 'Panel',
  }, [
    el('div.manija', { 'aria-hidden': 'true' }),
    titulo ? el('h2', { texto: titulo }) : null,
    bajada ? el('p.bajada', { texto: bajada }) : null,
  ]);

  if (contenido) cuerpo.append(...[].concat(contenido));

  const velo = el('div.velo', {
    'on:click': (e) => {
      // Solo si se tocó afuera de la hoja.
      if (e.target === velo) cerrar();
    },
  }, [cuerpo]);

  // Con la hoja abierta el fondo no scrollea.
  const scrollAntes = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  function cerrar() {
    if (cerrarHojaActual !== cerrar) return;
    document.removeEventListener('keydown', alTeclear);
    document.body.style.overflow = scrollAntes;
    velo.remove();
    cerrarHojaActual = null;
    alCerrar?.();
  }

  function alTeclear(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    }
  }

  document.addEventListener('keydown', alTeclear);
  document.getElementById('capas').append(velo);
  cerrarHojaActual = cerrar;

  // El foco va adentro de la hoja, para teclado y lectores de pantalla.
  const primero = cuerpo.querySelector(
    'input:not([type=hidden]), select, textarea, button',
  );
  (primero ?? cuerpo).focus?.();

  return { cerrar, cuerpo };
}

export function cerrarHoja() {
  cerrarHojaActual?.();
}

/** Pregunta de sí o no. Resuelve en true o false. */
export function confirmar({
  titulo,
  bajada,
  siTexto = 'Sí, dale',
  noTexto = 'Mejor no',
  peligroso = false,
}) {
  return new Promise((resolver) => {
    let respondido = false;
    const responder = (v) => {
      respondido = true;
      cerrar();
      resolver(v);
    };

    const { cerrar } = hoja({
      titulo,
      bajada,
      // Si se cierra tocando afuera o con Escape, es un "no".
      alCerrar: () => {
        if (!respondido) resolver(false);
      },
      contenido: el('div.acciones', {}, [
        el('button.btn.linea', {
          type: 'button',
          texto: noTexto,
          'on:click': () => responder(false),
        }),
        el(`button.btn.${peligroso ? 'peligro' : 'primario'}`, {
          type: 'button',
          texto: siTexto,
          'on:click': () => responder(true),
        }),
      ]),
    });
  });
}

// ---------------------------------------------------------------------------
//  Estados de la pantalla
// ---------------------------------------------------------------------------

export function cargando(texto = 'Cargando…') {
  return el('div.cargando', {}, [el('span.ruedita'), texto]);
}

/** Barras con la forma del contenido que está por venir. */
export function huesos(cuantos = 3) {
  return el('div', {}, Array.from({ length: cuantos }, () => el('div.hueso')));
}

/**
 * Pantalla vacía. El primer argumento es el nombre de un icono de iconos.js,
 * no un emoji: el emoji lo dibuja cada sistema a su manera y ninguno de ellos
 * se parece al resto de la app.
 */
export function vacio(nombreIcono, texto, accion) {
  return el('div.vacio', {}, [
    icono(nombreIcono, { tamano: 40, trazo: 1.6 }),
    el('p', { texto }),
    accion ? el('div', { estilo: { marginTop: '18px' } }, [accion]) : null,
  ]);
}

// ---------------------------------------------------------------------------
//  Piezas del sistema visual
// ---------------------------------------------------------------------------

/**
 * El círculo de un integrante. Lleva su emoji si eligió uno, y si no las
 * iniciales del nombre. El color va como variable --tinte y no como fondo
 * fijo, para que el CSS saque de ahí el fondo y el color de texto según el
 * tema: el mismo verde que se lee sobre marfil no se lee sobre negro.
 */
export function avatar(persona, { tamano = '' } = {}) {
  return el('span.avatar', {
    clase: tamano,
    texto: persona?.emoji || iniciales(persona?.nombre),
    title: persona?.nombre ?? '',
    estilo: { '--tinte': tinte(persona) },
  });
}

/** Varios avatares encimados, con un "+2" si no entran todos. */
export function pila(personas, { max = 4, tamano = 'chico' } = {}) {
  const muestra = personas.slice(0, max);
  const resto = personas.length - muestra.length;
  return el('span.pila', {}, [
    ...muestra.map((p) => avatar(p, { tamano })),
    resto > 0 ? el('span.avatar', { clase: tamano, texto: `+${resto}` }) : null,
  ]);
}

/**
 * El control de Mes | Semana | Día, y el de Menú | Compras.
 * @param {Array} opciones  [{ valor, texto }]
 */
export function segmentado(opciones, valor, alElegir, { etiqueta = '' } = {}) {
  const cont = el('div.segmentado', { role: 'group', 'aria-label': etiqueta });
  for (const o of opciones) {
    cont.append(el('button', {
      type: 'button',
      texto: o.texto,
      'aria-pressed': String(o.valor === valor),
      'on:click': () => {
        if (o.valor !== valor) alElegir(o.valor);
      },
    }));
  }
  return cont;
}

/** Una marquita de estado: "Vence hoy", "Hecha", "Del menú". */
export function marca(texto, tipo = 'pendiente') {
  return el('span.marca', { clase: tipo, texto });
}

/**
 * El anillo de progreso de Tareas.
 * @param {number} porcentaje  0 a 100
 * @param {Array}  contenido   lo que va al lado del anillo
 */
export function anillo(porcentaje, contenido = []) {
  const pct = Math.max(0, Math.min(100, Math.round(porcentaje)));
  const RADIO = 32;
  const VUELTA = 2 * Math.PI * RADIO;
  const NS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 76 76');
  svg.setAttribute('aria-hidden', 'true');

  // Dos círculos: el del fondo entero, y encima el del avance recortado con
  // stroke-dasharray. El CSS lo rota -90° para que arranque arriba.
  for (const [color, largo] of [
    ['var(--superficie-2)', VUELTA],
    ['var(--primario)', (VUELTA * pct) / 100],
  ]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '38');
    c.setAttribute('cy', '38');
    c.setAttribute('r', String(RADIO));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', color);
    c.setAttribute('stroke-width', '7');
    c.setAttribute('stroke-linecap', 'round');
    c.setAttribute('stroke-dasharray', `${largo} ${VUELTA}`);
    svg.append(c);
  }

  return el('div.anillo', {}, [
    el('div.grafico', {}, [svg, el('span.pct', { texto: `${pct}%` })]),
    el('div', { estilo: { flex: '1', minWidth: '0' } }, [].concat(contenido)),
  ]);
}

/** Una sección con su título y, si hace falta, una acción a la derecha. */
export function seccion(titulo, contenido, accion = null) {
  return el('section.seccion', {}, [
    titulo ? el('header', {}, [el('h2', { texto: titulo }), accion]) : null,
    ...[].concat(contenido).filter(Boolean),
  ]);
}

// ---------------------------------------------------------------------------
//  Formularios
// ---------------------------------------------------------------------------

/**
 * Un campo con etiqueta.
 * @param {string} etiqueta
 * @param {HTMLElement} control
 * @param {string} ayuda
 */
export function campo(etiqueta, control, ayuda) {
  const id = control.id || `c${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return el('div.campo', {}, [
    el('label', { for: id, texto: etiqueta }),
    control,
    ayuda ? el('p.ayuda', { texto: ayuda }) : null,
  ]);
}

export function entrada(props = {}) {
  return el('input', { type: 'text', ...props });
}

export function areaTexto(props = {}) {
  return el('textarea', props);
}

/** Un select. opciones = [[valor, texto], …] */
export function elegir(opciones, valor, props = {}) {
  const s = el('select', props);
  for (const [v, t] of opciones) {
    s.append(el('option', { value: v, texto: t, selected: v === valor }));
  }
  s.value = valor ?? '';
  return s;
}

export function interruptor(etiqueta, marcado, alCambiar) {
  const caja = el('input', {
    type: 'checkbox',
    checked: !!marcado,
    'on:change': (e) => alCambiar(e.target.checked),
  });
  return el('label.switch', {}, [el('span', { texto: etiqueta }), caja]);
}

/**
 * Fila de chips donde se elige uno.
 * @param {Array} opciones  [{ valor, texto, color }]
 */
export function chipsElegir(opciones, valor, alElegir, { scroll = false } = {}) {
  const cont = el('div.chips', { clase: scroll ? 'scroll' : '', role: 'group' });

  for (const o of opciones) {
    const b = el('button.chip', {
      type: 'button',
      texto: o.texto,
      'aria-pressed': String(o.valor === valor),
      'on:click': () => {
        for (const otro of cont.children) otro.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        alElegir(o.valor);
      },
    });
    if (o.color && o.valor === valor) {
      b.style.borderColor = o.color;
      b.style.color = o.color;
    }
    cont.append(b);
  }
  return cont;
}

// ---------------------------------------------------------------------------
//  Varios
// ---------------------------------------------------------------------------

/**
 * Copia al portapapeles. Devuelve true si funcionó.
 * Con respaldo para navegadores viejos y para http (donde no hay clipboard API).
 */
export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const t = el('textarea', {
        value: texto,
        estilo: { position: 'fixed', opacity: '0', top: '0' },
      });
      document.body.append(t);
      t.select();
      const listo = document.execCommand('copy');
      t.remove();
      return listo;
    } catch {
      return false;
    }
  }
}

/**
 * Convierte el negrita y las listas del markdown que devuelve el modelo.
 * Se escapa TODO primero y recién después se agregan las etiquetas: el texto
 * viene de un modelo, y un modelo puede devolver cualquier cosa.
 */
export function textoDelChef(texto) {
  const escapado = String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escapado
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?:^|\n)\s*[-*]\s+/g, '\n• ')
    .replace(/(?:^|\n)\s*(\d+)\.\s+/g, '\n$1. ');
}

/** Espera un rato antes de ejecutar; si se vuelve a llamar, reinicia la cuenta. */
export function conEspera(fn, ms = 350) {
  let reloj = null;
  return (...args) => {
    clearTimeout(reloj);
    reloj = setTimeout(() => fn(...args), ms);
  };
}

/** Una vibración corta, si el dispositivo la tiene. */
export function vibrar(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch { /* no todos los navegadores la tienen */ }
}
