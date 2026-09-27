// ===========================================================================
//  chef-ia — TODO EN UN ARCHIVO, para pegar en el editor de Supabase.
//
//  ARCHIVO GENERADO. No lo edites acá: los cambios se pierden.
//  El código de verdad está en supabase/functions/chef-ia/index.ts y en
//  supabase/functions/_shared/. Después de tocar cualquiera de los dos:
//
//      node supabase/armar-funciones.mjs
//
//  Es el mismo código, con los archivos de _shared pegados adelante. No pasó
//  por ningún bundler, así que los tipos y los comentarios están intactos.
// ===========================================================================

// ─── _shared/groq.ts ─────────────────────────────────────────────────────

// Cliente de Groq con cadena de modelos de respaldo.
//
// Groq da de baja modelos cada tanto y los limites de uso son POR MODELO, asi
// que ante un 429 o un "model_not_found" se pasa al siguiente en vez de fallar.
// La lista vigente esta en console.groq.com -> Models.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MODELOS = [
  'openai/gpt-oss-120b', // el mas capaz de produccion
  'openai/gpt-oss-20b', // respaldo mas rapido
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant', // ultimo recurso
];

export interface Mensaje {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RespuestaGroq {
  ok: boolean;
  texto?: string;
  modelo?: string;
  error?: string;
}

// Un error es recuperable cuando tiene sentido reintentar con otro modelo:
// el modelo ya no existe, o ese modelo puntual esta saturado o sin cupo.
function esRecuperable(status: number, cuerpo: string): boolean {
  if (status === 429 || status === 503) return true;
  return /model_not_found|does not exist|decommissioned|not supported|rate limit|too many requests|quota|capacity|over capacity|service unavailable/i
    .test(cuerpo);
}

export async function groqChat(opciones: {
  mensajes: Mensaje[];
  maxTokens?: number;
  temperatura?: number;
  json?: boolean;
  timeoutMs?: number;
}): Promise<RespuestaGroq> {
  const clave = Deno.env.get('GROQ_KEY');
  if (!clave) {
    return { ok: false, error: 'Falta el secreto GROQ_KEY en la función' };
  }

  let ultimoError = 'No se pudo contactar a ningún modelo';

  for (const modelo of MODELOS) {
    const abort = new AbortController();
    const reloj = setTimeout(() => abort.abort(), opciones.timeoutMs ?? 45_000);

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          'Authorization': `Bearer ${clave}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelo,
          messages: opciones.mensajes,
          max_tokens: opciones.maxTokens ?? 1200,
          temperature: opciones.temperatura ?? 0.7,
          ...(opciones.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const texto = data?.choices?.[0]?.message?.content ?? '';
        if (!texto.trim()) {
          ultimoError = `El modelo ${modelo} respondió vacío`;
          continue;
        }
        return { ok: true, texto, modelo };
      }

      const cuerpo = await res.text();
      ultimoError = `${res.status}: ${cuerpo.slice(0, 400)}`;
      if (!esRecuperable(res.status, cuerpo)) {
        return { ok: false, error: ultimoError };
      }
    } catch (e) {
      // Un timeout o un corte de red si vale reintentar con el siguiente modelo.
      ultimoError = e instanceof Error ? e.message : String(e);
    } finally {
      clearTimeout(reloj);
    }
  }

  return { ok: false, error: ultimoError };
}

// Los modelos a veces envuelven el JSON en ```json ... ``` o le cuelgan una
// frase antes. Esto rescata el primer objeto JSON valido que encuentre.
export function extraerJson<T = unknown>(texto: string): T | null {
  const limpio = texto
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    return JSON.parse(limpio) as T;
  } catch { /* seguimos probando */ }

  // Busqueda del objeto balanceado mas externo, respetando las comillas.
  const inicio = limpio.indexOf('{');
  if (inicio === -1) return null;

  let nivel = 0;
  let enTexto = false;
  let escapado = false;

  for (let i = inicio; i < limpio.length; i++) {
    const c = limpio[i];

    if (enTexto) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') enTexto = false;
      continue;
    }

    if (c === '"') enTexto = true;
    else if (c === '{') nivel++;
    else if (c === '}') {
      nivel--;
      if (nivel === 0) {
        try {
          return JSON.parse(limpio.slice(inicio, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

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

// ─── _shared/menu-sanear.ts ──────────────────────────────────────────────

// ============================================================================
//  Saneado del menu que devuelve el modelo.
//
//  El modelo casi siempre responde bien, pero "casi siempre" no alcanza cuando
//  lo que sigue es escribir en la base y mostrarselo a alguien. Aca se descarta
//  todo lo que no tenga forma de comida: fechas invalidas, momentos inventados,
//  dos comidas para el mismo dia y momento, rubros que no existen en la lista de
//  compras, tiempos absurdos, textos kilometricos.
//
//  Vive en un modulo aparte para poder probarlo (ver menu-sanear.test.ts).
// ============================================================================

export interface ItemMenu {
  fecha: string;
  momento: string;
  titulo: string;
  tiempo_min?: number;
  etiquetas?: string[];
  nota?: string;
  ingredientes?: { item: string; cantidad?: string; rubro?: string }[];
}

export interface MenuSaneado {
  resumen: string;
  menu: ItemMenu[];
}

// Tienen que coincidir con los rubros que entiende la lista de compras.
const RUBROS_OK = new Set([
  'verduleria',
  'carniceria',
  'pescaderia',
  'almacen',
  'panaderia',
  'fiambreria',
  'dietetica',
  'otros',
]);

// Una fecha tiene que existir de verdad: el 31 de febrero no pasa.
function fechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a &&
    fecha.getUTCMonth() === m - 1 &&
    fecha.getUTCDate() === d;
}

export function sanearMenu(
  crudo: unknown,
  dias: number,
  momentos: string[],
): MenuSaneado {
  const obj = (crudo ?? {}) as Record<string, unknown>;
  const filas = Array.isArray(obj.menu) ? obj.menu : [];
  const validos = new Set(momentos);
  const vistos = new Set<string>();
  const menu: ItemMenu[] = [];

  for (const f of filas) {
    if (!f || typeof f !== 'object') continue;
    const d = f as Record<string, unknown>;

    const fecha = String(d.fecha ?? '').slice(0, 10);
    const momento = String(d.momento ?? '').toLowerCase().trim();
    const titulo = String(d.titulo ?? '').trim();

    if (!fechaValida(fecha)) continue;
    if (!validos.has(momento)) continue;
    if (!titulo) continue;

    // Una sola comida por fecha y momento: la tabla ag_menu tiene esa clave
    // unica, un duplicado reventaria el insert.
    const clave = `${fecha}|${momento}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const ingredientes = (Array.isArray(d.ingredientes) ? d.ingredientes : [])
      .map((i) => {
        if (!i || typeof i !== 'object') return null;
        const it = i as Record<string, unknown>;
        const item = String(it.item ?? '').trim();
        if (!item) return null;
        const rubro = String(it.rubro ?? '').toLowerCase().trim();
        return {
          item: item.slice(0, 120),
          cantidad: String(it.cantidad ?? '').trim().slice(0, 60),
          rubro: RUBROS_OK.has(rubro) ? rubro : 'otros',
        };
      })
      .filter((x): x is { item: string; cantidad: string; rubro: string } => x !== null)
      .slice(0, 25);

    const tiempo = Number(d.tiempo_min);

    menu.push({
      fecha,
      momento,
      titulo: titulo.slice(0, 140),
      tiempo_min: Number.isFinite(tiempo) && tiempo > 0 && tiempo < 600
        ? Math.round(tiempo)
        : undefined,
      etiquetas: (Array.isArray(d.etiquetas) ? d.etiquetas : [])
        .map((e) => String(e).trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 6),
      nota: String(d.nota ?? '').trim().slice(0, 300) || undefined,
      ingredientes,
    });
  }

  menu.sort((a, b) =>
    a.fecha === b.fecha
      ? (a.momento === 'almuerzo' ? -1 : 1)
      : (a.fecha < b.fecha ? -1 : 1)
  );

  return {
    resumen: String(obj.resumen ?? '').trim().slice(0, 1000),
    // Tope duro: si el modelo se entusiasma, no se guardan 90 comidas.
    menu: menu.slice(0, dias * Math.max(momentos.length, 1)),
  };
}

// ─── chef-ia/index.ts ────────────────────────────────────────────────────

// ============================================================================
//  chef-ia — el agente que recomienda comidas de temporada en Buenos Aires.
//
//  Dos modos:
//    modo: 'chat'  -> conversacion libre ("¿qué hago con lo que tengo?")
//    modo: 'menu'  -> devuelve un menu semanal completo en JSON, listo para
//                     cargar en el planificador
//
//  Lo que hace la diferencia: recibe la AGENDA de la semana. Si el martes hay
//  natacion a las 19, ese dia propone algo de 20 minutos y no un guiso de tres
//  horas. Y recibe la lista de frutas y verduras que realmente estan en
//  temporada, asi no inventa tomates en julio.
//
//  Fuente unica de la estacionalidad: js/data/temporada.js en el frontend. Se
//  manda como contexto en cada pedido para no tener la tabla duplicada.
// ============================================================================

interface Temporada {
  estacion?: string;
  mes_nombre?: string;
  verduras?: string[];
  frutas?: string[];
  y_tambien?: string[];
}

interface Preferencias {
  restricciones?: string[];
  no_gusta?: string[];
  presupuesto?: string;
  tiempo_cocina?: string;
  porciones?: number;
  notas?: string;
}

interface DiaAgenda {
  fecha: string;
  etiqueta?: string;
  compromisos?: string[];
}

interface Contexto {
  hoy?: string;
  temporada?: Temporada;
  preferencias?: Preferencias;
  personas?: string[];
  agenda?: DiaAgenda[];
  menu_actual?: { fecha: string; momento: string; titulo: string }[];
  comidas_recientes?: string[];
  heladera?: string[];
}

interface Pedido {
  modo?: 'chat' | 'menu';
  mensajes?: { rol: string; contenido: string }[];
  contexto?: Contexto;
  // Para modo 'menu'
  desde?: string;
  dias?: number;
  momentos?: ('almuerzo' | 'cena')[];
  instruccion?: string;
}

const ETIQUETAS_RESTRICCION: Record<string, string> = {
  sin_tacc: 'sin gluten (celiaquía) — nada de trigo, avena, cebada ni centeno',
  vegetariano: 'vegetariano — sin carne ni pollo ni pescado',
  vegano: 'vegano — sin ningún producto de origen animal',
  sin_lactosa: 'sin lactosa',
  sin_frutos_secos: 'sin frutos secos',
  bajo_sodio: 'bajo en sodio',
  sin_cerdo: 'sin cerdo',
  sin_pescado: 'sin pescado ni mariscos',
};

const ETIQUETAS_TIEMPO: Record<string, string> = {
  rapido: 'hasta 30 minutos de cocina',
  medio: 'hasta 45 minutos de cocina',
  sin_apuro: 'sin límite de tiempo, se puede cocinar tranquilo',
};

const ETIQUETAS_PRESUPUESTO: Record<string, string> = {
  bajo: 'ajustado — priorizar legumbres, huevo, verdura de estación y cortes económicos',
  medio: 'normal',
  alto: 'holgado — se puede incluir pescado, cortes buenos y algún ingrediente caro',
};

function lista(xs?: string[]): string {
  return xs && xs.length ? xs.join(', ') : '—';
}

function bloqueTemporada(t?: Temporada): string {
  if (!t) {
    return `NO se recibió la tabla de estacionalidad. No afirmes qué está de
temporada: preguntá o hablá en términos generales.`;
  }
  return `ESTACIÓN: ${t.estacion ?? '—'} (${t.mes_nombre ?? '—'}) en Buenos Aires.

Verduras en su mejor momento AHORA: ${lista(t.verduras)}
Frutas en su mejor momento AHORA: ${lista(t.frutas)}
Además, buenas todo el año: ${lista(t.y_tambien)}

Esta lista es la verdad. Construí las comidas sobre estos ingredientes.
Si necesitás algo que no está, avisá que está fuera de temporada (más caro y de
menos sabor) y ofrecé el reemplazo de estación.`;
}

function bloquePreferencias(p?: Preferencias, personas?: string[]): string {
  const porciones = p?.porciones ?? (personas?.length || 2);
  const restr = (p?.restricciones ?? [])
    .map((r) => ETIQUETAS_RESTRICCION[r] ?? r);

  return `EL HOGAR
- Comen: ${lista(personas)} (${porciones} porciones)
- Restricciones que NO se pueden violar: ${restr.length ? restr.join('; ') : 'ninguna'}
- No les gusta: ${lista(p?.no_gusta)}
- Presupuesto: ${ETIQUETAS_PRESUPUESTO[p?.presupuesto ?? 'medio'] ?? 'normal'}
- Tiempo para cocinar: ${ETIQUETAS_TIEMPO[p?.tiempo_cocina ?? 'medio'] ?? 'hasta 45 minutos'}${
    p?.notas ? `\n- Nota de la casa: ${p.notas}` : ''
  }`;
}

function bloqueAgenda(agenda?: DiaAgenda[]): string {
  if (!agenda?.length) return '';
  const filas = agenda.map((d) => {
    const c = d.compromisos?.length ? d.compromisos.join(' · ') : 'día tranquilo';
    return `- ${d.etiqueta ?? d.fecha}: ${c}`;
  });
  return `
AGENDA DE LA SEMANA (esto manda sobre cuánto se puede cocinar cada día)
${filas.join('\n')}

Los días con cosas a la tarde o a la noche llevan comida de 20-30 minutos, o algo
que se prepare antes. Los días tranquilos aguantan una receta más larga, o cocinar
de más para que sobre.`;
}

function bloqueHistorial(ctx?: Contexto): string {
  const partes: string[] = [];
  if (ctx?.comidas_recientes?.length) {
    partes.push(`Comieron hace poco (no repitas): ${ctx.comidas_recientes.join(', ')}`);
  }
  if (ctx?.menu_actual?.length) {
    const ya = ctx.menu_actual
      .map((m) => `${m.fecha} ${m.momento}: ${m.titulo}`)
      .join(' | ');
    partes.push(`Ya tienen planificado: ${ya}`);
  }
  if (ctx?.heladera?.length) {
    partes.push(`Tienen en casa y conviene usar: ${ctx.heladera.join(', ')}`);
  }
  return partes.length ? '\n' + partes.join('\n') : '';
}

const VOZ = `Sos el cocinero de la casa: práctico, argentino, sin vueltas.
Hablás en español rioplatense (vos, no tú). Nada de "delicioso platillo" ni de
lenguaje de revista. Los ingredientes con los nombres de acá: zapallito, choclo,
chaucha, morrón, zapallo anco, batata, acelga, palta, durazno, pelón.
Comida real y sana: verdura de estación, legumbres, huevo, cortes accesibles.
Nada de suplementos ni dietas de moda. No inventás datos que no te dieron.`;

function promptChat(ctx?: Contexto): string {
  return `${VOZ}

${bloqueTemporada(ctx?.temporada)}

${bloquePreferencias(ctx?.preferencias, ctx?.personas)}
${bloqueAgenda(ctx?.agenda)}${bloqueHistorial(ctx)}

Respondés corto: 2 o 3 párrafos como máximo, o una lista breve. Si te piden
una receta, das los ingredientes con cantidades para las porciones del hogar y
el paso a paso en pocas líneas. Fecha de hoy: ${ctx?.hoy ?? 'sin dato'}.`;
}

function promptMenu(p: Pedido): string {
  const ctx = p.contexto;
  const momentos = p.momentos?.length ? p.momentos : ['almuerzo', 'cena'];

  return `${VOZ}

Tu tarea: armar el menú de ${p.dias ?? 7} días (${momentos.join(' y ')}),
empezando el ${p.desde ?? 'lunes que viene'}.

${bloqueTemporada(ctx?.temporada)}

${bloquePreferencias(ctx?.preferencias, ctx?.personas)}
${bloqueAgenda(ctx?.agenda)}${bloqueHistorial(ctx)}

REGLAS DEL MENÚ
1. Todo lo fuerte del plato sale de la lista de temporada.
2. Variedad: no repetís el mismo ingrediente principal dos días seguidos, ni la
   misma técnica (no tres cosas al horno seguidas).
3. Equilibrio en la semana: 2 o 3 comidas sin carne, al menos una con legumbre,
   al menos una con pescado si el presupuesto lo permite, y verdura en todas.
4. Respetás los minutos que la agenda deja libres ese día.
5. Si un día conviene cocinar de más para comer al otro día, lo decís en "nota".
6. Las cantidades van para ${ctx?.preferencias?.porciones ?? 3} porciones.
7. El rubro de cada ingrediente es uno de: verduleria, carniceria, pescaderia,
   almacen, panaderia, fiambreria, dietetica, otros.
${p.instruccion ? `8. Pedido especial de la casa: ${p.instruccion}\n` : ''}
Devolvés SOLO un objeto JSON con esta forma exacta, sin texto alrededor:

{
  "resumen": "dos líneas sobre la idea de la semana y qué conviene comprar",
  "menu": [
    {
      "fecha": "YYYY-MM-DD",
      "momento": "almuerzo",
      "titulo": "nombre corto del plato",
      "tiempo_min": 30,
      "etiquetas": ["vegetariano", "de temporada"],
      "nota": "un tip, o vacío",
      "ingredientes": [
        { "item": "zapallo anco", "cantidad": "1 chico", "rubro": "verduleria" }
      ]
    }
  ]
}

Una entrada por cada día y cada momento pedido. Sin comentarios en el JSON.`;
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return json(req, { error: 'Usá POST' }, 405);
  }

