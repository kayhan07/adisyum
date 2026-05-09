'use client';

import { useEffect, useState } from 'react';

type PaymentRow = {
  id: string;
  order_id?: string;
  method?: string;
  amount?: number;
  status?: string;
  auth_code?: string | null;
  rrn?: string | null;
  card_masked?: string | null;
  paid_at?: string | null;
};

export function FinancePaymentsClient() {
  const [rows, setRows] = useState<PaymentRow[]>([]);

  useEffect(() => {
    fetch('/api/finance/payments', { cache: 'no-store' })
      .then(async (response) => response.json())
      .then((payload) => setRows(payload?.data ?? []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
      <div className="mb-4 flex gap-2">
        <a href="/finance/reports" className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-ink">Daily Reports</a>
        <a href="/finance/invoices" className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-ink">Invoices</a>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.16em] text-muted">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Auth</th>
              <th className="px-3 py-2">RRN</th>
              <th className="px-3 py-2">Card</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-3 py-3">{row.paid_at ? new Date(row.paid_at).toLocaleString('tr-TR') : '—'}</td>
                <td className="px-3 py-3">{row.method || '—'}</td>
                <td className="px-3 py-3">{Number(row.amount || 0).toFixed(2)} TRY</td>
                <td className="px-3 py-3">{row.status || '—'}</td>
                <td className="px-3 py-3">{row.auth_code || '—'}</td>
                <td className="px-3 py-3">{row.rrn || '—'}</td>
                <td className="px-3 py-3">{row.card_masked || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}