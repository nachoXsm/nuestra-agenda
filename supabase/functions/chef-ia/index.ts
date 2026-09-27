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
import { groqChat, extraerJson, type Mensaje } from '../_shared/groq.ts';
import { json, preflight } from '../_shared/cors.ts';
import { sanearMenu } from '../_shared/menu-sanear.ts';

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
