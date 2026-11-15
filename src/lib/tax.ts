// Impuestos incluidos en el precio por país: el precio se sube para que, tras pagar el impuesto, quede el precio base.
// Bolivia: IVA 13% + IT 3% = 16% sobre el precio facturado → precio = base / (1 − 0,16).
// En otros países Paddle (comerciante registrado) calcula y cobra el impuesto aparte.
export const TAX_INCLUDED: Record<string, number> = { BO: 0.16 };

export const taxIncluded = (country?: string | null) => !!country && country in TAX_INCLUDED;

export function grossUp(base: number, country?: string | null): number {
  const r = country ? TAX_INCLUDED[country] : undefined;
  return r ? Math.round((base / (1 - r)) * 100) / 100 : base;
}
