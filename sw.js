// ============================================================================
//  Service worker: que la app abra sin conexión.
//
//  Dos estrategias, según qué se pide:
//
//   - El HTML, el CSS y el JS van por RED PRIMERO. Son el código de la app y
//     cambian en cada deploy: si fueran cache primero, una versión vieja
//     quedaría servida para siempre y habría que bumpear la versión a mano cada
//     vez. Se guarda copia igual, para cuando no hay señal.
//
//   - Los iconos y las fuentes van por CACHE PRIMERO: son lo más pesado y su
//     nombre cambia cuando cambia el contenido (ver pruebas/iconos-png.mjs),
//     así que una copia guardada nunca queda vieja.
//
//  Lo que NUNCA se cachea son los pedidos a Supabase: la agenda compartida
//  tiene que estar al día, y una respuesta vieja acá sería peor que un error.
// ============================================================================

const VERSION = 'v4';
const CACHE = `nuestra-agenda-${VERSION}`;

// Lo mínimo para que la app abra sin red. Los PNG del lanzador NO van acá: el
// teléfono se queda con su propia copia al instalar la app y adentro nunca se
// muestran, así que precargarlos era peso al pedo. El trébol sí, que es el que
// se ve en la cabecera.
const PRECARGA = [
  './',
  'index.html',
  'css/app.css',
  'js/main.js',
  'icons/trebol.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // De a uno con catch: si un archivo falla (por ejemplo, durante un deploy
      // a medio terminar) no puede tumbar toda la instalación.
      .then((c) => Promise.all(PRECARGA.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) =>
        Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim()),
  );
});

// ¿Es un archivo de la app (código) o un recurso estático?
function esCodigo(url) {
  return /\.(html|css|js|webmanifest)$/.test(url.pathname) ||
    url.pathname.endsWith('/');
}

function esEstatico(url) {
  return /\.(png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Supabase (datos, auth, funciones) siempre a la red. Nada de datos viejos.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) {
    return;
  }

  const propio = url.origin === self.location.origin;
  const fuenteOCdn = /fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/
    .test(url.hostname);

  if (!propio && !fuenteOCdn) return;

  // --- código: red primero --------------------------------------------------
  if (propio && esCodigo(url)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request)
            // Sin red y sin copia de esa ruta: se sirve el index, que es la app
            // entera y sabe pintar el resto.
            .then((c) => c || caches.match('index.html') || caches.match('./'))
        ),
    );
    return;
  }

  // --- estáticos y CDN: cache primero ---------------------------------------
  if (esEstatico(url) || fuenteOCdn) {
    e.respondWith(
      caches.match(e.request).then((guardado) => {
        if (guardado) return guardado;
        return fetch(e.request).then((res) => {
          // Una respuesta opaca (CDN sin CORS) se cachea igual: se puede servir
          // aunque no se pueda leer su contenido desde acá.
          if (res && (res.ok || res.type === 'opaque')) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copia));
          }
          return res;
        }).catch(() => guardado ?? Response.error());
      }),
    );
  }
});
