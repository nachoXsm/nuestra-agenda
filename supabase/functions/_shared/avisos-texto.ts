// ============================================================================
//  Cómo se redacta un aviso de juntos.
//
//  Esta es la parte que hace que valga la pena tener notificaciones propias en
//  vez de las del calendario. Un calendario avisa una vez por evento, siempre
//  con la misma forma: "Natación, 19:00". Cinco cosas, cinco pings. Y avisa
//  igual cuando no hay nada que decidir.
//
//  Acá el criterio es otro:
//
//   1. UN aviso por momento, no uno por cosa. Lo que llega es el día, no un
//      renglón de una agenda.
//   2. El título dice lo que ROZA, no lo que hay. "Natación 19 y no hay cena"
//      es accionable; "3 eventos hoy" no.
//   3. Si no hay nada, no se manda nada. El silencio también informa, y un
//      aviso diario que a veces dice "no tenés nada" se vuelve ruido y se
//      apaga a la semana.
//
//  Es todo función pura: entra el día ya resuelto, sale el texto. Por eso se
//  puede probar sin base, sin red y sin celular.
// ============================================================================

export interface ActividadAviso {
  titulo: string;
  hora: string | null; // "19:00", o null si es de todo el día
  persona: string | null;
  tarde: boolean; // arranca 17:00 o después
}

export interface TareaAviso {
  titulo: string;
  persona: string | null;
  atrasada: boolean;
}

export interface DiaAviso {
  fecha: string;
  actividades: ActividadAviso[];
  tareas: TareaAviso[];
  /** Qué se decidió comer. null en el momento que no está resuelto. */
  almuerzo: string | null;
  cena: string | null;
  faltanCompras: number;
}

export interface Aviso {
  titulo: string;
  cuerpo: string;
  /** A qué sección lleva al tocarla. */
  ir: string;
  acciones: { accion: string; titulo: string }[];
  etiqueta: string;
}

const y = (partes: string[]): string =>
  partes.length <= 1
    ? (partes[0] ?? '')
    : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;

const plural = (n: number, uno: string, varios: string) =>
  `${n} ${n === 1 ? uno : varios}`;

function conHora(a: ActividadAviso): string {
  return a.hora ? `${a.hora} ${a.titulo}` : a.titulo;
}

/**
 * El aviso de la mañana. Devuelve null si no hay nada que valga interrumpir.
 */
export function avisoDelDia(dia: DiaAviso): Aviso | null {
  const { actividades, tareas } = dia;
  const atrasadas = tareas.filter((t) => t.atrasada);
  const delDia = tareas.filter((t) => !t.atrasada);

  if (!actividades.length && !tareas.length) return null;

  // --- el título: lo primero que roza ---------------------------------------
  let titulo: string;

  if (atrasadas.length) {
    // Lo vencido manda: es lo único que ya salió mal.
    titulo = atrasadas.length === 1
      ? `Se pasó: ${atrasadas[0].titulo}`
      : `Se pasaron ${plural(atrasadas.length, 'tarea', 'tareas')}`;
  } else if (actividades.length) {
    const primera = actividades[0];
    const resto = actividades.length - 1;
    titulo = resto > 0
      ? `${conHora(primera)} y ${plural(resto, 'cosa más', 'cosas más')}`
      : conHora(primera);
  } else {
    titulo = delDia.length === 1
      ? delDia[0].titulo
      : `${plural(delDia.length, 'tarea', 'tareas')} para hoy`;
  }

  // --- el cuerpo: el resto, y el roce de la noche ----------------------------
  const lineas: string[] = [];

  if (actividades.length > 1 || (atrasadas.length && actividades.length)) {
    lineas.push(actividades.map(conHora).join(' · '));
  }
  if (delDia.length && (atrasadas.length || actividades.length)) {
    lineas.push(`Para hacer: ${y(delDia.map((t) => t.titulo))}`);
  }
  if (atrasadas.length > 1) {
    lineas.push(`Vencidas: ${y(atrasadas.map((t) => t.titulo))}`);
  }

  // Lo que ningún calendario sabe: que hay algo a la tarde Y que no hay cena
  // pensada es un problema de hoy, no de dos cosas separadas.
  const hayTarde = actividades.some((a) => a.tarde);
  if (hayTarde && !dia.cena) {
    lineas.push('Se hace tarde y no hay cena pensada.');
  } else if (!dia.cena && !dia.almuerzo && !actividades.length) {
    lineas.push('Tampoco hay nada decidido para comer.');
  }

  return {
    titulo,
    cuerpo: lineas.join('\n') || 'Tocá para ver el día.',
    // Si el día no tiene más que tareas, abrir en Inicio obliga a buscarlas.
    ir: !actividades.length && tareas.length ? 'tareas' : 'inicio',
    acciones: [
      { accion: 'agenda', titulo: 'Ver el día' },
      ...(tareas.length ? [{ accion: 'tareas', titulo: 'Tareas' }] : []),
    ],
    etiqueta: `diario-${dia.fecha}`,
  };
}

/**
 * El aviso de los lunes. Este sí se manda aunque la semana esté vacía: que
 * esté vacía es justamente la noticia.
 */
export function avisoDeLaSemana(
  dias: DiaAviso[],
  nombresDia: string[],
): Aviso | null {
  const actividades = dias.flatMap((d) =>
    d.actividades.map((a) => ({ ...a, fecha: d.fecha }))
  );
  const tareas = dias.flatMap((d) => d.tareas);

  const partes: string[] = [];
  if (actividades.length) {
    partes.push(plural(actividades.length, 'cosa', 'cosas'));
  }
  if (tareas.length) partes.push(plural(tareas.length, 'tarea', 'tareas'));

  const titulo = partes.length
    ? `La semana: ${y(partes)}`
    : 'La semana viene despejada';

  const lineas: string[] = [];
  for (const d of dias) {
    if (!d.actividades.length) continue;
    const i = new Date(`${d.fecha}T12:00:00Z`).getUTCDay();
    lineas.push(`${nombresDia[i]}: ${d.actividades.map(conHora).join(' · ')}`);
  }
  if (tareas.length) {
    lineas.push(`Tareas: ${y(tareas.map((t) => t.titulo))}`);
  }
  if (!lineas.length) {
    lineas.push('Nada anotado. Buen momento para planear algo.');
  }

  return {
    titulo,
    cuerpo: lineas.join('\n'),
    ir: 'agenda',
    acciones: [
      { accion: 'agenda', titulo: 'Ver la semana' },
      { accion: 'comidas', titulo: 'Armar el menú' },
    ],
    etiqueta: `semanal-${dias[0]?.fecha ?? ''}`,
  };
}
