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
