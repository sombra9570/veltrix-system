# Veltrix IA: plan de la rama `ia/veltrix-ia`

Se trabaja aquí y se une a `master` solo cuando todo lo de "Antes de unir" esté listo.

## Lo que ya existe (en master)
- `/api/ai` (servidor): valida sesión, llama a `ai_begin` (permiso, cuenta activa, cupo, resumen del negocio), pregunta al modelo y registra tokens con `ai_finish`.
- Cupo por empresa: `organizations.ai_monthly_quota` y tabla `ai_usage`. Hoy se asigna a mano, no sale del plan.
- Panel `dashboard/owner/ia`, solo administrador. Aviso "verifica con tu contador" ya puesto.
- Sin clave: responde 503 `AI_NOT_CONFIGURED` (la IA aparece apagada).

## Lo que falta
1. **Proveedor y clave.** Claude (`ANTHROPIC_API_KEY`, `AI_MODEL`) o Gemini (créditos de Google). Dejar una capa `AI_PROVIDER` para poder cambiar sin tocar el resto.
2. **Cupo por plan.** Al cambiar de plan se fija `ai_monthly_quota` (trigger) + complemento "Veltrix IA" para quien quiera más. Números a decidir con el costo real por pregunta.
3. **Costo real.** Medir con `ai_usage` (tokens por pregunta) y poner tope de gasto mensual en el proveedor.
4. **Resumen del negocio por rubro** (`ai_business_snapshot`): morosos y ruta para cobranza, platos y mesas para restaurante, etc. Menos datos = menos tokens y respuestas más exactas.
5. **Cifras siempre desde SQL.** La IA explica y redacta; no calcula. Resúmenes diarios/semanales armados con SQL y narrados por la IA.
6. **Seguridad.** Límite de preguntas por minuto, nombres de clientes tratados como datos (no instrucciones), interruptor para apagar la IA, registro de uso.
7. **Pruebas.** 30 preguntas con respuesta conocida por rubro, comparadas con SQL, antes de abrirla al piloto.

## Antes de unir a master
- [ ] Clave configurada y tope de gasto puesto en el proveedor.
- [ ] Cupo por plan decidido y aplicado.
- [ ] Prueba de las 30 preguntas aprobada.
- [ ] Interruptor de apagado probado.
