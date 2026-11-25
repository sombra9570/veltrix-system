create index if not exists orders_customer_idx          on orders (customer_id);
create index if not exists orders_branch_created_idx    on orders (branch_id, created_at desc);
create index if not exists orders_route_idx             on orders (route_id) where route_id is not null;
create index if not exists order_items_order_idx        on order_items (order_id);
create index if not exists payments_customer_idx        on payments (customer_id);
create index if not exists payments_route_idx           on payments (route_id) where route_id is not null;
create index if not exists payments_settlement_idx      on payments (settlement_id) where settlement_id is not null;
create index if not exists payments_branch_collected_idx on payments (branch_id, collected_at desc);
create index if not exists cash_movements_route_idx     on cash_movements (route_id) where route_id is not null;
create index if not exists cash_movements_shift_idx     on cash_movements (shift_id) where shift_id is not null;
create index if not exists cash_movements_settlement_idx on cash_movements (settlement_id) where settlement_id is not null;
create index if not exists customers_route_idx          on customers (route_id) where route_id is not null;
create index if not exists customers_branch_idx         on customers (branch_id);
create index if not exists visits_customer_idx          on visits (customer_id, visited_at desc);
create index if not exists visits_route_idx             on visits (route_id, visited_at desc);
create index if not exists memberships_org_idx          on memberships (org_id);
create index if not exists memberships_branch_idx       on memberships (branch_id) where branch_id is not null;
create index if not exists routes_collector_idx         on collection_routes (collector_id) where collector_id is not null;
create index if not exists routes_branch_idx            on collection_routes (branch_id);
create index if not exists loans_customer_idx           on loans (customer_id);
create index if not exists settlements_route_idx        on route_settlements (route_id, created_at desc);
create index if not exists register_shifts_branch_idx   on register_shifts (branch_id);
create index if not exists products_company_idx         on products (company_id);
create index if not exists stock_levels_product_idx     on stock_levels (product_id);

do $$
declare p record; q text; w text; changed int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
  loop
    q := p.qual; w := p.with_check;
    if q is not null and q !~* 'select auth\.uid\(\)' then q := replace(q, 'auth.uid()', '(select auth.uid())'); end if;
    if w is not null and w !~* 'select auth\.uid\(\)' then w := replace(w, 'auth.uid()', '(select auth.uid())'); end if;
    if q is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
      changed := changed + 1;
    end if;
    if w is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, w);
      changed := changed + 1;
    end if;
  end loop;
end $$;
