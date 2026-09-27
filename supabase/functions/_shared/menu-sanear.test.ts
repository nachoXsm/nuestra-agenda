// Pruebas del saneado del menu que devuelve el modelo, y del extractor de JSON.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { sanearMenu } from './menu-sanear.ts';
import { extraerJson } from './groq.ts';

const MOMENTOS = ['almuerzo', 'cena'];

Deno.test('deja pasar un menu bien formado', () => {
  const r = sanearMenu({
    resumen: 'Semana con mucha verdura de primavera.',
    menu: [
      {
        fecha: '2026-09-28',
        momento: 'cena',
        titulo: 'Tortilla de acelga',
        tiempo_min: 30,
        etiquetas: ['vegetariano'],
        nota: 'Rinde para el mediodía siguiente',
        ingredientes: [
          { item: 'Acelga', cantidad: '1 atado', rubro: 'verduleria' },
          { item: 'Huevos', cantidad: '6', rubro: 'almacen' },
        ],
      },
    ],
  }, 7, MOMENTOS);

  assertEquals(r.menu.length, 1);
  assertEquals(r.menu[0].titulo, 'Tortilla de acelga');
  assertEquals(r.menu[0].tiempo_min, 30);
  assertEquals(r.menu[0].ingredientes?.length, 2);
  assertEquals(r.resumen, 'Semana con mucha verdura de primavera.');
});

Deno.test('descarta fechas que no existen', () => {
  const r = sanearMenu({
    menu: [
      { fecha: '2026-02-31', momento: 'cena', titulo: 'Imposible' },
      { fecha: '2026-13-01', momento: 'cena', titulo: 'Mes 13' },
      { fecha: 'mañana', momento: 'cena', titulo: 'Sin formato' },
      { fecha: '2026-09-28', momento: 'cena', titulo: 'Válida' },
    ],
  }, 7, MOMENTOS);

  assertEquals(r.menu.length, 1);
  assertEquals(r.menu[0].titulo, 'Válida');
});

Deno.test('descarta momentos inventados', () => {
  const r = sanearMenu({
    menu: [
      { fecha: '2026-09-28', momento: 'merienda', titulo: 'No pedida' },
      { fecha: '2026-09-28', momento: 'desayuno', titulo: 'Tampoco' },
      { fecha: '2026-09-28', momento: 'CENA', titulo: 'En mayúscula, vale' },
    ],
  }, 7, MOMENTOS);

  assertEquals(r.menu.length, 1);
  assertEquals(r.menu[0].momento, 'cena');
});

Deno.test('respeta los momentos que se pidieron', () => {
  // Si solo se pidio la cena, un almuerzo no entra.
  const r = sanearMenu({
    menu: [
      { fecha: '2026-09-28', momento: 'almuerzo', titulo: 'No pedido' },
      { fecha: '2026-09-28', momento: 'cena', titulo: 'Sí' },
    ],
  }, 7, ['cena']);

  assertEquals(r.menu.length, 1);
  assertEquals(r.menu[0].titulo, 'Sí');
});

Deno.test('una sola comida por fecha y momento', () => {
  // ag_menu tiene unique (hogar_id, fecha, momento): un duplicado reventaria.
  const r = sanearMenu({
    menu: [
      { fecha: '2026-09-28', momento: 'cena', titulo: 'Primera' },
      { fecha: '2026-09-28', momento: 'cena', titulo: 'Repetida' },
    ],
  }, 7, MOMENTOS);

  assertEquals(r.menu.length, 1);
  assertEquals(r.menu[0].titulo, 'Primera');
});

Deno.test('los rubros desconocidos caen en otros', () => {
  const r = sanearMenu({
    menu: [{
      fecha: '2026-09-28',
      momento: 'cena',
      titulo: 'Algo',
      ingredientes: [
        { item: 'Pollo', rubro: 'CARNICERIA' },
        { item: 'Curry', rubro: 'especias raras' },
        { item: 'Sal' },
      ],
    }],
  }, 7, MOMENTOS);

  assertEquals(r.menu[0].ingredientes?.map((i) => i.rubro), [
    'carniceria',
    'otros',
    'otros',
  ]);
});

Deno.test('descarta ingredientes sin nombre y basura', () => {
  const r = sanearMenu({
    menu: [{
      fecha: '2026-09-28',
      momento: 'cena',
      titulo: 'Algo',
      ingredientes: [
        { item: '   ' },
        null,
        'texto suelto',
        { cantidad: '2' },
        { item: 'Zapallo', cantidad: '1' },
      ],
    }],
  }, 7, MOMENTOS);

  assertEquals(r.menu[0].ingredientes?.length, 1);
  assertEquals(r.menu[0].ingredientes?.[0].item, 'Zapallo');
});

