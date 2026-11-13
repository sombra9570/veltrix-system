-- Veltrix · Rubros de la empresa (puede tener uno o varios)
-- business_type ahora guarda: 'products' | 'services' | 'mixed'
alter table companies
  add column if not exists business_categories text[] not null default '{}';
