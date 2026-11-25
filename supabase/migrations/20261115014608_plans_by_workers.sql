insert into plans (code, name, price_usd, price_global_usd, max_companies, max_branches, max_users, max_storage_mb, max_store_products, chat_retention_days, is_active)
values
  ('basic',           'Básico',          12,  19,  1,  1,  4,  1024,   30,  15, true),
  ('enterprise_plus', 'Enterprise Plus', 249, 399, 10, 25, 91, 61440, 5000, 730, true)
on conflict (code) do update set name = excluded.name, price_usd = excluded.price_usd, price_global_usd = excluded.price_global_usd,
  max_companies = excluded.max_companies, max_branches = excluded.max_branches, max_users = excluded.max_users,
  max_storage_mb = excluded.max_storage_mb, max_store_products = excluded.max_store_products,
  chat_retention_days = excluded.chat_retention_days, is_active = true;

update plans set name = 'Startup', price_usd = 25, price_global_usd = 39, max_companies = 1, max_branches = 1, max_users = 8,
  max_storage_mb = 3072, max_store_products = 100, chat_retention_days = 30 where code = 'starter';
update plans set name = 'Empresa', price_usd = 49, price_global_usd = 79, max_companies = 1, max_branches = 2, max_users = 15,
  max_storage_mb = 8192, max_store_products = 300, chat_retention_days = 90 where code = 'pro';
update plans set name = 'Enterprise', price_usd = 129, price_global_usd = 219, max_companies = 3, max_branches = 10, max_users = 50,
  max_storage_mb = 25600, max_store_products = 2000, chat_retention_days = 365 where code = 'enterprise';
