-- 049: corrección de precios (aplicada por SQL): Empresa internacional 75; Enterprise Plus 235/389 (precio por trabajador decreciente)
update plans set price_global_usd = 75 where code = 'pro';
update plans set price_usd = 235, price_global_usd = 389 where code = 'enterprise_plus';
