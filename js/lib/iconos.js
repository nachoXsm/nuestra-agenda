// ============================================================================
//  Los iconos de la app, dibujados a mano.
//
//  Del manual de identidad: grilla de 24, trazo de 1,8 px, puntas y uniones
//  redondeadas, sin relleno. Un solo trazo por forma y nada de detalles que a
//  24 px no se vean.
//
//  Van acá y no como emoji porque el emoji lo dibuja el sistema: en un Android
//  se ve de una forma, en un iPhone de otra, y ninguna de las dos se parece a
//  esto. Un <svg> se ve igual en todos lados y toma el color del texto.
//
//  Cada icono es una lista de formas:
//    ['p', 'M…']                    un path
//    ['c', cx, cy, r]               un círculo
//    ['r', x, y, ancho, alto, rx]   un rectángulo
// ============================================================================

const NS = 'http://www.w3.org/2000/svg';

export const ICONOS = {
  // --- las cinco secciones ---
  inicio: [
    ['p', 'M3.2 10.6 12 3.2l8.8 7.4'],
    ['p', 'M5.6 9.4V20.3h12.8V9.4'],
    ['p', 'M9.6 20.3v-5.6h4.8v5.6'],
  ],
  agenda: [
    ['r', 3.2, 5, 17.6, 15.8, 3.2],
    ['p', 'M8 3.2v3.6'],
    ['p', 'M16 3.2v3.6'],
    ['p', 'M3.2 10.4h17.6'],
  ],
  // Una olla con vapor, no un tenedor y un cuchillo: a 24 px los cubiertos se
  // leen como dos letras sueltas, y la olla se entiende de una.
  comidas: [
    ['p', 'M4 9.4h16v5.4a5.2 5.2 0 0 1-5.2 5.2H9.2A5.2 5.2 0 0 1 4 14.8V9.4Z'],
    ['p', 'M2.4 9.4h19.2'],
    ['p', 'M8.4 6.2c0-1.2 1-1.6 1-2.8'],
    ['p', 'M12 6.2c0-1.2 1-1.6 1-2.8'],
    ['p', 'M15.6 6.2c0-1.2 1-1.6 1-2.8'],
  ],
  tareas: [
    ['c', 12, 12, 8.8],
    ['p', 'm8.2 12.3 2.6 2.6 5-5.4'],
  ],
  familia: [
    ['c', 9.2, 8, 3.6],
    ['p', 'M2.6 20.4c0-3.7 2.9-6.2 6.6-6.2s6.6 2.5 6.6 6.2'],
    ['p', 'M16.4 4.9a3.6 3.6 0 0 1 0 6.6'],
    ['p', 'M18.2 14.8c2 .8 3.2 2.7 3.2 5.6'],
  ],

  // --- acciones ---
  mas: [['p', 'M12 5.2v13.6'], ['p', 'M5.2 12h13.6']],
  menos: [['p', 'M5.2 12h13.6']],
  izq: [['p', 'm14.6 5.6-6.4 6.4 6.4 6.4']],
  der: [['p', 'm9.4 5.6 6.4 6.4-6.4 6.4']],
  arriba: [['p', 'm5.6 14.6 6.4-6.4 6.4 6.4']],
  abajo: [['p', 'm5.6 9.4 6.4 6.4 6.4-6.4']],
  tilde: [['p', 'm5 12.6 4.6 4.6L19 7.2']],
  cerrar: [['p', 'M6.2 6.2l11.6 11.6'], ['p', 'M17.8 6.2 6.2 17.8']],
  lapiz: [
    ['p', 'M4.2 20.4h4.2L20.2 8.6a2.4 2.4 0 0 0-3.4-3.4L5 17v3.4Z'],
    ['p', 'm15.2 6.8 2.2 2.2'],
  ],
  basura: [
    ['p', 'M4.2 7.2h15.6'],
    ['p', 'M9.4 7.2V4.9h5.2v2.3'],
    ['p', 'm6.6 7.2.9 12.1a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.9-12.1'],
  ],
  compartir: [
    ['p', 'M12 3.4v10.8'],
    ['p', 'm8.2 6.8 3.8-3.4 3.8 3.4'],
    ['p', 'M5.4 13.2v6a1.8 1.8 0 0 0 1.8 1.8h9.6a1.8 1.8 0 0 0 1.8-1.8v-6'],
  ],
  enviar: [['p', 'M4.4 12 20.4 4.2 13.2 20.2l-2.4-6L4.4 12Z']],
  reloj: [['c', 12, 12, 8.8], ['p', 'M12 7.4V12l3.2 2']],
  lugar: [
    ['p', 'M12 21c0 0 6.6-6.3 6.6-11.2A6.6 6.6 0 0 0 5.4 9.8C5.4 14.7 12 21 12 21Z'],
    ['c', 12, 9.8, 2.3],
  ],
  repetir: [
    ['p', 'M4.2 9.4a5.2 5.2 0 0 1 5.2-5.2h9.4'],
    ['p', 'm15.8 1.4 3 2.8-3 2.8'],
    ['p', 'M19.8 14.6a5.2 5.2 0 0 1-5.2 5.2H5.2'],
    ['p', 'm8.2 22.6-3-2.8 3-2.8'],
  ],
  campana: [
    ['p', 'M6.6 10.4a5.4 5.4 0 0 1 10.8 0c0 4 1.6 5.6 1.6 5.6H5s1.6-1.6 1.6-5.6Z'],
    ['p', 'M9.9 19.2a2.3 2.3 0 0 0 4.2 0'],
  ],
  chispas: [
    ['p', 'M12 3.4l1.8 4.5 4.5 1.8-4.5 1.8L12 16l-1.8-4.5L5.7 9.7l4.5-1.8L12 3.4Z'],
    ['p', 'M18.4 15.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z'],
  ],
  carrito: [
    ['p', 'M2.8 4.2h2.4l2.4 10.6h9.7L19.6 7H6.2'],
    ['c', 9, 19, 1.7],
    ['c', 16.2, 19, 1.7],
  ],
  ajustes: [
    ['p', 'M4.2 7h3'], ['p', 'M11.4 7h8.4'], ['c', 9.2, 7, 2.2],
    ['p', 'M4.2 13h8.2'], ['p', 'M16.8 13h3'], ['c', 14.6, 13, 2.2],
    ['p', 'M4.2 19h5'], ['p', 'M13.6 19h6.2'], ['c', 11.4, 19, 2.2],
  ],
  sol: [
    ['c', 12, 12, 4.2],
    ['p', 'M12 2.6v2.2'], ['p', 'M12 19.2v2.2'],
    ['p', 'M2.6 12h2.2'], ['p', 'M19.2 12h2.2'],
    ['p', 'm5.6 5.6 1.6 1.6'], ['p', 'm16.8 16.8 1.6 1.6'],
    ['p', 'm18.4 5.6-1.6 1.6'], ['p', 'm7.2 16.8-1.6 1.6'],
  ],
  luna: [['p', 'M20.4 14.6A8.8 8.8 0 0 1 9.4 3.6a8.8 8.8 0 1 0 11 11Z']],
  bajar: [
    ['p', 'M12 4v11'], ['p', 'm7.8 10.8 4.2 4.2 4.2-4.2'], ['p', 'M4.8 20h14.4'],
  ],
  enlace: [
    ['p', 'M10.4 13.6a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1.1 1.1'],
    ['p', 'M13.6 10.4a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1.1-1.1'],
  ],
  copiar: [
    ['r', 9, 9, 11.4, 11.4, 2.6],
    ['p', 'M15 5.6V5a1.9 1.9 0 0 0-1.9-1.9H5.5A1.9 1.9 0 0 0 3.6 5v7.6a1.9 1.9 0 0 0 1.9 1.9H6'],
  ],
  salir: [
    ['p', 'M14.6 4.8H7a2 2 0 0 0-2 2v10.4a2 2 0 0 0 2 2h7.6'],
    ['p', 'm16.8 8.4 3.6 3.6-3.6 3.6'],
    ['p', 'M20.4 12h-9.2'],
  ],
  sumarPersona: [
    ['c', 9.6, 8.2, 3.6],
    ['p', 'M3 20.4c0-3.7 2.9-6.2 6.6-6.2 1.2 0 2.3.3 3.2.7'],
    ['p', 'M17.6 13.8v6'], ['p', 'M14.6 16.8h6'],
  ],
  buscar: [['c', 10.6, 10.6, 6.6], ['p', 'm15.4 15.4 4.4 4.4']],
  filtro: [['p', 'M4.2 6.6h15.6'], ['p', 'M7 12h10'], ['p', 'M10 17.4h4']],
  alerta: [
    ['p', 'M12 3.8 21 19.6H3L12 3.8Z'],
    ['p', 'M12 9.6v4.2'], ['p', 'M12 16.8h.01'],
  ],
  info: [['c', 12, 12, 8.8], ['p', 'M12 11v5.4'], ['p', 'M12 7.8h.01']],
  nota: [
    ['p', 'M6 3.4h12a1.6 1.6 0 0 1 1.6 1.6v14a1.6 1.6 0 0 1-1.6 1.6H6a1.6 1.6 0 0 1-1.6-1.6V5A1.6 1.6 0 0 1 6 3.4Z'],
    ['p', 'M8 8.4h8'], ['p', 'M8 12.4h8'], ['p', 'M8 16.4h4.6'],
  ],

  // --- para pantallas vacías ---
  planta: [
    ['p', 'M12 21v-7.6'],
    ['p', 'M12 13.4C12 8.6 8.8 5 4.4 4.2c-.4 5.2 3 9 7.6 9.2Z'],
    ['p', 'M12 13.4c0-4.8 3.2-8.4 7.6-9.2.4 5.2-3 9-7.6 9.2Z'],
  ],
  taza: [
    ['p', 'M4.6 7.6h11.2v6.2a4.2 4.2 0 0 1-4.2 4.2H8.8a4.2 4.2 0 0 1-4.2-4.2V7.6Z'],
    ['p', 'M15.8 9.4h1.8a2.4 2.4 0 0 1 0 4.8h-1.8'],
    ['p', 'M4 21h13'],
  ],
};

