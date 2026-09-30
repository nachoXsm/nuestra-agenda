// ============================================================================
//  avisos — las notificaciones propias de juntos.
//
//  Corre cada hora, disparada por pg_cron desde el mismo proyecto. Mira quién
//  pidió que le avisen a esta hora, arma el día (o la semana, si es lunes) y
//  manda UNA notificación por persona, cifrada con Web Push.
//
//  Por qué no alcanzaba con publicar el calendario: ahí los recordatorios los
//  da el calendario del sistema, con su cara y su formato, uno por evento y
//  siempre igual. Esto es de la app: el trébol, el texto escrito para lo que
//  pasa ese día, y botones que llevan a la pantalla que corresponde.
//
//  Cómo no manda dos veces lo mismo: cada fila de ag_push guarda la última
//  fecha en que se le mandó cada tipo de aviso. Si el disparador corre de más
//  —o si alguien lo llama a mano— la segunda vuelta no hace nada.
//
//  OJO: necesita verify_jwt = false. La llama pg_net, que no manda un JWT; lo
//  que la autoriza es el token de ag_avisos_config, que vive en la base y no
//  sale del proyecto.
// ============================================================================
// Fechas: las mismas del frontend, no una copia. Redeclararlas acá rompía el
// archivo de un solo pegue, donde fechas.js queda arriba en el mismo alcance.
import { diaSemana, ocurrencias, sumarDias } from '../../../js/lib/fechas.js';
import { json, preflight } from '../_shared/cors.ts';
import {
  type ActividadAviso,
  type Aviso,
  avisoDelDia,
  avisoDeLaSemana,
  type DiaAviso,
  type TareaAviso,
} from '../_shared/avisos-texto.ts';
import {
  type ClavesVapid,
  enviarPush,
  generarClavesVapid,
  type Suscripcion,
} from '../_shared/webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ZONA = 'America/Argentina/Buenos_Aires';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

