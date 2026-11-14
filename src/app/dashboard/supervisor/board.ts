'use client';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../../lib/supabase';
import type { DayRow } from '../collector/days-table';
import type { Period } from '../collector/cut-form';

export type SBranch = { id: string; name: string; company: string; currency: string; can_liquidate: boolean; can_invest: boolean; can_approve: boolean };
export type SRoute = {
  id: string; name: string; branch_id: string; branch: string; collector: string | null; currency: string; balance: number;
  period: Period; days: DayRow[]; lent_open: number; portfolio: number; customers: number; late_customers: number;
  liquidations: { id: string; created_at: string; expected: number; counted: number; difference: number; closing: number }[];
};
export type SLoan = {
  order_id: string; created_at: string; customer: string; route: string | null; collector: string | null; branch: string; branch_id: string;
  currency: string; principal: number; interest: number; total: number; installments: number; every_days: number;
  reasons: string[]; approval: string; status: string; balance: number; rating: string;
};
export type Board = { branches: SBranch[]; routes: SRoute[]; loans: SLoan[] };

export function useBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setBoard(await rpc<Board>('supervisor_board')); setError(''); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { board, error, load };
}
