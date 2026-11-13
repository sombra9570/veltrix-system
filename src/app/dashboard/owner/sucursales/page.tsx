'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOwner, friendlyError } from '../owner-context';
import { Card } from '../../shell';
import { ui } from '../../../site-header';
import { supabase, rpc } from '../../../../lib/supabase';
import { COUNTRIES, CountryCode } from '../../../language-selector';
import { useT, countryName } from '../../../i18n';

type Company = { id: string; legal_name: string; country_code: string; base_currency: string; tax_id: string | null };
type Branch = { id: string; company_id: string; code: string; name: string; timezone: string; address: string | null; is_active: boolean };

export default function BranchesPage() {
  const { orgId, reload, overview } = useOwner();
  const { t, lang } = useT();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [branchForm, setBranchForm] = useState<{ open: boolean; companyId: string; name: string; address: string; tz: string }>(
    { open: false, companyId: '', name: '', address: '', tz: '' });
  const [compForm, setCompForm] = useState<{ open: boolean; name: string; country: CountryCode; taxId: string }>(
    { open: false, name: '', country: 'PE', taxId: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [c, b] = await Promise.all([
      supabase.from('companies').select('id, legal_name, country_code, base_currency, tax_id').eq('org_id', orgId).is('deleted_at', null).order('created_at'),
      supabase.from('branches').select('id, company_id, code, name, timezone, address, is_active').eq('org_id', orgId).is('deleted_at', null).order('created_at'),
    ]);
    setCompanies((c.data ?? []) as Company[]);
    setBranches((b.data ?? []) as Branch[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const countryOf = (code: string) => COUNTRIES.find((x) => x.code === code);
  const tzOptions = (companyId: string) => countryOf(companies.find((c) => c.id === companyId)?.country_code ?? '')?.timezones ?? [];

  const openBranchForm = (companyId: string) => {
    const tz = tzOptions(companyId)[0]?.tz ?? '';
    setBranchForm({ open: true, companyId, name: '', address: '', tz });
    setMsg(null);
  };

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      await Promise.all([load(), reload()]);
      return true;
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e instanceof Error ? e.message : '', t) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => rpc('create_branch', {
      p_company: branchForm.companyId, p_name: branchForm.name, p_timezone: branchForm.tz || null, p_address: branchForm.address || null,
    }), t('branches.created'));
    if (ok) setBranchForm((f) => ({ ...f, open: false }));
  };

  const createCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = countryOf(compForm.country)!;
    const ok = await run(() => rpc('create_company', {
      p_legal_name: compForm.name, p_country: c.code, p_currency: c.currency, p_tax_id: compForm.taxId || null,
      p_tax_rate: c.taxRate / 100, p_timezone: c.timezones[0]?.tz ?? null,
    }), t('companies.created'));
    if (ok) setCompForm((f) => ({ ...f, open: false, name: '', taxId: '' }));
  };

  const u = overview?.usage;
  const branchesFull = !!u && u.branches.max !== null && u.branches.used >= u.branches.max;
  const companiesFull = !!u && u.companies.max !== null && u.companies.used >= u.companies.max;
  const sortedCountries = [...COUNTRIES].sort((a, b) => countryName(lang, a.code, a.name).localeCompare(countryName(lang, b.code, b.name), lang));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">{t('branches.title')}</h1>
          <p className={`text-sm ${ui.muted}`}>{t('branches.subtitle')}</p>
        </div>
        {u && (
          <p className={`text-sm font-semibold ${ui.muted}`}>
            {t('owner.usageBranches')}: {u.branches.max === null ? u.branches.used : t('owner.of', { used: u.branches.used, max: u.branches.max })}
          </p>
        )}
      </div>

      {msg && (
        <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>
          {msg.ok ? '✅' : '⚠️'} {msg.text}
        </p>
      )}

      {loading ? <p className={`text-sm ${ui.muted}`}>{t('common.wait')}</p> : companies.map((c) => {
        const country = countryOf(c.country_code);
        const list = branches.filter((b) => b.company_id === c.id);
        return (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{country?.flag} {c.legal_name}</h2>
                <p className={`text-xs ${ui.muted}`}>
                  {countryName(lang, c.country_code, country?.name ?? c.country_code)} · {c.base_currency}
                  {c.tax_id ? ` · ${country?.taxIdName ?? ''} ${c.tax_id}` : ''}
                </p>
              </div>
              <button type="button" disabled={branchesFull} onClick={() => openBranchForm(c.id)} className={`${ui.btnGhost} !py-2 text-sm`}>
                + {t('branches.add')}
              </button>
            </div>

            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {list.map((b) => (
                <li key={b.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-semibold">🏬 {b.name} <span className={`text-xs font-normal ${ui.muted}`}>· {b.code}</span></p>
                  <p className={`mt-0.5 text-xs ${ui.muted}`}>🕒 {b.timezone}{b.address ? ` · 📍 ${b.address}` : ''}</p>
                </li>
              ))}
            </ul>

            {branchForm.open && branchForm.companyId === c.id && (
              <form onSubmit={createBranch} className="mt-4 grid gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:grid-cols-2 dark:border-blue-500/20 dark:bg-blue-500/5">
                <div>
                  <label className={ui.label}>{t('branches.name')}</label>
                  <input required className={ui.input} value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} />
                </div>
                <div>
                  <label className={ui.label}>{t('branches.timezone')}</label>
                  <select className={ui.input} value={branchForm.tz} onChange={(e) => setBranchForm({ ...branchForm, tz: e.target.value })}>
                    {tzOptions(c.id).map((z) => <option key={z.tz} value={z.tz}>{z.label} ({z.utcOffset})</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={ui.label}>{t('branches.address')}</label>
                  <input className={ui.input} value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <button type="button" onClick={() => setBranchForm({ ...branchForm, open: false })} className={ui.btnGhost}>{t('pwa.close')}</button>
                  <button type="submit" disabled={busy} className={`${ui.btnPrimary} max-sm:w-full`}>{busy ? t('common.wait') : t('branches.create')}</button>
                </div>
              </form>
            )}
          </Card>
        );
      })}

      {branchesFull && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">{t('err.limitBranches')}</p>}

      {/* OTRA EMPRESA / OTRO PAÍS */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">🌎 {t('companies.addTitle')}</h2>
            <p className={`text-sm ${ui.muted}`}>
              {companiesFull ? t('err.limitCompanies') : t('companies.addHint')}
            </p>
          </div>
          {!companiesFull && !compForm.open && (
            <button type="button" onClick={() => { setCompForm({ ...compForm, open: true }); setMsg(null); }} className={ui.btnGhost}>
              + {t('companies.add')}
            </button>
          )}
        </div>
        {compForm.open && (
          <form onSubmit={createCompany} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={ui.label}>{t('reg.companyName')}</label>
              <input required className={ui.input} value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} />
            </div>
            <div>
              <label className={ui.label}>{t('common.country')}</label>
              <select className={ui.input} value={compForm.country} onChange={(e) => setCompForm({ ...compForm, country: e.target.value as CountryCode })}>
                {sortedCountries.map((x) => <option key={x.code} value={x.code}>{x.flag} {countryName(lang, x.code, x.name)} ({x.currency})</option>)}
              </select>
            </div>
            <div>
              <label className={ui.label}>{t('reg.taxIdOptional', { taxId: countryOf(compForm.country)?.taxIdName ?? '' })}</label>
              <input className={ui.input} value={compForm.taxId} onChange={(e) => setCompForm({ ...compForm, taxId: e.target.value })} />
            </div>
            <p className={`text-xs ${ui.muted} sm:col-span-2`}>
              {(() => { const x = countryOf(compForm.country)!; return t('reg.currencyInfo', { currency: x.currency, taxName: x.taxName, taxRate: x.taxRate }); })()}
            </p>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => setCompForm({ ...compForm, open: false })} className={ui.btnGhost}>{t('pwa.close')}</button>
              <button type="submit" disabled={busy} className={`${ui.btnPrimary} max-sm:w-full`}>{busy ? t('common.wait') : t('companies.create')}</button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
