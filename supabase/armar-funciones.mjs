// ===========================================================================
//  Arma una versión de cada Edge Function en UN SOLO ARCHIVO.
//
//  ¿Para qué? Para poder subirlas desde el navegador. Cada función importa
//  cosas de _shared/, así que copiarlas a mano es crear la función, crear la
//  carpeta _shared adentro y pegar dos o tres archivos más: nueve pegadas.
//  Con esto es una por función.
//
//  No usa un bundler. Un bundler saca los tipos y los comentarios, y el
//  archivo que alguien va a pegar en un editor web es el que más conviene que
//  se pueda leer. Esto solamente pega los archivos en orden de dependencia y
//  saca las líneas de import locales, así que lo que sale es el mismo código,
//  con sus tipos y sus comentarios.
//
//    node supabase/armar-funciones.mjs            genera
//    node supabase/armar-funciones.mjs --revisar  falla si quedó desactualizado
//
//  Lo segundo lo corre el workflow de pruebas, para que el archivo generado no
//  se quede viejo cuando alguien toque el original.
// ===========================================================================
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url));
const RAIZ = resolve(AQUI, '..');
const SALIDA = join(AQUI, 'funciones-para-pegar');
const FUNCIONES = ['chef-ia', 'ics-proxy', 'ics-feed', 'avisos'];

// Una línea de import de un archivo nuestro. Las de jsr:/npm:/https: no se
// tocan: esas Deno las resuelve sola y tienen que quedar.
const IMPORT_LOCAL = /^\s*import\s+[^;]*?\bfrom\s+['"](\.[^'"]+)['"]\s*;?\s*$/gm;

/**
 * Recorre los imports locales de un archivo, en profundidad, y devuelve la
 * lista de archivos en orden: primero las dependencias, después quien las usa.
 */
async function enOrdenDeDependencia(entrada, vistos = new Set(), salida = []) {
  const ruta = resolve(entrada);
  if (vistos.has(ruta)) return salida;
  vistos.add(ruta);

  const texto = await readFile(ruta, 'utf8');

  for (const m of texto.matchAll(IMPORT_LOCAL)) {
    const dep = resolve(dirname(ruta), m[1]);
    await enOrdenDeDependencia(dep, vistos, salida);
  }

  salida.push({ ruta, texto });
  return salida;
}

/** Saca los imports locales y deja el resto tal cual. */
function sinImportsLocales(texto) {
  return texto.replace(IMPORT_LOCAL, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Nombres declarados en el nivel de arriba de un archivo.
 *
 * Solo el nivel de arriba, que es justo donde el pegado los junta a todos en
 * el mismo alcance. Por eso el regex ancla al principio de línea: lo que está
 * indentado vive adentro de otra cosa y no choca con nada.
 */
const DECLARACION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;

function declaradosArriba(texto) {
  return [...texto.matchAll(DECLARACION)].map((m) => m[1]);
}

/**
 * Dos archivos que declaran el mismo nombre.
 *
 * Esto es lo único que el pegado puede romper y que en el código original no
 * se ve: cada archivo por separado compila bien, y el de un solo pegue tira
 * "Identifier has already been declared" apenas Supabase lo carga. Pasó con
 * sumarDias, que estaba en fechas.js y también en la función de avisos.
 */
function choques(archivos) {
  const donde = new Map();
  for (const { ruta, texto } of archivos) {
    for (const nombre of declaradosArriba(sinImportsLocales(texto))) {
      if (!donde.has(nombre)) donde.set(nombre, []);
      const lista = donde.get(nombre);
      if (!lista.includes(ruta)) lista.push(ruta);
    }
  }
  return [...donde].filter(([, rutas]) => rutas.length > 1);
}

function encabezado(nombre) {
  return `// ===========================================================================
//  ${nombre} — TODO EN UN ARCHIVO, para pegar en el editor de Supabase.
//
//  ARCHIVO GENERADO. No lo edites acá: los cambios se pierden.
//  El código de verdad está en supabase/functions/${nombre}/index.ts y en
//  supabase/functions/_shared/. Después de tocar cualquiera de los dos:
//
//      node supabase/armar-funciones.mjs
//
//  Es el mismo código, con los archivos de _shared pegados adelante. No pasó
//  por ningún bundler, así que los tipos y los comentarios están intactos.
// ===========================================================================
`;
}

async function armar(nombre) {
  const entrada = join(AQUI, 'functions', nombre, 'index.ts');
  const archivos = await enOrdenDeDependencia(entrada);

  const repetidos = choques(archivos);
  if (repetidos.length) {
    console.error(`\n${nombre}: dos archivos declaran el mismo nombre.`);
    console.error('En un solo archivo eso no compila. Hay que renombrar uno, o');
    console.error('mejor, que uno importe al otro en vez de tener su copia.\n');
    for (const [nombre2, rutas] of repetidos) {
      const cortas = rutas.map((r) => r.slice(RAIZ.length + 1)).join('  y  ');
      console.error(`  ${nombre2}: ${cortas}`);
    }
    process.exit(1);
  }

  const partes = archivos.map(({ ruta, texto }) => {
    const relativa = ruta.slice(join(AQUI, 'functions').length + 1);
    return `// ─── ${relativa} ${'─'.repeat(Math.max(0, 68 - relativa.length))}\n\n` +
      sinImportsLocales(texto);
  });

  return encabezado(nombre) + '\n' + partes.join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------

const revisar = process.argv.includes('--revisar');
const desactualizados = [];

await mkdir(SALIDA, { recursive: true });

for (const nombre of FUNCIONES) {
  const contenido = await armar(nombre);
  const destino = join(SALIDA, `${nombre}.ts`);

  if (revisar) {
    const actual = await readFile(destino, 'utf8').catch(() => null);
    if (actual !== contenido) desactualizados.push(nombre);
  } else {
    await writeFile(destino, contenido);
    console.log(`→ ${nombre}.ts  (${contenido.split('\n').length} líneas)`);
  }
}

// Si alguien borra una función, el archivo generado tiene que irse también.
if (revisar) {
  const sobrantes = (await readdir(SALIDA).catch(() => []))
    .filter((f) => f.endsWith('.ts') && !FUNCIONES.includes(f.replace(/\.ts$/, '')));

  if (desactualizados.length || sobrantes.length) {
    console.error('Los archivos de funciones-para-pegar/ no coinciden con el código.');
    if (desactualizados.length) {
      console.error(`  desactualizados: ${desactualizados.join(', ')}`);
    }
    if (sobrantes.length) console.error(`  sobran: ${sobrantes.join(', ')}`);
    console.error('\nCorré:  node supabase/armar-funciones.mjs');
    process.exit(1);
  }
  console.log('funciones-para-pegar/ está al día.');
} else {
  console.log('\nListas en supabase/funciones-para-pegar/');
}
