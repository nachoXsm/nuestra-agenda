// ============================================================================
//  Los colores de los integrantes.
//
//  Del manual: cinco tintes apagados, todos del mismo registro que el pino y
//  la terracota de la marca. No son colores para destacar sino para
//  identificar: sirven para saber de quién es algo de un vistazo, sin gritar.
//
//  Se guarda SOLO el tinte en la base. El fondo suave de cada integrante se
//  saca del tinte en el CSS con color-mix, para que en el tema oscuro salga
//  oscuro en vez de un pastel que encandila.
// ============================================================================

export const TINTES = [
  '#4F7A63', // salvia oscura
  '#2C5A66', // petróleo
  '#C4674A', // terracota
  '#B88A2E', // ocre
  '#7A5670', // ciruela
  '#6E7B3F', // oliva
  '#8A5A3C', // tierra
];

/** El tinte que le toca al que entra en la posición n. */
export function tintePorOrden(n) {
  return TINTES[n % TINTES.length];
}

/** El tinte de una persona, con respaldo por si la fila no tiene color. */
export function tinte(persona) {
  return persona?.color || TINTES[0];
}

/**
 * Las iniciales para el avatar: una letra, o dos si el nombre tiene apellido.
 * Intl.Segmenter para no partir al medio un emoji o una letra compuesta.
 */
export function iniciales(nombre) {
  const palabras = String(nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return '?';
  const letra = (p) => {
    try {
      const seg = new Intl.Segmenter('es', { granularity: 'grapheme' });
      return [...seg.segment(p)][0]?.segment ?? p[0];
    } catch {
      return p[0];
    }
  };
  const uno = letra(palabras[0]);
  const dos = palabras.length > 1 ? letra(palabras[1]) : '';
  return (uno + dos).toUpperCase();
}
