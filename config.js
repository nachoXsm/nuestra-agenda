// ============================================================================
//  Conexión al proyecto de Supabase.
//
//  Este es el mismo proyecto que usa Nuestras Finanzas. Las dos apps conviven
//  sin pisarse: todo lo de la agenda vive con el prefijo ag_.
//
//  La clave de abajo es la publishable (anon), y es pública a propósito: viaja
//  en el código de cualquier app web, así que cualquiera que abra la app la
//  tiene. Lo que protege los datos NO es que la clave sea secreta, es el RLS:
//  cada tabla ag_* exige ser miembro del hogar, y eso se verifica del lado del
//  servidor contra el usuario que inició sesión.
//
//  Por eso mismo: NUNCA pongas acá la service_role. Esa saltea el RLS por
//  diseño y le daría a cualquiera acceso completo a todo.
//
//  Si algún día cambiás de proyecto, los valores están en
//  Supabase → Project Settings → Data API.
// ============================================================================

export const CONFIG = {
  SUPABASE_URL: 'https://gzjhohwuyquumkgiehan.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_2YKu-8E5kpmXYpWs9eOjNw_C4QNFJnO',
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
