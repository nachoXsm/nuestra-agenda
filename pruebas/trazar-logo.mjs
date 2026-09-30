// ============================================================================
//  Saca el trébol de juntos de la hoja de identidad, trazando los píxeles.
//
//  No lo dibuja nadie: se separa la imagen por color, se limpia cada región y
//  se traza con potrace, que es el mismo algoritmo que usa Inkscape.
//
//  La parte delicada es el antialias. Clasificar cada píxel por el color más
//  parecido deja un anillo de píxeles intermedios alrededor de cada hoja, y
//  esos anillos caen en la capa equivocada: el borde entre el verde oscuro y
//  el crema se parece al verde claro. Por eso, de cada color se conserva
//  únicamente la mancha más grande —cada hoja es una sola— y después se le
//  tapan los agujeros.
//
//  Se corre a mano, solo si alguna vez cambia la imagen de la marca:
//
//    cd pruebas && npm install sharp potrace && node trazar-logo.mjs
//
//  No corre en CI: sharp y potrace no hacen falta para nada más, y lo que
//  produce ya está commiteado en icons/.
//
//  Escribe icons/trebol.svg, icons/icono.svg e icons/icono-maskable.svg. Los
//  PNG del manifest salen después, con node pruebas/iconos-png.mjs.
// ============================================================================
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import potrace from 'potrace';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ORIGINAL = RAIZ + 'docs/marca/identidad.webp';
// Medido fila por fila: el trébol va de x 162..308 e y 64..231, y el logotipo
// "juntos" recién empieza en y 239.
const RECORTE = { left: 148, top: 56, width: 178, height: 180 };
const ESCALA = 8; // se agranda antes de clasificar: el borde cae con precisión subpíxel

const REFS = [
  { id: 'fondo', rgb: [246, 245, 238] },
  { id: 'blanco', rgb: [255, 255, 255] },
  { id: 'verde-oscuro', rgb: [0x2f, 0x5c, 0x50] },
  { id: 'verde-claro', rgb: [0xa1, 0xc2, 0x8e] },
  { id: 'lila', rgb: [0xb5, 0x9f, 0xd0] },
  { id: 'azul', rgb: [0x99, 0xad, 0xdb] },
  { id: 'terracota', rgb: [0xc4, 0x67, 0x4a] },
];
const FORMAS = ['verde-oscuro', 'verde-claro', 'lila', 'azul', 'terracota'];

const { data, info } = await sharp(ORIGINAL)
  .extract(RECORTE)
  .resize({ width: RECORTE.width * ESCALA, kernel: 'lanczos3' })
  .raw().toBuffer({ resolveWithObject: true });

const { width: W, height: H, channels: C } = info;
console.log(`clasificando ${W}x${H}`);

const clase = new Uint8Array(W * H);
for (let p = 0; p < W * H; p++) {
  const i = p * C;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  let mejor = 0, dist = Infinity;
  for (let k = 0; k < REFS.length; k++) {
    const [R, G, B] = REFS[k].rgb;
    const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2;
    if (d < dist) { dist = d; mejor = k; }
  }
  clase[p] = mejor;
}

/** La mancha conectada más grande de la máscara (4-vecinos, sin recursión). */
function manchaMasGrande(mask, w, h) {
  const visto = new Uint8Array(w * h);
  const pila = new Int32Array(w * h);
  let mejor = null, mejorN = 0;
  for (let inicio = 0; inicio < w * h; inicio++) {
    if (!mask[inicio] || visto[inicio]) continue;
    let tope = 0, n = 0;
    const comp = [];
    pila[tope++] = inicio; visto[inicio] = 1;
    while (tope > 0) {
      const p = pila[--tope];
      comp.push(p); n++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !visto[p - 1]) { visto[p - 1] = 1; pila[tope++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !visto[p + 1]) { visto[p + 1] = 1; pila[tope++] = p + 1; }
      if (y > 0 && mask[p - w] && !visto[p - w]) { visto[p - w] = 1; pila[tope++] = p - w; }
      if (y < h - 1 && mask[p + w] && !visto[p + w]) { visto[p + w] = 1; pila[tope++] = p + w; }
    }
    if (n > mejorN) { mejorN = n; mejor = comp; }
  }
  const sola = new Uint8Array(w * h);
  for (const p of mejor ?? []) sola[p] = 1;
  return { mask: sola, n: mejorN };
}

