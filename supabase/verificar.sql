-- ============================================================================
--  ¿Quedó todo bien instalado?
--
--  Pegá esto en el SQL Editor de Supabase y dale Run. Es SOLO DE LECTURA: no
--  crea, no borra y no modifica nada. Devuelve una fila por cosa a revisar,
--  con OK o con qué falta.
--
--  Sirve después de correr schema.sql, y también más adelante si algo dejara
--  de andar y quisieras descartar que el problema sea la base.
-- ============================================================================

with
-- Las once tablas que tiene que haber creado schema.sql.
esperadas(t) as (
  values ('ag_hogares'), ('ag_personas'), ('ag_eventos'), ('ag_ocurrencias'),
         ('ag_menu'), ('ag_compras'), ('ag_tareas'), ('ag_calendarios'),
         ('ag_preferencias'), ('ag_recetas'), ('ag_chef_mensajes')
),
tablas as (
  select e.t,
         c.oid,
         c.relrowsecurity as rls,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as politicas
  from esperadas e
  left join pg_class c
    on c.relname = e.t
   and c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
),
-- Las funciones que usa la app. Sin estas, crear o entrar a un hogar falla.
funciones(f) as (
  values ('ag_crear_hogar'), ('ag_unirse_a_hogar'), ('ag_es_miembro'),
         ('ag_es_admin'), ('ag_codigo_nuevo'), ('ag_menu_a_compras'),
         ('ag_regenerar_feed_token')
),
-- Las cuatro tablas de Nuestras Finanzas, contadas de forma dinámica: si
-- alguna no existiera, un "select count(*) from grupos" escrito a mano haría
-- fallar TODA la consulta con "relation does not exist" en vez de mostrar el
-- informe. Así, la que falta sale en null y el informe se ve igual.
finanzas(t, n) as (
  select v.t,
         case when to_regclass('public.' || v.t) is null then null
           else (xpath(
             '/row/c/text()',
             query_to_xml(format('select count(*) as c from public.%I', v.t),
                          false, true, '')
           ))[1]::text::bigint
         end
  from (values ('grupos'), ('gastos'), ('ingresos'), ('tarjetas')) v(t)
)

select * from (

  -- 1. ¿Están las once tablas?
  select 1 as orden,
         'Tablas de la agenda' as revisión,
         case when count(*) filter (where oid is null) = 0
              then '✅ OK — las ' || count(*) || ' tablas están'
              else '❌ FALTAN: ' || string_agg(t, ', ') filter (where oid is null)
         end as resultado
  from tablas

  union all

  -- 2. ¿Tienen RLS prendida? Sin esto, cualquiera con la clave ve todo.
  select 2,
         'Seguridad (RLS) prendida',
         case when count(*) filter (where oid is not null and not rls) = 0
                   and count(*) filter (where oid is not null) = 11
              then '✅ OK — las 11 tablas protegidas'
              else '❌ SIN PROTEGER: ' ||
                   coalesce(string_agg(t, ', ') filter (where oid is not null and not rls),
                            '(faltan tablas)')
         end
  from tablas

  union all

  -- 3. ¿Y las políticas? RLS sin políticas bloquea todo, incluso a ustedes.
  select 3,
         'Políticas de acceso',
         case when count(*) filter (where oid is not null and politicas = 0) = 0
                   and count(*) filter (where oid is not null) = 11
              then '✅ OK — ' || sum(politicas) || ' políticas en total'
              else '❌ SIN POLÍTICAS: ' ||
                   coalesce(string_agg(t, ', ') filter (where oid is not null and politicas = 0),
                            '(faltan tablas)')
         end
  from tablas

  union all

  -- 4. Las funciones.
  select 4,
         'Funciones de la app',
         case when count(*) filter (
                where not exists (
                  select 1 from pg_proc p
                  where p.proname = f and p.pronamespace = 'public'::regnamespace)
              ) = 0
              then '✅ OK — las 7 funciones están'
              else '❌ FALTAN: ' || string_agg(f, ', ') filter (
                     where not exists (
                       select 1 from pg_proc p
                       where p.proname = f and p.pronamespace = 'public'::regnamespace))
         end
  from funciones

  union all

  -- 5. Lo importante para quedarse tranquilo: Nuestras Finanzas sigue entera.
  select 5,
         'Nuestras Finanzas intacta',
         case when count(*) filter (where n is not null) = 4
              then '✅ OK — grupos, gastos, ingresos y tarjetas siguen ahí'
              else '⚠️ Solo encontré ' || count(*) filter (where n is not null) ||
                   ' de 4 tablas. Faltan: ' ||
                   coalesce(string_agg(t, ', ') filter (where n is null), 'ninguna')
         end
  from finanzas

  union all

  -- 6. Y con sus datos. Si estos números son los de siempre, no se tocó nada.
  select 6,
         'Datos de Finanzas',
         '📊 ' || string_agg(coalesce(n::text, '—') || ' ' || t, ' · '
                             order by array_position(
                               array['grupos', 'gastos', 'ingresos', 'tarjetas'], t))
  from finanzas

) x order by orden;
