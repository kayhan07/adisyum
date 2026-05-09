import { AppShell } from '@/components/app-shell';
import { FinanceReportsClient } from '@/components/finance/finance-reports-client';

export default function FinanceReportsPage() {
  return (
    <AppShell title="Daily Reports" subtitle="Z-like end-of-day totals" backHref="/finance" backLabel="Finans">
      <FinanceReportsClient />
    </AppShell>
  );
}