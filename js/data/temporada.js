// ============================================================================
//  Qué está de temporada en Buenos Aires, mes por mes.
//
//  FUENTE ÚNICA de la estacionalidad de toda la app. El agente de IA no tiene su
//  propia tabla: esto se le manda como contexto en cada pedido. Así no hay dos
//  verdades y no puede proponer tomate en julio.
//
//  Hemisferio sur: el verano es diciembre-febrero y el invierno junio-agosto.
//  Armado sobre la oferta habitual del Mercado Central de Buenos Aires. Las
//  fechas de cada fruta se corren una o dos semanas según el año, así que lo que
//  importa es el mes, no el día.
// ============================================================================

export const ESTACIONES = {
  verano: [12, 1, 2],
  otoño: [3, 4, 5],
  invierno: [6, 7, 8],
  primavera: [9, 10, 11],
};

/**
 * Verdulería disponible todo el año: la base de cualquier comida.
 * Cuenta como "de temporada" en cualquier mes.
 */
export const TODO_EL_AÑO = [
  'papa',
  'cebolla',
  'zanahoria',
  'ajo',
  'banana',
  'limón',
  'perejil',
  'cilantro',
  'orégano',
  'laurel',
  'romero',
  'apio',
  'jengibre',
];

/**
 * Cosas que no tienen temporada: despensa, lácteos, huevo, carne y pescado.
 * No cuentan ni a favor ni en contra al medir cuánto tiene de estación una
 * comida. Sin esta distinción, unas berenjenas con aceite de oliva y vinagre
 * puntuaban 40% "de temporada" en pleno febrero, que es justo cuando la
 * berenjena está en su mejor momento.
 */
export const SIN_TEMPORADA = [
  // despensa
  'aceite', 'oliva', 'vinagre', 'sal', 'pimienta', 'pimentón', 'comino',
  'nuez moscada', 'especias', 'azúcar', 'miel', 'mostaza', 'salsa de soja',
  'harina', 'pan', 'pan rallado', 'tapa de tarta', 'tapas de empanada',
  'fideos', 'arroz', 'polenta', 'avena', 'levadura', 'caldo',
  'lentejas', 'garbanzos', 'porotos', 'arvejas secas',
  'atún', 'anchoas', 'aceituna', 'tomate triturado', 'tomate perita',
  'conserva', 'nuez', 'almendra', 'semillas', 'sésamo',
  // lácteos y huevo
  'huevo', 'queso', 'mozzarella', 'leche', 'manteca', 'crema', 'yogur',
  // carnicería y pescadería
  'carne', 'picada', 'pollo', 'pechuga', 'pata', 'muslo', 'cerdo', 'carré',
  'chorizo', 'bondiola', 'vacío', 'asado', 'milanesa', 'jamón', 'panceta',
  'pescado', 'merluza', 'salmón', 'filet',
];

