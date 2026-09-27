// ===========================================================================
//  ics-proxy — TODO EN UN ARCHIVO, para pegar en el editor de Supabase.
//
//  ARCHIVO GENERADO. No lo edites acá: los cambios se pierden.
//  El código de verdad está en supabase/functions/ics-proxy/index.ts y en
//  supabase/functions/_shared/. Después de tocar cualquiera de los dos:
//
//      node supabase/armar-funciones.mjs
//
//  Es el mismo código, con los archivos de _shared pegados adelante. No pasó
//  por ningún bundler, así que los tipos y los comentarios están intactos.
// ===========================================================================

// ─── _shared/cors.ts ─────────────────────────────────────────────────────

// CORS comun a todas las funciones.
//
// ORIGENES_OK se define con el secreto ORIGENES_PERMITIDOS (lista separada por
// comas) para no dejar la API abierta a cualquier sitio. Si no esta cargado se
// permite todo, que es lo practico mientras se prueba en local.
const ORIGENES_OK = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function cors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? '';
  const permitido = ORIGENES_OK.length === 0
    ? '*'
    : (ORIGENES_OK.includes(origen) ? origen : ORIGENES_OK[0]);

  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(
  req: Request,
  cuerpo: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(req) });
  }
  return null;
}

// ─── _shared/url-segura.ts ───────────────────────────────────────────────

// ============================================================================
//  Validacion de URLs para el proxy de calendarios.
//
//  Una funcion que baja cualquier URL que le pasen es un agujero de SSRF: desde
//  adentro de la infra de Supabase, http://169.254.169.254/ y compania pueden
//  devolver credenciales. Asi que antes de bajar nada:
//    1. solo http/https (webcal:// se traduce, que es lo que publican muchos
//       calendarios),
//    2. se rechazan los nombres y las IPs de redes internas,
//    3. se resuelve el DNS y se revisa la IP de verdad, para que un dominio
//       publico que apunta a 127.0.0.1 no pase igual,
//    4. los redirects se siguen a mano, revalidando cada salto.
// ============================================================================

const HOSTS_PROHIBIDOS = [
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
];

const SUFIJOS_PROHIBIDOS = ['.local', '.internal', '.localhost', '.home.arpa'];

function ipv4Privada(ip: string): boolean {
  const partes = ip.split('.').map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // si no se entiende, no se confia
  }
  const [a, b] = partes;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // privada
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local: metadata de la nube
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 168) return true; // privada
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 y documentacion
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast y reservadas
  return false;
}

function ipv6Privada(ip: string): boolean {
  const n = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (n === '::' || n === '::1') return true; // sin especificar / loopback
  if (n.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(n)) return true; // unique local fc00::/7
  if (n.startsWith('::ffff:')) {
    // IPv4 mapeada en IPv6
    const v4 = n.slice(7);
    return /^\d+\.\d+\.\d+\.\d+$/.test(v4) ? ipv4Privada(v4) : true;
  }
  return false;
}

function esIpLiteral(host: string): 'v4' | 'v6' | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 'v4';
  if (host.includes(':')) return 'v6';
  return null;
}

export interface Veredicto {
  ok: boolean;
  url?: URL;
  motivo?: string;
}

export async function validarUrlPublica(entrada: string): Promise<Veredicto> {
  let url: URL;
  try {
    // Muchos calendarios se publican como webcal://, que es http(s) disfrazado.
    const normalizada = entrada.trim().replace(/^webcal:\/\//i, 'https://');
    url = new URL(normalizada);
  } catch {
    return { ok: false, motivo: 'Esa no parece una dirección válida' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, motivo: `No se puede usar ${url.protocol} acá, solo http o https` };
  }

  const host = url.hostname.toLowerCase();

  if (!host) return { ok: false, motivo: 'La dirección no tiene servidor' };
  if (HOSTS_PROHIBIDOS.includes(host)) {
    return { ok: false, motivo: 'Esa dirección es interna, no se puede leer desde acá' };
  }
  if (SUFIJOS_PROHIBIDOS.some((s) => host.endsWith(s))) {
    return { ok: false, motivo: 'Esa dirección es de una red interna' };
  }

  const tipo = esIpLiteral(host);
  if (tipo === 'v4' && ipv4Privada(host)) {
    return { ok: false, motivo: 'Esa IP es de una red privada' };
  }
  if (tipo === 'v6' && ipv6Privada(host)) {
    return { ok: false, motivo: 'Esa IP es de una red privada' };
  }

  // Un dominio publico puede apuntar igual a una IP interna, asi que se
  // resuelve y se revisa. Si el entorno no permite resolver DNS, no se corta:
  // los filtros de arriba ya tapan los casos conocidos.
  if (!tipo && typeof Deno.resolveDns === 'function') {
    try {
      const v4 = await Deno.resolveDns(host, 'A').catch(() => [] as string[]);
      const v6 = await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]);

      if (v4.length || v6.length) {
        if (v4.some(ipv4Privada) || v6.some(ipv6Privada)) {
          return { ok: false, motivo: 'Ese dominio resuelve a una dirección interna' };
        }
      }
    } catch {
      // Sin permiso para resolver: seguimos con lo que ya validamos.
    }
  }

  return { ok: true, url };
}

