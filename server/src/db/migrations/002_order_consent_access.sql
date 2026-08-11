alter table orders add column personal_data_consent_at timestamptz;
alter table orders add column personal_data_consent_version text;
alter table orders add column offer_version text;
alter table orders add column access_token_hash char(64);

create index orders_access_token_hash_idx
  on orders (access_token_hash)
  where access_token_hash is not null;
