create table if not exists push_subscriptions (
  id uuid primary key,
  staff_account_id uuid not null references staff_accounts(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  active boolean not null default true,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_staff_account_idx
  on push_subscriptions (staff_account_id, active);

create table if not exists push_jobs (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  order_id uuid not null references orders(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_jobs_pending_idx
  on push_jobs (status, available_at, id);