  let pedido: Pedido;
  try {
    pedido = await req.json();
  } catch {
    return json(req, { error: 'El cuerpo tiene que ser JSON' }, 400);
  }

  const modo = pedido.modo === 'menu' ? 'menu' : 'chat';

  // -------- modo menu: JSON estructurado -----------------------------------
  if (modo === 'menu') {
    const dias = Math.min(Math.max(Number(pedido.dias) || 7, 1), 14);
    const momentos = (pedido.momentos?.length ? pedido.momentos : ['almuerzo', 'cena'])
      .filter((m) => m === 'almuerzo' || m === 'cena');

    const mensajes: Mensaje[] = [
      { role: 'system', content: promptMenu({ ...pedido, dias, momentos }) },
      { role: 'user', content: 'Armá el menú.' },
    ];

    const r = await groqChat({
      mensajes,
      json: true,
      maxTokens: 6000,
      temperatura: 0.8,
      timeoutMs: 90_000,
    });

    if (!r.ok) return json(req, { error: r.error }, 502);

    const crudo = extraerJson(r.texto!);
    if (!crudo) {
      return json(req, {
        error: 'El modelo no devolvió un JSON que se pueda leer. Probá de nuevo.',
      }, 502);
    }

    const limpio = sanearMenu(crudo, dias, momentos);
    if (!limpio.menu.length) {
      return json(req, {
        error: 'El menú llegó vacío o con fechas inválidas. Probá de nuevo.',
      }, 502);
    }

    return json(req, { ...limpio, modelo: r.modelo });
  }

  // -------- modo chat -------------------------------------------------------
  const historial: Mensaje[] = (pedido.mensajes ?? [])
    .filter((m) => m && typeof m.contenido === 'string' && m.contenido.trim())
    // Solo los ultimos turnos: alcanza para el contexto y no infla el pedido.
    .slice(-12)
    .map((m) => ({
      role: m.rol === 'assistant' ? 'assistant' : 'user',
      content: m.contenido.slice(0, 4000),
    }));

  if (!historial.length) {
    return json(req, { error: 'No mandaste ningún mensaje' }, 400);
  }

  const r = await groqChat({
    mensajes: [
      { role: 'system', content: promptChat(pedido.contexto) },
      ...historial,
    ],
    maxTokens: 1400,
    temperatura: 0.7,
  });

  if (!r.ok) return json(req, { error: r.error }, 502);

  return json(req, { respuesta: r.texto, modelo: r.modelo });
});