const MESES = {
  1: {
    nombre: 'enero',
    verduras: [
      'tomate', 'choclo', 'zapallito', 'berenjena', 'morrón', 'pepino',
      'chaucha', 'albahaca', 'rúcula', 'lechuga', 'cebolla de verdeo',
      'remolacha',
    ],
    frutas: [
      'durazno', 'pelón', 'ciruela', 'sandía', 'melón', 'uva', 'higo',
      'damasco', 'pera', 'manzana',
    ],
  },
  2: {
    nombre: 'febrero',
    verduras: [
      'tomate', 'choclo', 'zapallito', 'berenjena', 'morrón', 'pepino',
      'chaucha', 'albahaca', 'acelga', 'lechuga', 'zapallo',
    ],
    frutas: [
      'durazno', 'pelón', 'ciruela', 'sandía', 'melón', 'uva', 'higo',
      'pera', 'manzana', 'palta',
    ],
  },
  3: {
    nombre: 'marzo',
    verduras: [
      'zapallo', 'zapallito', 'berenjena', 'morrón', 'tomate', 'acelga',
      'espinaca', 'brócoli', 'coliflor', 'puerro', 'remolacha', 'batata',
    ],
    frutas: [
      'uva', 'higo', 'ciruela', 'pera', 'manzana', 'membrillo', 'granada',
      'palta',
    ],
  },
  4: {
    nombre: 'abril',
    verduras: [
      'zapallo anco', 'zapallo cabutiá', 'batata', 'remolacha', 'brócoli',
      'coliflor', 'acelga', 'espinaca', 'puerro', 'hinojo', 'repollo',
      'calabaza',
    ],
    frutas: [
      'manzana', 'pera', 'membrillo', 'caqui', 'granada', 'mandarina',
      'kiwi', 'nuez', 'palta',
    ],
  },
  5: {
    nombre: 'mayo',
    verduras: [
      'zapallo anco', 'batata', 'remolacha', 'brócoli', 'coliflor', 'repollo',
      'acelga', 'espinaca', 'puerro', 'hinojo', 'achicoria', 'radicheta',
    ],
    frutas: [
      'mandarina', 'naranja', 'pomelo', 'manzana', 'pera', 'kiwi', 'caqui',
      'palta',
    ],
  },
  6: {
    nombre: 'junio',
    verduras: [
      'zapallo anco', 'batata', 'puerro', 'repollo', 'coliflor', 'brócoli',
      'acelga', 'espinaca', 'achicoria', 'radicheta', 'hinojo', 'nabo',
      'remolacha',
    ],
    frutas: ['naranja', 'mandarina', 'pomelo', 'manzana', 'pera', 'kiwi', 'palta'],
  },
  7: {
    nombre: 'julio',
    verduras: [
      'alcaucil', 'zapallo anco', 'batata', 'puerro', 'repollo', 'coliflor',
      'brócoli', 'acelga', 'espinaca', 'achicoria', 'radicheta', 'nabo',
      'remolacha',
    ],
    frutas: ['naranja', 'mandarina', 'pomelo', 'manzana', 'pera', 'kiwi', 'palta'],
  },
  8: {
    nombre: 'agosto',
    verduras: [
      'alcaucil', 'espárrago', 'zapallo anco', 'batata', 'puerro', 'repollo',
      'coliflor', 'brócoli', 'acelga', 'espinaca', 'achicoria', 'radicheta',
    ],
    frutas: ['naranja', 'mandarina', 'pomelo', 'manzana', 'pera', 'kiwi', 'frutilla'],
  },
  9: {
    nombre: 'septiembre',
    verduras: [
      'alcaucil', 'espárrago', 'arvejas frescas', 'habas', 'acelga',
      'espinaca', 'lechuga', 'rúcula', 'rabanito', 'remolacha',
      'cebolla de verdeo', 'puerro',
    ],
    frutas: ['frutilla', 'naranja', 'pomelo', 'kiwi', 'níspero'],
  },
  10: {
    nombre: 'octubre',
    verduras: [
      'alcaucil', 'espárrago', 'arvejas frescas', 'habas', 'chaucha',
      'zapallito', 'lechuga', 'rúcula', 'rabanito', 'remolacha',
      'cebolla de verdeo', 'acelga',
    ],
    frutas: ['frutilla', 'níspero', 'cereza', 'naranja'],
  },
  11: {
    nombre: 'noviembre',
    verduras: [
      'zapallito', 'chaucha', 'arvejas frescas', 'habas', 'choclo', 'lechuga',
      'rúcula', 'pepino', 'tomate', 'albahaca', 'rabanito', 'remolacha',
    ],
    frutas: ['frutilla', 'cereza', 'ciruela', 'durazno', 'damasco', 'níspero'],
  },
  12: {
    nombre: 'diciembre',
    verduras: [
      'tomate', 'choclo', 'zapallito', 'chaucha', 'berenjena', 'morrón',
      'pepino', 'albahaca', 'lechuga', 'rúcula',
    ],
    frutas: [
      'cereza', 'frutilla', 'durazno', 'pelón', 'damasco', 'ciruela',
      'sandía', 'melón', 'higo',
    ],
  },
};

/** La estación de un mes (1-12). */
export function estacionDe(mes) {
  for (const [nombre, meses] of Object.entries(ESTACIONES)) {
    if (meses.includes(mes)) return nombre;
  }
  return 'verano';
}

