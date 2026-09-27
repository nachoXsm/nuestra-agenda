// ============================================================================
//  Conexión al proyecto de Supabase.
//
//  Reemplazá los dos valores por los de TU proyecto:
//    Supabase → Project Settings → Data API
//      • Project URL          →  SUPABASE_URL
//      • API Keys → anon / publishable  →  SUPABASE_ANON_KEY
//
//  Esta clave es pública a propósito: viaja en cualquier app web y lo que
//  protege los datos es el RLS del esquema, no el secreto de la clave. Igual
//  NUNCA pongas acá la service_role: esa saltea el RLS y da acceso a todo.
//
//  Si dejás los valores como están, la app abre una pantalla para cargarlos a
//  mano y los guarda en el navegador. Sirve para probar rápido, pero conviene
//  escribirlos acá así los dos entran sin configurar nada.
// ============================================================================

export const CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-CLAVE-PUBLISHABLE',
};

/** ¿Está configurado de verdad o son todavía los valores de ejemplo? */
export function configListo(c = CONFIG) {
  return (
    typeof c?.SUPABASE_URL === 'string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(c.SUPABASE_URL.trim()) &&
    typeof c?.SUPABASE_ANON_KEY === 'string' &&
    c.SUPABASE_ANON_KEY.trim().length > 20 &&
    !c.SUPABASE_ANON_KEY.includes('TU-CLAVE')
  );
}
