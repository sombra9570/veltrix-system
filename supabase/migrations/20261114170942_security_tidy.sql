revoke execute on function loan_disburse() from public, anon, authenticated;
alter function perm_catalog() set search_path = public;
alter function perm_default(text, text) set search_path = public;
revoke execute on function installment_paid(uuid), customer_open_balance(uuid), customer_overdue(uuid) from anon;
