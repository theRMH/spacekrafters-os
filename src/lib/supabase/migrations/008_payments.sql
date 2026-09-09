create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_mode text not null default 'cash',
  reference text,
  notes text,
  recorded_by uuid references users(id),
  payment_date date not null default current_date,
  created_at timestamptz default now()
);
alter table payments enable row level security;
create policy "payments_authenticated" on payments for all using (auth.uid() is not null);
