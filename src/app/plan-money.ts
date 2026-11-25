'use client';
import { useLanguage } from './language-selector';
import { grossUp } from '../lib/tax';

/** Precio de planes: en Bolivia, en bolivianos (dólares al cambio oficial del BCB, con IVA e IT incluidos); en el resto, en dólares. */
export function usePlanMoney() {
  const { activeRate, country } = useLanguage();
  const isBo = country.code === 'BO' && activeRate > 0;
  const fmt = (usd: number) => {
    if (isBo) {
      const bs = Math.round(grossUp(usd, 'BO') * activeRate * 100) / 100;
      return `Bs ${bs.toLocaleString('es-BO', { maximumFractionDigits: 2 })}`;
    }
    return `US$ ${Number(usd).toFixed(2)}`;
  };
  // Plan de cobranza en calle: bolivianos fijos en Bolivia; en el resto, dólares (más impuestos que suma la plataforma de pago)
  const street = (bs: number, usd: number) => isBo
    ? `Bs ${Number(bs).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
    : `US$ ${Number(usd).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return { fmt, isBo, street };
}
