-- ============================================================================
--  Segunda mitad de la prueba de convivencia: se corre DESPUÉS de schema.sql.
--  Compara contra la foto que sacó test_convivencia.sql y falla si algo de la
--  app ajena cambió.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

\echo ''
\echo '== Después de correr schema.sql dos veces =================================='

do $$
declare
  v_faltan   int;
  v_sobran   int;
  v_cambios  int;
  v_fila     record;
begin
  -- ---- objetos que desaparecieron ----------------------------------------
  select count(*) into v_faltan
  from prueba_antes a
  where not exists (
    select 1 from prueba_foto f
    where f.que = a.que and f.nombre = a.nombre
  );

  if v_faltan > 0 then
    raise notice 'DESAPARECIERON:';
    for v_fila in
      select a.que, a.nombre from prueba_antes a
      where not exists (select 1 from prueba_foto f
                        where f.que = a.que and f.nombre = a.nombre)
    loop
      raise notice '  - % %', v_fila.que, v_fila.nombre;
    end loop;
    raise exception 'schema.sql se llevó puestos % objetos de la otra app', v_faltan;
  end if;
  raise notice '  ok   no desapareció ningún objeto de la otra app';

  -- ---- objetos que cambiaron de definición -------------------------------
  select count(*) into v_cambios
  from prueba_antes a
  join prueba_foto f on f.que = a.que and f.nombre = a.nombre
  where f.detalle is distinct from a.detalle;

  if v_cambios > 0 then
    raise notice 'CAMBIARON:';
    for v_fila in
      select a.que, a.nombre, a.detalle as antes, f.detalle as ahora
      from prueba_antes a
      join prueba_foto f on f.que = a.que and f.nombre = a.nombre
      where f.detalle is distinct from a.detalle
    loop
      raise notice '  - % %', v_fila.que, v_fila.nombre;
      raise notice '      antes: %', left(v_fila.antes, 120);
      raise notice '      ahora: %', left(v_fila.ahora, 120);
    end loop;
    raise exception 'schema.sql modificó % objetos de la otra app', v_cambios;
  end if;
  raise notice '  ok   ningún objeto de la otra app cambió de definición';

  -- ---- objetos nuevos que no son de la agenda -----------------------------
  -- La vista prueba_foto ya excluye ag_*, así que cualquier cosa nueva que
  -- aparezca acá es algo que schema.sql creó fuera de su prefijo.
  select count(*) into v_sobran
  from prueba_foto f
  where not exists (
    select 1 from prueba_antes a
    where a.que = f.que and a.nombre = f.nombre
  );

  if v_sobran > 0 then
    raise notice 'APARECIERON FUERA DEL PREFIJO ag_:';
    for v_fila in
      select f.que, f.nombre from prueba_foto f
      where not exists (select 1 from prueba_antes a
                        where a.que = f.que and a.nombre = f.nombre)
    loop
      raise notice '  - % %', v_fila.que, v_fila.nombre;
    end loop;
    raise exception 'schema.sql creó % objetos fuera del prefijo ag_', v_sobran;
  end if;
  raise notice '  ok   todo lo que creó schema.sql se llama ag_*';
end $$;

-- ---- los datos, uno por uno -------------------------------------------------
do $$
declare
  v_ahora  record;
  v_antes  text;
  v_malos  int := 0;
begin
  for v_ahora in
    select 'grupos' as que,       md5(string_agg(g::text, '|' order by g.id::text)) as huella from grupos g
    union all
    select 'gastos',              md5(string_agg(x::text, '|' order by x.id::text)) from gastos x
    union all
    select 'ingresos',            md5(string_agg(i::text, '|' order by i.id::text)) from ingresos i
    union all
    select 'tarjetas',            md5(string_agg(t::text, '|' order by t.id::text)) from tarjetas t
    union all
    select 'agenda_vieja',        md5(string_agg(a::text, '|' order by a.id::text)) from agenda_vieja a
    union all
    select 'agencias',            md5(string_agg(a::text, '|' order by a.id::text)) from agencias a
  loop
    select huella into v_antes from prueba_datos_antes where que = v_ahora.que;
    if v_antes is distinct from v_ahora.huella then
      raise notice '  CAMBIARON LOS DATOS DE %', v_ahora.que;
      v_malos := v_malos + 1;
    else
      raise notice '  ok   los datos de % están intactos', v_ahora.que;
    end if;
  end loop;

  if v_malos > 0 then
    raise exception 'schema.sql tocó los datos de % tablas ajenas', v_malos;
  end if;
end $$;

-- ---- y que la agenda haya quedado instalada de verdad -----------------------
do $$
declare v_tablas int;
begin
  select count(*) into v_tablas
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ag\_%';

  if v_tablas < 10 then
    raise exception 'la agenda tenía que crear 10 tablas y creó %', v_tablas;
  end if;
  raise notice '  ok   la agenda quedó instalada (% tablas ag_*)', v_tablas;
end $$;

\echo ''
\echo 'LAS DOS APPS CONVIVEN SIN TOCARSE'
