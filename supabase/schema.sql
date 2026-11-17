-- =====================================================================
-- FINANZAS PERSONALES — Esquema Supabase
-- Pegar completo en: Supabase > SQL Editor > New query > Run
-- Cada usuario ve y edita SOLO sus propios datos (Row Level Security).
-- =====================================================================

-- ---------- PERFILES ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '',
  tema        text not null default 'dark' check (tema in ('dark','light')),
  created_at  timestamptz not null default now()
);

-- Crea el perfil automáticamente cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- GASTOS OBLIGATORIOS ----------
create table if not exists public.gastos_fijos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  monto       bigint not null default 0 check (monto >= 0),
  frecuencia  text not null default 'Mensual'
              check (frecuencia in ('Semanal','Quincenal','Mensual','Bimestral','Trimestral','Semestral','Anual','Única vez')),
  created_at  timestamptz not null default now()
);

-- ---------- PAGOS (qué gasto se pagó en qué mes) ----------
-- monto = equivalente mensual al momento de marcarlo (así el historial no cambia si después editas el gasto)
create table if not exists public.pagos (
  gasto_id    bigint not null references public.gastos_fijos(id) on delete cascade,
  mes         char(7) not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),   -- 'YYYY-MM'
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  monto       bigint not null default 0,
  pagado_en   timestamptz not null default now(),
  primary key (gasto_id, mes)
);

-- ---------- INGRESOS ----------
create table if not exists public.ingresos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  monto       bigint not null check (monto > 0),
  descripcion text not null default '',
  fecha       date not null default current_date,
  created_at  timestamptz not null default now()
);

-- ---------- PRÉSTAMOS ----------
create table if not exists public.prestamos (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  a_quien          text not null,
  monto            bigint not null check (monto > 0),
  fecha            date not null default current_date,
  devuelto         boolean not null default false,
  fecha_devolucion date,
  created_at       timestamptz not null default now()
);

-- ---------- METAS ----------
create table if not exists public.metas (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre          text not null,
  monto_objetivo  bigint not null check (monto_objetivo > 0),
  monto_actual    bigint not null default 0 check (monto_actual >= 0),
  created_at      timestamptz not null default now()
);

-- ---------- ÍNDICES ----------
create index if not exists gastos_fijos_user_idx on public.gastos_fijos (user_id);
create index if not exists pagos_user_mes_idx    on public.pagos (user_id, mes);
create index if not exists ingresos_user_idx     on public.ingresos (user_id, fecha desc);
create index if not exists prestamos_user_idx    on public.prestamos (user_id, fecha desc);
create index if not exists metas_user_idx        on public.metas (user_id);

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles     enable row level security;
alter table public.gastos_fijos enable row level security;
alter table public.pagos        enable row level security;
alter table public.ingresos     enable row level security;
alter table public.prestamos    enable row level security;
alter table public.metas        enable row level security;

drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "filas propias" on public.gastos_fijos;
create policy "filas propias" on public.gastos_fijos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "filas propias" on public.pagos;
create policy "filas propias" on public.pagos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.gastos_fijos g where g.id = gasto_id and g.user_id = (select auth.uid()))
  );

drop policy if exists "filas propias" on public.ingresos;
create policy "filas propias" on public.ingresos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "filas propias" on public.prestamos;
create policy "filas propias" on public.prestamos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "filas propias" on public.metas;
create policy "filas propias" on public.metas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- REALTIME (sincroniza PC <-> celular al instante) ----------
-- Si alguna tabla ya estaba agregada, esta línea tira error: bórrala de la lista y vuelve a correr solo esto.
alter publication supabase_realtime
  add table public.profiles, public.gastos_fijos, public.pagos, public.ingresos, public.prestamos, public.metas;
