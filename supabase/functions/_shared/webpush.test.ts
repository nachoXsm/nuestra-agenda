// ============================================================================
//  Prueba del cifrado de Web Push contra el vector del RFC 8291 §5.
//
//  Esto importa más que la mayoría de las pruebas: un cuerpo mal cifrado no da
//  error en ningún lado. El servicio de push lo acepta, devuelve 201, y el
//  celular simplemente no muestra nada. Sin esta prueba, la única forma de
//  enterarse sería que a alguien no le llegue un aviso y lo note.
// ============================================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  aB64Url,
  cabeceraVapid,
  cifrar,
  deB64Url,
  generarClavesVapid,
} from './webpush.ts';

// Los valores tal cual salen del RFC.
const RFC = {
  texto: 'When I grow up, I want to be a watermelon',
  uaPublica: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivada: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPublica: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  esperado:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

/** Rearma el par efímero del ejemplo, para poder comparar byte por byte. */
async function parDelRfc(): Promise<CryptoKeyPair> {
  const pub = deB64Url(RFC.asPublica);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: RFC.asPrivada,
    x: aB64Url(pub.slice(1, 33)),
    y: aB64Url(pub.slice(33, 65)),
    ext: true,
  };
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publicKey = await crypto.subtle.importKey(
    'raw',
    pub as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
  return { privateKey, publicKey };
}

Deno.test('el cifrado da exactamente lo que dice el RFC 8291', async () => {
  const cuerpo = await cifrar(
    { endpoint: 'https://x/y', p256dh: RFC.uaPublica, auth: RFC.auth },
    RFC.texto,
    await parDelRfc(),
    deB64Url(RFC.sal),
  );
  assertEquals(aB64Url(cuerpo), RFC.esperado);
});

Deno.test('la cabecera del cuerpo cifrado tiene la forma del RFC 8188', async () => {
  const cuerpo = await cifrar(
    { endpoint: 'https://x/y', p256dh: RFC.uaPublica, auth: RFC.auth },
    RFC.texto,
  );
  // 16 de sal, 4 de tamaño de registro, 1 de largo del id, 65 del id.
  assertEquals(cuerpo.slice(0, 16).length, 16);
  assertEquals(new DataView(cuerpo.buffer, cuerpo.byteOffset + 16, 4).getUint32(0), 4096);
  assertEquals(cuerpo[20], 65);
  // El id es un punto sin comprimir: arranca con 0x04.
  assertEquals(cuerpo[21], 4);
});

Deno.test('dos envíos del mismo texto no dan el mismo cuerpo', async () => {
  const sus = { endpoint: 'https://x/y', p256dh: RFC.uaPublica, auth: RFC.auth };
  const a = aB64Url(await cifrar(sus, RFC.texto));
  const b = aB64Url(await cifrar(sus, RFC.texto));
  assert(a !== b, 'la sal y la clave efímera tienen que ser nuevas en cada envío');
});

Deno.test('las claves VAPID salen con el largo que corresponde', async () => {
  const c = await generarClavesVapid();
  // Punto sin comprimir: 65 bytes. Escalar privado: 32.
  assertEquals(deB64Url(c.publica).length, 65);
  assertEquals(deB64Url(c.publica)[0], 4);
  assertEquals(deB64Url(c.privada).length, 32);
});

Deno.test('la cabecera VAPID es un JWT ES256 que se verifica con su pública', async () => {
  const claves = await generarClavesVapid();
  const cabecera = await cabeceraVapid(
    claves,
    'https://fcm.googleapis.com',
    'mailto:hola@ejemplo.com',
  );

  assert(cabecera.startsWith('vapid t='), cabecera);
  const t = cabecera.slice('vapid t='.length, cabecera.indexOf(', k='));
  const k = cabecera.slice(cabecera.indexOf(', k=') + 4);
  assertEquals(k, claves.publica, 'la k tiene que ser la clave pública');

  const [enc, cuerpo, firma] = t.split('.');
  assertEquals(JSON.parse(new TextDecoder().decode(deB64Url(enc))).alg, 'ES256');

  const datos = JSON.parse(new TextDecoder().decode(deB64Url(cuerpo)));
  assertEquals(datos.aud, 'https://fcm.googleapis.com');
  assertEquals(datos.sub, 'mailto:hola@ejemplo.com');
  assert(datos.exp > Date.now() / 1000, 'no puede venir vencido');
  assert(datos.exp < Date.now() / 1000 + 24 * 3600, 'más de 24 h lo rechazan');

  // Y la firma verifica de verdad con la pública que viaja al lado.
  const pub = deB64Url(claves.publica);
  const llave = await crypto.subtle.importKey(
    'raw',
    pub as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  assert(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      llave,
      deB64Url(firma) as BufferSource,
      new TextEncoder().encode(`${enc}.${cuerpo}`) as BufferSource,
    ),
    'la firma tiene que verificar',
  );
});
