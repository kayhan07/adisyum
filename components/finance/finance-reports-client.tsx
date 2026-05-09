'use client';

import { useEffect, useState } from 'react';

type ReportRow = {
  id: string;
  report_date: string;
  total_sales: number;
  total_cash: number;
  total_card: number;
  transaction_count: number;
};

export function FinanceReportsClient() {
  const [rows, setRows] = useState<ReportRow[]>([]);

  useEffect(() => {
    fetch('/api/finance/daily-reports?days=30', { cache: 'no-store' })
      .then(async (response) => response.json())
      .then((payload) => setRows(payload?.data ?? []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="rounded-3xl border border-line bg-panel p-5 shadow-soft">
      <div className="mb-4 flex gap-2">
        <a href="/finance/payments" className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-ink">Payments</a>
        <a href="/finance/invoices" className="rounded-2xl border border-line px-4 py-2 text-sm font-semibold text-ink">Invoices</a>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.16em] text-muted">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Total Sales</th>
              <th className="px-3 py-2">Cash</th>
              <th className="px-3 py-2">Card</th>
              <th className="px-3 py-2">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-3 py-3">{row.report_date}</td>
                <td className="px-3 py-3">{Number(row.total_sales || 0).toFixed(2)} TRY</td>
                <td className="px-3 py-3">{Number(row.total_cash || 0).toFixed(2)} TRY</td>
                <td className="px-3 py-3">{Number(row.total_card || 0).toFixed(2)} TRY</td>
                <td className="px-3 py-3">{row.transaction_count || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}