-- ============================================================================
--  Nuestra Agenda — esquema completo
--  Pegar TODO esto en Supabase -> SQL Editor -> Run. Es idempotente: se puede
--  volver a correr sin romper nada.
--
--  Modelo: un HOGAR agrupa todo. Las PERSONAS del hogar pueden tener cuenta
--  (vos y tu pareja) o no tenerla (el nene). Todo lo demas cuelga del hogar y
--  solo lo ve quien es miembro, via RLS.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
--  HOGARES
-- ----------------------------------------------------------------------------
create table if not exists ag_hogares (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  -- Codigo de 6 caracteres para que la otra persona entre al hogar.
  codigo          text not null unique,
  -- Token secreto del feed .ics. Con esto el calendario del celular se suscribe
  -- a la agenda sin necesidad de login. Se puede regenerar desde Ajustes.
  feed_token      uuid not null default gen_random_uuid(),
  zona_horaria    text not null default 'America/Argentina/Buenos_Aires',
  creado_por      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  PERSONAS  (miembros con cuenta + integrantes sin cuenta, como los chicos)
-- ----------------------------------------------------------------------------
create table if not exists ag_personas (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  -- null = integrante sin cuenta (un hijo). No null = miembro que puede entrar.
  user_id         uuid references auth.users on delete cascade,
  nombre          text not null,
  color           text not null default '#8b7cff',
  emoji           text not null default '🙂',
  es_admin        boolean not null default false,
  orden           smallint not null default 0,
  created_at      timestamptz not null default now()
);

-- Un usuario no puede estar dos veces en el mismo hogar.
create unique index if not exists ag_personas_hogar_user_uk
  on ag_personas (hogar_id, user_id) where user_id is not null;
create index if not exists ag_personas_user_ix on ag_personas (user_id);

-- ----------------------------------------------------------------------------
--  Helpers de seguridad
--  security definer para que las politicas no se pregunten a si mismas
--  (si ag_personas se consultara con RLS activo dentro de su propia politica,
--  Postgres entra en recursion infinita).
-- ----------------------------------------------------------------------------
create or replace function ag_es_miembro(p_hogar uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from ag_personas
    where hogar_id = p_hogar and user_id = auth.uid()
  );
$$;

create or replace function ag_es_admin(p_hogar uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from ag_personas
    where hogar_id = p_hogar and user_id = auth.uid() and es_admin
  );
$$;

-- ----------------------------------------------------------------------------
--  EVENTOS
-- ----------------------------------------------------------------------------
create table if not exists ag_eventos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  titulo          text not null,
  detalle         text,
  lugar           text,
  -- familia | hijo | pareja | trabajo | salud | colegio | cumple | tramite | otro
  categoria       text not null default 'familia',
  inicio          timestamptz not null,
  fin             timestamptz,
  todo_el_dia     boolean not null default false,
  -- De quien es el evento (la clase de natacion del nene, el turno medico de ella)
  persona_id      uuid references ag_personas on delete set null,
  -- no | diario | semanal | quincenal | mensual | anual
  repite          text not null default 'no',
  -- Para repite = 'semanal': dias de la semana, 0=domingo .. 6=sabado
  repite_dias     smallint[] not null default '{}',
  repite_hasta    date,
  -- Minutos antes para el recordatorio (lo usa el feed .ics -> avisa el celular)
  aviso_minutos   int,
  -- Trazabilidad de los eventos que vinieron de un calendario importado
  calendario_id   uuid,
  ics_uid         text,
  creado_por      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ag_eventos_hogar_inicio_ix on ag_eventos (hogar_id, inicio);

-- Reimportar el mismo calendario actualiza en vez de duplicar.
--
-- OJO: el indice NO puede ser parcial (...where ics_uid is not null). Postgres
-- solo usa un indice parcial en un ON CONFLICT si el insert repite la misma
-- condicion, y PostgREST no la manda: el upsert de la importacion fallaria con
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- No hace falta que sea parcial igual, porque Postgres trata los NULL como
-- distintos entre si: los eventos cargados a mano, que no tienen ics_uid,
-- pueden ser todos los que quieran.
drop index if exists ag_eventos_ics_uk;
create unique index if not exists ag_eventos_ics_uk
  on ag_eventos (hogar_id, ics_uid);

-- Estado de cada ocurrencia de un evento que se repite: si se hizo o si esa
-- vez puntual no va. Un evento simple usa la fecha de su propio inicio.
create table if not exists ag_ocurrencias (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references ag_eventos on delete cascade,
  fecha           date not null,
  -- hecho | cancelado
  estado          text not null default 'hecho',
  created_at      timestamptz not null default now(),
  unique (evento_id, fecha)
);

-- ----------------------------------------------------------------------------
--  MENU SEMANAL
-- ----------------------------------------------------------------------------
create table if not exists ag_menu (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  fecha           date not null,
  -- almuerzo | cena
  momento         text not null,
  titulo          text not null,
  -- id de una receta del recetario local, o null si es texto libre / de la IA
  receta_id       text,
  notas           text,
  -- [{ "item": "zapallo anco", "cantidad": "1 chico", "rubro": "verduleria" }]
  ingredientes    jsonb not null default '[]'::jsonb,
  etiquetas       text[] not null default '{}',
  a_cargo         uuid references ag_personas on delete set null,
  created_at      timestamptz not null default now(),
  unique (hogar_id, fecha, momento)
);

create index if not exists ag_menu_hogar_fecha_ix on ag_menu (hogar_id, fecha);

-- ----------------------------------------------------------------------------
--  LISTA DE COMPRAS
-- ----------------------------------------------------------------------------
create table if not exists ag_compras (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  item            text not null,
  cantidad        text,
  -- verduleria | carniceria | almacen | panaderia | fiambreria | limpieza | otros
  rubro           text not null default 'otros',
  comprado        boolean not null default false,
  -- manual | menu
  origen          text not null default 'manual',
  created_at      timestamptz not null default now()
);

create index if not exists ag_compras_hogar_ix on ag_compras (hogar_id, comprado);

-- ----------------------------------------------------------------------------
--  CALENDARIOS IMPORTADOS (.ics del colegio, del club, de Cokidoo si exporta)
-- ----------------------------------------------------------------------------
create table if not exists ag_calendarios (
  id                  uuid primary key default gen_random_uuid(),
  hogar_id            uuid not null references ag_hogares on delete cascade,
  nombre              text not null,
  url                 text,
  color               text not null default '#6c63ff',
  categoria           text not null default 'colegio',
  persona_id          uuid references ag_personas on delete set null,
  ultima_sync         timestamptz,
  eventos_importados  int not null default 0,
  created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  PREFERENCIAS DE COMIDA DEL HOGAR (contexto del agente de IA)
-- ----------------------------------------------------------------------------
create table if not exists ag_preferencias (
  hogar_id        uuid primary key references ag_hogares on delete cascade,
  -- sin_tacc | vegetariano | vegano | sin_lactosa | sin_frutos_secos | bajo_sodio
  restricciones   text[] not null default '{}',
  no_gusta        text[] not null default '{}',
  -- bajo | medio | alto
  presupuesto     text not null default 'medio',
  -- rapido (hasta 30 min) | medio | sin_apuro
  tiempo_cocina   text not null default 'medio',
  porciones       smallint not null default 3,
  notas           text,
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  RECETAS GUARDADAS (las que propone la IA y el hogar decide guardar)
-- ----------------------------------------------------------------------------
create table if not exists ag_recetas (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  nombre          text not null,
  ingredientes    jsonb not null default '[]'::jsonb,
  pasos           text,
  tiempo_min      smallint,
  etiquetas       text[] not null default '{}',
  -- meses del año en que conviene, 1..12
  meses           smallint[] not null default '{}',
  favorita        boolean not null default false,
  creado_por      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists ag_recetas_hogar_ix on ag_recetas (hogar_id);

-- ----------------------------------------------------------------------------
--  TAREAS DE LA CASA
--  Lo que hay que hacer pero no tiene hora: pagar el gas, comprar el regalo,
--  sacar la ropa de invierno. Se reparten entre los integrantes y se tildan.
-- ----------------------------------------------------------------------------
create table if not exists ag_tareas (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  titulo          text not null,
  detalle         text,
  -- de quien es. null = de la casa, de cualquiera
  persona_id      uuid references ag_personas on delete set null,
  -- para cuando tiene que estar. null = sin fecha, alguna vez
  vence           date,
  hecha           boolean not null default false,
  hecha_en        timestamptz,
  -- no | diaria | semanal | mensual  (al tildar una que repite nace la siguiente)
  repite          text not null default 'no',
  creado_por      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Las dos consultas que hace la app: las pendientes del hogar, y las de la
-- semana ordenadas por vencimiento.
create index if not exists ag_tareas_hogar_ix on ag_tareas (hogar_id, hecha, vence);

-- ----------------------------------------------------------------------------
--  AVISOS PROPIOS DE LA APP (Web Push)
--
--  La agenda tambien se puede publicar como calendario (ver ics-feed), pero eso
--  hace que los recordatorios los de el calendario del sistema: con la cara de
--  esa app y su formato. Esto es lo otro: notificaciones de juntos, escritas
--  por juntos, con el trebol y con botones que llevan a donde hay que ir.
-- ----------------------------------------------------------------------------

-- Cada navegador que dijo que si. Una persona puede tener varios: el telefono,
-- la tablet, la compu.
create table if not exists ag_push (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  persona_id      uuid references ag_personas on delete set null,
  -- Lo que devuelve pushManager.subscribe(): a donde mandar y con que cifrar.
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  -- A que hora quiere que le avisen, y que avisos.
  hora            smallint not null default 8,
  diario          boolean not null default true,
  semanal         boolean not null default true,
  -- La ultima fecha (en Buenos Aires) en que se le mando cada cosa. Es lo que
  -- evita mandar dos veces lo mismo si el disparador corre de mas.
  ultimo_diario   date,
  ultimo_semanal  date,
  ultimo_error    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- El endpoint identifica al navegador: si vuelve a suscribirse, se actualiza en
-- vez de duplicarse.
create unique index if not exists ag_push_endpoint_uk on ag_push (endpoint);
create index if not exists ag_push_hogar_ix on ag_push (hogar_id);

-- Las claves VAPID del proyecto. Una sola fila, y NINGUNA politica de RLS: esto
-- no lo lee el cliente ni con la clave publishable. Solo la funcion, que entra
-- con la clave de servicio y saltea RLS.
create table if not exists ag_vapid (
  id              boolean primary key default true check (id),
  publica         text not null,
  privada         text not null,
  contacto        text not null default 'mailto:avisos@juntos.app',
  created_at      timestamptz not null default now()
);

-- Donde tiene que pegar el disparador horario. Lo completa la app sola la
-- primera vez que alguien prende los avisos, asi nadie tiene que pegar una URL
-- ni una clave a mano en ningun lado.
create table if not exists ag_avisos_config (
  id              boolean primary key default true check (id),
  url_funcion     text,
  -- El secreto con el que el disparador se identifica ante la funcion. Se
  -- genera aca y no sale nunca del proyecto.
  token           uuid not null default gen_random_uuid(),
  created_at      timestamptz not null default now()
);

insert into ag_avisos_config (id) values (true) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
--  HISTORIAL DEL CHAT CON EL AGENTE
-- ----------------------------------------------------------------------------
create table if not exists ag_chef_mensajes (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references ag_hogares on delete cascade,
  -- user | assistant
  rol             text not null,
  contenido       text not null,
  created_at      timestamptz not null default now()
);

create index if not exists ag_chef_hogar_ix on ag_chef_mensajes (hogar_id, created_at);

-- ============================================================================
--  updated_at automatico
-- ============================================================================
create or replace function ag_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ag_eventos_touch on ag_eventos;
create trigger ag_eventos_touch before update on ag_eventos
  for each row execute function ag_touch_updated_at();

drop trigger if exists ag_preferencias_touch on ag_preferencias;
create trigger ag_preferencias_touch before update on ag_preferencias
  for each row execute function ag_touch_updated_at();

drop trigger if exists ag_tareas_touch on ag_tareas;
create trigger ag_tareas_touch before update on ag_tareas
  for each row execute function ag_touch_updated_at();

drop trigger if exists ag_push_touch on ag_push;
create trigger ag_push_touch before update on ag_push
  for each row execute function ag_touch_updated_at();

-- ============================================================================
--  RLS — nadie ve nada de un hogar del que no es miembro
-- ============================================================================
alter table ag_hogares        enable row level security;
alter table ag_personas       enable row level security;
alter table ag_eventos        enable row level security;
alter table ag_ocurrencias    enable row level security;
alter table ag_menu           enable row level security;
alter table ag_compras        enable row level security;
alter table ag_calendarios    enable row level security;
alter table ag_preferencias   enable row level security;
alter table ag_recetas        enable row level security;
alter table ag_tareas         enable row level security;
alter table ag_push           enable row level security;
alter table ag_vapid          enable row level security;
alter table ag_avisos_config  enable row level security;
alter table ag_chef_mensajes  enable row level security;

-- ---- ag_hogares -------------------------------------------------------------
drop policy if exists ag_hogares_select on ag_hogares;
create policy ag_hogares_select on ag_hogares
  for select using (ag_es_miembro(id));

drop policy if exists ag_hogares_update on ag_hogares;
create policy ag_hogares_update on ag_hogares
  for update using (ag_es_miembro(id)) with check (ag_es_miembro(id));

drop policy if exists ag_hogares_delete on ag_hogares;
create policy ag_hogares_delete on ag_hogares
  for delete using (ag_es_admin(id));

-- El alta de hogar va siempre por ag_crear_hogar(), nunca con un insert suelto:
-- asi el hogar y su primera persona nacen juntos y no queda un hogar huerfano
-- al que nadie pueda entrar. Por eso no hay policy de insert aca.

-- ---- ag_personas ------------------------------------------------------------
drop policy if exists ag_personas_select on ag_personas;
create policy ag_personas_select on ag_personas
  for select using (ag_es_miembro(hogar_id));

-- Se pueden agregar integrantes SIN cuenta (los chicos). Sumar a otro usuario
-- con cuenta es exclusivo de ag_unirse_a_hogar() con el codigo en la mano.
drop policy if exists ag_personas_insert on ag_personas;
create policy ag_personas_insert on ag_personas
  for insert with check (ag_es_miembro(hogar_id) and user_id is null);

-- Se edita la propia ficha o la de un integrante sin cuenta. La fila de otro
-- miembro no se toca: si no, cualquiera podria dejarle el user_id en null y
-- sacarlo del hogar sin que se entere.
drop policy if exists ag_personas_update on ag_personas;
create policy ag_personas_update on ag_personas
  for update using (
    ag_es_miembro(hogar_id)
    and (user_id is null or user_id = auth.uid())
  )
  with check (
    ag_es_miembro(hogar_id)
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists ag_personas_delete on ag_personas;
create policy ag_personas_delete on ag_personas
  for delete using (
    ag_es_miembro(hogar_id)
    and (user_id is null or user_id = auth.uid())
  );

-- ---- Tablas que cuelgan del hogar ------------------------------------------
-- Todas comparten la misma regla: miembro del hogar = acceso total.
do $$
declare t text;
begin
  foreach t in array array[
    'ag_eventos', 'ag_menu', 'ag_compras', 'ag_calendarios',
    'ag_preferencias', 'ag_recetas', 'ag_chef_mensajes', 'ag_tareas'
  ]
  loop
    execute format('drop policy if exists %1$s_todo on %1$s', t);
    execute format(
      'create policy %1$s_todo on %1$s for all
         using (ag_es_miembro(hogar_id))
         with check (ag_es_miembro(hogar_id))', t);
  end loop;
end $$;

-- ---- ag_push ----------------------------------------------------------------
-- Cada uno ve y maneja SOLO sus propios dispositivos. Ni siquiera los del otro
-- integrante del hogar: un endpoint de push es la direccion a la que le suena
-- el telefono a alguien, y no hay razon para que nadie mas la toque.
drop policy if exists ag_push_propio on ag_push;
create policy ag_push_propio on ag_push
  for all using (user_id = auth.uid() and ag_es_miembro(hogar_id))
  with check (user_id = auth.uid() and ag_es_miembro(hogar_id));

-- ag_vapid y ag_avisos_config no llevan ninguna politica a proposito: con RLS
-- prendida y sin policies, el cliente no llega ni a leerlas. Solo la funcion,
-- que entra con la clave de servicio.

-- ag_ocurrencias no tiene hogar_id: hereda el permiso de su evento.
drop policy if exists ag_ocurrencias_todo on ag_ocurrencias;
create policy ag_ocurrencias_todo on ag_ocurrencias
  for all using (
    exists (select 1 from ag_eventos e
            where e.id = evento_id and ag_es_miembro(e.hogar_id))
  ) with check (
    exists (select 1 from ag_eventos e
            where e.id = evento_id and ag_es_miembro(e.hogar_id))
  );

-- ============================================================================
--  RPCs
-- ============================================================================

-- Codigo de 6 caracteres sin letras/numeros que se confundan al dictarlo por
-- telefono (fuera 0/O, 1/I/L).
create or replace function ag_codigo_nuevo()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  intento  text;
  i        int;
begin
  for _ in 1..40 loop
    intento := '';
    for i in 1..6 loop
      intento := intento || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    if not exists (select 1 from ag_hogares where codigo = intento) then
      return intento;
    end if;
  end loop;
  -- Con 31^6 combinaciones esto no deberia pasar nunca, pero si pasa preferimos
  -- fallar claro antes que devolver un codigo repetido.
  raise exception 'No se pudo generar un codigo de hogar libre';
end;
$$;

-- Crea el hogar y mete al usuario actual como primera persona (admin).
create or replace function ag_crear_hogar(
  p_nombre     text,
  p_mi_nombre  text,
  p_color      text default '#8b7cff',
  p_emoji      text default '🙂'
)
returns ag_hogares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hogar ag_hogares;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion';
  end if;
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_mi_nombre), '') = '' then
    raise exception 'Falta el nombre del hogar o el tuyo';
  end if;

  insert into ag_hogares (nombre, codigo, creado_por)
  values (trim(p_nombre), ag_codigo_nuevo(), auth.uid())
  returning * into v_hogar;

  insert into ag_personas (hogar_id, user_id, nombre, color, emoji, es_admin, orden)
  values (v_hogar.id, auth.uid(), trim(p_mi_nombre), p_color, p_emoji, true, 0);

  insert into ag_preferencias (hogar_id) values (v_hogar.id)
  on conflict (hogar_id) do nothing;

  return v_hogar;
end;
$$;

-- Entrar a un hogar existente con el codigo de 6 caracteres.
create or replace function ag_unirse_a_hogar(
  p_codigo     text,
  p_mi_nombre  text,
  p_color      text default '#ff9f68',
  p_emoji      text default '🙂'
)
returns ag_hogares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hogar ag_hogares;
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesion';
  end if;

  select * into v_hogar from ag_hogares
  where codigo = upper(trim(p_codigo));

  if v_hogar.id is null then
    raise exception 'Ese codigo no existe';
  end if;

  -- Si ya estaba, no duplicamos: solo devolvemos el hogar.
  if exists (select 1 from ag_personas
             where hogar_id = v_hogar.id and user_id = auth.uid()) then
    return v_hogar;
  end if;

  insert into ag_personas (hogar_id, user_id, nombre, color, emoji, es_admin, orden)
  values (
    v_hogar.id, auth.uid(), trim(p_mi_nombre), p_color, p_emoji, false,
    coalesce((select max(orden) + 1 from ag_personas where hogar_id = v_hogar.id), 1)
  );

  return v_hogar;
end;
$$;

-- Cambiar el token del feed .ics (si se compartio el link de mas).
create or replace function ag_regenerar_feed_token(p_hogar uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_token uuid;
begin
  if not ag_es_miembro(p_hogar) then
    raise exception 'No sos miembro de ese hogar';
  end if;
  update ag_hogares set feed_token = gen_random_uuid()
  where id = p_hogar returning feed_token into v_token;
  return v_token;
end;
$$;

-- Volcar los ingredientes del menu de un rango a la lista de compras, juntando
-- lo repetido y sin pisar lo que ya esta cargado.
create or replace function ag_menu_a_compras(
  p_hogar  uuid,
  p_desde  date,
  p_hasta  date
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila   record;
  v_nuevos int := 0;
begin
  if not ag_es_miembro(p_hogar) then
    raise exception 'No sos miembro de ese hogar';
  end if;

  for v_fila in
    select
      -- Se agrupa en minusculas para juntar "Zapallo" con "zapallo", pero se
      -- guarda el texto tal como lo escribio la receta.
      min(trim(ing->>'item'))                              as item,
      lower(trim(ing->>'item'))                            as clave,
      string_agg(nullif(trim(ing->>'cantidad'), ''), ' + ') as cantidad,
      coalesce(min(nullif(ing->>'rubro', '')), 'otros')     as rubro
    from ag_menu m, jsonb_array_elements(m.ingredientes) ing
    where m.hogar_id = p_hogar
      and m.fecha between p_desde and p_hasta
      and coalesce(trim(ing->>'item'), '') <> ''
    group by lower(trim(ing->>'item'))
  loop
    -- Si el item ya esta en la lista y sin comprar, no lo repetimos.
    if not exists (
      select 1 from ag_compras c
      where c.hogar_id = p_hogar
        and not c.comprado
        and lower(trim(c.item)) = v_fila.clave
    ) then
      insert into ag_compras (hogar_id, item, cantidad, rubro, origen)
      values (p_hogar, v_fila.item, v_fila.cantidad, v_fila.rubro, 'menu');
      v_nuevos := v_nuevos + 1;
    end if;
  end loop;

  return v_nuevos;
end;
$$;

-- ============================================================================
--  El disparador de los avisos
--
--  Los avisos hay que mandarlos aunque nadie abra la app: esa es toda la
--  gracia. Asi que algo tiene que llamar a la funcion cada hora.
--
--  Se usa pg_cron + pg_net, que viven adentro del mismo proyecto de Supabase:
--  ningun servicio de afuera, ninguna clave pegada en ningun lado. El cuerpo
--  del cron lee la URL y el token de ag_avisos_config EN CADA CORRIDA, asi que
--  se puede programar antes de que existan: mientras la URL este vacia no hace
--  nada, y la app la completa sola la primera vez que alguien prende los
--  avisos.
--
--  Si el proyecto no deja crear las extensiones, todo esto se saltea sin
--  romper nada y queda el respaldo: la app dispara la vuelta al abrirse, y en
--  el repo hay un workflow de GitHub Actions que se puede prender.
-- ============================================================================
do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise notice 'No se pudieron crear pg_cron/pg_net (%). Los avisos van a salir igual cuando alguien abra la app; para que salgan solos, ver SETUP.md.', sqlerrm;
end $$;

do $$
begin
  -- Cada hora en punto. La funcion mira quien pidio los avisos a esta hora.
  perform cron.unschedule('ag_avisos');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'ag_avisos',
    '0 * * * *',
    $cron$
      select net.http_post(
        url := (select url_funcion from ag_avisos_config where url_funcion is not null),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-avisos-token', (select token::text from ag_avisos_config)
        ),
        body := '{}'::jsonb
      )
      where exists (select 1 from ag_avisos_config where url_funcion is not null);
    $cron$
  );
exception when others then
  raise notice 'No se pudo programar el aviso horario (%).', sqlerrm;
end $$;

-- La app guarda acá la URL de su propia función la primera vez que alguien
-- prende los avisos. Es security definer porque ag_avisos_config no tiene
-- politicas de RLS: nadie la lee ni la escribe directo.
create or replace function ag_registrar_url_avisos(p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Hay que estar logueado';
  end if;
  -- Solo una URL de funcion de Supabase, y solo la de avisos: esto lo llama el
  -- cliente, asi que no puede poder apuntar el cron a cualquier lado.
  if p_url !~ '^https://[a-z0-9-]+\.supabase\.(co|in)/functions/v1/avisos$' then
    raise exception 'Esa no es la direccion de la funcion de avisos';
  end if;
  update ag_avisos_config set url_funcion = p_url where id;
end;
$$;

revoke all on function ag_registrar_url_avisos(text) from public;
grant execute on function ag_registrar_url_avisos(text) to authenticated;

-- ============================================================================
--  Realtime: que los cambios de uno le aparezcan al otro sin recargar
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'ag_eventos', 'ag_menu', 'ag_compras', 'ag_personas', 'ag_ocurrencias',
    'ag_tareas'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table %s', t);
    exception
      when duplicate_object then null;  -- ya estaba publicada
      when undefined_object then null;  -- el proyecto no tiene realtime activo
    end;
  end loop;
end $$;
