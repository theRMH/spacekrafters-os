create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft',
  line_items jsonb not null default '[]',
  subtotal numeric(12,2) default 0,
  discount_percent numeric(5,2) default 0,
  discount_amount numeric(12,2) default 0,
  tax_percent numeric(5,2) default 0,
  tax_amount numeric(12,2) default 0,
  total_amount numeric(12,2) not null default 0,
  total_sqft numeric(10,2),
  notes text,
  terms text,
  valid_until date,
  created_by uuid references users(id),
  approved_by uuid references users(id),
  rejected_by uuid references users(id),
  rejection_reason text,
  approved_at timestamptz,
  rejected_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table quotations enable row level security;
create policy "quotations_authenticated" on quotations for all using (auth.uid() is not null);
