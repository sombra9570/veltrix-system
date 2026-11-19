'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../shell';
import { ui } from '../../site-header';
import { useT } from '../../i18n';
import { DeliveryMap, type MapPoint } from '../delivery-map';

export const NEAR_METERS = 100;

export type NearCustomer = { id: string; name: string; address: string | null; lat: number | null; lng: number | null };

/** Distancia en metros entre dos puntos (fórmula de haversine) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Clientes cercanos: usa el GPS del cobrador y muestra, en el mapa y en lista, los clientes cuya
 * ubicación (guardada al crearlos) está a menos de 100 metros. Tocar uno abre su ficha.
 */
export function NearbyScreen({ customers, onOpen }: { customers: NearCustomer[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<'locating' | 'ready' | 'denied'>('locating');

  const locate = useCallback(() => {
    setState('locating');
    if (!('geolocation' in navigator)) { setState('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setState('ready'); },
      () => setState('denied'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, []);
  useEffect(() => { locate(); }, [locate]);

  const near = useMemo(() => {
    if (!pos) return [];
    return customers
      .filter((c) => c.lat != null && c.lng != null && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)))
      .map((c) => ({ c, d: distanceM(pos, { lat: Number(c.lat), lng: Number(c.lng) }) }))
      .filter((x) => x.d <= NEAR_METERS)
      .sort((a, b) => a.d - b.d);
  }, [customers, pos]);

  const points: MapPoint[] = near.map(({ c }) => ({ lat: Number(c.lat), lng: Number(c.lng), label: c.name, icon: '🏠' }));
  const withGps = customers.filter((c) => c.lat != null && c.lng != null).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">📍 {t('cx.near.title', { m: NEAR_METERS })}</h2>
        <button type="button" onClick={locate} className={`${ui.btnGhost} !px-3 !py-1.5 text-xs`}>↻ {t('cx.near.refresh')}</button>
      </div>
      {state === 'locating' && <Card><p className={`text-sm ${ui.muted}`}>{t('cx.near.locating')}</p></Card>}
      {state === 'denied' && <Card><p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('cx.near.noGps')}</p></Card>}
      {state === 'ready' && (
        <>
          <DeliveryMap points={points} height={280} />
          {near.length === 0 ? (
            <Card>
              <p className={`text-sm ${ui.muted}`}>{t('cx.near.none', { m: NEAR_METERS })}</p>
              {withGps === 0 && <p className={`mt-1 text-xs ${ui.muted}`}>{t('cx.near.noSaved')}</p>}
            </Card>
          ) : (
            <ul className="space-y-2">
              {near.map(({ c, d }) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onOpen(c.id)} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left cursor-pointer ${ui.card}`}>
                    <span className="text-xl">🏠</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-bold leading-tight">{c.name}</p>
                      <p className={`truncate text-xs ${ui.muted}`}>{c.address ?? '—'}</p>
                    </div>
                    <span className="shrink-0 text-sm font-extrabold">{t('cx.near.dist', { m: Math.round(d) })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
