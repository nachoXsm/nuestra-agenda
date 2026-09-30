// ============================================================================
//  Web Push a mano, con Web Crypto. Sin librerías.
//
//  Mandar una notificación push no es "hacer un POST": el contenido va cifrado
//  de punta a punta con las claves del navegador que se suscribió (RFC 8291),
//  y el pedido va firmado con VAPID (RFC 8292) para que el servicio de push
//  sepa quién lo manda. Nada de eso lo hace fetch solo.
//
//  Se escribe acá en vez de traer una librería por dos razones. Una: las
//  librerías de web push son de Node y usan su módulo crypto, que en el
//  runtime de Supabase no está garantizado. La otra: es una dependencia más
//  que se puede pudrir en un proyecto que tiene que seguir andando en tres
//  años, y esto son cien líneas de algoritmo que no va a cambiar.
//
//  La prueba lo corre contra el vector del RFC 8291 §5: mismas claves, misma
//  sal, y el cuerpo cifrado tiene que dar byte por byte lo que dice el
//  documento. Si algo de esto estuviera mal, el celular no mostraría nada y no
//  habría ningún error que lo delate.
// ============================================================================

// --- base64url --------------------------------------------------------------

export function aB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64Url(texto: string): Uint8Array {
  const s = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function pegar(...trozos: Uint8Array[]): Uint8Array {
  const total = trozos.reduce((n, t) => n + t.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const t of trozos) {
    salida.set(t, i);
    i += t.length;
  }
  return salida;
}

// --- HKDF (RFC 5869), que es de lo que está hecho todo lo de abajo -----------

async function hmac(clave: Uint8Array, datos: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    clave as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, datos as BufferSource));
}

/** Una sola vuelta de expand alcanza: nunca se piden más de 32 bytes. */
async function hkdf(
  sal: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  largo: number,
): Promise<Uint8Array> {
  const prk = await hmac(sal, ikm);
  const bloque = await hmac(prk, pegar(info, new Uint8Array([1])));
  return bloque.slice(0, largo);
}

// --- cifrado del contenido (RFC 8291) ---------------------------------------

export interface Suscripcion {
  endpoint: string;
  p256dh: string; // clave pública del navegador, base64url
  auth: string; // secreto de autenticación, base64url
}

/**
 * Cifra el cuerpo de la notificación para una suscripción.
 *
 * Los dos últimos parámetros existen solo para la prueba: en producción la
 * clave efímera y la sal se generan al azar en cada envío, que es justamente
 * lo que hace que el mismo texto no viaje nunca dos veces igual.
 */
export async function cifrar(
  sus: Suscripcion,
  cuerpo: string,
  efimeras?: CryptoKeyPair,
  salFija?: Uint8Array,
): Promise<Uint8Array> {
  const uaPublica = deB64Url(sus.p256dh);
  const authSecreto = deB64Url(sus.auth);

  const par = efimeras ?? await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  ) as CryptoKeyPair;

  const asPublica = new Uint8Array(
    await crypto.subtle.exportKey('raw', par.publicKey),
  );

  const uaImportada = await crypto.subtle.importKey(
    'raw',
    uaPublica as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const compartido = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaImportada },
      par.privateKey,
      256,
    ),
  );

  // El "info" ata el secreto a las dos claves públicas: sin esto, un secreto
  // robado serviría para cualquier par de puntas.
  const infoAuth = pegar(
    utf8('WebPush: info'),
    new Uint8Array([0]),
    uaPublica,
    asPublica,
  );
  const ikm = await hkdf(authSecreto, compartido, infoAuth, 32);

  const sal = salFija ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const llave = await crypto.subtle.importKey(
    'raw',
    cek as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  // El 0x02 marca que este es el último registro. Sin ese byte el navegador
  // descarta el mensaje entero.
  const plano = pegar(utf8(cuerpo), new Uint8Array([2]));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      llave,
      plano as BufferSource,
    ),
  );

  // Cabecera de RFC 8188: sal, tamaño de registro, largo del id, id (que acá
  // es la clave pública efímera), y atrás el contenido cifrado.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return pegar(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

// --- firma VAPID (RFC 8292) -------------------------------------------------

export interface ClavesVapid {
  publica: string; // base64url del punto sin comprimir (65 bytes)
  privada: string; // base64url del escalar (32 bytes)
}

/** Un par de claves nuevo. Se genera una vez y se guarda. */
export async function generarClavesVapid(): Promise<ClavesVapid> {
  const par = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  return { publica: aB64Url(publica), privada: jwk.d! };
}

async function importarPrivada(claves: ClavesVapid): Promise<CryptoKey> {
  const p = deB64Url(claves.publica);
  // El punto sin comprimir es 0x04 || X (32) || Y (32).
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: claves.privada,
    x: aB64Url(p.slice(1, 33)),
    y: aB64Url(p.slice(33, 65)),
    ext: true,
  };
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * El encabezado Authorization del pedido de push.
 * @param audiencia  el origen del servicio de push (https://fcm.googleapis.com)
 * @param contacto   un mailto: o https: para que puedan avisar si algo molesta
 */
export async function cabeceraVapid(
  claves: ClavesVapid,
  audiencia: string,
  contacto: string,
  ahora = Date.now(),
): Promise<string> {
  const encabezado = { typ: 'JWT', alg: 'ES256' };
  const cuerpo = {
    aud: audiencia,
    // Doce horas: el máximo que acepta la especificación es 24.
    exp: Math.floor(ahora / 1000) + 12 * 3600,
    sub: contacto,
  };
  const sinFirma = `${aB64Url(utf8(JSON.stringify(encabezado)))}.${
    aB64Url(utf8(JSON.stringify(cuerpo)))
  }`;

  const firma = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await importarPrivada(claves),
      utf8(sinFirma) as BufferSource,
    ),
  );
  return `vapid t=${sinFirma}.${aB64Url(firma)}, k=${claves.publica}`;
}

// --- envío ------------------------------------------------------------------

export interface Resultado {
  ok: boolean;
  status: number;
  /** true si la suscripción ya no existe y hay que borrarla de la base. */
  vencida: boolean;
  detalle?: string;
}

export async function enviarPush(
  sus: Suscripcion,
  cuerpo: unknown,
  claves: ClavesVapid,
  contacto: string,
): Promise<Resultado> {
  let cifrado: Uint8Array;
  try {
    cifrado = await cifrar(sus, JSON.stringify(cuerpo));
  } catch (e) {
    // Una suscripción con claves rotas no se puede cifrar: no tiene arreglo.
    return { ok: false, status: 0, vencida: true, detalle: String(e) };
  }

  const origen = new URL(sus.endpoint).origin;
  const res = await fetch(sus.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabeceraVapid(claves, origen, contacto),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // Cuánto puede esperar el servicio de push si el celular está apagado.
      TTL: '86400',
      Urgency: 'normal',
    },
    body: cifrado as BufferSource,
  });

  // 404 y 410: el navegador se desuscribió o desinstaló la app. Hay que sacarla
  // de la base o se le sigue mandando a un endpoint muerto para siempre.
  const vencida = res.status === 404 || res.status === 410;
  return {
    ok: res.ok,
    status: res.status,
    vencida,
    detalle: res.ok ? undefined : (await res.text().catch(() => '')).slice(0, 300),
  };
}
