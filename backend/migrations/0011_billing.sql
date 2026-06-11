-- #33/#34: Stripe subscriptions + plan tiers. Every user starts on 'free';
-- the Stripe ids/status are filled in by the billing webhook. All nullable so
-- the app runs unchanged when billing is not configured (no STRIPE_* env).
alter table users add column if not exists plan                   text not null default 'free';
alter table users add column if not exists stripe_customer_id     text;
alter table users add column if not exists stripe_subscription_id text;
alter table users add column if not exists subscription_status    text;

create index if not exists idx_users_stripe_customer on users (stripe_customer_id);
