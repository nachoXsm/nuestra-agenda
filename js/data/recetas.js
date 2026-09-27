// ============================================================================
//  Recetario base: comida de casa argentina, sana y sin vueltas.
//
//  Está acá para que la app sirva desde el primer día, sin depender de la IA, y
//  para que el planificador tenga de dónde elegir sin conexión. El agente suma
//  ideas nuevas encima de esto.
//
//  meses: en qué meses conviene, según js/data/temporada.js. Vacío = todo el año.
//  Las cantidades son para 3 porciones (dos grandes y un chico).
//  rubro: dónde se compra, para que la lista de compras salga ordenada.
// ============================================================================

export const RUBROS = {
  verduleria: { nombre: 'Verdulería', emoji: '🥬', orden: 1 },
  carniceria: { nombre: 'Carnicería', emoji: '🥩', orden: 2 },
  pescaderia: { nombre: 'Pescadería', emoji: '🐟', orden: 3 },
  fiambreria: { nombre: 'Fiambrería', emoji: '🧀', orden: 4 },
  panaderia: { nombre: 'Panadería', emoji: '🥖', orden: 5 },
  almacen: { nombre: 'Almacén', emoji: '🛒', orden: 6 },
  dietetica: { nombre: 'Dietética', emoji: '🌾', orden: 7 },
  limpieza: { nombre: 'Limpieza', emoji: '🧽', orden: 8 },
  otros: { nombre: 'Otros', emoji: '📦', orden: 9 },
};

// Atajo para escribir los ingredientes más corto: i('tomate', '3', 'verduleria')
const i = (item, cantidad = '', rubro = 'verduleria') => ({ item, cantidad, rubro });

