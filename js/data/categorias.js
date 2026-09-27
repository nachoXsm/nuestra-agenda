// Las categorías de evento. El color sale de las variables CSS (--cat-*), así
// el tema claro y el oscuro no se escriben dos veces.
export const CATEGORIAS = {
  familia: { nombre: 'Familia', emoji: '🏠', color: 'var(--cat-familia)' },
  hijo: { nombre: 'De los chicos', emoji: '🧒', color: 'var(--cat-hijo)' },
  colegio: { nombre: 'Colegio', emoji: '🎒', color: 'var(--cat-colegio)' },
  salud: { nombre: 'Salud', emoji: '🩺', color: 'var(--cat-salud)' },
  pareja: { nombre: 'Nosotros', emoji: '❤️', color: 'var(--cat-pareja)' },
  trabajo: { nombre: 'Trabajo', emoji: '💼', color: 'var(--cat-trabajo)' },
  cumple: { nombre: 'Cumpleaños', emoji: '🎂', color: 'var(--cat-cumple)' },
  tramite: { nombre: 'Trámite', emoji: '📄', color: 'var(--cat-tramite)' },
  otro: { nombre: 'Otro', emoji: '📌', color: 'var(--cat-otro)' },
};

export function categoria(clave) {
  return CATEGORIAS[clave] ?? CATEGORIAS.otro;
}

export const REPETICIONES = [
  ['no', 'No se repite'],
  ['diario', 'Todos los días'],
  ['semanal', 'Cada semana'],
  ['quincenal', 'Cada 15 días'],
  ['mensual', 'Cada mes'],
  ['anual', 'Cada año'],
];

export const AVISOS = [
  ['', 'Sin aviso'],
  ['10', '10 minutos antes'],
  ['30', 'Media hora antes'],
  ['60', '1 hora antes'],
  ['120', '2 horas antes'],
  ['1440', 'El día anterior'],
  ['2880', 'Dos días antes'],
];
