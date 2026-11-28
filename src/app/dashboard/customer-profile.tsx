'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useT } from '../i18n';
import type { DictKey } from '../i18n/es';
import { ui } from '../site-header';
import { whatsappLink } from './format';
import { freqOf, type Credit } from './collector/credit-card';
import { RATING_DOT } from './collector/loan-form';
import { GpsButton } from './collector/new-client';

/* Lista de clientes y ficha del cliente: iguales para administrador, gerente, supervisor y cobrador.
   Lo único que cambia entre roles son los bloques extra (acciones) y la pestaña "Cambiar ubicación", que depende de permisos. */
export type ProfCust = {
  id: string; name: string; phone: string | null; address: string | null; lat?: number | null; lng?: number | null;
  balance: number; overdue: number; due_today?: number; next_due?: string | null; tax_id?: string | null; business?: string | null;
  g_name?: string | null; g_phone?: string | null; credits?: Credit[]; rating?: string;
};
export type ProfTab = 'info' | 'acc' | 'loc' | 'chg';

/** Lista: solo el nombre del cliente (con su color de calificación). Al tocarlo se abre la ficha. */
export function CustomerNames({ list, onPick, selId }: { list: { id: string; name: string; rating?: string; visited_today?: boolean }[]; onPick: (id: string) => void; selId?: string | null }) {
  const { t } = useT();
  return (
    <ul className="space-y-2">
      {list.length === 0 && <li className={`rounded-2xl p-4 text-sm ${ui.card} ${ui.muted}`}>{t('col.noCustomers')}</li>}
      {list.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onPick(c.id)}
            className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left transition cursor-pointer ${ui.card} ${selId === c.id ? 'ring-2 ring-blue-500' : ''}`}>
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${RATING_DOT[c.rating ?? 'new'] ?? RATING_DOT.new}`} />
            <span className="min-w-0 flex-1 break-words font-bold leading-tight">{c.name}</span>
            <span className={`shrink-0 ${ui.muted}`}>›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Filtro por frecuencia de cobro (todos / diaria / semanal / quincenal / mensual), igual en todos los roles */
export type FreqFilter = 'all' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export function FreqChips({ customers, freq, onFreq }: { customers: { credits?: Credit[] }[]; freq: FreqFilter; onFreq: (f: FreqFilter) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-1">
      {(['all', 'daily', 'weekly', 'biweekly', 'monthly'] as const).map((f) => {
        const n = f === 'all' ? customers.length : customers.filter((c) => (c.credits ?? []).some((k) => freqOf(k) === f)).length;
        if (f !== 'all' && n === 0) return null;
        return (
          <button key={f} type="button" onClick={() => onFreq(f)}
            className={`rounded-full px-3 py-1 text-xs font-bold cursor-pointer ${freq === f ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-300 dark:border-slate-700'}`}>
            {f === 'all' ? t('card.all') : t(`card.f.${f}` as DictKey)} · {n}
          </button>
        );
      })}
    </div>
  );
}

/** Barra inferior de la ficha */
export function ProfileTabs({ tab, onTab, canChange }: { tab: ProfTab; onTab: (t: ProfTab) => void; canChange: boolean }) {
  const { t } = useT();
  const tabs: [ProfTab, string, string][] = [['info', '👤', 'cx.tab.info'], ['acc', '💳', 'cx.tab.accounts'], ['loc', '📍', 'cx.tab.loc'], ...(canChange ? [['chg', '🎯', 'cx.tab.changeLoc'] as [ProfTab, string, string]] : [])];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-xl">
        {tabs.map(([k, ic, lk]) => (
          <button key={k} type="button" onClick={() => onTab(k)}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-bold cursor-pointer ${tab === k ? 'text-blue-600 dark:text-blue-400' : ui.muted}`}>
            <span className="text-2xl leading-none">{ic}</span><span className="max-w-full truncate">{t(lk as DictKey)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function CustomerProfile({ c, fmt, tab, acct, onAcct, renderCards, extra, canChange, onSaveLoc, online }: {
  c: ProfCust; fmt: (n: number) => string; tab: ProfTab; acct: string | null; onAcct: (id: string | null) => void;
  renderCards: (only: string) => ReactNode; extra?: ReactNode; canChange: boolean; onSaveLoc?: (lat: number, lng: number) => Promise<void>; online: boolean;
}) {
  const { t, lang } = useT();
  const map = c.lat != null && c.lng != null
    ? `https://maps.google.com/?q=${c.lat},${c.lng}`
    : c.address ? `https://maps.google.com/?q=${encodeURIComponent(c.address)}` : null;
  const initials = c.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    setPhoto(null);
    if (!navigator.onLine) return;
    (async () => {
      try {
        const { data } = await supabase.from('customers').select('photo_path').eq('id', c.id).maybeSingle();
        const path = (data as { photo_path?: string | null } | null)?.photo_path;
        if (!path) return;
        const { data: u } = await supabase.storage.from('customer-files').createSignedUrl(path, 600);
        if (!off && u?.signedUrl) setPhoto(u.signedUrl);
      } catch { /* sin foto: se muestran las iniciales */ }
    })();
    return () => { off = true; };
  }, [c.id]);
  const credits = c.credits ?? [];
  const [newGps, setNewGps] = useState<{ lat: number; lng: number } | null>(null);
  const [savingLoc, setSavingLoc] = useState(false);
  const ro = 'rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900';

  if (tab === 'loc') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold">📍 {c.name}</h2>
        {c.address && <p className={ro}>{c.address}</p>}
        {c.lat != null && c.lng != null && <p className={`text-xs ${ui.muted}`}>{c.lat}, {c.lng}</p>}
        {map ? <a href={map} target="_blank" rel="noopener noreferrer" className={`${ui.btnPrimary} w-full py-3`}>📍 {t('col.map')}</a> : <p className={`text-sm ${ui.muted}`}>{t('cx.loc.none')}</p>}
      </div>
    );
  }
  if (tab === 'chg' && canChange && onSaveLoc) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold">📍 {t('cx.tab.changeLoc')}</h2>
        <GpsButton value={newGps} onChange={setNewGps} label={t('cx.nc.gpsBtn')} />
        <button type="button" disabled={!newGps || savingLoc || !online} className={`${ui.btnPrimary} w-full py-3`}
          onClick={async () => { if (!newGps) return; setSavingLoc(true); try { await onSaveLoc(newGps.lat, newGps.lng); setNewGps(null); } finally { setSavingLoc(false); } }}>
          💾 {t('cx.loc.save')}
        </button>
      </div>
    );
  }
  if (tab === 'acc') {
    if (acct) return <div className="space-y-4">{renderCards(acct)}</div>;
    return (
      <div className="space-y-3">
        {credits.length === 0 && <p className={`text-sm ${ui.muted}`}>{t('card.noCards')}</p>}
        {credits.map((k) => {
          const debt = k.installments.reduce((a, i) => a + Math.max(0, Number(i.amount) - Number(i.paid)), 0);
          const paid = k.installments.filter((i) => Number(i.amount) - Number(i.paid) <= 0.004).length;
          return (
            <button key={k.id} type="button" onClick={() => onAcct(k.id)} className={`w-full space-y-2 rounded-2xl p-4 text-left cursor-pointer ${ui.card}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">💳 {new Date(k.created).toLocaleDateString(lang)}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold dark:bg-slate-800">{t(`card.f.${freqOf(k)}` as DictKey)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div><p className={`text-[11px] ${ui.muted}`}>{t('cx.acc.amount')}</p><p className="font-extrabold">{fmt(Number(k.total))}</p></div>
                <div><p className={`text-[11px] ${ui.muted}`}>{t('cx.acc.debt')}</p><p className={`font-extrabold ${debt > 0 ? '' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmt(debt)}</p></div>
                <div><p className={`text-[11px] ${ui.muted}`}>{t('cx.acc.paid')}</p><p className="font-extrabold">{paid}/{k.installments.length}</p></div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt={c.name} onError={() => setPhoto(null)} className="h-24 w-24 shrink-0 rounded-full object-cover" />
          : <span className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-blue-600 text-3xl font-extrabold text-white">{initials || '👤'}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-bold leading-tight">{c.name}</h2>
          {c.phone && <p className="truncate text-sm font-semibold text-blue-700 dark:text-blue-300">{c.phone}</p>}
          {c.tax_id && <p className={`truncate text-xs ${ui.muted}`}>{t('cx.cs.ci')}: {c.tax_id}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
          <p className={`text-[11px] uppercase ${ui.muted}`}>{t('cust.overdue')}</p>
          <p className={`font-extrabold ${Number(c.overdue) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{fmt(c.overdue)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
          <p className={`text-[11px] uppercase ${ui.muted}`}>{t('col.dueToday')}</p>
          <p className="font-extrabold">{fmt(c.due_today ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
          <p className={`text-[11px] uppercase ${ui.muted}`}>{t('cust.balance')}</p>
          <p className="font-extrabold">{fmt(c.balance)}</p>
        </div>
      </div>
      {c.next_due && <p className={`text-xs ${ui.muted}`}>{t('col.nextDue', { date: new Date(c.next_due + 'T12:00:00').toLocaleDateString(lang) })}</p>}

      {c.phone && (
        <div className="flex items-center gap-2">
          <p className={`min-w-0 flex-1 truncate ${ro}`}>{c.phone}</p>
          <a href={whatsappLink(c.phone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-500 text-xl text-white">💬</a>
          <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label={t('col.call')} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-600 text-xl text-white">📞</a>
        </div>
      )}
      {c.business && <p className={ro}>💼 {t('cx.cs.business')}: <b>{c.business}</b></p>}
      {c.address && <p className={ro}>📍 {c.address}</p>}
      {(c.g_name || c.g_phone) && (
        <p className={`text-xs ${ui.muted}`}>{t('cx.cs.guarantor')}: {c.g_name ?? '—'}{c.g_phone ? ` · ${c.g_phone}` : ''}</p>
      )}
      {extra}
    </div>
  );
}
