-- FourPlay / Connect Four Online
-- Run this entire file in Supabase Dashboard → SQL Editor as the project owner.
-- All state-changing game actions go through SECURITY DEFINER RPCs. The browser has SELECT only.

create table if not exists public.connect_four_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-F0-9]{8}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  host_name text not null check (char_length(btrim(host_name)) between 1 and 18),
  guest_name text check (guest_name is null or char_length(btrim(guest_name)) between 1 and 18),
  board integer[] not null default array_fill(0, array[42]),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'won', 'draw')),
  current_turn smallint not null default 1 check (current_turn in (1, 2)),
  winner smallint check (winner is null or winner in (1, 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connect_four_board_size check (cardinality(board) = 42)
);

create index if not exists connect_four_rooms_host_id_idx on public.connect_four_rooms(host_id);
create index if not exists connect_four_rooms_guest_id_idx on public.connect_four_rooms(guest_id);

alter table public.connect_four_rooms enable row level security;
revoke all on public.connect_four_rooms from anon, authenticated;
grant select on public.connect_four_rooms to authenticated;

drop policy if exists "room players can read their room" on public.connect_four_rooms;
create policy "room players can read their room"
  on public.connect_four_rooms
  for select
  to authenticated
  using ((select auth.uid()) = host_id or (select auth.uid()) = guest_id);

create or replace function public.create_room(p_player_name text)
returns public.connect_four_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_code text;
  v_room public.connect_four_rooms%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in is required to create a room.'; end if;
  v_name := left(btrim(regexp_replace(coalesce(p_player_name, ''), '[[:cntrl:]]', '', 'g')), 18);
  if v_name = '' then raise exception 'Enter a nickname between 1 and 18 characters.'; end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.connect_four_rooms r where r.room_code = v_code);
  end loop;

  insert into public.connect_four_rooms(room_code, host_id, host_name)
  values (v_code, v_user_id, v_name)
  returning * into v_room;
  return v_room;
end;
$$;

create or replace function public.join_room(p_room_code text, p_player_name text)
returns public.connect_four_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_code text := upper(regexp_replace(coalesce(p_room_code, ''), '[^A-Fa-f0-9]', '', 'g'));
  v_room public.connect_four_rooms%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in is required to join a room.'; end if;
  v_name := left(btrim(regexp_replace(coalesce(p_player_name, ''), '[[:cntrl:]]', '', 'g')), 18);
  if v_name = '' then raise exception 'Enter a nickname between 1 and 18 characters.'; end if;
  if char_length(v_code) <> 8 then raise exception 'Enter the 8-character room code.'; end if;

  select * into v_room
  from public.connect_four_rooms r
  where r.room_code = v_code
  for update;
  if not found then raise exception 'Room not found. Check the code and try again.'; end if;

  -- Allows a player to reopen their own room on the same browser session.
  if v_room.host_id = v_user_id or v_room.guest_id = v_user_id then return v_room; end if;
  if v_room.status <> 'waiting' or v_room.guest_id is not null then
    raise exception 'That room is already full.';
  end if;

  update public.connect_four_rooms
  set guest_id = v_user_id,
      guest_name = v_name,
      status = 'playing',
      updated_at = now()
  where id = v_room.id
  returning * into v_room;
  return v_room;
end;
$$;

create or replace function public.make_move(p_room_id uuid, p_column integer)
returns public.connect_four_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.connect_four_rooms%rowtype;
  v_board integer[];
  v_piece integer;
  v_idx integer;
  v_row integer;
  v_col integer;
  v_dir record;
  v_step integer;
  v_next_row integer;
  v_next_col integer;
  v_has_win boolean := false;
  v_matches boolean;
  v_new_status text;
  v_winner smallint := null;
