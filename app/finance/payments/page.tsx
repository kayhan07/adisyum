import { AppShell } from '@/components/app-shell';
import { FinancePaymentsClient } from '@/components/finance/finance-payments-client';

export default function FinancePaymentsPage() {
  return (
    <AppShell title="Payments" subtitle="POS and cash transaction tracking" backHref="/finance" backLabel="Finans">
      <FinancePaymentsClient />
    </AppShell>
  );
}