// ============================================================================
//  ics-feed — publica la agenda del hogar como calendario suscribible.
//
//  Esta es la pieza que hace que la app sirva para no olvidarse las cosas. En vez
//  de armar notificaciones push (que piden servidor propio, claves VAPID, y en
//  iPhone no andan si la app no esta instalada como PWA), se publica un .ics y
//  cada uno lo suscribe en el calendario del celular. Desde ahi avisa el sistema
//  operativo, con la confiabilidad del calendario nativo, y se ve mezclado con el
//  resto de los compromisos de cada uno.
//
//    GET /functions/v1/ics-feed?hogar=<uuid>&token=<uuid>
//    GET ...&incluir=menu     -> suma el menu de la semana como eventos del dia
//    GET ...&persona=<uuid>   -> solo lo de esa persona (+ lo de toda la familia)
//
//  El token es el secreto: quien tiene el link ve la agenda. Se rota desde
//  Ajustes (ag_regenerar_feed_token) si se compartio de mas.
//
//  OJO: necesita verify_jwt = false en config.toml. Los clientes de calendario no
//  saben mandar un JWT, asi que la autenticacion es el token del link.
//
//  La logica esta en _shared/feed.ts para poder probarla sin base ni servidor.
// ============================================================================
import { generarFeed, type Consultar } from '../_shared/feed.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// El feed lee con la clave de servicio: RLS no aplica porque no hay usuario
// logueado del otro lado. Lo que autoriza es el token del hogar, que ya se
// verifico antes de llegar a cualquier dato.
const consultar: Consultar = async <T>(ruta: string): Promise<T> => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Base de datos: ${res.status} ${await res.text()}`);
  }
  return await res.json() as T;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    });
  }

  try {
    const r = await generarFeed(new URL(req.url), consultar);
    return new Response(r.cuerpo, { status: r.status, headers: r.headers });
  } catch (e) {
    console.error('ics-feed', e);
    return new Response('No se pudo generar el calendario.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
});
