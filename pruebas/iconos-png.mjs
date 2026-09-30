// ============================================================================
//  Convierte los SVG de icons/ en los PNG que pide el manifest.
//
//  No hace falta ningún conversor instalado: usa el Chromium que ya está para
//  las pruebas, que es el mismo motor que después va a dibujar la app.
//
//    node pruebas/iconos-png.mjs
//
//  ---------------------------------------------------------------------------
//  POR QUÉ LOS ARCHIVOS LLEVAN VERSIÓN EN EL NOMBRE
//
//  Android no vuelve a mirar el ícono de una app instalada. Cuando alguien la
//  agrega a la pantalla de inicio, Chrome arma un WebAPK con el ícono de ese
//  momento y después solo revisa si el MANIFEST cambió. Si el archivo se sigue
//  llamando icon-192.png, el manifest queda idéntico aunque adentro haya otro
//  dibujo, y el teléfono se queda con el viejo para siempre.
//
//  Por eso el nombre lleva la versión: al subirla, el manifest cambia, Chrome
//  lo nota y actualiza el ícono solo. Para cambiar el ícono alcanza con subir
//  VERSION acá y correr este script: él se encarga de renombrar, de borrar los
//  PNG viejos y de dejar al día el manifest y el index.html.
// ============================================================================
import { existsSync } from 'node:fs';
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ICONOS = join(RAIZ, 'icons');

// Subir esto cada vez que cambie el dibujo del ícono.
const VERSION = 2;

const TRABAJOS = [
  ['icono.svg', `icon-192-v${VERSION}.png`, 192],
  ['icono.svg', `icon-512-v${VERSION}.png`, 512],
  ['icono-maskable.svg', `icon-maskable-512-v${VERSION}.png`, 512],
];

function chromiumDelSistema() {
  const ruta = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
  return existsSync(ruta) ? ruta : undefined;
}

// --- los PNG ----------------------------------------------------------------

const navegador = await chromium.launch({ executablePath: chromiumDelSistema() });

for (const [origen, destino, lado] of TRABAJOS) {
  const svg = await readFile(join(ICONOS, origen), 'utf8');
  const pagina = await navegador.newPage({
    viewport: { width: lado, height: lado },
    deviceScaleFactor: 1,
  });
  await pagina.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;overflow:hidden}
     svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`,
  );
  await pagina.screenshot({ path: join(ICONOS, destino), omitBackground: true });
  await pagina.close();
  console.log(`  icons/${destino}  (${lado}×${lado})`);
}

await navegador.close();

// --- fuera los de versiones anteriores --------------------------------------

const nuevos = new Set(TRABAJOS.map(([, d]) => d));
for (const f of await readdir(ICONOS)) {
  if (/^icon(-maskable)?-\d+(-v\d+)?\.png$/.test(f) && !nuevos.has(f)) {
    await unlink(join(ICONOS, f));
    console.log(`  (borrado icons/${f})`);
  }
}

// --- y el manifest y el index, al día ---------------------------------------

// Se reemplaza cualquier versión anterior, y también el nombre sin versión que
// usaban las primeras entregas.
const alDia = (texto) => texto
  .replace(/icons\/icon-192(-v\d+)?\.png/g, `icons/icon-192-v${VERSION}.png`)
  .replace(/icons\/icon-512(-v\d+)?\.png/g, `icons/icon-512-v${VERSION}.png`)
  .replace(
    /icons\/icon-maskable-512(-v\d+)?\.png/g,
    `icons/icon-maskable-512-v${VERSION}.png`,
  );

for (const archivo of ['manifest.webmanifest', 'index.html']) {
  const ruta = join(RAIZ, archivo);
  const antes = await readFile(ruta, 'utf8');
  const despues = alDia(antes);
  if (antes !== despues) {
    await writeFile(ruta, despues);
    console.log(`  ${archivo} actualizado`);
  }
}
