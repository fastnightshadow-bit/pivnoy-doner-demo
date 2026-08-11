alter table reviews alter column published set default false;
alter table reviews add column publication_consent_at timestamptz;
alter table reviews add column publication_consent_version text;
alter table reviews add column publication_revoked_at timestamptz;

alter table orders add column closed_at timestamptz;
