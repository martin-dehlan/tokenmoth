-- #30: per-user monthly budget (USD). Default 50 preserves the previous
-- hard-coded cap so existing users see no behaviour change until they set one.
alter table users
    add column if not exists budget_usd double precision not null default 50;
