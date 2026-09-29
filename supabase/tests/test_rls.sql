-- ============================================================================
--  Pruebas del esquema y de las politicas RLS.
--  Se corren con supabase/tests/run.sh sobre un Postgres local (no en Supabase).
--  Cualquier assert que falle corta el script con error.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function ag_test_assert(p_ok boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice '  ok   %', p_msg;
  else
    raise exception 'FALLO: %', p_msg;
  end if;
end;
$$;

-- Se hace pasar por un usuario, como lo haria un JWT de Supabase.
create or replace function ag_test_como(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
end;
$$;

-- ---------------------------------------------------------------------------
--  Datos base: tres usuarios. Ana y Beto son la pareja; Caro es una extraña.
-- ---------------------------------------------------------------------------
delete from ag_hogares;
delete from auth.users;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'beto@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'caro@test.local');

\echo ''
\echo '== Alta de hogar =========================================================='

do $$
declare
  ana   constant uuid := '11111111-1111-1111-1111-111111111111';
  beto  constant uuid := '22222222-2222-2222-2222-222222222222';
  caro  constant uuid := '33333333-3333-3333-3333-333333333333';
  v_hogar    ag_hogares;
  v_codigo   text;
  v_n        int;
  v_evento   uuid;
  v_persona  uuid;
  v_tarea    uuid;
  v_err      text;
begin
  -- Ana crea el hogar
  perform ag_test_como(ana);
  v_hogar := ag_crear_hogar('Casa de prueba', 'Ana', '#8b7cff', '🌻');
  v_codigo := v_hogar.codigo;

  perform ag_test_assert(v_hogar.id is not null, 'ag_crear_hogar devuelve el hogar');
  perform ag_test_assert(length(v_codigo) = 6, 'el codigo tiene 6 caracteres');
  perform ag_test_assert(v_codigo ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$',
    'el codigo no usa caracteres que se confunden al dictarlo');
  perform ag_test_assert(v_hogar.feed_token is not null, 'el hogar nace con feed_token');

  perform ag_test_assert(
    (select count(*) from ag_personas where hogar_id = v_hogar.id and user_id = ana and es_admin) = 1,
    'quien crea el hogar queda como persona admin');
  perform ag_test_assert(
    (select count(*) from ag_preferencias where hogar_id = v_hogar.id) = 1,
    'el hogar nace con preferencias de comida');

  -- Sin sesion no se puede crear hogar
  perform ag_test_como(null);
  begin
    v_hogar := ag_crear_hogar('Hogar fantasma', 'Nadie');
    perform ag_test_assert(false, 'sin sesion no se deberia poder crear un hogar');
  exception when others then
    perform ag_test_assert(sqlerrm like '%sesion%', 'sin sesion, ag_crear_hogar corta');
  end;

  raise notice '';
  raise notice '== Aislamiento entre hogares ==============================================';

  -- Ana carga un evento y algo de menu, con RLS puesto (rol authenticated)
  perform ag_test_como(ana);
  set local role authenticated;

  perform ag_test_assert((select count(*) from ag_hogares) = 1, 'Ana ve su hogar');

  insert into ag_eventos (hogar_id, titulo, categoria, inicio, creado_por)
  values (v_hogar.id, 'Clase de natación', 'hijo', now() + interval '1 day', ana)
  returning id into v_evento;
  perform ag_test_assert(v_evento is not null, 'Ana puede crear un evento en su hogar');

  insert into ag_menu (hogar_id, fecha, momento, titulo, ingredientes)
  values (v_hogar.id, current_date, 'cena', 'Tarta de acelga',
          '[{"item":"Acelga","cantidad":"1 atado","rubro":"verduleria"}]'::jsonb);

  reset role;

  -- Caro, que no es de la casa, no tiene que ver NADA
  perform ag_test_como(caro);
  set local role authenticated;

  perform ag_test_assert((select count(*) from ag_hogares)       = 0, 'una extraña no ve el hogar');
  perform ag_test_assert((select count(*) from ag_eventos)        = 0, 'una extraña no ve los eventos');
  perform ag_test_assert((select count(*) from ag_menu)           = 0, 'una extraña no ve el menu');
  perform ag_test_assert((select count(*) from ag_personas)       = 0, 'una extraña no ve las personas');
  perform ag_test_assert((select count(*) from ag_preferencias)   = 0, 'una extraña no ve las preferencias');

  -- Tampoco puede escribir en el hogar ajeno
  begin
    insert into ag_eventos (hogar_id, titulo, inicio)
    values (v_hogar.id, 'Evento colado', now());
    perform ag_test_assert(false, 'una extraña no deberia poder insertar eventos ajenos');
  exception when insufficient_privilege then
    perform ag_test_assert(true, 'RLS bloquea el insert de una extraña');
  end;

  -- Ni borrar el evento de otro hogar
  delete from ag_eventos where id = v_evento;
  perform ag_test_assert(not found or true, 'delete de una extraña no afecta filas ajenas');
  reset role;
  perform ag_test_assert((select count(*) from ag_eventos where id = v_evento) = 1,
    'el evento de Ana sigue vivo despues del delete de la extraña');

  raise notice '';
  raise notice '== Entrar con el codigo ===================================================';

  -- Codigo inventado
  perform ag_test_como(beto);
  begin
    v_hogar := ag_unirse_a_hogar('ZZZZZZ', 'Beto');
    perform ag_test_assert(false, 'un codigo inexistente no deberia funcionar');
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform ag_test_assert(v_err like '%no existe%', 'un codigo inexistente da error claro');
  end;

  -- Codigo real, y en minuscula para probar que lo normaliza
  v_hogar := ag_unirse_a_hogar(lower(v_codigo), 'Beto', '#ff9f68', '🧉');
  perform ag_test_assert(v_hogar.codigo = v_codigo, 'el codigo en minuscula tambien entra');
  perform ag_test_assert(
    (select count(*) from ag_personas where hogar_id = v_hogar.id) = 2,
    'ahora el hogar tiene dos personas');
  perform ag_test_assert(
    (select not es_admin from ag_personas where hogar_id = v_hogar.id and user_id = beto),
    'quien se suma no queda como admin');

  -- Volver a unirse no duplica
  v_hogar := ag_unirse_a_hogar(v_codigo, 'Beto otra vez');
  perform ag_test_assert(
    (select count(*) from ag_personas where hogar_id = v_hogar.id) = 2,
    'unirse dos veces no duplica la persona');

  -- Y ahora Beto si ve todo
  set local role authenticated;
  perform ag_test_assert((select count(*) from ag_eventos) = 1, 'Beto ya ve los eventos de Ana');
  perform ag_test_assert((select count(*) from ag_menu)    = 1, 'Beto ya ve el menu');
  reset role;

  raise notice '';
  raise notice '== No se puede sacar a nadie del hogar por la ventana =====================';

  -- Beto intenta dejar sin cuenta a Ana (seria echarla del hogar)
  perform ag_test_como(beto);
  set local role authenticated;
  update ag_personas set user_id = null where user_id = ana;
  reset role;
  perform ag_test_assert(
    (select count(*) from ag_personas where user_id = ana) = 1,
    'un miembro no puede borrarle el user_id a otro miembro');

  -- Beto intenta meter a Caro a mano
  perform ag_test_como(beto);
  set local role authenticated;
  begin
    insert into ag_personas (hogar_id, user_id, nombre)
    values (v_hogar.id, caro, 'Caro colada');
    perform ag_test_assert(false, 'no se deberia poder sumar a otro usuario a mano');
  exception when insufficient_privilege then
    perform ag_test_assert(true, 'sumar a otro usuario solo se puede con el codigo');
  end;

  -- Pero si puede agregar al nene, que no tiene cuenta
  insert into ag_personas (hogar_id, user_id, nombre, emoji)
  values (v_hogar.id, null, 'Tomás', '🧒')
  returning id into v_persona;
  perform ag_test_assert(v_persona is not null, 'se puede agregar un integrante sin cuenta');
  reset role;

  raise notice '';
  raise notice '== Ocurrencias de eventos que se repiten ==================================';

  perform ag_test_como(ana);
  set local role authenticated;
  update ag_eventos set repite = 'semanal', repite_dias = '{2,4}' where id = v_evento;

  insert into ag_ocurrencias (evento_id, fecha, estado)
  values (v_evento, current_date, 'hecho');
  perform ag_test_assert(
    (select count(*) from ag_ocurrencias where evento_id = v_evento) = 1,
    'se puede marcar una ocurrencia como hecha');

  insert into ag_ocurrencias (evento_id, fecha, estado)
  values (v_evento, current_date, 'cancelado')
  on conflict (evento_id, fecha) do update set estado = excluded.estado;
  perform ag_test_assert(
    (select estado from ag_ocurrencias where evento_id = v_evento and fecha = current_date) = 'cancelado',
    'la misma fecha se actualiza en vez de duplicarse');
  reset role;

  -- Caro no llega a las ocurrencias, que no tienen hogar_id propio
  perform ag_test_como(caro);
  set local role authenticated;
  perform ag_test_assert((select count(*) from ag_ocurrencias) = 0,
    'las ocurrencias heredan el permiso de su evento');
  reset role;

  raise notice '';
  raise notice '== Tareas de la casa ======================================================';

  perform ag_test_como(ana);
  set local role authenticated;
  insert into ag_tareas (hogar_id, titulo, vence, repite)
  values (v_hogar.id, 'Pagar el gas', current_date, 'mensual')
  returning id into v_tarea;
  perform ag_test_assert(v_tarea is not null, 'Ana puede anotar una tarea');
  reset role;

  -- Beto es de la casa: la ve y la puede tildar.
  perform ag_test_como(beto);
  set local role authenticated;
  perform ag_test_assert((select count(*) from ag_tareas) = 1,
    'Beto ve las tareas del hogar');
  update ag_tareas set hecha = true, hecha_en = now() where id = v_tarea;
  perform ag_test_assert((select hecha from ag_tareas where id = v_tarea),
    'cualquiera de la casa puede tildar una tarea');
  reset role;

  -- Caro no.
  perform ag_test_como(caro);
  set local role authenticated;
  perform ag_test_assert((select count(*) from ag_tareas) = 0,
    'una extraña no ve las tareas de otro hogar');
  -- El update no da error: RLS no le deja ver la fila, así que no toca ninguna.
  -- Por eso se verifica afuera del rol, que es donde se ve la tabla entera.
  update ag_tareas set titulo = 'Cambiada' where id = v_tarea;
  begin
    insert into ag_tareas (hogar_id, titulo) values (v_hogar.id, 'Colada');
    perform ag_test_assert(false, 'no se deberia poder meter una tarea en un hogar ajeno');
  exception when insufficient_privilege then
    perform ag_test_assert(true, 'no se puede meter una tarea en un hogar ajeno');
  end;
  reset role;
  perform ag_test_assert((select titulo from ag_tareas where id = v_tarea) = 'Pagar el gas',
    'una extraña tampoco las puede cambiar');
  perform ag_test_assert((select count(*) from ag_tareas) = 1,
    'y no quedó ninguna tarea colada');

  -- updated_at lo pone el trigger, no el cliente. Se atrasa a mano primero:
  -- dentro de una transacción now() no se mueve, así que comparar contra
  -- created_at daría siempre igual y la prueba no probaría nada.
  update ag_tareas set updated_at = now() - interval '1 day' where id = v_tarea;
  perform ag_test_como(ana);
  set local role authenticated;
  update ag_tareas set titulo = 'Pagar el gas y la luz' where id = v_tarea;
  reset role;
  perform ag_test_assert(
    (select updated_at from ag_tareas where id = v_tarea) > now() - interval '1 minute',
    'el trigger actualiza updated_at al editar');

  raise notice '';
  raise notice '== Menu -> lista de compras ===============================================';

  perform ag_test_como(ana);
  set local role authenticated;
  -- Dos comidas que comparten un ingrediente, escrito distinto
  insert into ag_menu (hogar_id, fecha, momento, titulo, ingredientes) values
    (v_hogar.id, current_date + 1, 'almuerzo', 'Wok de verduras',
     '[{"item":"Zapallito","cantidad":"2","rubro":"verduleria"},
        {"item":"Pollo","cantidad":"500 g","rubro":"carniceria"}]'::jsonb),
    (v_hogar.id, current_date + 1, 'cena', 'Sopa de zapallo',
     '[{"item":"zapallito","cantidad":"1","rubro":"verduleria"}]'::jsonb);
  reset role;

  v_n := ag_menu_a_compras(v_hogar.id, current_date, current_date + 7);
  perform ag_test_assert(v_n = 3, 'se cargaron 3 items distintos (acelga, zapallito, pollo), no 4');
  perform ag_test_assert(
    (select count(*) from ag_compras where hogar_id = v_hogar.id and lower(item) = 'zapallito') = 1,
    'Zapallito y zapallito se juntan en un solo item');
  perform ag_test_assert(
    (select cantidad from ag_compras where hogar_id = v_hogar.id and lower(item) = 'zapallito') like '%+%',
    'las cantidades repetidas se suman en el texto');
  perform ag_test_assert(
    (select rubro from ag_compras where hogar_id = v_hogar.id and lower(item) = 'pollo') = 'carniceria',
    'cada item conserva su rubro');

  -- Volver a volcar no duplica lo que ya esta sin comprar
  v_n := ag_menu_a_compras(v_hogar.id, current_date, current_date + 7);
  perform ag_test_assert(v_n = 0, 'volcar dos veces no duplica la lista');

  -- Pero si ya se compro, vuelve a aparecer para la semana siguiente
  perform ag_test_como(ana);
  set local role authenticated;
  update ag_compras set comprado = true where hogar_id = v_hogar.id;
  reset role;
  v_n := ag_menu_a_compras(v_hogar.id, current_date, current_date + 7);
  perform ag_test_assert(v_n = 3, 'lo ya comprado se vuelve a pedir en la vuelta siguiente');

  -- Caro no puede volcar el menu de un hogar ajeno
  perform ag_test_como(caro);
  begin
    v_n := ag_menu_a_compras(v_hogar.id, current_date, current_date + 7);
    perform ag_test_assert(false, 'una extraña no deberia poder tocar la lista ajena');
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform ag_test_assert(v_err like '%miembro%', 'ag_menu_a_compras valida la membresia');
  end;

  raise notice '';
  raise notice '== Reimportar un calendario actualiza, no duplica =========================';

  -- Esto reproduce el upsert que manda PostgREST al reimportar. Si el indice
  -- unico de ics_uid fuera PARCIAL, este insert fallaria con "no unique or
  -- exclusion constraint matching the ON CONFLICT specification", porque
  -- Postgres solo usa un indice parcial cuando el insert repite su condicion, y
  -- PostgREST no la manda.
  perform ag_test_como(ana);
  set local role authenticated;

  insert into ag_eventos (hogar_id, titulo, inicio, ics_uid)
  values (v_hogar.id, 'Acto del colegio', now() + interval '3 days', 'cal1:acto@colegio')
  on conflict (hogar_id, ics_uid) do update
    set titulo = excluded.titulo, inicio = excluded.inicio;
  perform ag_test_assert(true, 'el upsert por ics_uid no explota');

  -- Segunda pasada: el colegio le cambio la hora.
  insert into ag_eventos (hogar_id, titulo, inicio, ics_uid)
  values (v_hogar.id, 'Acto del colegio (nueva hora)', now() + interval '4 days', 'cal1:acto@colegio')
  on conflict (hogar_id, ics_uid) do update
    set titulo = excluded.titulo, inicio = excluded.inicio;

  perform ag_test_assert(
    (select count(*) from ag_eventos where ics_uid = 'cal1:acto@colegio') = 1,
    'reimportar el mismo evento no lo duplica');
  perform ag_test_assert(
    (select titulo from ag_eventos where ics_uid = 'cal1:acto@colegio')
      = 'Acto del colegio (nueva hora)',
    'reimportar actualiza el titulo');

  -- Dos calendarios distintos pueden traer el mismo UID: por eso la app le pone
  -- adelante el id del calendario.
  insert into ag_eventos (hogar_id, titulo, inicio, ics_uid)
  values (v_hogar.id, 'Acto del club', now() + interval '3 days', 'cal2:acto@colegio');
  perform ag_test_assert(
    (select count(*) from ag_eventos where ics_uid like '%acto@colegio') = 2,
    'el mismo UID en dos calendarios convive');

  -- Y los eventos cargados a mano no tienen ics_uid: tienen que poder ser
  -- muchos, porque en un indice unico los NULL no chocan entre si.
  insert into ag_eventos (hogar_id, titulo, inicio) values
    (v_hogar.id, 'A mano 1', now()),
    (v_hogar.id, 'A mano 2', now()),
    (v_hogar.id, 'A mano 3', now());
  perform ag_test_assert(
    (select count(*) from ag_eventos where ics_uid is null and titulo like 'A mano%') = 3,
    'varios eventos sin ics_uid conviven sin problema');

  reset role;

  raise notice '';
  raise notice '== Feed .ics ==============================================================';

  perform ag_test_como(caro);
  begin
    perform ag_regenerar_feed_token(v_hogar.id);
    perform ag_test_assert(false, 'una extraña no deberia poder rotar el token del feed');
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform ag_test_assert(v_err like '%miembro%', 'ag_regenerar_feed_token valida la membresia');
  end;

  perform ag_test_como(ana);
  perform ag_test_assert(
    ag_regenerar_feed_token(v_hogar.id) <> v_hogar.feed_token,
    'un miembro puede rotar el token del feed');

  raise notice '';
  raise notice '== Baja del hogar en cascada ==============================================';

  perform ag_test_como(ana);
  delete from ag_hogares where id = v_hogar.id;
  perform ag_test_assert((select count(*) from ag_eventos)      = 0, 'borrar el hogar se lleva los eventos');
  perform ag_test_assert((select count(*) from ag_menu)         = 0, 'borrar el hogar se lleva el menu');
  perform ag_test_assert((select count(*) from ag_compras)      = 0, 'borrar el hogar se lleva la lista');
  perform ag_test_assert((select count(*) from ag_personas)     = 0, 'borrar el hogar se lleva las personas');
  perform ag_test_assert((select count(*) from ag_ocurrencias)  = 0, 'borrar el hogar se lleva las ocurrencias');
end $$;

\echo ''
\echo '== Unicidad del codigo de hogar ==========================================='

do $$
declare
  ana constant uuid := '11111111-1111-1111-1111-111111111111';
  v_codigos text[] := '{}';
  v_h ag_hogares;
begin
  perform ag_test_como(ana);
  for i in 1..25 loop
    v_h := ag_crear_hogar('Hogar ' || i, 'Ana');
    v_codigos := v_codigos || v_h.codigo;
  end loop;
  perform ag_test_assert(
    (select count(distinct c) from unnest(v_codigos) c) = 25,
    '25 hogares seguidos, 25 codigos distintos');
  delete from ag_hogares;
end $$;

\echo ''
\echo 'TODAS LAS PRUEBAS PASARON'
