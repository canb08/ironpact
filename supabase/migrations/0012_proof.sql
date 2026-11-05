-- L21 / Y8: additive Proof contract. Existing workout tables are unchanged.
create table public.proof_cards (
  id uuid primary key,
  crew_id uuid not null references public.crews(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('lift','run','muay_thai')),
  together boolean not null,
  caption text check (char_length(caption) <= 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index proof_together_day on public.proof_cards (crew_id,day,kind)
  where together and deleted_at is null;
create index proof_cards_month on public.proof_cards (crew_id,day desc);
create table public.proof_links (
  id uuid primary key,
  card_id uuid not null references public.proof_cards(id) on delete cascade,
  entry_table text not null check (entry_table in ('sessions','sets','cardio_entries','martial_entries')),
  entry_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (card_id,entry_table,entry_id,user_id)
);
create table public.proof_photos (
  id uuid primary key,
  card_id uuid not null references public.proof_cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  width integer not null check (width between 1 and 1600),
  height integer not null check (height between 1 and 1600),
  bytes integer not null check (bytes between 1 and 5000000),
  created_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (card_id,user_id)
);

-- Only inspect visible workout rows, and bind ownership to auth.uid(), never
-- just the caller-supplied proof_links.user_id. Date and kind must also match.
create function public.proof_entry_owned(c uuid, t text, e uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.proof_cards card
    where card.id = c and card.deleted_at is null and public.is_member(card.crew_id)
      and (card.together or card.created_by = auth.uid()) and (
        (card.kind = 'lift' and t = 'sessions' and exists (
          select 1 from public.sessions s where s.id = e and s.user_id = auth.uid()
            and s.kind = 'gym' and s.local_date = card.day and s.deleted_at is null))
        or (card.kind = 'lift' and t = 'sets' and exists (
          select 1 from public.sets s join public.sessions p on p.id = s.session_id
          where s.id = e and s.user_id = auth.uid() and p.kind = 'gym'
            and s.local_date = card.day and s.deleted_at is null and p.deleted_at is null))
        or (card.kind = 'run' and t = 'cardio_entries' and exists (
          select 1 from public.cardio_entries r where r.id = e and r.user_id = auth.uid()
            and r.local_date = card.day and r.deleted_at is null))
        or (card.kind = 'muay_thai' and t = 'martial_entries' and exists (
          select 1 from public.martial_entries m where m.id = e and m.user_id = auth.uid()
            and m.discipline = 'Muay Thai' and m.local_date = card.day and m.deleted_at is null))
      )
  );
$$;
-- Text comparisons avoid unsafe UUID casts on hostile storage paths.
create function public.proof_path_allowed(path text, writing boolean) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.proof_cards c
    where c.crew_id::text = split_part(path,'/',1)
      and c.id::text = split_part(path,'/',2)
      and array_length(string_to_array(path,'/'),1) = 3
      and public.is_member(c.crew_id) and c.deleted_at is null
      and (not writing or ((c.together or c.created_by = auth.uid())
        and split_part(path,'/',3) = auth.uid()::text || '.jpg'))
  );
$$;
revoke all on function public.proof_entry_owned(uuid,text,uuid), public.proof_path_allowed(text,boolean)
  from public, anon, authenticated;
grant execute on function public.proof_entry_owned(uuid,text,uuid), public.proof_path_allowed(text,boolean) to authenticated;

alter table public.proof_cards enable row level security;
alter table public.proof_links enable row level security;
alter table public.proof_photos enable row level security;
create policy proof_cards_read on public.proof_cards for select to authenticated using (public.is_member(crew_id));
create policy proof_cards_insert on public.proof_cards for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_member(crew_id));
create policy proof_cards_update on public.proof_cards for update to authenticated
  using (created_by = (select auth.uid()) and public.is_member(crew_id))
  with check (created_by = (select auth.uid()) and public.is_member(crew_id));
create policy proof_cards_delete on public.proof_cards for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_member(crew_id));
create policy proof_links_read on public.proof_links for select to authenticated using (
  exists (select 1 from public.proof_cards c where c.id = card_id and public.is_member(c.crew_id)));
create policy proof_links_insert on public.proof_links for insert to authenticated
  with check (user_id = (select auth.uid()) and public.proof_entry_owned(card_id,entry_table,entry_id));
create policy proof_links_delete on public.proof_links for delete to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.proof_cards c where c.id = card_id and public.is_member(c.crew_id)));
create policy proof_photos_read on public.proof_photos for select to authenticated using (
  exists (select 1 from public.proof_cards c where c.id = card_id and public.is_member(c.crew_id)));
create policy proof_photos_insert on public.proof_photos for insert to authenticated
  with check (user_id = (select auth.uid()) and public.proof_path_allowed(storage_path,true)
    and split_part(storage_path,'/',2) = card_id::text);
create policy proof_photos_update on public.proof_photos for update to authenticated
  using (user_id = (select auth.uid()) and public.proof_path_allowed(storage_path,true))
  with check (user_id = (select auth.uid()) and public.proof_path_allowed(storage_path,true)
    and split_part(storage_path,'/',2) = card_id::text);
create policy proof_photos_delete on public.proof_photos for delete to authenticated
  using (user_id = (select auth.uid()) and public.proof_path_allowed(storage_path,true));

-- H5: grant only the operations and mutable columns this feature needs.
revoke all on public.proof_cards, public.proof_links, public.proof_photos from public, anon, authenticated;
grant select, insert, delete on public.proof_cards, public.proof_links, public.proof_photos to authenticated;
grant update (caption,client_updated_at,deleted_at) on public.proof_cards to authenticated;
grant update (width,height,bytes,client_updated_at,deleted_at) on public.proof_photos to authenticated;
grant all on public.proof_cards, public.proof_links, public.proof_photos to service_role;
create trigger proof_cards_stamp before insert or update on public.proof_cards for each row execute function public.set_updated_at();
create trigger proof_photos_stamp before insert or update on public.proof_photos for each row execute function public.set_updated_at();
create trigger proof_links_stamp before insert on public.proof_links for each row execute function public.set_updated_at();
create trigger a_lww_guard before update on public.proof_cards for each row execute function public.lww_guard();
create trigger a_lww_guard before update on public.proof_photos for each row execute function public.lww_guard();

-- Storage API enforces these bucket limits before accepting bytes, independently
-- of clients and proof_photos metadata. Decimal 5 MB, not the global 50 MiB cap.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('proof','proof',false,5000000,array['image/jpeg','image/webp']);
create policy proof_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'proof' and public.proof_path_allowed(name,false));
create policy proof_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proof' and public.proof_path_allowed(name,true));
create policy proof_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'proof' and public.proof_path_allowed(name,true))
  with check (bucket_id = 'proof' and public.proof_path_allowed(name,true));
create policy proof_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proof' and public.proof_path_allowed(name,true));
