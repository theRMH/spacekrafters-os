create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'sales' references roles(name),
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table users enable row level security;
create policy "users_select_own" on users for select using (auth.uid() = id);
create policy "users_select_owner" on users for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role = 'owner')
);
create policy "users_update_owner" on users for update using (
  exists (select 1 from users u where u.id = auth.uid() and u.role = 'owner')
);
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'role', 'sales'));
  return new;
end;
$$;
create or replace trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