/** Tapa los huecos: lo que no se alcanza desde el borde es agujero. */
function taparHuecos(mask, w, h) {
  const afuera = new Uint8Array(w * h);
  const pila = [];
  const meter = (p) => { if (!mask[p] && !afuera[p]) { afuera[p] = 1; pila.push(p); } };
  for (let x = 0; x < w; x++) { meter(x); meter((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { meter(y * w); meter(y * w + w - 1); }
  while (pila.length) {
    const p = pila.pop();
    const x = p % w, y = (p / w) | 0;
    if (x > 0) meter(p - 1);
    if (x < w - 1) meter(p + 1);
    if (y > 0) meter(p - w);
    if (y < h - 1) meter(p + w);
  }
  const lleno = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) lleno[p] = (mask[p] || !afuera[p]) ? 1 : 0;
  return lleno;
}

// Caja común de las cinco formas ya limpias.
const limpias = {};
for (const forma of FORMAS) {
  const id = REFS.findIndex((r) => r.id === forma);
  const bruta = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (clase[p] === id) bruta[p] = 1;
  const { mask, n } = manchaMasGrande(bruta, W, H);
  limpias[forma] = taparHuecos(mask, W, H);
  const brutos = bruta.reduce((a, v) => a + v, 0);
  console.log(`${forma.padEnd(14)} ${brutos} px → mancha de ${n} (se descartan ${brutos - n} de anillo)`);
}

let x0 = W, x1 = -1, y0 = H, y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (FORMAS.some((f) => limpias[f][y * W + x])) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}
const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
console.log('caja del trébol:', bw, 'x', bh);

const trazar = (buf) => new Promise((res, rej) => {
  const p = new potrace.Potrace({
    turdPolicy: 'majority',
    turdSize: 40,
    alphaMax: 1.334,   // el máximo: prioriza curvas suaves sobre esquinas
    optCurve: true,
    optTolerance: 0.2,
    threshold: 128,
    blackOnWhite: true,
  });
  p.loadImage(buf, (e) => (e ? rej(e) : res(p.getPathTag())));
});

const paths = {};
for (const forma of FORMAS) {
  const m = limpias[forma];
  const buf = Buffer.alloc(bw * bh * 4, 255);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (m[(y + y0) * W + (x + x0)]) {
        const o = (y * bw + x) * 4;
        buf[o] = buf[o + 1] = buf[o + 2] = 0;
      }
    }
  }
  const png = await sharp(buf, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
  paths[forma] = (await trazar(png)).match(/ d="([^"]+)"/)?.[1] ?? '';
  console.log(`${forma.padEnd(14)} path de ${paths[forma].length} caracteres`);
}

// ---------------------------------------------------------------------------
//  Los archivos
// ---------------------------------------------------------------------------

// Los colores medidos sobre la imagen. Ojo: no son exactamente los de la hoja
// de paleta (el verde claro y el lila de las hojas quedaron más saturados que
// los swatches). Mandan los de la imagen, que es el logo que se aprobó.
const COLOR = {
  terracota: '#C4674A',
  'verde-oscuro': '#2F5C50',
  'verde-claro': '#A1C28E',
  lila: '#B59FD0',
  azul: '#99ADDB',
};
// El tallo primero: va por detrás de las hojas.
const ORDEN = ['terracota', 'verde-oscuro', 'verde-claro', 'lila', 'azul'];

/**
 * Redondea las coordenadas. potrace las escupe con seis decimales, y sobre una
 * caja de 1256 px el sexto decimal es un cuarto de micra: no lo ve nadie y
 * ocupa la mitad del archivo. El desvío máximo es medio píxel.
 */
function redondear(d) {
  return d
    .replace(/-?\d+\.?\d*/g, (n) => String(Number(Number(n).toFixed(0))))
    .replace(/\s+/g, ' ')
    .replace(/ ([A-Za-z])/g, '$1')
    .replace(/([A-Za-z]) /g, '$1')
    .trim();
}

const cuerpo = ORDEN
  .map((k) => `  <path fill="${COLOR[k]}" d="${redondear(paths[k])}"/>`)
  .join('\n');

writeFileSync(RAIZ + 'icons/trebol.svg',
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bw} ${bh}" role="img" aria-label="juntos">
  <!-- ======================================================================
       El trébol de juntos.

       Esto NO está dibujado a mano: son los contornos de la imagen de la marca
       (docs/marca/identidad.webp), sacados con potrace. Para rehacerlo:
       pruebas/trazar-logo.mjs.

       Cuatro hojas de colores distintos y un tallo terracota que las sostiene.
       El tallo va primero para que quede por detrás.
       ====================================================================== -->
${cuerpo}
</svg>
`);

/** El trébol centrado en una caja cuadrada, ocupando `porcion` del alto. */
function centrado(lado, porcion) {
  const escala = (lado * porcion) / bh;
  const x = (lado - bw * escala) / 2;
  const y = (lado - bh * escala) / 2;
  return `  <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${escala.toFixed(5)})">
${cuerpo.split('\n').map((l) => '  ' + l).join('\n')}
  </g>`;
}

writeFileSync(RAIZ + 'icons/icono.svg',
`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- El ícono de la app: el trébol sobre marfil, con las esquinas
       redondeadas. Lo genera pruebas/trazar-logo.mjs; los PNG del manifest
       salen de acá con pruebas/iconos-png.mjs. -->
  <rect width="512" height="512" rx="114" fill="#FAF5EE"/>
${centrado(512, 0.6)}
</svg>
`);

writeFileSync(RAIZ + 'icons/icono-maskable.svg',
`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- La versión "maskable": Android recorta los bordes con la forma que tenga
       el launcher (círculo, squircle, gota). Por eso no lleva esquinas
       redondeadas propias, y el trébol va más chico para entrar entero en la
       zona segura, que es el 80% del centro. -->
  <rect width="512" height="512" fill="#FAF5EE"/>
${centrado(512, 0.46)}
</svg>
`);

console.log('\nescritos: icons/trebol.svg, icons/icono.svg, icons/icono-maskable.svg');
console.log('ahora: node pruebas/iconos-png.mjs');
