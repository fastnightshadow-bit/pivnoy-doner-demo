create table if not exists catalog_option_availability (
  option_kind text not null check (option_kind in ('meat', 'sauce')),
  option_id text not null,
  available boolean not null default true,
  updated_by uuid references staff_accounts(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (option_kind, option_id)
);

create table if not exists refund_operations (
  order_id uuid primary key references orders(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete restrict,
  provider_refund_id text unique,
  idempotency_key text not null unique,
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  amount integer not null check (amount > 0),
  currency text not null default 'RUB',
  reason text not null,
  requested_by uuid references staff_accounts(id) on delete set null,
  attempt integer not null default 1 check (attempt > 0),
  provider_payload jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
