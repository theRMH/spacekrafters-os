create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  phone text not null,
  email text,
  address text,
  product_interest text,
  source text,
  status text not null default 'new',
  notes text,
  owner_id uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table leads enable row level security;
create policy "leads_owner_all" on leads for all using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('owner','sales'))
);
create policy "leads_ccl_own" on leads for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role = 'cold_call_leader') and owner_id = auth.uid()
);
