// ============================================================================
//  Pruebas de cómo queda redactado cada aviso.
//
//  El texto es el producto acá: una notificación que dice "3 eventos" no sirve
//  para nada, y una que interrumpe para decir "no tenés nada" se apaga a la
//  semana. Por eso esto se prueba como se prueba una función, no "a ojo".
// ============================================================================
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  type ActividadAviso,
  avisoDelDia,
  avisoDeLaSemana,
  type DiaAviso,
  type TareaAviso,
} from './avisos-texto.ts';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const act = (e: Partial<ActividadAviso> = {}): ActividadAviso => ({
  titulo: 'Natación',
  hora: '19:00',
  persona: 'Lila',
  tarde: true,
  ...e,
});

const tar = (e: Partial<TareaAviso> = {}): TareaAviso => ({
  titulo: 'Pagar el gas',
  persona: null,
  atrasada: false,
  ...e,
});

const dia = (e: Partial<DiaAviso> = {}): DiaAviso => ({
  fecha: '2026-10-01',
  actividades: [],
  tareas: [],
  almuerzo: null,
  cena: null,
  faltanCompras: 0,
  ...e,
});

Deno.test('un día sin nada no genera aviso', () => {
  assertEquals(avisoDelDia(dia()), null);
});

Deno.test('un día sin nada tampoco avisa aunque falte decidir la comida', () => {
  // Que no haya menú no es motivo para interrumpir a nadie a las 8 de la mañana.
  assertEquals(avisoDelDia(dia({ cena: null, faltanCompras: 5 })), null);
});

Deno.test('el título lleva la primera actividad con su hora', () => {
  const a = avisoDelDia(dia({ actividades: [act()] }))!;
  assertEquals(a.titulo, '19:00 Natación');
});

Deno.test('con varias, el título cuenta las que siguen', () => {
  const a = avisoDelDia(dia({
    actividades: [act({ titulo: 'Yoga', hora: '08:00', tarde: false }), act(), act({ titulo: 'Cine' })],
  }))!;
  assertEquals(a.titulo, '08:00 Yoga y 2 cosas más');
  // Y el cuerpo las tiene todas, que es para lo que uno abre la notificación.
  assertStringIncludes(a.cuerpo, 'Natación');
  assertStringIncludes(a.cuerpo, 'Cine');
});

Deno.test('lo vencido le gana a todo lo demás en el título', () => {
  const a = avisoDelDia(dia({
    actividades: [act()],
    tareas: [tar({ titulo: 'Renovar la obra social', atrasada: true })],
  }))!;
  assertEquals(a.titulo, 'Se pasó: Renovar la obra social');
  // Pero lo de hoy sigue estando en el cuerpo.
  assertStringIncludes(a.cuerpo, 'Natación');
});

Deno.test('dos vencidas se cuentan y se listan', () => {
  const a = avisoDelDia(dia({
    tareas: [
      tar({ titulo: 'Pagar el gas', atrasada: true }),
      tar({ titulo: 'Turno del dentista', atrasada: true }),
    ],
  }))!;
  assertEquals(a.titulo, 'Se pasaron 2 tareas');
  assertStringIncludes(a.cuerpo, 'Pagar el gas');
  assertStringIncludes(a.cuerpo, 'Turno del dentista');
});

Deno.test('un día de solo tareas usa la tarea como título', () => {
  const a = avisoDelDia(dia({ tareas: [tar()] }))!;
  assertEquals(a.titulo, 'Pagar el gas');
  assertEquals(a.ir, 'tareas', 'si es solo tareas, tiene que abrir en Tareas');
});

Deno.test('avisa del roce: algo a la tarde y sin cena pensada', () => {
  const a = avisoDelDia(dia({ actividades: [act({ tarde: true })] }))!;
  assertStringIncludes(a.cuerpo, 'no hay cena pensada');
});

Deno.test('con la cena decidida no molesta con eso', () => {
  const a = avisoDelDia(dia({
    actividades: [act({ tarde: true })],
    cena: 'Wok de verduras',
  }))!;
  assert(!a.cuerpo.includes('cena pensada'), a.cuerpo);
});

Deno.test('si lo del día es temprano, no habla de la cena', () => {
  const a = avisoDelDia(dia({
    actividades: [act({ titulo: 'Yoga', hora: '08:00', tarde: false })],
  }))!;
  assert(!a.cuerpo.includes('cena'), a.cuerpo);
});

Deno.test('el aviso lleva botones que llevan a algún lado', () => {
  const a = avisoDelDia(dia({ actividades: [act()], tareas: [tar()] }))!;
  assertEquals(a.acciones.map((x) => x.accion), ['agenda', 'tareas']);
});

Deno.test('sin tareas no aparece el botón de tareas', () => {
  const a = avisoDelDia(dia({ actividades: [act()] }))!;
  assertEquals(a.acciones.map((x) => x.accion), ['agenda']);
});

// ---------------------------------------------------------------------------
//  El de los lunes
// ---------------------------------------------------------------------------

Deno.test('el resumen semanal cuenta actividades y tareas', () => {
  const a = avisoDeLaSemana([
    dia({ fecha: '2026-10-05', actividades: [act()] }),
    dia({ fecha: '2026-10-07', actividades: [act({ titulo: 'Pediatra', hora: '16:00' })], tareas: [tar()] }),
  ], DIAS)!;
  assertEquals(a.titulo, 'La semana: 2 cosas y 1 tarea');
  assertStringIncludes(a.cuerpo, 'lunes');
  assertStringIncludes(a.cuerpo, 'miércoles');
  assertStringIncludes(a.cuerpo, 'Pediatra');
  assertStringIncludes(a.cuerpo, 'Pagar el gas');
});

Deno.test('una semana vacía sí avisa, porque eso es la noticia', () => {
  const a = avisoDeLaSemana([dia({ fecha: '2026-10-05' })], DIAS)!;
  assertEquals(a.titulo, 'La semana viene despejada');
  assertStringIncludes(a.cuerpo, 'Nada anotado');
});

Deno.test('los días sin nada no ocupan una línea del resumen', () => {
  const a = avisoDeLaSemana([
    dia({ fecha: '2026-10-05' }),
    dia({ fecha: '2026-10-06', actividades: [act()] }),
    dia({ fecha: '2026-10-07' }),
  ], DIAS)!;
  assertEquals(a.cuerpo.split('\n').length, 1, a.cuerpo);
  assertStringIncludes(a.cuerpo, 'martes');
});