begin
  if v_user_id is null then raise exception 'Sign in is required to move.'; end if;
  if p_column is null or p_column < 0 or p_column > 6 then raise exception 'Choose a valid column.'; end if;

  select * into v_room
  from public.connect_four_rooms r
  where r.id = p_room_id
  for update;
  if not found then raise exception 'Room not found.'; end if;
  if v_room.host_id = v_user_id then
    v_piece := 1;
  elsif v_room.guest_id = v_user_id then
    v_piece := 2;
  else
    raise exception 'You are not a player in this room.';
  end if;
  if v_room.status <> 'playing' then raise exception 'This game is not accepting moves.'; end if;
  if v_room.current_turn <> v_piece then raise exception 'It is not your turn yet.'; end if;

  v_board := v_room.board;
  v_idx := null;
  -- Board is row-major: top row first, column 0 first. Postgres array positions start at 1.
  for v_row in reverse 5..0 loop
    v_idx := v_row * 7 + p_column + 1;
    if v_board[v_idx] = 0 then
      v_board[v_idx] := v_piece;
      exit;
    end if;
    v_idx := null;
  end loop;
  if v_idx is null then raise exception 'That column is full. Pick another column.'; end if;

  -- Validate the win on the database, in the same locked transaction as the move.
  for v_row in 0..5 loop
    for v_col in 0..6 loop
      if v_board[v_row * 7 + v_col + 1] <> v_piece then continue; end if;
      for v_dir in select d.dr, d.dc from (values (0,1), (1,0), (1,1), (1,-1)) as d(dr,dc) loop
        v_matches := true;
        for v_step in 1..3 loop
          v_next_row := v_row + v_step * v_dir.dr;
          v_next_col := v_col + v_step * v_dir.dc;
          if v_next_row < 0 or v_next_row > 5 or v_next_col < 0 or v_next_col > 6 then
            v_matches := false;
            exit;
          end if;
          if v_board[v_next_row * 7 + v_next_col + 1] <> v_piece then
            v_matches := false;
            exit;
          end if;
        end loop;
        if v_matches then v_has_win := true; exit; end if;
      end loop;
      if v_has_win then exit; end if;
    end loop;
    if v_has_win then exit; end if;
  end loop;

  if v_has_win then
    v_new_status := 'won';
    v_winner := v_piece;
  elsif array_position(v_board, 0) is null then
    v_new_status := 'draw';
  else
    v_new_status := 'playing';
  end if;

  update public.connect_four_rooms
  set board = v_board,
      status = v_new_status,
      winner = v_winner,
      current_turn = case when v_new_status = 'playing' then (3 - v_piece)::smallint else current_turn end,
      updated_at = now()
  where id = v_room.id
  returning * into v_room;
  return v_room;
end;
$$;

create or replace function public.rematch_room(p_room_id uuid)
returns public.connect_four_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.connect_four_rooms%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in is required to request a rematch.'; end if;
  select * into v_room
  from public.connect_four_rooms r
  where r.id = p_room_id
  for update;
  if not found then raise exception 'Room not found.'; end if;
  if v_room.host_id <> v_user_id and v_room.guest_id <> v_user_id then
    raise exception 'You are not a player in this room.';
  end if;
  if v_room.status not in ('won', 'draw') then raise exception 'Finish the current game before starting a rematch.'; end if;

  update public.connect_four_rooms
  set board = array_fill(0, array[42]),
      status = 'playing',
      current_turn = 1,
      winner = null,
      updated_at = now()
  where id = v_room.id
  returning * into v_room;
  return v_room;
end;
$$;

revoke all on function public.create_room(text) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.make_move(uuid, integer) from public, anon;
revoke all on function public.rematch_room(uuid) from public, anon;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.make_move(uuid, integer) to authenticated;
grant execute on function public.rematch_room(uuid) to authenticated;

-- Enable Postgres Changes for live synchronization; RLS restricts each event to room participants.
do $$
begin
  alter publication supabase_realtime add table public.connect_four_rooms;
exception when duplicate_object then
  null;
end;
$$;
