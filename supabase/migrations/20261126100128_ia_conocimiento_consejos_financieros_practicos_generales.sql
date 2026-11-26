insert into public.ai_knowledge (kind, area, country_code, topic, title, summary, source_name, source_url, license, lang, status) values
('management','finanzas',null,'separar_dinero_negocio_y_personal','Separar el dinero del negocio del dinero personal',
$k$Mezclar cuentas es la causa más común de no saber si el negocio gana o pierde.
Pasos prácticos:
1. Abrir una cuenta o billetera solo del negocio y cobrar ahí todas las ventas.
2. Fijarse un sueldo para el dueño (monto y día fijos) y retirarlo como un gasto más del negocio. No sacar dinero "cuando hace falta".
3. Si el dueño retira más de lo que el negocio ganó en el mes, está comiéndose el capital: se nota cuando la caja baja aunque haya ventas.
4. Registrar cada retiro en el sistema con su motivo, aunque sea pequeño.
5. Compras personales con dinero del negocio, y al revés, se anotan como préstamo del dueño al negocio o del negocio al dueño, con fecha, para poder devolverlo.
Beneficio: se puede calcular la ganancia real y mostrar números limpios al contador, al banco o a un socio. Esta es una práctica general de gestión, no una norma de un país.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','finanzas',null,'ganancia_vs_caja_diferencia','Ganancia no es lo mismo que caja disponible',
$k$Un negocio puede ser rentable y aun así quedarse sin efectivo.
- Ganancia = ventas del periodo menos los costos y gastos de ese periodo.
- Caja disponible = dinero que realmente hay hoy en efectivo y bancos.
Por qué difieren: se vende a crédito y todavía no se cobró; se compró mercadería que aún está en el depósito; se pagaron cuotas de deuda (la parte de capital no es gasto, pero sí sale de la caja); se pagaron impuestos o beneficios laborales acumulados.
Qué hacer: mirar siempre ambos números cada semana. Si la ganancia es positiva y la caja baja, buscar si el dinero está en cuentas por cobrar, en inventario o en pagos de deuda. Decidir inversiones y retiros del dueño según la caja libre, no según la ganancia.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','finanzas',null,'provision_mensual_impuestos_beneficios_laborales','Reservar cada mes para impuestos y beneficios laborales',
$k$El dinero de los impuestos, de los aportes de seguridad social y de los pagos anuales a los trabajadores (aguinaldo, gratificaciones, vacaciones, según el país) no es del dueño: se acumula durante el año.
Método simple:
1. Pedir al contador el porcentaje o el monto mensual que corresponde reservar, según el régimen del negocio y el país. No usar porcentajes de memoria.
2. Cada vez que se cobra una venta, apartar ese porcentaje en una cuenta separada.
3. Para beneficios anuales: dividir el costo estimado del año entre 12 y reservarlo cada mes, para no tener un golpe de caja en diciembre o junio.
4. Antes de cada vencimiento, comparar lo reservado con lo que se debe pagar.
Si no hay reserva, el negocio termina pidiendo crédito caro para pagar obligaciones que ya sabía que vendrían. Las fechas y montos exactos dependen de cada país; ver las fichas de impuestos y laboral del país.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','finanzas',null,'costo_real_de_un_credito_antes_de_pedirlo','Cómo evaluar el costo real de un crédito antes de pedirlo',
$k$Antes de firmar:
1. Pedir por escrito el costo total del crédito: tasa, comisiones, seguros, gastos de apertura y de garantía. En cada país el indicador tiene otro nombre (por ejemplo costo anual total, tasa efectiva o costo total); pedir el que usa el banco y comparar el mismo indicador entre entidades.
2. Verificar si la tasa es fija o variable y qué pasa si se atrasa una cuota (mora, penalidades).
3. Calcular si la cuota entra en el flujo: la suma de todas las cuotas de deuda del mes debería caber con holgura dentro de la ganancia operativa mensual. Si solo entra en un mes bueno, es demasiado.
4. Preguntar para qué se usa el dinero: invertir en algo que genere ingresos (equipos, inventario de alta rotación) es distinto a tapar pérdidas o pagar gastos fijos.
5. Revisar si hay una garantía estatal o línea de banca de desarrollo disponible (ver las fichas de financiamiento de cada país) y comparar.
6. Evitar refinanciar con otro crédito más caro solo para ganar tiempo.
Recomendación: consultar con el contador antes de firmar. Esto es orientación general, no asesoría financiera personalizada.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','finanzas',null,'fondo_de_reserva_del_negocio','Fondo de reserva del negocio para imprevistos',
$k$Un fondo de reserva evita pedir deuda cuando falla una venta, se descompone un equipo o se retrasa un cobro grande.
Cómo armarlo:
- Definir una meta en meses de gastos fijos (alquiler, sueldos, servicios, cuotas). Una referencia común es empezar con 1 mes y avanzar hacia 3 o más según qué tan estables sean las ventas; la meta correcta depende del negocio.
- Apartar un monto fijo o un porcentaje de cada semana o mes, en una cuenta separada que no se use para el día a día.
- Usarlo solo para imprevistos reales y reponerlo después.
- Revisarlo cada trimestre: si los gastos fijos suben, la meta también.
Es una práctica general de gestión; la meta exacta conviene definirla con el contador según el rubro.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','finanzas',null,'inventario_dinero_dormido_rotacion','Inventario: cuánto dinero tienes parado y cómo moverlo',
$k$El inventario es dinero guardado. Mucho inventario de lenta venta ahoga la caja.
- Rotación: ventas al costo del periodo dividido entre el inventario promedio. Cuanto más alta, más rápido vuelve el dinero.
- Días de inventario: días del periodo dividido entre la rotación. Indica cuántos días tarda en venderse lo que hay.
- Clasificar productos: los que más venden (comprar con frecuencia y en cantidades ajustadas), los intermedios, y los de poca salida (no reponer, liquidar con promoción).
- Revisar cada mes los productos sin movimiento en 60 o 90 días (el plazo depende del rubro) y decidir: promoción, combo o devolución al proveedor.
- Negociar con proveedores plazos de pago más largos o pedidos más chicos y frecuentes.
- Tener cuidado con las compras grandes por descuento: ahorrar un porcentaje no sirve si el producto se vence o queda parado.
Veltrix registra stock y movimientos para calcular esto. Práctica general de gestión.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','credito_cobranza',null,'cartera_vencida_antiguedad_y_prioridades','Controlar la cartera por antigüedad y priorizar el cobro',
$k$Una lista de deudores sin orden no se cobra. Ordenar por antigüedad:
- Al día (no vencido), vencido de 1 a 30 días, de 31 a 60, de 61 a 90 y más de 90 días. Cuanto más antiguo, menor la probabilidad de cobrar.
- Rutina semanal: revisar quién vence en los próximos 7 días y avisar antes; contactar a quien venció la semana pasada; escalar a los de más de 30 días.
- Prioridad: primero los montos grandes y los vencimientos recientes, que son los más recuperables.
- Dejar de dar crédito nuevo a quien tiene deuda vencida importante hasta que regularice.
- Definir un plan de pagos por escrito cuando el cliente no puede pagar todo, con fechas y monto de cada cuota.
- Medir: porcentaje de la cartera vencida sobre el total por cobrar, cada mes. Si sube, ajustar las condiciones de crédito.
- Aspectos legales de cobro, intereses de mora y protección de datos del deudor varían por país; consultar la normativa local o a un abogado antes de aplicar cargos o mensajes de presión.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','finanzas',null,'revision_mensual_siete_numeros','Revisión mensual: siete números que todo dueño debe mirar',
$k$Una revisión de 30 minutos al mes con estos números ordena el negocio:
1. Ventas del mes y su comparación con el mes anterior.
2. Margen bruto: (ventas menos costo de lo vendido) dividido entre ventas.
3. Gastos fijos del mes y su porcentaje sobre las ventas.
4. Ganancia del mes (después de gastos y del sueldo del dueño).
5. Caja disponible y cuántos meses de gastos fijos cubre.
6. Cuentas por cobrar vencidas y su porcentaje sobre el total por cobrar.
7. Deudas: cuotas del mes y saldo total.
Preguntas para decidir: ¿qué producto o servicio deja más margen?, ¿qué gasto subió sin razón?, ¿el cliente que más compra paga a tiempo?, ¿la caja alcanza para los próximos 60 días?
Anotar una acción concreta por mes. Comparar mes contra mes, y el mismo mes del año anterior si hay datos, por la estacionalidad.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft'),
('management','finanzas',null,'crecer_sin_quedarse_sin_caja','Crecer sin quedarse sin caja',
$k$Vender más casi siempre exige gastar antes de cobrar: más inventario, más personal, más tiempo de crédito a clientes.
Antes de crecer (abrir sucursal, contratar, comprar equipos):
1. Calcular cuánto dinero se necesita antes de que lleguen los primeros ingresos nuevos y cuántos meses tarda en recuperarse.
2. Verificar que el negocio actual ya genera ganancia y caja positiva sin depender del nuevo proyecto.
3. Probar en pequeño primero (un turno, un producto, una zona) y medir antes de ampliar.
4. No financiar gastos fijos nuevos con créditos de corto plazo.
5. Mantener el fondo de reserva intacto.
6. Evaluar el costo laboral y de impuestos del crecimiento con el contador, porque cambia según el país y el régimen.
Una buena señal para crecer: la caja se mantiene positiva varios meses y la cobranza está al día. Si no, primero ordenar la base.$k$,
'Redacción propia de Veltrix (prácticas generales de gestión)',null,null,'es','draft');