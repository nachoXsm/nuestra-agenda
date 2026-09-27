-- ============================================================================
--  Shim de Supabase para poder probar schema.sql en un Postgres pelado.
--  NO se corre en Supabase: alla todo esto ya existe.
--  Sirve para verificar en local que el esquema y las politicas RLS hacen lo
--  que dicen hacer (ver tests/test_rls.sql).
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- En Supabase auth.uid() lee el claim "sub" del JWT. Aca leemos una variable de
-- sesion que los tests van seteando para hacerse pasar por cada usuario.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Roles que Supabase trae de fabrica.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public, auth to anon, authenticated;
grant select on auth.users to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated, anon;

-- Publicacion de realtime.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