/**
 * Lo que está de temporada en un mes.
 * Es exactamente el objeto que viaja al agente de IA como contexto.
 */
export function temporadaDe(mes) {
  const m = MESES[mes] ?? MESES[1];
  return {
    mes,
    mes_nombre: m.nombre,
    estacion: estacionDe(mes),
    verduras: [...m.verduras],
    frutas: [...m.frutas],
    y_tambien: [...TODO_EL_AÑO],
  };
}

/** Todo lo de temporada de un mes, en una sola lista, para buscar rápido. */
export function listaTemporada(mes) {
  const t = temporadaDe(mes);
  return [...t.verduras, ...t.frutas];
}

// Se normaliza para comparar: sin acentos, en minúscula y en singular simple.
// Así "Zapallitos" encuentra a "zapallito" y "Berenjena" a "berenjena".
function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim();
}

function raiz(palabra) {
  const n = normalizar(palabra);
  // Plural simple: "tomates" -> "tomate", "morrones" -> "morron".
  return n.endsWith('es') && n.length > 5
    ? n.slice(0, -2)
    : (n.endsWith('s') && n.length > 4 ? n.slice(0, -1) : n);
}

/**
 * ¿El ingrediente aparece en esa lista? Compara por raíz, así el plural y los
 * acentos no molestan.
 *
 * `soloHaciaAdelante` cambia qué tan suelta es la comparación:
 *
 *  - false (la verdulería): vale en los dos sentidos, porque el ingrediente
 *    puede traer palabras de más ("zapallo anco en cubos" encuentra "zapallo
 *    anco") o de menos ("zapallo" encuentra "zapallo anco", y está bien: el
 *    zapallo está de temporada).
 *
 *  - true (lo que no tiene temporada): solo vale si el ingrediente contiene a
 *    la palabra de la lista. Si se aceptara al revés, "tomate" haría match con
 *    "tomate triturado" y el tomate nunca quedaría marcado fuera de temporada
 *    en julio, que es justo lo que la app tiene que avisar.
 */
function estaEn(ingrediente, lista, soloHaciaAdelante = false) {
  const objetivo = raiz(ingrediente);
  if (!objetivo) return false;

  for (const item of lista) {
    const r = raiz(item);
    if (!r) continue;
    if (objetivo === r) return true;
    if (objetivo.includes(r)) return true;
    if (!soloHaciaAdelante && r.includes(objetivo)) return true;
  }
  return false;
}

/**
 * Clasifica un ingrediente en un mes:
 *   'temporada' — está en su mejor momento (o es verdura de todo el año)
 *   'despensa'  — no tiene temporada (aceite, arroz, queso, carne…)
 *   'fuera'     — es de estación, pero no de esta
 *
 * Lo sin temporada se pregunta PRIMERO: así el tomate triturado queda siempre
 * como despensa en vez de "de temporada" cada verano.
 */
export function clasificar(ingrediente, mes) {
  if (!raiz(ingrediente)) return 'despensa';
  if (estaEn(ingrediente, SIN_TEMPORADA, true)) return 'despensa';
  if (estaEn(ingrediente, [...listaTemporada(mes), ...TODO_EL_AÑO])) return 'temporada';
  return 'fuera';
}

/** ¿Este ingrediente está de temporada en ese mes? */
export function esDeTemporada(ingrediente, mes) {
  return clasificar(ingrediente, mes) === 'temporada';
}

/**
 * De la fruta y la verdura que lleva una comida, qué parte está en su momento
 * (0 a 1). La despensa no entra en la cuenta: que una receta use aceite no la
 * hace menos de temporada.
 * Devuelve null si la comida es toda despensa y no hay nada que medir.
 */
export function proporcionDeTemporada(ingredientes, mes) {
  const items = (ingredientes ?? [])
    .map((x) => (typeof x === 'string' ? x : x?.item))
    .filter(Boolean)
    .map((x) => clasificar(x, mes))
    .filter((c) => c !== 'despensa');

  if (!items.length) return null;
  return items.filter((c) => c === 'temporada').length / items.length;
}
