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
const SALIDA = join(AQUI, 'funciones-para-pegar');
const FUNCIONES = ['chef-ia', 'ics-proxy', 'ics-feed'];

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

  const partes = archivos.map(({ ruta, texto }) => {
    const relativa = ruta.slice(join(AQUI, 'functions').length + 1);
    return `// ─── ${relativa} ${'─'.repeat(Math.max(0, 68 - relativa.length))}\n\n` +
      sinImportsLocales(texto);
  });

  return encabezado(nombre) + '\n' + partes.join('\n\n') + '\n';
}

// ---------------------------------------------------------------------------

const revisar = process.argv.includes('--revisar');
let desactualizados = [];

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