export const RECETAS = [
  // ---------------------------------------------------------------- verano ---
  {
    id: 'ensalada-tomate-choclo',
    nombre: 'Ensalada de tomate, choclo y huevo',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 20,
    etiquetas: ['vegetariano', 'fresco', 'sin TACC'],
    meses: [12, 1, 2, 3],
    ingredientes: [
      i('tomate', '4'),
      i('choclo', '2'),
      i('huevo', '3', 'almacen'),
      i('cebolla de verdeo', '1'),
      i('aceite de oliva', 'un chorro', 'almacen'),
    ],
    pasos: 'Hervir los choclos 12 min y los huevos 10. Cortar el tomate grueso, ' +
      'desgranar el choclo, sumar el huevo en gajos y la cebolla de verdeo. ' +
      'Aliñar con oliva, sal y un poco de limón.',
  },
  {
    id: 'tarta-zapallito',
    nombre: 'Tarta de zapallito y cebolla',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 45,
    etiquetas: ['vegetariano', 'rinde al otro día'],
    meses: [11, 12, 1, 2, 3],
    ingredientes: [
      i('zapallito', '4'),
      i('cebolla', '2'),
      i('huevo', '3', 'almacen'),
      i('queso rallado', '50 g', 'fiambreria'),
      i('tapa de tarta', '1', 'almacen'),
    ],
    pasos: 'Rehogar la cebolla, sumar el zapallito en cubos y cocinar hasta que ' +
      'pierda el agua. Dejar tibiar, mezclar con los huevos y el queso, volcar ' +
      'sobre la tapa y hornear 30 min a 180°.',
  },
  {
    id: 'berenjenas-escabeche',
    nombre: 'Berenjenas al horno con ajo y perejil',
    momentos: ['cena'],
    tiempo_min: 40,
    etiquetas: ['vegano', 'sin TACC'],
    meses: [12, 1, 2, 3],
    ingredientes: [
      i('berenjena', '3'),
      i('ajo', '3 dientes'),
      i('perejil', '1 puñado'),
      i('aceite de oliva', '', 'almacen'),
      i('vinagre', '', 'almacen'),
    ],
    pasos: 'Cortar las berenjenas en rodajas de 1 cm, salar y dejar 15 min para ' +
      'que suelten el amargor. Hornear 25 min a 200°. Aliñar en caliente con ' +
      'ajo picado, perejil, oliva y un golpe de vinagre.',
  },
  {
    id: 'pollo-limon-ensalada',
    nombre: 'Pollo al limón con ensalada de estación',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 30,
    etiquetas: ['sin TACC', 'rápido'],
    meses: [],
    ingredientes: [
      i('pechuga de pollo', '600 g', 'carniceria'),
      i('limón', '2'),
      i('lechuga', '1 planta'),
      i('tomate', '2'),
      i('zanahoria', '2'),
    ],
    pasos: 'Marinar el pollo 10 min con jugo de limón, ajo y orégano. Sellar a ' +
      'fuego fuerte 4 min de cada lado. Servir con la ensalada aliñada simple.',
  },
  {
    id: 'gazpacho',
    nombre: 'Gazpacho de tomate y morrón',
    momentos: ['cena'],
    tiempo_min: 15,
    etiquetas: ['vegano', 'sin cocción', 'sin TACC'],
    meses: [12, 1, 2],
    ingredientes: [
      i('tomate', '6'),
      i('morrón', '1'),
      i('pepino', '1'),
      i('ajo', '1 diente'),
      i('pan del día anterior', '1 rodaja', 'panaderia'),
    ],
    pasos: 'Licuar todo con un chorro de oliva, sal y un golpe de vinagre. ' +
      'Enfriar dos horas como mínimo. Servir con cubitos de pepino arriba.',
  },
  {
    id: 'milanesas-napo-horno',
    nombre: 'Milanesas de berenjena al horno',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 45,
    etiquetas: ['vegetariano', 'les gusta a los chicos'],
    meses: [12, 1, 2, 3],
    ingredientes: [
      i('berenjena', '2'),
      i('huevo', '2', 'almacen'),
      i('pan rallado', '200 g', 'almacen'),
      i('queso', '150 g', 'fiambreria'),
      i('tomate perita', '1 lata', 'almacen'),
    ],
    pasos: 'Rodajas de 1 cm, pasar por huevo y pan rallado, horno 200° 20 min ' +
      'dando vuelta a mitad. Salsa rápida de tomate, queso arriba y 5 min más.',
  },

  // ----------------------------------------------------------------- otoño ---
  {
    id: 'sopa-crema-zapallo',
    nombre: 'Crema de zapallo anco y jengibre',
    momentos: ['cena'],
    tiempo_min: 35,
    etiquetas: ['vegetariano', 'sin TACC', 'abriga'],
    meses: [3, 4, 5, 6, 7, 8],
    ingredientes: [
      i('zapallo anco', '1 chico'),
      i('cebolla', '1'),
      i('zanahoria', '2'),
      i('jengibre', 'un trozo'),
      i('caldo de verdura', '1 l', 'almacen'),
    ],
    pasos: 'Rehogar cebolla y jengibre, sumar zapallo y zanahoria en cubos, ' +
      'cubrir con caldo y hervir 20 min. Procesar. Semillas de zapallo tostadas ' +
      'arriba si hay.',
  },
  {
    id: 'guiso-lentejas',
    nombre: 'Guiso de lentejas',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 60,
    etiquetas: ['rinde al otro día', 'económico', 'legumbre'],
    meses: [4, 5, 6, 7, 8, 9],
    ingredientes: [
      i('lentejas', '400 g', 'almacen'),
      i('zapallo anco', '1/2'),
      i('batata', '1'),
      i('cebolla', '1'),
      i('morrón', '1'),
      i('chorizo colorado', '1', 'carniceria'),
      i('tomate triturado', '1 lata', 'almacen'),
    ],
    pasos: 'Rehogar cebolla, morrón y el chorizo en rodajas. Sumar el tomate, ' +
      'las lentejas y las verduras en cubos. Cubrir con agua y cocinar 40 min ' +
      'a fuego bajo. Queda mejor recalentado.',
  },
  {
    id: 'tortilla-acelga',
    nombre: 'Tortilla de acelga y papa',
    momentos: ['cena'],
    tiempo_min: 30,
    etiquetas: ['vegetariano', 'sin TACC', 'rápido'],
    meses: [3, 4, 5, 6, 7, 8, 9, 10],
    ingredientes: [
      i('acelga', '1 atado'),
      i('papa', '2'),
      i('huevo', '5', 'almacen'),
      i('cebolla', '1'),
    ],
    pasos: 'Hervir la papa en cubos y blanquear la acelga. Rehogar la cebolla, ' +
      'sumar todo, volcar los huevos batidos y cocinar tapado 8 min. Dar vuelta ' +
      'con un plato y 4 min más.',
  },
  {
    id: 'pollo-horno-verduras',
    nombre: 'Pollo al horno con verduras de raíz',
    momentos: ['almuerzo'],
    tiempo_min: 70,
    etiquetas: ['sin TACC', 'una sola bandeja'],
    meses: [3, 4, 5, 6, 7, 8],
    ingredientes: [
      i('pollo en presas', '1 kg', 'carniceria'),
      i('batata', '2'),
      i('zapallo anco', '1/2'),
      i('cebolla', '2'),
      i('romero', '2 ramas'),
    ],
    pasos: 'Todo en una bandeja con oliva, sal, pimentón y romero. Horno 190° ' +
      '55 min, mezclando una vez. Se hace solo mientras hacés otra cosa.',
  },
  {
    id: 'brocoli-pasta',
    nombre: 'Fideos con brócoli, ajo y anchoas',
    momentos: ['cena'],
    tiempo_min: 25,
    etiquetas: ['rápido'],
    meses: [3, 4, 5, 6, 7, 8],
    ingredientes: [
      i('brócoli', '1'),
      i('fideos', '400 g', 'almacen'),
      i('ajo', '4 dientes'),
      i('anchoas', '4 filetes', 'almacen'),
      i('queso rallado', '', 'fiambreria'),
    ],
    pasos: 'Hervir el brócoli 4 min en el agua de los fideos y sacarlo. Cocinar ' +
      'los fideos ahí mismo. Dorar ajo con las anchoas hasta deshacerlas, sumar ' +
      'el brócoli, aplastarlo un poco y mezclar con los fideos.',
  },
  {
    id: 'budin-zapallo-carne',
    nombre: 'Pastel de calabaza y carne',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 60,
    etiquetas: ['sin TACC', 'rinde al otro día'],
    meses: [3, 4, 5, 6, 7, 8],
    ingredientes: [
      i('zapallo anco', '1'),
      i('carne picada', '500 g', 'carniceria'),
      i('cebolla', '1'),
      i('puerro', '1'),
      i('huevo duro', '2', 'almacen'),
    ],
    pasos: 'Puré de zapallo al horno. Saltear cebolla, puerro y la carne con ' +
      'comino y pimentón. Armar en capas con el huevo picado, tapar con puré y ' +
      'gratinar 15 min.',
  },

  // -------------------------------------------------------------- invierno ---
  {
    id: 'sopa-verduras-fideos',
    nombre: 'Sopa de verduras con fideos finos',
    momentos: ['cena'],
    tiempo_min: 35,
    etiquetas: ['les gusta a los chicos', 'económico'],
    meses: [5, 6, 7, 8, 9],
    ingredientes: [
      i('zanahoria', '3'),
      i('puerro', '1'),
      i('papa', '2'),
      i('zapallo anco', '1/4'),
      i('apio', '1 rama'),
      i('fideos cabello de ángel', '100 g', 'almacen'),
    ],
    pasos: 'Todo en cubos chicos, cubrir con agua, sal y hervir 20 min. Sumar ' +
      'los fideos los últimos 4 min. Un chorrito de oliva crudo al servir.',
  },
  {
    id: 'garbanzos-espinaca',
    nombre: 'Garbanzos con espinaca y pimentón',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 30,
    etiquetas: ['vegano', 'sin TACC', 'legumbre', 'económico'],
    meses: [4, 5, 6, 7, 8, 9],
    ingredientes: [
      i('garbanzos', '2 latas', 'almacen'),
      i('espinaca', '1 atado'),
      i('cebolla', '1'),
      i('ajo', '3 dientes'),
      i('pimentón dulce', '', 'almacen'),
    ],
    pasos: 'Rehogar cebolla y ajo, sumar pimentón fuera del fuego para que no se ' +
      'queme. Volver al fuego con los garbanzos y un poco de su agua. Sumar la ' +
      'espinaca al final, que se apenas marchite.',
  },
  {
    id: 'pescado-papas-horno',
    nombre: 'Merluza al horno con papas y limón',
    momentos: ['cena'],
    tiempo_min: 40,
    etiquetas: ['sin TACC', 'pescado'],
    meses: [],
    ingredientes: [
      i('filet de merluza', '600 g', 'pescaderia'),
      i('papa', '4'),
      i('limón', '1'),
      i('perejil', '1 puñado'),
      i('aceite de oliva', '', 'almacen'),
    ],
    pasos: 'Papas en rodajas finas al horno 20 min. Poner el pescado arriba con ' +
      'limón, perejil y oliva, y 12 min más a 200°. No pasarlo de punto.',
  },
  {
    id: 'polenta-salsa',
    nombre: 'Polenta cremosa con salsa de verduras',
    momentos: ['cena'],
    tiempo_min: 30,
    etiquetas: ['vegetariano', 'sin TACC', 'económico'],
    meses: [5, 6, 7, 8],
    ingredientes: [
      i('polenta', '300 g', 'almacen'),
      i('tomate triturado', '1 lata', 'almacen'),
      i('cebolla', '1'),
      i('zanahoria', '2'),
      i('puerro', '1'),
      i('queso', '100 g', 'fiambreria'),
    ],
    pasos: 'Salsa con cebolla, zanahoria y puerro bien picados, más el tomate, ' +
      '20 min a fuego bajo. Polenta con ' +
      'el doble y medio de agua, revolviendo. Queso al final y la salsa arriba.',
  },
  {
    id: 'repollo-salteado-cerdo',
    nombre: 'Repollo salteado con cerdo y sésamo',
    momentos: ['cena'],
    tiempo_min: 25,
    etiquetas: ['rápido'],
    meses: [4, 5, 6, 7, 8],
    ingredientes: [
      i('repollo', '1/2'),
      i('carré de cerdo', '400 g', 'carniceria'),
      i('zanahoria', '2'),
      i('cebolla de verdeo', '2'),
      i('salsa de soja', '', 'almacen'),
      i('semillas de sésamo', '', 'dietetica'),
    ],
    pasos: 'Cortar todo en tiras finas. Sellar el cerdo a fuego fuerte, sacarlo. ' +
      'Saltear las verduras 5 min, volver la carne, soja y sésamo.',
  },
  {
    id: 'lentejas-ensalada-tibia',
    nombre: 'Ensalada tibia de lentejas y remolacha',
    momentos: ['almuerzo'],
    tiempo_min: 40,
    etiquetas: ['vegetariano', 'sin TACC', 'legumbre'],
    meses: [4, 5, 6, 7, 8, 9],
    ingredientes: [
      i('lentejas', '250 g', 'almacen'),
      i('remolacha', '3'),
      i('cebolla morada', '1'),
      i('queso de cabra', '100 g', 'fiambreria'),
      i('nuez', 'un puñado', 'dietetica'),
    ],
    pasos: 'Hervir las lentejas 20 min y las remolachas aparte. Cortar en cubos, ' +
      'mezclar tibio con cebolla en pluma, queso desgranado y nueces. Aliño de ' +
      'mostaza, oliva y vinagre.',
  },

  // ------------------------------------------------------------- primavera ---
  {
    id: 'revuelto-esparragos',
    nombre: 'Revuelto de espárragos y papa',
    momentos: ['cena'],
    tiempo_min: 25,
    etiquetas: ['vegetariano', 'sin TACC', 'rápido'],
    meses: [8, 9, 10, 11],
    ingredientes: [
      i('espárrago', '1 atado'),
      i('papa', '2'),
      i('huevo', '5', 'almacen'),
      i('cebolla de verdeo', '2'),
    ],
    pasos: 'Papa en cubos chicos a la sartén hasta dorar. Sumar los espárragos ' +
      'cortados en trozos de 3 cm, 4 min. Volcar los huevos y revolver poco, ' +
      'que queden cremosos.',
  },
  {
    id: 'arvejas-jamon',
    nombre: 'Arvejas frescas con jamón crudo y menta',
    momentos: ['almuerzo'],
    tiempo_min: 20,
    etiquetas: ['sin TACC', 'rápido', 'de temporada corta'],
    meses: [9, 10, 11],
    ingredientes: [
      i('arvejas frescas', '500 g'),
      i('jamón crudo', '80 g', 'fiambreria'),
      i('cebolla de verdeo', '2'),
      i('menta', 'unas hojas'),
    ],
    pasos: 'Desgranar las arvejas y hervirlas 5 min. Saltear la cebolla de verdeo, ' +
      'sumar las arvejas, el jamón en tiras y la menta fuera del fuego.',
  },
  {
    id: 'alcauciles-rellenos',
    nombre: 'Alcauciles rellenos al horno',
    momentos: ['almuerzo'],
    tiempo_min: 70,
    etiquetas: ['vegetariano', 'para un día tranquilo'],
    meses: [7, 8, 9, 10],
    ingredientes: [
      i('alcaucil', '4'),
      i('pan rallado', '100 g', 'almacen'),
      i('ajo', '3 dientes'),
      i('perejil', '1 puñado'),
      i('queso rallado', '50 g', 'fiambreria'),
      i('limón', '1'),
    ],
    pasos: 'Limpiar los alcauciles y dejarlos en agua con limón. Rellenar entre ' +
      'las hojas con pan rallado, ajo, perejil y queso. Horno 180° con un dedo ' +
      'de agua en la bandeja, 50 min tapados.',
  },
  {
    id: 'wok-verduras-pollo',
    nombre: 'Wok de verduras de primavera con pollo',
    momentos: ['cena'],
    tiempo_min: 25,
    etiquetas: ['rápido', 'sin TACC'],
    meses: [9, 10, 11, 12],
    ingredientes: [
      i('pechuga de pollo', '500 g', 'carniceria'),
      i('chaucha', '250 g'),
      i('zapallito', '2'),
      i('zanahoria', '2'),
      i('cebolla de verdeo', '2'),
      i('salsa de soja', '', 'almacen'),
    ],
    pasos: 'Todo cortado fino y a mano antes de prender el fuego. Pollo a fuego ' +
      'fuerte 5 min, afuera. Verduras 5 min, que queden al dente. Volver el ' +
      'pollo, soja y listo.',
  },
  {
    id: 'ensalada-frutilla-rucula',
    nombre: 'Ensalada de rúcula, frutilla y queso',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 10,
    etiquetas: ['vegetariano', 'sin TACC', 'sin cocción'],
    meses: [9, 10, 11, 12],
    ingredientes: [
      i('rúcula', '1 atado'),
      i('frutilla', '250 g'),
      i('queso fresco', '150 g', 'fiambreria'),
      i('nuez', 'un puñado', 'dietetica'),
      i('vinagre balsámico', '', 'almacen'),
    ],
    pasos: 'Todo en un bol, aliño de oliva y balsámico. Diez minutos y está.',
  },
  {
    id: 'habas-arroz',
    nombre: 'Arroz con habas y hierbas',
    momentos: ['cena'],
    tiempo_min: 35,
    etiquetas: ['vegetariano', 'sin TACC'],
    meses: [9, 10, 11],
    ingredientes: [
      i('habas frescas', '500 g'),
      i('arroz', '300 g', 'almacen'),
      i('cebolla', '1'),
      i('caldo de verdura', '700 ml', 'almacen'),
      i('perejil', '1 puñado'),
    ],
    pasos: 'Pelar las habas (vale hervirlas 2 min para que salgan fáciles). ' +
      'Rehogar la cebolla, sumar el arroz, el caldo de a poco. A los 15 min ' +
      'sumar las habas y las hierbas.',
  },

  // ------------------------------------------------------------ todo el año --
  {
    id: 'omelette-queso-verdura',
    nombre: 'Omelette de queso y lo que haya',
    momentos: ['cena'],
    tiempo_min: 15,
    etiquetas: ['vegetariano', 'sin TACC', 'rápido', 'día complicado'],
    meses: [],
    ingredientes: [
      i('huevo', '5', 'almacen'),
      i('queso', '100 g', 'fiambreria'),
      i('verdura de hoja', 'lo que haya'),
    ],
    pasos: 'Batir los huevos con sal. Sartén caliente con manteca, volcar, ' +
      'rellenar con queso y verdura salteada, plegar. Quince minutos contando ' +
      'el lavado.',
  },
  {
    id: 'pastel-papa',
    nombre: 'Pastel de papa',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 55,
    etiquetas: ['les gusta a los chicos', 'rinde al otro día', 'sin TACC'],
    meses: [],
    ingredientes: [
      i('papa', '1 kg'),
      i('carne picada', '500 g', 'carniceria'),
      i('cebolla', '2'),
      i('morrón', '1'),
      i('huevo duro', '2', 'almacen'),
      i('aceituna', 'un puñado', 'almacen'),
    ],
    pasos: 'Puré con leche y manteca. Saltear cebolla y morrón, sumar la carne ' +
      'con comino y pimentón. Armar con huevo y aceitunas, tapar con puré, ' +
      'gratinar 20 min a 200°.',
  },
  {
    id: 'noquis-papa',
    nombre: 'Ñoquis de papa caseros',
    momentos: ['almuerzo'],
    tiempo_min: 60,
    etiquetas: ['vegetariano', 'para un día tranquilo', 'con los chicos'],
    meses: [],
    ingredientes: [
      i('papa', '1 kg'),
      i('harina', '300 g', 'almacen'),
      i('huevo', '1', 'almacen'),
      i('tomate triturado', '1 lata', 'almacen'),
      i('albahaca', 'unas hojas'),
    ],
    pasos: 'Hervir las papas con piel, pelarlas en caliente y hacer puré. Sumar ' +
      'harina y huevo sin amasar de más. Armar los rollos, cortar, hervir hasta ' +
      'que floten. Los chicos ayudan en esta parte.',
  },
  {
    id: 'empanadas-verdura',
    nombre: 'Empanadas de verdura al horno',
    momentos: ['cena'],
    tiempo_min: 50,
    etiquetas: ['vegetariano', 'rinde al otro día'],
    meses: [],
    ingredientes: [
      i('acelga', '2 atados'),
      i('cebolla', '2'),
      i('queso', '150 g', 'fiambreria'),
      i('tapas de empanada', '12', 'almacen'),
      i('nuez moscada', '', 'almacen'),
    ],
    pasos: 'Blanquear y escurrir muy bien la acelga (si queda agua, se rompen). ' +
      'Rehogar la cebolla, mezclar con la acelga picada, queso y nuez moscada. ' +
      'Armar, pintar con huevo y horno 200° 18 min.',
  },
  {
    id: 'salteado-porotos',
    nombre: 'Porotos negros con arroz y palta',
    momentos: ['almuerzo', 'cena'],
    tiempo_min: 30,
    etiquetas: ['vegano', 'sin TACC', 'legumbre', 'económico'],
    meses: [],
    ingredientes: [
      i('porotos negros', '2 latas', 'almacen'),
      i('arroz', '300 g', 'almacen'),
      i('cebolla', '1'),
      i('morrón', '1'),
      i('palta', '1'),
      i('comino', '', 'almacen'),
    ],
    pasos: 'Arroz aparte. Rehogar cebolla y morrón, sumar los porotos con comino ' +
      'y un poco de su líquido, 10 min. Servir con la palta en cubos y limón.',
  },
  {
    id: 'pizza-casera',
    nombre: 'Pizza casera de verduras',
    momentos: ['cena'],
    tiempo_min: 90,
    etiquetas: ['vegetariano', 'con los chicos', 'viernes'],
    meses: [],
    ingredientes: [
      i('harina', '500 g', 'almacen'),
      i('levadura', '10 g', 'almacen'),
      i('mozzarella', '400 g', 'fiambreria'),
      i('tomate triturado', '1 lata', 'almacen'),
      i('verdura de estación', 'la que haya'),
    ],
    pasos: 'Masa: harina, 300 ml de agua tibia, levadura, sal, un chorro de ' +
      'oliva. Leudar 1 hora. Estirar, salsa, horno bien caliente 12 min, sumar ' +
      'el queso y la verdura, 6 min más.',
  },
  {
    id: 'hamburguesas-lentejas',
    nombre: 'Hamburguesas de lentejas y avena',
    momentos: ['cena'],
    tiempo_min: 40,
    etiquetas: ['vegano', 'legumbre', 'les gusta a los chicos'],
    meses: [],
    ingredientes: [
      i('lentejas cocidas', '400 g', 'almacen'),
      i('avena', '150 g', 'dietetica'),
      i('cebolla', '1'),
      i('zanahoria', '1'),
      i('pan de hamburguesa', '6', 'panaderia'),
    ],
    pasos: 'Procesar las lentejas sin hacer puré fino. Mezclar con avena, cebolla ' +
      'y zanahoria rallada, condimentar. Descansar 15 min en la heladera. ' +
      'Sartén o horno, 6 min de cada lado.',
  },
  {
    id: 'fideos-atun',
    nombre: 'Fideos con atún, tomate y aceitunas',
    momentos: ['cena'],
    tiempo_min: 20,
    etiquetas: ['rápido', 'día complicado', 'pescado'],
    meses: [],
    ingredientes: [
      i('fideos', '400 g', 'almacen'),
      i('atún al natural', '2 latas', 'almacen'),
      i('tomate triturado', '1 lata', 'almacen'),
      i('aceituna', 'un puñado', 'almacen'),
      i('ajo', '2 dientes'),
    ],
    pasos: 'Mientras hierven los fideos: ajo en oliva, tomate 8 min, atún ' +
      'escurrido y aceitunas. Mezclar con los fideos y un poco del agua de ' +
      'cocción. Veinte minutos de punta a punta.',
  },
  {
    id: 'ensalada-pollo-garbanzos',
    nombre: 'Ensalada de garbanzos, pollo y verdura',
    momentos: ['almuerzo'],
    tiempo_min: 25,
    etiquetas: ['sin TACC', 'legumbre', 'se lleva al trabajo'],
    meses: [],
    ingredientes: [
      i('garbanzos', '1 lata', 'almacen'),
      i('pechuga de pollo', '400 g', 'carniceria'),
      i('verdura de estación', 'lo que haya'),
      i('limón', '1'),
      i('aceite de oliva', '', 'almacen'),
    ],
    pasos: 'Pollo a la plancha con sal y pimentón, cortado en cubos. Mezclar con ' +
      'los garbanzos y la verdura cruda o asada. Aliño de limón y oliva. ' +
      'Aguanta bien en la vianda.',
  },
  {
    id: 'sopa-crema-verduras-sobras',
    nombre: 'Crema de lo que sobró en la verdulera',
    momentos: ['cena'],
    tiempo_min: 30,
    etiquetas: ['vegetariano', 'sin TACC', 'nada se tira', 'económico'],
    meses: [],
    ingredientes: [
      i('verduras varias', 'lo que quede'),
      i('papa', '1'),
      i('cebolla', '1'),
      i('caldo', '1 l', 'almacen'),
    ],
    pasos: 'La receta para el día antes de la compra: todo lo que quedó en el ' +
      'cajón, más una papa para dar cuerpo. Rehogar, cubrir con caldo, 20 min y ' +
      'procesar. Siempre sale bien.',
  },
];

