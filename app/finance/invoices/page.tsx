import { AppShell } from '@/components/app-shell';
import { FinanceInvoicesClient } from '@/components/finance/finance-invoices-client';

export default function FinanceInvoicesPage() {
  return (
    <AppShell title="Invoices" subtitle="e-Fatura / e-Arşiv tracking" backHref="/finance" backLabel="Finans">
      <FinanceInvoicesClient />
    </AppShell>
  );
}