async function rest<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opciones.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Base de datos: ${res.status} ${await res.text()}`);
  return res.status === 204 ? (null as T) : await res.json() as T;
}

// --- fechas, todas en hora de Buenos Aires ----------------------------------

const hoyEn = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);

const horaEn = (d = new Date()) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false })
      .format(d),
  ) % 24;

// --- las claves VAPID, que se generan solas la primera vez -------------------

async function clavesVapid(): Promise<ClavesVapid & { contacto: string }> {
  const filas = await rest<
    { publica: string; privada: string; contacto: string }[]
  >('ag_vapid?select=publica,privada,contacto&limit=1');
  if (filas.length) return filas[0];

  // Nadie las cargó: se generan acá. Así no hay que pegar ninguna clave a mano
  // en ningún lado, que es donde siempre se traba la instalación.
  const nuevas = await generarClavesVapid();
  const guardadas = await rest<{ publica: string; privada: string; contacto: string }[]>(
    'ag_vapid',
    { method: 'POST', body: JSON.stringify({ id: true, ...nuevas }) },
  );
  return guardadas[0];
}

// --- armado del día ---------------------------------------------------------

interface EventoFila {
  id: string;
  titulo: string;
  inicio: string;
  todo_el_dia: boolean;
  persona_id: string | null;
  repite: string;
  repite_dias: number[] | null;
  repite_hasta: string | null;
  ag_ocurrencias?: { fecha: string; estado: string }[];
}

interface TareaFila {
  id: string;
  titulo: string;
  vence: string | null;
  hecha: boolean;
  persona_id: string | null;
}

function partesHora(iso: string): { hora: string; tarde: boolean } {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return { hora: f, tarde: Number(f.slice(0, 2)) >= 17 };
}

/** Junta todo lo que pasa un día, ya resuelto y listo para redactar. */
function armarDia(
  fecha: string,
  eventos: EventoFila[],
  tareas: TareaFila[],
  menu: { fecha: string; momento: string; titulo: string }[],
  personas: Map<string, string>,
  hoy: string,
): DiaAviso {
  const actividades: ActividadAviso[] = [];
  for (const e of eventos) {
    for (const f of ocurrencias(e, fecha, fecha) as string[]) {
      const cancelada = (e.ag_ocurrencias ?? []).some(
        (o) => o.fecha.slice(0, 10) === f && o.estado === 'cancelado',
      );
      const hecha = (e.ag_ocurrencias ?? []).some(
        (o) => o.fecha.slice(0, 10) === f && o.estado === 'hecho',
      );
      if (cancelada || hecha) continue;
      const h = e.todo_el_dia ? null : partesHora(e.inicio);
      actividades.push({
        titulo: e.titulo,
        hora: h?.hora ?? null,
        persona: e.persona_id ? personas.get(e.persona_id) ?? null : null,
        tarde: h?.tarde ?? false,
      });
    }
  }
  actividades.sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''));

  const delDia: TareaAviso[] = tareas
    .filter((t) => !t.hecha && t.vence)
    .filter((t) => {
      const v = t.vence!.slice(0, 10);
      // En el día de hoy entran también las que ya vencieron: siguen siendo
      // trabajo de hoy.
      return v === fecha || (fecha === hoy && v < hoy);
    })
    .map((t) => ({
      titulo: t.titulo,
      persona: t.persona_id ? personas.get(t.persona_id) ?? null : null,
      atrasada: t.vence!.slice(0, 10) < fecha,
    }));

  const comida = (momento: string) =>
    menu.find((m) => m.fecha.slice(0, 10) === fecha && m.momento === momento)?.titulo ??
      null;

  return {
    fecha,
    actividades,
    tareas: delDia,
    almuerzo: comida('almuerzo'),
    cena: comida('cena'),
    faltanCompras: 0,
  };
}

// --- la vuelta --------------------------------------------------------------

interface FilaPush {
  id: string;
  hogar_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  hora: number;
  diario: boolean;
  semanal: boolean;
  ultimo_diario: string | null;
  ultimo_semanal: string | null;
}

interface Vuelta {
  /** Una sola fila: la prueba que se pide desde la app. */
  soloPush?: string;
  /** Limita la vuelta a un hogar: la empuja alguien de esa casa. */
  hogar?: string;
  /**
   * Toma tambien las horas que ya pasaron hoy, no solo la hora en punto.
   * Es para la vuelta que empuja la app: si el disparador no corrio a las 8,
   * quien abre la app a las 11 igual recibe lo de la manana.
   */
  atrasadas?: boolean;
}

async function darLaVuelta({ soloPush, hogar, atrasadas }: Vuelta = {}): Promise<{
  mirados: number;
  enviados: number;
  errores: number;
}> {
  const hoy = hoyEn();
  const hora = horaEn();
  const esLunes = diaSemana(hoy) === 1;

  const filtro = soloPush
    ? `id=eq.${soloPush}`
    : `hora=${atrasadas ? 'lte' : 'eq'}.${hora}&or=(diario.eq.true,semanal.eq.true)` +
      (hogar ? `&hogar_id=eq.${hogar}` : '');
  const suscripciones = await rest<FilaPush[]>(
    `ag_push?${filtro}&select=id,hogar_id,endpoint,p256dh,auth,hora,diario,semanal,` +
      `ultimo_diario,ultimo_semanal&limit=200`,
  );
  if (!suscripciones.length) return { mirados: 0, enviados: 0, errores: 0 };

  const claves = await clavesVapid();
  let enviados = 0;
  let errores = 0;

  // Se agrupa por hogar: los datos son los mismos para todos los de la casa.
  const porHogar = new Map<string, FilaPush[]>();
  for (const s of suscripciones) {
    if (!porHogar.has(s.hogar_id)) porHogar.set(s.hogar_id, []);
    porHogar.get(s.hogar_id)!.push(s);
  }

  for (const [hogarId, suyas] of porHogar) {
    const hasta = sumarDias(hoy, 8);
    const [eventos, tareas, menu, personas] = await Promise.all([
      rest<EventoFila[]>(
        `ag_eventos?hogar_id=eq.${hogarId}&select=id,titulo,inicio,todo_el_dia,` +
          `persona_id,repite,repite_dias,repite_hasta,ag_ocurrencias(fecha,estado)` +
          `&limit=1000`,
      ),
      rest<TareaFila[]>(
        `ag_tareas?hogar_id=eq.${hogarId}&hecha=eq.false` +
          `&select=id,titulo,vence,hecha,persona_id&limit=400`,
      ),
      rest<{ fecha: string; momento: string; titulo: string }[]>(
        `ag_menu?hogar_id=eq.${hogarId}&fecha=gte.${hoy}&fecha=lte.${hasta}` +
          `&select=fecha,momento,titulo&limit=60`,
      ),
      rest<{ id: string; nombre: string }[]>(
        `ag_personas?hogar_id=eq.${hogarId}&select=id,nombre`,
      ),
    ]);
    const nombres = new Map(personas.map((p) => [p.id, p.nombre]));

    const diaDeHoy = armarDia(hoy, eventos, tareas, menu, nombres, hoy);
    const semana = Array.from({ length: 7 }, (_, i) =>
      armarDia(sumarDias(hoy, i), eventos, tareas, menu, nombres, hoy));

    for (const s of suyas) {
      // Forzado (la prueba desde la app) manda el del día sí o sí.
      const forzado = !!soloPush;
      const mandarSemanal = !forzado && s.semanal && esLunes &&
        s.ultimo_semanal !== hoy;
      const mandarDiario = forzado ||
        (s.diario && s.ultimo_diario !== hoy && !mandarSemanal);

      let aviso: Aviso | null = null;
      if (mandarSemanal) aviso = avisoDeLaSemana(semana, DIAS);
      else if (mandarDiario) aviso = avisoDelDia(diaDeHoy);

      if (!aviso) {
        // Nada que decir. Igual se marca el día: sin esto, un día tranquilo
        // se reintenta en cada vuelta de la hora siguiente.
        if (mandarDiario) {
          await rest(`ag_push?id=eq.${s.id}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ ultimo_diario: hoy }),
          });
        }
        continue;
      }

      const sus: Suscripcion = {
        endpoint: s.endpoint,
        p256dh: s.p256dh,
        auth: s.auth,
      };
      const r = await enviarPush(sus, aviso, claves, claves.contacto);

      if (r.vencida) {
        // El navegador se desuscribió o borró la app: si no se saca, se le
        // sigue mandando a un endpoint muerto para siempre.
        await rest(`ag_push?id=eq.${s.id}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
        errores++;
        continue;
      }

      const cambios: Record<string, unknown> = {
        ultimo_error: r.ok ? null : `${r.status} ${r.detalle ?? ''}`.slice(0, 300),
      };
      if (r.ok && !forzado) {
        if (mandarSemanal) cambios.ultimo_semanal = hoy;
        if (mandarDiario) cambios.ultimo_diario = hoy;
      }
      await rest(`ag_push?id=eq.${s.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(cambios),
      });

      if (r.ok) enviados++;
      else errores++;
    }
  }

  return { mirados: suscripciones.length, enviados, errores };
}

