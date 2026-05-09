import { QrCustomerMenu } from '@/components/qr/qr-customer-menu';

type QrCustomerPageProps = {
  params: Promise<{
    tableId: string;
  }>;
};

export default async function QrCustomerPage({ params }: QrCustomerPageProps) {
  const resolvedParams = await params;

  return <QrCustomerMenu tableId={resolvedParams.tableId} />;
}
