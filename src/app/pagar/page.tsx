'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SiteHeader, SiteFooter, ui } from '../site-header';
import { useT } from '../i18n';

// Página de pago de Paddle ("default payment link"): Paddle.js abre el pago solo
// cuando la URL trae ?_ptxn=… (la transacción que creó /api/billing/checkout).
type PaddleJs = {
  Environment: { set: (env: string) => void };
  Initialize: (opts: { token: string; eventCallback?: (e: { name?: string }) => void }) => void;
};

export default function PayPage() {
  const { t } = useT();
  const [state, setState] = useState<'loading' | 'open' | 'error'>('loading');

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) { setState('error'); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.async = true;
    s.onload = () => {
      const P = (window as unknown as { Paddle?: PaddleJs }).Paddle;
      if (!P) { setState('error'); return; }
      if (token.startsWith('test_')) P.Environment.set('sandbox');
      P.Initialize({
        token,
        eventCallback: (e) => {
          if (e.name === 'checkout.completed') window.location.href = '/dashboard/owner/plan?pagado=1';
          if (e.name === 'checkout.closed') window.location.href = '/dashboard/owner/plan';
        },
      });
      setState('open');
    };
    s.onerror = () => setState('error');
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col">
      <SiteHeader showAuthButtons={false} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <p className="text-4xl">💳</p>
        <h1 className="mt-3 text-xl font-extrabold">{state === 'error' ? t('pay.error') : t('pay.opening')}</h1>
        <p className={`mt-2 text-sm ${ui.muted}`}>{t('pay.secure')}</p>
        <Link href="/dashboard/owner/plan" className={`${ui.btnGhost} mt-6`}>{t('pay.back')}</Link>
      </div>
      <SiteFooter />
    </main>
  );
}
