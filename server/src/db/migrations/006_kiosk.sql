create table kiosk_devices (
  id uuid primary key,
  display_name text not null,
  session_token_hash char(64) not null unique,
  session_expires_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index kiosk_devices_active_idx
  on kiosk_devices (active, session_expires_at);

create table kiosk_activation_codes (
  code_hash char(64) primary key,
  created_by uuid not null references staff_accounts(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index kiosk_activation_codes_expiry_idx
  on kiosk_activation_codes (expires_at)
  where consumed_at is null;

alter table orders add column source text not null default 'web'
  check (source in ('web', 'kiosk'));
alter table orders add column service_mode text
  check (service_mode in ('dine_in', 'takeaway'));
alter table orders add column kiosk_device_id uuid references kiosk_devices(id)
  on delete set null;

create index orders_kiosk_device_idx on orders (kiosk_device_id, created_at)
  where source = 'kiosk';