/** Una receta por id. */
export function receta(id) {
  return RECETAS.find((r) => r.id === id) ?? null;
}

/**
 * Recetas que van bien en un mes. Las de meses vacío entran siempre.
 * @param {number} mes 1-12
 * @param {object} filtros  { momento, etiqueta, maxMin }
 */
export function recetasDelMes(mes, filtros = {}) {
  return RECETAS.filter((r) => {
    if (r.meses.length && !r.meses.includes(mes)) return false;
    if (filtros.momento && !r.momentos.includes(filtros.momento)) return false;
    if (filtros.etiqueta && !r.etiquetas.includes(filtros.etiqueta)) return false;
    if (filtros.maxMin && r.tiempo_min > filtros.maxMin) return false;
    return true;
  });
}

/** Busca por nombre, etiqueta o ingrediente. */
export function buscarRecetas(texto) {
  const q = String(texto ?? '').toLowerCase().trim();
  if (!q) return RECETAS;
  return RECETAS.filter((r) =>
    r.nombre.toLowerCase().includes(q) ||
    r.etiquetas.some((e) => e.toLowerCase().includes(q)) ||
    r.ingredientes.some((i) => i.item.toLowerCase().includes(q))
  );
}

/** Todas las etiquetas que existen, para armar los filtros. */
export function etiquetas() {
  return [...new Set(RECETAS.flatMap((r) => r.etiquetas))].sort();
}
