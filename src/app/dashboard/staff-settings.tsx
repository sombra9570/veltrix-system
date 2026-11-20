'use client';
import { useEffect, useState } from 'react';
import { supabase, rpc } from '../../lib/supabase';
import { Card } from './shell';
import { ui } from '../site-header';
import { useT } from '../i18n';
import { compressImage, extFor } from './image';

type Me = { name: string | null; phone: string | null; email: string | null; pay_qr: string | null; pay_qr_note: string | null; org_id: string | null; branch_id: string | null };

/** Ajustes del personal: datos propios y QR para que la empresa le pague el sueldo */
export function StaffSettings() {
  const { t } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    rpc<Me>('my_settings').then((m) => { setMe(m); setName(m.name ?? ''); setPhone(m.phone ?? ''); setNote(m.pay_qr_note ?? ''); setQr(m.pay_qr); })
      .catch((e) => setMsg({ ok: false, text: (e as Error).message }));
  }, []);
  useEffect(() => {
    if (!qr) { setQrUrl(null); return; }
    supabase.storage.from('sale-files').createSignedUrl(qr, 3600).then(({ data }) => setQrUrl(data?.signedUrl ?? null));
  }, [qr]);

  const save = async (path: string | null) => {
    setBusy(true); setMsg(null);
    try {
      await rpc('set_my_settings', { p_name: name, p_phone: phone, p_qr_path: path ?? '', p_qr_note: note });
      setQr(path);
      setMsg({ ok: true, text: t('ss.saved') });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message || t('err.generic') }); }
    finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    if (!me?.org_id || !me.branch_id) return;
    setBusy(true); setMsg(null);
    try {
      const blob = await compressImage(file);
      const path = `${me.org_id}/${me.branch_id}/qr/staff-${Date.now()}.${extFor(blob)}`;
      const { error } = await supabase.storage.from('sale-files').upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw new Error(error.message);
      await rpc('set_my_settings', { p_name: name, p_phone: phone, p_qr_path: path, p_qr_note: note });
      setQr(path); setMsg({ ok: true, text: t('ss.saved') });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message || t('err.generic') }); }
    finally { setBusy(false); }
  };

  if (!me) return <p className={`text-sm ${ui.muted}`}>{msg?.text ?? t('common.wait')}</p>;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-extrabold">⚙️ {t('nav.settings')}</h1>
      {msg && <p className={`rounded-xl border p-3 text-sm font-semibold ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'}`}>{msg.text}</p>}
      <Card className="space-y-3">
        <p className="font-bold">👤 {t('ss.title')}</p>
        <label className="block text-xs font-semibold">{t('ss.name')}<input value={name} onChange={(e) => setName(e.target.value)} className={`${ui.input} mt-1`} /></label>
        <label className="block text-xs font-semibold">{t('ss.phone')}<input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${ui.input} mt-1`} /></label>
        {me.email && <p className={`text-xs ${ui.muted}`}>✉️ {me.email}</p>}
        <button type="button" disabled={busy || !name.trim()} onClick={() => void save(qr)} className={`${ui.btnPrimary} w-full`}>💾 {t('prod.save')}</button>
      </Card>
      <Card className="space-y-3">
        <p className="font-bold">📱 {t('ss.qr')}</p>
        <p className={`text-xs ${ui.muted}`}>{t('ss.qrHint')}</p>
        {qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrUrl} alt={t('ss.qr')} className="mx-auto max-h-64 rounded-xl bg-white p-2" />
        ) : <p className={`text-sm ${ui.muted}`}>{t('cx.set.noQr')}</p>}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('cx.set.qrNote')} maxLength={120} className={ui.input} />
        <label className={`${ui.btnPrimary} w-full cursor-pointer text-center ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          📷 {t('cx.set.qrUpload')}
          <input type="file" accept="image/*" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; if (f) void upload(f); }} />
        </label>
        {qr && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => void save(qr)} className={ui.btnGhost}>{t('prod.save')}</button>
            <button type="button" disabled={busy} onClick={() => void save(null)} className={ui.btnGhost}>🗑️ {t('ss.qrRemove')}</button>
          </div>
        )}
      </Card>
    </div>
  );
}
