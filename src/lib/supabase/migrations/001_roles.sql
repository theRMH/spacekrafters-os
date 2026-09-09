create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  display_name text not null,
  created_at timestamptz default now()
);
insert into roles (name, display_name) values
  ('owner', 'Owner'),
  ('sales', 'Sales'),
  ('site_engineer', 'Site Engineer'),
  ('cold_call_leader', 'Cold Call Leader'),
  ('production_admin', 'Production Admin'),
  ('production_manager', 'Production Manager')
on conflict (name) do nothing;
alter table roles enable row level security;
create policy "roles_select_all" on roles for select using (true);
