'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc } from '../../../../lib/supabase';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { useT, countryName } from '../../../i18n';
import { COUNTRIES } from '../../../language-selector';
import { useOwner } from '../owner-context';

// Indicadores por país: hora de cada sucursal, divisas del día (subió / bajó / igual), feriados e impuestos.
type Fx = { currency: string; rate: number | null; prev: number | null; day: string | null; source: string | null; series: number[] };
type Holiday = { day: string; local_name: string; name: string | null };
type Branch = { id: string; name: string; timezone: string; company_id: string };
type Company = { id: string; country_code: string };

const LATAM = new Set(['BO', 'MX', 'CO', 'AR', 'CL', 'PE', 'BR', 'EC', 'PY', 'UY', 'VE', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'DO', 'PR', 'CU']);
const WATCH_LATAM = ['USD', 'EUR', 'BRL', 'ARS', 'CLP', 'PEN', 'COP', 'MXN', 'PYG'];
const WATCH_WORLD = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CHF', 'CAD'];

function Spark({ values, up }: { values: number[]; up: boolean | null }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`).join(' ');
  const color = up === null ? '#94a3b8' : up ? '#10b981' : '#ef4444';
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function IndicatorsPage() {
  const { orgId } = useOwner();
  const { t, lang } = useT();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [country, setCountry] = useState<string>('');
  const [fx, setFx] = useState<Fx[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [c, b] = await Promise.all([
        supabase.from('companies').select('id, country_code').eq('org_id', orgId).is('deleted_at', null).order('created_at'),
        supabase.from('branches').select('id, name, timezone, company_id').eq('org_id', orgId).is('deleted_at', null).eq('is_active', true).order('created_at'),
      ]);
      const cs = (c.data ?? []) as Company[];
      setCompanies(cs); setBranches((b.data ?? []) as Branch[]);
      setCountry((x) => x || cs[0]?.country_code || 'BO');
    })();
  }, [orgId]);

  const cfg = COUNTRIES.find((x) => x.code === country);
  const local = cfg?.currency ?? 'USD';
  const watch = useMemo(() => (LATAM.has(country) ? WATCH_LATAM : WATCH_WORLD).filter((c) => c !== local).slice(0, 7), [country, local]);

  const load = useCallback(async () => {
    if (!country) return;
    try { setFx(await rpc<Fx[]>('fx_board', { p_currencies: [local, ...watch] })); } catch { setFx([]); }
    try { setHolidays(await rpc<Holiday[]>('holidays_next', { p_country: country, p_limit: 5 })); } catch { setHolidays([]); }
  }, [country, local, watch]);
  useEffect(() => { load(); }, [load]);

  const myCountries = [...new Set(companies.map((c) => c.country_code))];
  const countryBranches = branches.filter((b) => companies.find((c) => c.id === b.company_id)?.country_code === country);
  const zones = countryBranches.length
    ? countryBranches.map((b) => ({ key: b.id, label: b.name, tz: b.timezone }))
    : (cfg?.timezones ?? []).map((z) => ({ key: z.tz, label: z.label, tz: z.tz }));

  const base = fx.find((f) => f.currency === local);
  const cross = (f: Fx) => {
    // 1 unidad de la moneda extranjera expresada en moneda local
    if (!f.rate || !base?.rate) return null;
    const v = Number(base.rate) / Number(f.rate);
    const p = f.prev && base.prev ? Number(base.prev) / Number(f.prev) : null;
    const n = Math.min(f.series.length, base.series.length);
    const series = Array.from({ length: n }, (_, i) => Number(base.series[base.series.length - n + i]) / Number(f.series[f.series.length - n + i]));
    return { v, p, series };
  };
  const num = (v: number) => new Intl.NumberFormat(cfg?.locale ?? lang, { maximumFractionDigits: v >= 100 ? 2 : v >= 1 ? 4 : 6 }).format(v);
  const ccyName = (code: string) => { try { return new Intl.DisplayNames([lang], { type: 'currency' }).of(code) ?? code; } catch { return code; } };
  const fxDay = base?.day ?? fx.find((f) => f.day)?.day ?? null;
  const longDate = (d: Date, tz?: string) => d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
  const dayOnly = (s: string) => new Date(s + 'T12:00:00Z');
  const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const mainTz = zones[0]?.tz ?? 'UTC';
  const today = todayIn(mainTz);
  const holidayToday = holidays.find((h) => h.day === today);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: mainTz, weekday: 'short' }).format(now);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-2xl">🌎 {t('nav.indicators')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('ind.subtitle')}</p>
        </div>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={`${ui.input} sm:w-64`} aria-label={t('ind.country')}>
          {myCountries.length > 0 && (
            <optgroup label={t('ind.myCountries')}>
              {myCountries.map((c) => { const x = COUNTRIES.find((k) => k.code === c); return <option key={c} value={c}>{x?.flag} {countryName(lang, c, x?.name ?? c)}</option>; })}
            </optgroup>
          )}
          <optgroup label={t('ind.otherCountries')}>
            {COUNTRIES.filter((c) => !myCountries.includes(c.code)).map((c) => <option key={c.code} value={c.code}>{c.flag} {countryName(lang, c.code, c.name)}</option>)}
          </optgroup>
        </select>
      </div>

      {/* Aviso del día */}
      {(holidayToday || weekday === 'Sun') && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          📅 {holidayToday ? t('ind.holidayToday', { name: holidayToday.local_name }) : t('ind.sundayToday')}
        </p>
      )}

      {/* Hora local */}
      <Card className="space-y-3">
        <h2 className="font-bold">🕒 {t('ind.localTime')}</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {zones.map((z) => (
            <li key={z.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <p className={`truncate text-xs font-semibold ${ui.muted}`}>{z.label}</p>
              <p className="text-2xl font-extrabold tabular-nums">{now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', timeZone: z.tz })}</p>
              <p className={`text-xs capitalize ${ui.muted}`}>{longDate(now, z.tz)} · {z.tz}</p>
            </li>
          ))}
        </ul>
      </Card>

      {/* Divisas */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">💱 {t('ind.fxTitle', { ccy: local })}</h2>
          {fxDay && <p className={`text-xs ${ui.muted}`}>{t('ind.fxUpdated', { date: dayOnly(fxDay).toLocaleDateString(lang, { day: 'numeric', month: 'long', timeZone: 'UTC' }) })}</p>}
        </div>
        {!base?.rate ? (
          <p className={`text-sm ${ui.muted}`}>{t('ind.fxNone')}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {fx.filter((f) => f.currency !== local).map((f) => {
              const c = cross(f);
              if (!c) return null;
              const diff = c.p ? (c.v - c.p) / c.p * 100 : null;
              const dir = diff === null || Math.abs(diff) < 0.05 ? null : diff > 0;
              const main = f.currency === 'USD';
              return (
                <li key={f.currency} className={`rounded-xl border p-3 ${main ? 'border-blue-300 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10 sm:col-span-2' : 'border-slate-200 dark:border-slate-800'}`}>
                  <p className={`truncate text-xs font-semibold ${ui.muted}`}>1 {f.currency} · {ccyName(f.currency)}</p>
                  <p className={`${main ? 'text-3xl' : 'text-xl'} font-extrabold tabular-nums`}>{num(c.v)} <span className="text-sm font-bold">{local}</span></p>
                  <p className={`text-xs font-bold ${dir === null ? ui.muted : dir ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {c.p === null ? `• ${t('ind.noPrev')}` : dir === null ? `= ${t('ind.same')}` : `${dir ? '▲' : '▼'} ${t(dir ? 'ind.up' : 'ind.down', { pct: Math.abs(diff!).toFixed(2) })}`}
                  </p>
                  <Spark values={c.series} up={dir} />
                  {main && f.currency === 'USD' && base.source === 'BCB' && <p className={`mt-1 text-[11px] ${ui.muted}`}>{t('ind.srcBcb')}</p>}
                </li>
              );
            })}
          </ul>
        )}
        <p className={`text-[11px] ${ui.muted}`}>{t('ind.fxNote')}</p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Feriados */}
        <Card className="space-y-3">
          <h2 className="font-bold">📅 {t('ind.holidays')}</h2>
          {holidays.length === 0 ? <p className={`text-sm ${ui.muted}`}>{t('ind.noHolidays')}</p> : (
            <ul className="space-y-2">
              {holidays.map((h) => {
                const days = Math.round((Date.parse(h.day) - Date.parse(today)) / 86400000);
                return (
                  <li key={h.day + h.local_name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{h.local_name}</p>
                      <p className={`text-xs capitalize ${ui.muted}`}>{longDate(dayOnly(h.day), 'UTC')}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${days <= 7 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {days <= 0 ? t('ind.today') : days === 1 ? t('ind.tomorrow') : t('ind.inDays', { n: days })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={`text-[11px] ${ui.muted}`}>{t('ind.holidaysNote')}</p>
        </Card>

        {/* Impuestos */}
        {cfg && (
          <Card className="space-y-3">
            <h2 className="font-bold">🧾 {t('ind.taxes')}</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span>{cfg.taxName} · {t('ind.taxStandard')}</span><span className="font-extrabold">{cfg.taxRate} %</span></li>
              <li className="flex justify-between"><span>{t('ind.taxReduced')}</span><span className="font-extrabold">{cfg.reducedTaxRate} %</span></li>
              <li className="flex justify-between"><span>{t('ind.taxSpecial')}</span><span className="font-extrabold">{cfg.specialTaxRate} %</span></li>
              <li className="flex justify-between"><span>{t('ind.taxId')}</span><span className="font-extrabold">{cfg.taxIdName}</span></li>
              <li className="flex justify-between"><span>{t('ind.phone')}</span><span className="font-extrabold">{cfg.phonePrefix}</span></li>
            </ul>
            <p className={`text-[11px] ${ui.muted}`}>{t('ind.taxNote')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