Deno.test('los tiempos absurdos se descartan', () => {
  const casos: [unknown, number | undefined] = [0, undefined];
  for (const [entrada, esperado] of [
    [0, undefined],
    [-10, undefined],
    [9999, undefined],
    ['no sé', undefined],
    [null, undefined],
    [45, 45],
    [30.7, 31],
  ] as [unknown, number | undefined][]) {
    const r = sanearMenu({
      menu: [{ fecha: '2026-09-28', momento: 'cena', titulo: 'X', tiempo_min: entrada }],
    }, 7, MOMENTOS);
    assertEquals(r.menu[0].tiempo_min, esperado, `tiempo_min: ${entrada}`);
  }
  assertEquals(casos.length, 2); // el array de arriba es solo para tipar
});

Deno.test('ordena por fecha y deja el almuerzo antes de la cena', () => {
  const r = sanearMenu({
    menu: [
      { fecha: '2026-09-29', momento: 'cena', titulo: 'D' },
      { fecha: '2026-09-28', momento: 'cena', titulo: 'B' },
      { fecha: '2026-09-29', momento: 'almuerzo', titulo: 'C' },
      { fecha: '2026-09-28', momento: 'almuerzo', titulo: 'A' },
    ],
  }, 7, MOMENTOS);

  assertEquals(r.menu.map((m) => m.titulo), ['A', 'B', 'C', 'D']);
});

Deno.test('corta si el modelo devuelve mas comidas que los dias pedidos', () => {
  const filas = [];
  for (let d = 1; d <= 20; d++) {
    filas.push({
      fecha: `2026-09-${String(d).padStart(2, '0')}`,
      momento: 'cena',
      titulo: `Día ${d}`,
    });
  }
  const r = sanearMenu({ menu: filas }, 3, ['cena']);
  assertEquals(r.menu.length, 3);
});

Deno.test('aguanta cualquier basura sin explotar', () => {
  for (const basura of [null, undefined, 42, 'hola', [], { menu: 'no es lista' }, { menu: [null, 7] }]) {
    const r = sanearMenu(basura, 7, MOMENTOS);
    assertEquals(r.menu.length, 0);
    assertEquals(typeof r.resumen, 'string');
  }
});

Deno.test('recorta los textos largos', () => {
  const r = sanearMenu({
    resumen: 'r'.repeat(5000),
    menu: [{
      fecha: '2026-09-28',
      momento: 'cena',
      titulo: 't'.repeat(500),
      nota: 'n'.repeat(1000),
      etiquetas: Array(20).fill('etiqueta'),
    }],
  }, 7, MOMENTOS);

  assertEquals(r.resumen.length, 1000);
  assertEquals(r.menu[0].titulo.length, 140);
  assertEquals(r.menu[0].nota?.length, 300);
  assertEquals(r.menu[0].etiquetas?.length, 6);
});

// ---------------------------------------------------------------------------
//  extraerJson
// ---------------------------------------------------------------------------

Deno.test('extraerJson lee un JSON pelado', () => {
  assertEquals(extraerJson('{"a":1}'), { a: 1 });
});

Deno.test('extraerJson le saca el bloque de markdown', () => {
  assertEquals(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
  assertEquals(extraerJson('```\n{"a":1}\n```'), { a: 1 });
});

Deno.test('extraerJson ignora la charla de alrededor', () => {
  assertEquals(
    extraerJson('Claro, acá va el menú:\n{"menu":[]}\n¡Buen provecho!'),
    { menu: [] },
  );
});

Deno.test('extraerJson no se confunde con llaves dentro de un texto', () => {
  const texto = 'blabla {"nota":"usar la llave } del final","ok":true} fin';
  assertEquals(extraerJson(texto), { nota: 'usar la llave } del final', ok: true });
});

Deno.test('extraerJson aguanta comillas escapadas', () => {
  const texto = '{"titulo":"Tarta \\"de la abuela\\"","n":1}';
  assertEquals(extraerJson(texto), { titulo: 'Tarta "de la abuela"', n: 1 });
});

Deno.test('extraerJson devuelve null si no hay JSON', () => {
  assertEquals(extraerJson('no hay nada acá'), null);
  assertEquals(extraerJson(''), null);
  assertEquals(extraerJson('{ roto: '), null);
});

Deno.test('extraerJson toma el objeto mas externo, completo', () => {
  const r = extraerJson<{ a: { b: number } }>('texto {"a":{"b":2}} mas texto');
  assert(r !== null);
  assertEquals(r.a.b, 2);
});
