-- ============================================================================
--  ¿Correr schema.sql rompe algo de una app que ya estaba en el proyecto?
--
--  Esta prueba existe porque la agenda comparte el proyecto de Supabase con
--  Nuestras Finanzas, y el editor SQL de Supabase avisa (con razón) que el
--  script tiene operaciones destructivas: hay varios `drop ... if exists`.
--  Todos apuntan a objetos ag_* que el propio script crea, pero eso es una
--  afirmación, y con los datos de otra app de por medio conviene una prueba.
--
--  Lo que hace:
--    1. arma una app "ajena" con tablas, datos, índices, triggers, políticas,
--       vistas, secuencias y funciones propias,
--    2. saca una foto completa de todo eso,
--    3. corre schema.sql DOS veces por encima,
--    4. compara la foto: si cambió una sola cosa, falla.
--
--  Incluye a propósito objetos cuyo nombre empieza con "ag" pero que no son de
--  la agenda (agenda_vieja, agencias), para descartar que algún patrón de
--  búsqueda se los lleve puestos por delante.
--
--  La corre supabase/tests/run.sh.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
--  1. La app que ya estaba
-- ---------------------------------------------------------------------------

create table if not exists grupos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  codigo      text,
  moneda      text default 'ARS',
  created_at  timestamptz default now()
);

create table if not exists gastos (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid references grupos on delete cascade,
  concepto    text not null,
  monto       numeric(14,2) not null,
  categoria   text,
  quien       text,
  created_at  timestamptz default now()
);

create table if not exists ingresos (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid references grupos on delete cascade,
  concepto    text not null,
  monto       numeric(14,2) not null,
  created_at  timestamptz default now()
);

create table if not exists tarjetas (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid references grupos on delete cascade,
  nombre      text not null,
  cierre      smallint,
  created_at  timestamptz default now()
);

-- Objetos que empiezan con "ag" pero NO son de la agenda: el caso borde.
create table if not exists agenda_vieja (
  id      int primary key,
  nota    text
);
create table if not exists agencias (
  id      int primary key,
  nombre  text
);

-- Y el resto de las cosas que una app real tiene alrededor.
create index if not exists gastos_grupo_ix on gastos (grupo_id, created_at);
create unique index if not exists grupos_codigo_uk on grupos (codigo);

create or replace function finanzas_total_del_grupo(g uuid)
returns numeric language sql stable as $$
  select coalesce(sum(monto), 0) from gastos where grupo_id = g;
$$;

create or replace function finanzas_touch()
returns trigger language plpgsql as $$
begin
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$;

drop trigger if exists gastos_touch on gastos;
create trigger gastos_touch before insert on gastos
  for each row execute function finanzas_touch();

create or replace view finanzas_resumen as
  select g.id, g.nombre, count(x.id) as cuantos, coalesce(sum(x.monto), 0) as total
  from grupos g left join gastos x on x.grupo_id = g.id
  group by g.id, g.nombre;

-- RLS prendida con una política propia, para ver que nadie la toque.
alter table tarjetas enable row level security;
drop policy if exists tarjetas_todo on tarjetas;
create policy tarjetas_todo on tarjetas for all using (true) with check (true);

-- Datos. Si alguno de estos se mueve, la prueba falla.
delete from grupos;
insert into grupos (id, nombre, codigo, moneda) values
  ('11111111-1111-4111-8111-111111111111', 'Casa', 'ABC123', 'ARS'),
  ('22222222-2222-4222-8222-222222222222', 'Viaje a Brasil', 'XYZ789', 'USD');

insert into gastos (grupo_id, concepto, monto, categoria, quien) values
  ('11111111-1111-4111-8111-111111111111', 'Supermercado', 45230.50, 'comida', 'Nacho'),
  ('11111111-1111-4111-8111-111111111111', 'Luz', 18900.00, 'servicios', 'Sofi'),
  ('22222222-2222-4222-8222-222222222222', 'Hotel', 320.00, 'viaje', 'Nacho');

insert into ingresos (grupo_id, concepto, monto) values
  ('11111111-1111-4111-8111-111111111111', 'Sueldo', 900000.00);

insert into tarjetas (grupo_id, nombre, cierre) values
  ('11111111-1111-4111-8111-111111111111', 'Visa Galicia', 15);

insert into agenda_vieja (id, nota) values (1, 'no me toques');
insert into agencias (id, nombre) values (1, 'Despegar');

-- ---------------------------------------------------------------------------
--  2. La foto de antes
-- ---------------------------------------------------------------------------

-- Todo lo que NO es de la agenda. Si algo de esto cambia, es un problema.
create or replace view prueba_foto as
  select 'tabla' as que, c.relname::text as nombre,
         (c.relrowsecurity::text || '|' ||
          coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ','
                                      order by a.attnum)
                    from pg_attribute a
                    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '')) as detalle
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
    -- prueba_* son las tablas auxiliares de esta misma prueba.
    and c.relname not like 'ag\_%' and c.relname not like 'prueba\_%'

  union all
  select 'indice', ci.relname::text,
         pg_get_indexdef(ci.oid)
  from pg_index i
  join pg_class ci on ci.oid = i.indexrelid
  join pg_class ct on ct.oid = i.indrelid
  join pg_namespace n on n.oid = ci.relnamespace
  where n.nspname = 'public' and ct.relname not like 'ag\_%'
    and ct.relname not like 'prueba\_%'

  union all
  select 'trigger', t.tgname::text,
         pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and c.relname not like 'ag\_%'

  union all
  select 'politica', p.polname::text,
         c.relname || '|' || pg_get_expr(p.polqual, p.polrelid)
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname not like 'ag\_%'

  union all
  -- Las funciones se identifican por firma completa, no por nombre: pgcrypto
  -- tiene varias que se llaman igual y cambian solo en los argumentos, y
  -- compararlas por nombre las hace parecer modificadas cuando no lo están.
  -- Y se dejan afuera las que pertenecen a una extensión: esas son de la
  -- extensión, no de la app, y aparecen solas al instalar pgcrypto.
  select 'funcion',
         (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text,
         pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname not like 'ag\_%'
    and p.proname not like 'prueba\_%'
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
    );

create table if not exists prueba_antes as select * from prueba_foto;
delete from prueba_antes;
insert into prueba_antes select * from prueba_foto;

-- Y los datos, que es lo que de verdad importa.
create table if not exists prueba_datos_antes (que text, huella text);
delete from prueba_datos_antes;
insert into prueba_datos_antes
  select 'grupos',       md5(string_agg(g::text, '|' order by g.id::text)) from grupos g
  union all
  select 'gastos',       md5(string_agg(x::text, '|' order by x.id::text)) from gastos x
  union all
  select 'ingresos',     md5(string_agg(i::text, '|' order by i.id::text)) from ingresos i
  union all
  select 'tarjetas',     md5(string_agg(t::text, '|' order by t.id::text)) from tarjetas t
  union all
  select 'agenda_vieja', md5(string_agg(a::text, '|' order by a.id::text)) from agenda_vieja a
  union all
  select 'agencias',     md5(string_agg(a::text, '|' order by a.id::text)) from agencias a;

\echo ''
\echo '== Se armó la app "ajena" con datos =========================================='
select que, count(*) as objetos from prueba_antes group by que order by que;
