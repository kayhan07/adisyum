'use client';

import { useEffect, useState } from 'react';

type InvoiceRow = {
  id: string;
  number: string;
  type: string;
  customer_name?: string | null;
  tax_number?: string | null;
  grand_total?: number;
  status?: string;
  gib_status?: string | null;
  issued_at?: string | null;
};

export function FinanceInvoicesClient() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    fetch('/api/finance/invoices', { cache: 'no-store' })
      .then(async (response) => response.json())
      .then((payload) => setRows(payload?.data ?? []))
      .catch(() => setRows([]));
  }, []);

  async function retryInvoice(id: string) {
    await fetch(`/api/finance/invoices/${id}/retry`, { method: 'POST' });
    const refreshed = await fetch('/api/finance/invoices', { cache: 'no-store' }).then((response) => response.json());
    setRows(refreshed?.data ?? []);
  }

  return (
    <div className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
      <div className="mb-4 flex gap-2">
        <a href="/finance/payments" className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-ink">Payments</a>
        <a href="/finance/reports" className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-ink">Daily Reports</a>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.16em] text-muted">
            <tr>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Tax Number</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">GIB</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-3 py-3">{row.number}</td>
                <td className="px-3 py-3">{row.type}</td>
                <td className="px-3 py-3">{row.customer_name || '—'}</td>
                <td className="px-3 py-3">{row.tax_number || '—'}</td>
                <td className="px-3 py-3">{Number(row.grand_total || 0).toFixed(2)} TRY</td>
                <td className="px-3 py-3">{row.status || '—'}</td>
                <td className="px-3 py-3">{row.gib_status || '—'}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void retryInvoice(row.id)} className="rounded-xl border border-line px-3 py-1 text-xs font-semibold text-ink">Retry</button>
                    <a href={`/api/finance/invoices/${row.id}/pdf`} target="_blank" className="rounded-xl border border-line px-3 py-1 text-xs font-semibold text-ink">PDF</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}