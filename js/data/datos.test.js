// ============================================================================
//  Pruebas de los datos: estacionalidad y recetario.
//
//  Un recetario escrito a mano junta errores de tipeo (un rubro que no existe,
//  un mes 13) que no se ven hasta que la lista de compras sale vacía o la app
//  revienta. Esto los caza en el momento.
// ============================================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  clasificar,
  SIN_TEMPORADA,
  esDeTemporada,
  ESTACIONES,
  estacionDe,
  listaTemporada,
  proporcionDeTemporada,
  temporadaDe,
  TODO_EL_AÑO,
} from './temporada.js';
import { buscarRecetas, etiquetas, receta, RECETAS, recetasDelMes, RUBROS } from './recetas.js';

// ---------------------------------------------------------------------------
//  Estacionalidad
// ---------------------------------------------------------------------------

Deno.test('las estaciones son las del hemisferio sur', () => {
  assertEquals(estacionDe(1), 'verano');
  assertEquals(estacionDe(7), 'invierno');
  assertEquals(estacionDe(10), 'primavera');
  assertEquals(estacionDe(4), 'otoño');
  // Los 12 meses tienen estación, y ninguno tiene dos.
  const cubiertos = Object.values(ESTACIONES).flat().sort((a, b) => a - b);
  assertEquals(cubiertos, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

Deno.test('los 12 meses traen verduras y frutas', () => {
  for (let m = 1; m <= 12; m++) {
    const t = temporadaDe(m);
    assertEquals(t.mes, m);
    assert(t.mes_nombre, `el mes ${m} no tiene nombre`);
    assert(t.verduras.length >= 8, `el mes ${m} tiene pocas verduras`);
    assert(t.frutas.length >= 4, `el mes ${m} tiene pocas frutas`);
    assert(t.y_tambien.length > 0);
    assert(['verano', 'otoño', 'invierno', 'primavera'].includes(t.estacion));
  }
});

Deno.test('un mes fuera de rango no rompe nada', () => {
  assert(temporadaDe(0).verduras.length > 0);
  assert(temporadaDe(13).verduras.length > 0);
  assert(temporadaDe(undefined).verduras.length > 0);
});

Deno.test('las listas no tienen repetidos', () => {
  for (let m = 1; m <= 12; m++) {
    const t = temporadaDe(m);
    assertEquals(
      new Set(t.verduras).size,
      t.verduras.length,
      `verduras repetidas en el mes ${m}`,
    );
    assertEquals(
      new Set(t.frutas).size,
      t.frutas.length,
      `frutas repetidas en el mes ${m}`,
    );
  }
});

Deno.test('el tomate es de verano y no de invierno', () => {
  assert(esDeTemporada('tomate', 1), 'en enero sí');
  assert(esDeTemporada('tomate', 12), 'en diciembre sí');
  assert(!esDeTemporada('tomate', 7), 'en julio no');
});

Deno.test('los cítricos son de invierno y no de verano', () => {
  assert(esDeTemporada('naranja', 7));
  assert(esDeTemporada('mandarina', 6));
  assert(!esDeTemporada('naranja', 1));
});

Deno.test('la frutilla es de primavera', () => {
  assert(esDeTemporada('frutilla', 10));
  assert(!esDeTemporada('frutilla', 4));
});

Deno.test('esDeTemporada aguanta plurales, acentos y mayúsculas', () => {
  assert(esDeTemporada('Tomates', 1), 'plural y mayúscula');
  assert(esDeTemporada('MORRONES', 1), 'plural en -es sin acento');
  assert(esDeTemporada('morrón', 1), 'con acento');
  assert(esDeTemporada('Zapallitos', 12));
  assert(esDeTemporada('brócoli', 6));
  assert(esDeTemporada('brocoli', 6), 'sin acento también');
});

Deno.test('esDeTemporada encuentra el ingrediente con palabras de más', () => {
  assert(esDeTemporada('zapallo anco en cubos', 5));
  assert(esDeTemporada('zapallo', 5));
});

Deno.test('lo de todo el año está de temporada siempre', () => {
  for (const item of TODO_EL_AÑO) {
    for (const mes of [1, 4, 7, 10]) {
      assert(esDeTemporada(item, mes), `${item} debería estar siempre (mes ${mes})`);
    }
  }
});

Deno.test('esDeTemporada dice no a lo que no está y no rompe con basura', () => {
  assert(!esDeTemporada('trufa blanca', 7));
  assert(!esDeTemporada('', 7));
  assert(!esDeTemporada(null, 7));
  assert(!esDeTemporada('   ', 7));
});

Deno.test('clasificar separa temporada, fuera de temporada y despensa', () => {
  assertEquals(clasificar('tomate', 1), 'temporada');
  assertEquals(clasificar('tomate', 7), 'fuera');
  assertEquals(clasificar('cebolla', 7), 'temporada', 'verdura de todo el año');
  assertEquals(clasificar('aceite de oliva', 7), 'despensa');
  assertEquals(clasificar('arroz', 7), 'despensa');
  assertEquals(clasificar('queso rallado', 7), 'despensa');
  assertEquals(clasificar('', 7), 'despensa');
});

Deno.test('nada sin temporada queda marcado como fuera de temporada', () => {
  // Si algo de despensa cayera en 'fuera', la app le pondría un cartel de
  // "fuera de temporada" al aceite.
  for (const item of SIN_TEMPORADA) {
    for (const mes of [1, 4, 7, 10]) {
      const c = clasificar(item, mes);
      assert(c !== 'fuera', `${item} quedó como fuera de temporada en el mes ${mes}`);
    }
  }
});

Deno.test('proporcionDeTemporada mide solo la fruta y la verdura', () => {
  const ings = [
    { item: 'tomate' }, // enero sí
    { item: 'choclo' }, // enero sí
    { item: 'naranja' }, // enero no
    { item: 'cebolla' }, // todo el año
  ];
  assertEquals(proporcionDeTemporada(ings, 1), 0.75);

  // El aceite y el arroz no cambian la cuenta.
  assertEquals(
    proporcionDeTemporada([...ings, { item: 'aceite de oliva' }, { item: 'arroz' }], 1),
    0.75,
  );

  // Sin nada que medir, null (no 0: no es que esté todo fuera de temporada).
  assertEquals(proporcionDeTemporada([], 1), null);
  assertEquals(proporcionDeTemporada(null, 1), null);
  assertEquals(proporcionDeTemporada([{ item: 'arroz' }, { item: 'sal' }], 1), null);

  // Acepta también una lista de textos.
  assertEquals(proporcionDeTemporada(['tomate', 'naranja'], 1), 0.5);
});

Deno.test('listaTemporada junta verduras y frutas', () => {
  const t = temporadaDe(3);
  assertEquals(listaTemporada(3).length, t.verduras.length + t.frutas.length);
});

// ---------------------------------------------------------------------------
//  Recetario
// ---------------------------------------------------------------------------

Deno.test('el recetario tiene un tamaño razonable', () => {
  assert(RECETAS.length >= 30, `solo ${RECETAS.length} recetas`);
});

Deno.test('cada receta está bien formada', () => {
  for (const r of RECETAS) {
    assert(r.id, 'falta id');
    assert(/^[a-z0-9-]+$/.test(r.id), `id raro: ${r.id}`);
    assert(r.nombre, `${r.id}: falta nombre`);
    assert(r.pasos && r.pasos.length > 30, `${r.id}: los pasos están muy flacos`);
    assert(r.momentos.length > 0, `${r.id}: sin momento`);
    for (const m of r.momentos) {
      assert(['almuerzo', 'cena'].includes(m), `${r.id}: momento raro "${m}"`);
    }
    assert(
      Number.isInteger(r.tiempo_min) && r.tiempo_min > 0 && r.tiempo_min <= 240,
      `${r.id}: tiempo raro (${r.tiempo_min})`,
    );
    assert(Array.isArray(r.etiquetas), `${r.id}: etiquetas`);
    assert(r.ingredientes.length >= 3, `${r.id}: muy pocos ingredientes`);
  }
});

Deno.test('los ids no se repiten', () => {
  const ids = RECETAS.map((r) => r.id);
  assertEquals(new Set(ids).size, ids.length, 'hay ids repetidos');
});

Deno.test('los meses de cada receta son válidos', () => {
  for (const r of RECETAS) {
    assert(Array.isArray(r.meses), `${r.id}: meses tiene que ser lista`);
    for (const m of r.meses) {
      assert(
        Number.isInteger(m) && m >= 1 && m <= 12,
        `${r.id}: mes inválido ${m}`,
      );
    }
    assertEquals(new Set(r.meses).size, r.meses.length, `${r.id}: meses repetidos`);
  }
});

Deno.test('todos los rubros de los ingredientes existen', () => {
  // Si un rubro está mal escrito, ese ingrediente desaparece de la lista de
  // compras agrupada y nadie se da cuenta hasta el supermercado.
  for (const r of RECETAS) {
    for (const ing of r.ingredientes) {
      assert(ing.item && ing.item.trim(), `${r.id}: ingrediente sin nombre`);
      assert(
        Object.hasOwn(RUBROS, ing.rubro),
        `${r.id}: rubro desconocido "${ing.rubro}" en "${ing.item}"`,
      );
    }
  }
});

Deno.test('cada mes del año tiene recetas para elegir', () => {
  for (let m = 1; m <= 12; m++) {
    const delMes = recetasDelMes(m);
    assert(delMes.length >= 10, `el mes ${m} tiene solo ${delMes.length} recetas`);
    // Y para cada momento.
    for (const momento of ['almuerzo', 'cena']) {
      const n = recetasDelMes(m, { momento }).length;
      assert(n >= 5, `mes ${m}, ${momento}: solo ${n} opciones`);
    }
  }
});

Deno.test('cada mes tiene algo rápido, para los días complicados', () => {
  for (let m = 1; m <= 12; m++) {
    const rapidas = recetasDelMes(m, { maxMin: 30 });
    assert(rapidas.length >= 4, `el mes ${m} tiene solo ${rapidas.length} recetas de 30 min`);
  }
});

Deno.test('cada mes tiene opciones sin carne', () => {
  for (let m = 1; m <= 12; m++) {
    const sinCarne = recetasDelMes(m).filter((r) =>
      r.etiquetas.includes('vegetariano') || r.etiquetas.includes('vegano')
    );
    assert(sinCarne.length >= 3, `el mes ${m} tiene solo ${sinCarne.length} sin carne`);
  }
});

Deno.test('las recetas de temporada usan de verdad lo que hay ese mes', () => {
  // Una receta atada a ciertos meses debería apoyarse en lo de esos meses. Si no,
  // o los meses están mal puestos o los ingredientes no son de estación.
  for (const r of RECETAS) {
    if (!r.meses.length) continue;
    const mes = r.meses[Math.floor(r.meses.length / 2)];
    const p = proporcionDeTemporada(r.ingredientes, mes);
    assert(
      p !== null && p >= 0.6,
      `${r.id}: en el mes ${mes} solo ${Math.round(p * 100)}% de los ` +
        `ingredientes son de temporada`,
    );
  }
});

Deno.test('receta() busca por id', () => {
  assertEquals(receta(RECETAS[0].id)?.nombre, RECETAS[0].nombre);
  assertEquals(receta('no-existe'), null);
});

Deno.test('buscarRecetas encuentra por nombre, etiqueta e ingrediente', () => {
  assert(buscarRecetas('lentejas').length >= 2, 'por ingrediente y nombre');
  assert(buscarRecetas('vegano').length >= 3, 'por etiqueta');
  assert(buscarRecetas('LENTEJAS').length >= 2, 'sin importar mayúsculas');
  assertEquals(buscarRecetas('').length, RECETAS.length, 'vacío devuelve todo');
  assertEquals(buscarRecetas('xyzqw').length, 0);
});

Deno.test('etiquetas() devuelve la lista sin repetir y ordenada', () => {
  const e = etiquetas();
  assertEquals(new Set(e).size, e.length);
  assertEquals([...e].sort(), e);
  assert(e.includes('vegetariano'));
});

Deno.test('los rubros tienen nombre, emoji y orden único', () => {
  const ordenes = Object.values(RUBROS).map((r) => r.orden);
  assertEquals(new Set(ordenes).size, ordenes.length, 'órdenes repetidos');
  for (const [clave, r] of Object.entries(RUBROS)) {
    assert(r.nombre, `${clave}: falta nombre`);
    assert(r.emoji, `${clave}: falta emoji`);
  }
});
