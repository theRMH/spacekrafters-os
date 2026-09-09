create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  assigned_engineer_id uuid references users(id),
  scheduled_date timestamptz not null,
  actual_date timestamptz,
  status text not null default 'scheduled',
  address text,
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  notes text,
  measurements_taken boolean default false,
  measurement_notes text,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table site_visits enable row level security;
create policy "site_visits_authenticated" on site_visits for all using (auth.uid() is not null);
