alter table reviews alter column published set default false;
alter table reviews add column publication_consent_at timestamptz;
alter table reviews add column publication_consent_version text;
alter table reviews add column publication_revoked_at timestamptz;

update reviews
set published = false
where published = true
  and publication_consent_at is null;

alter table orders add column closed_at timestamptz;

update orders
set closed_at = coalesce(updated_at, created_at)
where closed_at is null
  and status in ('completed', 'cancelled');
