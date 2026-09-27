-- LIFE TERMINAL anonymous room chat
-- Run this file once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  body varchar(100) not null,
  created_at timestamptz not null default now(),
  constraint messages_body_not_blank check (char_length(btrim(body)) > 0),
  constraint messages_body_max_length check (char_length(body) <= 100)
);

-- This index supports newest-first room history; the client reverses ten rows for display.
create index if not exists messages_room_created_at_desc_idx
  on public.messages (room_id, created_at desc, id desc);

-- Idempotent seed. No sample messages are inserted.
insert into public.rooms (name)
values ('dungdongvaianh'), ('laviepeppapig')
on conflict (name) do nothing;

alter table public.rooms enable row level security;
alter table public.messages enable row level security;

-- Make permissions explicit: browser clients may only select enabled data and insert messages.
revoke all on table public.rooms, public.messages from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.rooms, public.messages to anon, authenticated;
grant insert on table public.messages to anon, authenticated;

drop policy if exists "read enabled rooms" on public.rooms;
create policy "read enabled rooms"
on public.rooms for select to anon, authenticated
using (enabled = true);

drop policy if exists "read messages in enabled rooms" on public.messages;
create policy "read messages in enabled rooms"
on public.messages for select to anon, authenticated
using (
  exists (
    select 1 from public.rooms
    where rooms.id = messages.room_id and rooms.enabled = true
  )
);

drop policy if exists "insert messages in enabled rooms" on public.messages;
create policy "insert messages in enabled rooms"
on public.messages for insert to anon, authenticated
with check (
  exists (
    select 1 from public.rooms
    where rooms.id = messages.room_id and rooms.enabled = true
  )
);

-- Intentionally no INSERT/UPDATE/DELETE policy for rooms and no UPDATE/DELETE policy for messages.
-- Enable database changes for the Realtime subscription used by /room.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