/**
 * Devuelve un <svg> del icono.
 * @param {string} nombre  una clave de ICONOS
 * @param {object} opciones  { tamano, trazo, clase, titulo }
 */
export function icono(nombre, { tamano = 24, trazo = 1.8, clase = '', titulo = '' } = {}) {
  const formas = ICONOS[nombre] ?? ICONOS.info;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamano));
  svg.setAttribute('height', String(tamano));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(trazo));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (clase) svg.setAttribute('class', clase);

  // Un icono al lado de su texto es decoración y el lector de pantalla no tiene
  // que leerlo. Uno solo, sin texto, necesita nombre.
  if (titulo) {
    svg.setAttribute('role', 'img');
    const t = document.createElementNS(NS, 'title');
    t.textContent = titulo;
    svg.append(t);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  for (const forma of formas) {
    const [tipo, ...v] = forma;
    if (tipo === 'p') {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', v[0]);
      svg.append(p);
    } else if (tipo === 'c') {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', v[0]);
      c.setAttribute('cy', v[1]);
      c.setAttribute('r', v[2]);
      svg.append(c);
    } else if (tipo === 'r') {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', v[0]);
      r.setAttribute('y', v[1]);
      r.setAttribute('width', v[2]);
      r.setAttribute('height', v[3]);
      if (v[4] !== undefined) r.setAttribute('rx', v[4]);
      svg.append(r);
    }
  }

  return svg;
}

/**
 * El trébol de la marca.
 *
 * Va como <img> y no como SVG pegado acá adentro por dos razones. Una: el
 * dibujo son cinco contornos trazados de la imagen original y ocupan 12 KB,
 * que no tienen por qué viajar dentro del JavaScript ni parsearse en cada
 * arranque. La otra: a diferencia de los iconos de trazo, el trébol tiene sus
 * colores propios —una hoja por integrante— así que no necesita heredar
 * currentColor ni cambiar con el tema.
 *
 * La URL se arma contra import.meta.url y no contra el documento: así apunta
 * bien aunque la app se sirva desde un subdirectorio, como en GitHub Pages.
 */
const URL_TREBOL = new URL('../../icons/trebol.svg', import.meta.url).href;

export function trebol({ tamano = 28, titulo = '' } = {}) {
  const img = document.createElement('img');
  img.src = URL_TREBOL;
  img.width = tamano;
  img.height = tamano;
  img.decoding = 'async';
  // Un trébol al lado del nombre "juntos" es decoración: el lector de pantalla
  // ya lee el nombre. Uno solo, sin texto al lado, necesita alternativa.
  if (titulo) img.alt = titulo;
  else {
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
  }
  return img;
}
