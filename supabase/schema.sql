-- WPMENU Supabase schema (backend-only, service role)
-- Supabase Dashboard > SQL Editor'da bu dosyayı çalıştırın.

-- Siparişler
create table if not exists public.orders (
  id bigint primary key,
  telegram_id text,
  whatsapp_id text,
  items text not null default '',
  total numeric not null default 0,
  subtotal numeric,
  discount_amount numeric default 0,
  address text default 'Belirtilmedi',
  notes text default '',
  order_type text default 'paket',
  payment_method text default 'kapida_nakit',
  location jsonb,
  coupon_code text,
  status text not null default 'Alındı',
  created_at timestamptz not null default now(),
  estimated_minutes int,
  cancel_reason text
);

create index if not exists idx_orders_telegram on public.orders(telegram_id);
create index if not exists idx_orders_whatsapp on public.orders(whatsapp_id);
create index if not exists idx_orders_created_at on public.orders(created_at desc);

-- Favoriler
create table if not exists public.favorites (
  id bigint primary key,
  telegram_id text,
  whatsapp_id text,
  order_id bigint not null,
  items text,
  total numeric default 0,
  name text default ''
);

create index if not exists idx_favorites_telegram on public.favorites(telegram_id);
create index if not exists idx_favorites_whatsapp on public.favorites(whatsapp_id);

-- Kullanıcı tercihleri (user_key = telegram_id veya 'wa_' + whatsapp_id)
create table if not exists public.user_prefs (
  user_key text primary key,
  notify boolean not null default true,
  addresses jsonb not null default '[]'::jsonb
);

-- RLS açık; sadece backend (service_role key) kullanacağız — service_role RLS'i bypass eder.
-- Frontend DB'ye bağlanmayacak, ek politika gerekmez.
alter table public.orders enable row level security;
alter table public.favorites enable row level security;
alter table public.user_prefs enable row level security;