// ---------------------------------------------------------------------------

/** Quien esta pidiendo esto, segun SU sesion. null si no hay sesion valida. */
async function quienEs(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const yo = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: auth },
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return yo?.id ?? null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') return json(req, { error: 'Usá POST' }, 405);

  let pedido: { modo?: string; push_id?: string } = {};
  try {
    pedido = await req.json();
  } catch { /* el disparador manda un cuerpo vacío */ }

  // Existe y anda: lo usa "Revisar las funciones".
  if (pedido.modo === 'ping') {
    return json(req, { ok: true, funcion: 'avisos' });
  }

  // La clave pública es pública por definición: con ella el navegador se
  // suscribe, y sin ella no puede.
  if (pedido.modo === 'clave') {
    try {
      const c = await clavesVapid();
      return json(req, { ok: true, clave: c.publica });
    } catch (e) {
      console.error('avisos/clave', e);
      return json(req, { error: 'No se pudieron preparar las claves' }, 500);
    }
  }

  // La prueba la pide una persona desde la app, así que se autoriza con SU
  // sesión. No con el token del disparador: ese no tiene por qué salir nunca
  // de la base, y un token que viaja al navegador es un token filtrado.
  if (pedido.modo === 'prueba') {
    const yo = await quienEs(req);
    if (!yo) return json(req, { error: 'Hay que estar logueado' }, 401);

    // Y solo puede probar SU propio dispositivo.
    const filas = await rest<{ id: string }[]>(
      `ag_push?id=eq.${pedido.push_id ?? ''}&user_id=eq.${yo}&select=id&limit=1`,
    ).catch(() => []);
    if (!filas.length) return json(req, { error: 'Ese aparato no es tuyo' }, 403);

    try {
      const r = await darLaVuelta({ soloPush: pedido.push_id });
      return json(req, { ok: true, ...r });
    } catch (e) {
      console.error('avisos/prueba', e);
      return json(req, { error: String((e as Error)?.message ?? e) }, 500);
    }
  }

  // La red de seguridad: si el proyecto no deja prender pg_cron, la vuelta la
  // empuja quien abre la app. Va con SU sesion y solo alcanza a SU hogar, y
  // toma tambien las horas que ya pasaron hoy, porque nadie la disparo a la
  // hora justa. Mandar dos veces lo mismo no puede: eso lo corta ultimo_diario.
  if (pedido.modo === 'vuelta') {
    const yo = await quienEs(req);
    if (!yo) return json(req, { error: 'Hay que estar logueado' }, 401);

    const casas = await rest<{ hogar_id: string }[]>(
      `ag_personas?user_id=eq.${yo}&select=hogar_id&limit=10`,
    ).catch(() => []);
    if (!casas.length) return json(req, { ok: true, mirados: 0, enviados: 0, errores: 0 });

    try {
      let total = { mirados: 0, enviados: 0, errores: 0 };
      for (const c of casas) {
        const r = await darLaVuelta({ hogar: c.hogar_id, atrasadas: true });
        total = {
          mirados: total.mirados + r.mirados,
          enviados: total.enviados + r.enviados,
          errores: total.errores + r.errores,
        };
      }
      return json(req, { ok: true, ...total });
    } catch (e) {
      console.error('avisos/vuelta', e);
      return json(req, { error: String((e as Error)?.message ?? e) }, 500);
    }
  }

  // La vuelta horaria la dispara pg_cron con el token que vive en la base.
  const token = req.headers.get('x-avisos-token') ?? '';
  const config = await rest<{ token: string }[]>(
    'ag_avisos_config?select=token&limit=1',
  ).catch(() => []);
  if (!config.length || !token || token !== config[0].token) {
    return json(req, { error: 'No autorizado' }, 401);
  }

  try {
    const r = await darLaVuelta();
    return json(req, { ok: true, ...r });
  } catch (e) {
    console.error('avisos', e);
    return json(req, { error: String((e as Error)?.message ?? e) }, 500);
  }
});
