import { redirect } from 'next/navigation';

type DemoOrdersPageProps = {
  searchParams?: Promise<{
    tableId?: string;
    payment?: string;
  }>;
};

export default async function DemoOrdersPage({ searchParams }: DemoOrdersPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params?.tableId) {
    query.set('tableId', params.tableId);
  }
  if (params?.payment) {
    query.set('payment', params.payment);
  }

  const target = query.size > 0 ? `/orders?${query.toString()}` : '/orders';
  redirect(target);
}