// Baja el contenido siguiendo los redirects a mano, revalidando cada salto y
// cortando por tamaño y por tiempo.
export async function bajarTextoSeguro(entrada: string, opciones?: {
  maxBytes?: number;
  timeoutMs?: number;
  maxSaltos?: number;
}): Promise<{ ok: true; texto: string; urlFinal: string } | { ok: false; motivo: string }> {
  const maxBytes = opciones?.maxBytes ?? 4 * 1024 * 1024; // 4 MB
  const timeoutMs = opciones?.timeoutMs ?? 20_000;
  const maxSaltos = opciones?.maxSaltos ?? 4;

  let actual = entrada;

  for (let salto = 0; salto <= maxSaltos; salto++) {
    const v = await validarUrlPublica(actual);
    if (!v.ok) return { ok: false, motivo: v.motivo! };

    const abort = new AbortController();
    const reloj = setTimeout(() => abort.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(v.url!.toString(), {
        // Manual: un 302 hacia 127.0.0.1 no se sigue solo, se revalida.
        redirect: 'manual',
        signal: abort.signal,
        headers: {
          'Accept': 'text/calendar, text/plain, */*',
          'User-Agent': 'NuestraAgenda/1.0 (+calendar import)',
        },
      });
    } catch (e) {
      clearTimeout(reloj);
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        motivo: abort.signal.aborted
          ? 'El calendario tardó demasiado en responder'
          : `No se pudo conectar: ${msg}`,
      };
    }
    clearTimeout(reloj);

    if (res.status >= 300 && res.status < 400) {
      const destino = res.headers.get('location');
      if (!destino) return { ok: false, motivo: 'El servidor redirigió a ninguna parte' };
      actual = new URL(destino, v.url!).toString();
      continue;
    }

    if (!res.ok) {
      return {
        ok: false,
        motivo: res.status === 404
          ? 'Esa dirección no existe (404). Revisá el link del calendario.'
          : `El servidor del calendario respondió ${res.status}`,
      };
    }

    // Lectura en trozos para poder cortar si el archivo es enorme.
    const cuerpo = res.body;
    if (!cuerpo) return { ok: false, motivo: 'El calendario vino vacío' };

    const lector = cuerpo.getReader();
    const trozos: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await lector.cancel();
          return {
            ok: false,
            motivo: `El calendario pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB`,
          };
        }
        trozos.push(value);
      }
    } catch (e) {
      return {
        ok: false,
        motivo: `Se cortó la descarga: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const t of trozos) {
      buffer.set(t, offset);
      offset += t.byteLength;
    }

    return {
      ok: true,
      texto: new TextDecoder('utf-8').decode(buffer),
      urlFinal: v.url!.toString(),
    };
  }

  return { ok: false, motivo: 'Demasiados redirects, el calendario da vueltas en círculo' };
}

// ─── ics-proxy/index.ts ──────────────────────────────────────────────────

// ============================================================================
//  ics-proxy — baja un calendario .ics de una URL y devuelve el texto.
//
//  ¿Por qué hace falta? El navegador no puede pedirle un .ics al servidor del
//  colegio: casi ninguno manda cabeceras CORS, así que el fetch se cae. Esta
//  función lo baja del lado del servidor y se lo pasa a la app.
//
//  Requiere JWT (verify_jwt queda en true, el default), así solo lo usan los
//  usuarios de la app y no queda un proxy abierto para cualquiera.
//  El parseo del .ics pasa en el navegador: acá solo se transporta el texto.
// ============================================================================

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return json(req, { error: 'Usá POST' }, 405);
  }

  let url = '';
  try {
    const cuerpo = await req.json();
    url = String(cuerpo?.url ?? '');
  } catch {
    return json(req, { error: 'El cuerpo tiene que ser JSON con { url }' }, 400);
  }

  if (!url.trim()) {
    return json(req, { error: 'Falta la dirección del calendario' }, 400);
  }

  const r = await bajarTextoSeguro(url, { maxBytes: 4 * 1024 * 1024, timeoutMs: 20_000 });
  if (!r.ok) {
    return json(req, { error: r.motivo }, 400);
  }

  // Chequeo mínimo de que sea un calendario y no la página de login del colegio.
  if (!/BEGIN:VCALENDAR/i.test(r.texto)) {
    return json(req, {
      error: 'Eso no es un calendario. Suele pasar cuando el link pide login: ' +
        'buscá la opción "suscribirse" o "exportar .ics" y usá ese link.',
    }, 422);
  }

  return json(req, { ics: r.texto, url_final: r.urlFinal, bytes: r.texto.length });
});
