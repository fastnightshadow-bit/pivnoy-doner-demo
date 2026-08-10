create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create type order_status as enum (
  'submitted',
  'accepted',
  'cooking',
  'ready',
  'courier',
  'delivered',
  'completed',
  'cancelled'
);

create table staff_accounts (
  id uuid primary key,
  display_name text not null,
  role text not null check (role in ('owner', 'kitchen', 'courier')),
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  staff_account_id uuid not null references staff_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_staff_account_idx on sessions (staff_account_id);
create index sessions_expires_at_idx on sessions (expires_at);

create table catalog_products (
  product_id text primary key,
  name text not null,
  category text not null,
  available boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  updated_by uuid references staff_accounts(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key,
  public_number bigint generated always as identity unique,
  idempotency_key text not null unique,
  status order_status not null default 'submitted',
  fulfillment text not null check (fulfillment in ('pickup', 'delivery')),
  payment_status text not null check (
    payment_status in ('pending', 'paid', 'failed', 'refunded')
  ),
  customer_name text not null default '',
  phone text not null,
  address jsonb not null default '{}'::jsonb,
  customer_comment text not null default '',
  courier_comment text not null default '',
  items_total integer not null check (items_total >= 0),
  delivery_total integer not null check (delivery_total >= 0),
  discount_total integer not null check (discount_total >= 0),
  total integer not null check (total >= 0),
  eta_min integer not null check (eta_min >= 0),
  eta_max integer not null check (eta_max >= eta_min),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_active_queue_idx on orders (status, created_at)
  where status not in ('completed', 'cancelled');
create index orders_phone_idx on orders (phone);

create table order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id text not null,
  name text not null,
  quantity integer not null check (quantity between 1 and 20),
  unit_price integer not null check (unit_price >= 0),
  configuration jsonb not null default '{}'::jsonb
);

create index order_items_order_idx on order_items (order_id);

create table status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  previous_status order_status,
  new_status order_status not null,
  actor_id uuid references staff_accounts(id) on delete set null,
  actor_name text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index status_history_order_idx on status_history (order_id, created_at);

create table payments (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,
  provider_payment_id text unique,
  idempotency_key text not null unique,
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),
  amount integer not null check (amount >= 0),
  currency text not null default 'RUB',
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_idx on payments (order_id);

create table reviews (
  id uuid primary key,
  order_id uuid not null unique references orders(id) on delete cascade,
  customer_name text not null default 'Покупатель',
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table restaurant_settings (
  singleton boolean primary key default true check (singleton),
  accepting_orders boolean not null default true,
  delivery_price integer not null default 200 check (delivery_price >= 0),
  free_delivery_from integer not null default 2000 check (free_delivery_from >= 0),
  minimum_delivery_order integer not null default 300 check (minimum_delivery_order >= 0),
  delivery_opens time not null default '11:30',
  delivery_closes time not null default '22:30',
  updated_by uuid references staff_accounts(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into restaurant_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table event_outbox (
  id bigint generated always as identity primary key,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index event_outbox_aggregate_idx
  on event_outbox (aggregate_type, aggregate_id, id);
create index event_outbox_created_at_idx on event_outbox (created_at);
