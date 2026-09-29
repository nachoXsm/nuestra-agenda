// ============================================================================
//  Convierte los SVG de icons/ en los PNG que pide el manifest.
//
//  No hace falta ningún conversor instalado: usa el Chromium que ya está para
//  las pruebas, que es el mismo motor que después va a dibujar la app.
//
//    node pruebas/iconos-png.mjs
// ============================================================================
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

const TRABAJOS = [
  ['icono.svg', 'icon-192.png', 192],
  ['icono.svg', 'icon-512.png', 512],
  ['icono-maskable.svg', 'icon-maskable-512.png', 512],
];

function chromiumDelSistema() {
  const ruta = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
  return existsSync(ruta) ? ruta : undefined;
}

const navegador = await chromium.launch({ executablePath: chromiumDelSistema() });

for (const [origen, destino, lado] of TRABAJOS) {
  const svg = await readFile(join(RAIZ, 'icons', origen), 'utf8');
  const pagina = await navegador.newPage({
    viewport: { width: lado, height: lado },
    deviceScaleFactor: 1,
  });
  await pagina.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;overflow:hidden}
     svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`,
  );
  await pagina.screenshot({ path: join(RAIZ, 'icons', destino), omitBackground: true });
  await pagina.close();
  console.log(`  icons/${destino}  (${lado}×${lado})`);
}

await navegador.close();
