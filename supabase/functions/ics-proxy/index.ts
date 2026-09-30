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
import { json, preflight } from '../_shared/cors.ts';
import { bajarTextoSeguro } from '../_shared/url-segura.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return json(req, { error: 'Usá POST' }, 405);
  }

  let url = '';
  try {
    const cuerpo = await req.json();
    // Igual que chef-ia: un modo para saber desde la app si quedó bien subida,
    // sin salir a bajar nada.
    if (cuerpo?.modo === 'ping') {
      return json(req, { ok: true, funcion: 'ics-proxy' });
    }
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
