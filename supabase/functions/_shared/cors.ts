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
