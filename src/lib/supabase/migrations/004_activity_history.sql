create table if not exists activity_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  description text not null,
  performed_by uuid references users(id),
  created_at timestamptz default now()
);
alter table activity_history enable row level security;
create policy "activity_select_authenticated" on activity_history for select using (auth.uid() is not null);
create policy "activity_insert_authenticated" on activity_history for insert with check (auth.uid() is not null);
